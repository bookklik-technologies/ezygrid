import {
  SparseCellStore,
  SizeIndex,
  toA1,
  createId,
  op,
  transformFormulaRefs,
  rectToRange,
  HistoryService,
  type Operation,
  type CellRecord,
  type RefTransform,
} from '@ezygrid/model';
import { Parser, DependencyGraph, FormulaError, type RuntimeValue, isMatrix, type MatrixValue } from '@ezygrid/formula';
import { MergeStore } from './merges.js';
import { TableStore } from './tables.js';
import { ValidationService, type ValidationRule, type ValidationAction } from './validation.js';
import { ConditionalFormatEngine } from './conditional-format.js';
import { ChartEngine } from './charts.js';
import { PivotEngine } from './pivot.js';
import { MediaStore } from './media.js';
import { worksheetToCsv, worksheetFromCsv, type ToCsvOptions, type FromCsvOptions } from './csv-export.js';
import { PluginManager, type EzygridPlugin } from './plugins.js';
import { parseRange } from '@ezygrid/model';


export interface WorksheetConfig {
  id?: string;
  name?: string;
  rows?: number;
  columns?: number;
  data?: unknown[][];
}

/** Cell-level style properties (§23.2 subset for Phase 2). */
export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  background?: string;
  align?: 'left' | 'center' | 'right';
}

export const DEFAULT_ROW_HEIGHT = 24;
export const DEFAULT_COLUMN_WIDTH = 100;

/**
 * Worksheet: sparse store + size indexes + formula graph wiring.
 * Model is authoritative; rendering is a projection.
 */
export class Worksheet {
  readonly id: string;
  name: string;
  readonly workbook: Workbook;
  readonly cells = new SparseCellStore();
  readonly rowSizes: SizeIndex;
  readonly columnSizes: SizeIndex;
  rowCount: number;
  columnCount: number;
  /** Per-row overrides by row id (structural identity placeholder for Phase 0). */
  readonly rowIds = new Map<number, string>();
  /** Merged ranges (§16): anchor-only data rule. */
  readonly merges = new MergeStore();
  /** Structured tables (§25). */
  readonly tables = new TableStore();
  /** Number format masks keyed by "row,column". */
  readonly numberFormats = new Map<string, string>();
  /** Validation rules (§24). */
  readonly validations = new ValidationService();
  /** Conditional formatting rules (§24.5). */
  readonly conditionalFormats = new ConditionalFormatEngine();
  /** Charts (§31). */
  readonly charts = new ChartEngine();
  /** Pivot engine (§33). */
  readonly pivots = new PivotEngine();
  /** Floating media: images and shapes (§30/§32). */
  readonly media = new MediaStore();

  /** Merge a range (A1 notation). Data lives on the anchor cell. */
  merge(range: string): void {
    const rect = parseRange(range);
    this.merges.merge(rect);
  }

  /** Create a structured table from a range. */
  addTable(options: { name: string; range: string; headerRow?: boolean; totalRow?: boolean }): void {
    this.tables.add(this, options);
  }

  getTable(name: string): ReturnType<TableStore['get']> {
    return this.tables.get(name);
  }

  // ── Validation (§24): applied on every write ────────────────────────────

  addValidation(rule: Omit<ValidationRule, 'id'>): ValidationRule {
    return this.validations.add(rule);
  }

  removeValidation(id: string): void {
    this.validations.remove(id);
  }

  // ── Charts / pivot / media convenience APIs ──────────────────────────────

  addChart(spec: Parameters<ChartEngine['add']>[0]): string {
    return this.charts.add(spec).id;
  }

  addPivot(spec: Omit<import('./pivot.js').PivotSpec, 'id'>): string {
    const full = { ...spec, id: createId('pivot') };
    this.pivots.refresh(this, full);
    return full.id;
  }

  addImage(image: Parameters<MediaStore['addImage']>[0]): string {
    return this.media.addImage(image).id;
  }

  addShape(shape: Parameters<MediaStore['addShape']>[0]): string {
    return this.media.addShape(shape).id;
  }

  // ── CSV import/export (§35.1) ────────────────────────────────────────────

  toCsv(options?: ToCsvOptions): string {
    return worksheetToCsv(this, options);
  }

  fromCsv(text: string, options?: FromCsvOptions): void {
    worksheetFromCsv(this, text, options);
  }

  unmerge(range: string): void {
    const rect = parseRange(range);
    this.merges.unmergeAt(rect.top, rect.left);
  }

  /** Apply a number format mask to a range (A1 notation). */
  setNumberFormat(range: string, mask: string): void {
    const rect = parseRange(range);
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        this.numberFormats.set(`${r},${c}`, mask);
      }
    }
  }

  getNumberFormat(row: number, column: number): string | undefined {
    return this.numberFormats.get(`${row},${column}`);
  }

  /** Re-register all formulas after direct record manipulation (sort, paste). */
  refreshFormulas(): void {
    this.registerAllFormulas();
  }

  // ── Visibility (§15.1/§15.2): hide/show rows and columns ────────────────

  readonly hiddenRows = new Set<number>();
  readonly hiddenColumns = new Set<number>();

  hideRows(index: number, count = 1): void {
    for (let i = 0; i < count; i++) this.hiddenRows.add(index + i);
  }

  showRows(index: number, count = 1): void {
    for (let i = 0; i < count; i++) this.hiddenRows.delete(index + i);
  }

  hideColumns(index: number, count = 1): void {
    for (let i = 0; i < count; i++) this.hiddenColumns.add(index + i);
  }

  showColumns(index: number, count = 1): void {
    for (let i = 0; i < count; i++) this.hiddenColumns.delete(index + i);
  }

  isColumnHidden(column: number): boolean {
    return this.hiddenColumns.has(column);
  }

  // ── Filters (§20 prototype): value-predicate row filters ────────────────

  readonly filters = new Map<number, (value: unknown) => boolean>();
  private filteredRows = new Set<number>();

  setFilter(column: number, predicate: (value: unknown) => boolean): void {
    this.filters.set(column, predicate);
    this.applyFilters();
  }

  clearFilter(column?: number): void {
    if (column === undefined) this.filters.clear();
    else this.filters.delete(column);
    this.applyFilters();
  }

  private applyFilters(): void {
    for (const row of this.filteredRows) this.hiddenRows.delete(row);
    this.filteredRows.clear();
    if (this.filters.size === 0) return;
    const used = this.cells.usedRange;
    if (!used) return;
    for (let r = used.top; r <= used.bottom; r++) {
      let visible = true;
      for (const [column, predicate] of this.filters) {
        const record = this.cells.getCell(r, column);
        const value =
          record === undefined
            ? null
            : record.formula !== undefined
              ? this.getValue(r, column)
              : record.raw ?? null;
        if (!predicate(value)) {
          visible = false;
          break;
        }
      }
      if (!visible) {
        this.hiddenRows.add(r);
        this.filteredRows.add(r);
      }
    }
  }

  // ── Cell editor assignment (§13.2 prototype) ─────────────────────────────

  readonly cellEditors = new Map<string, { type: string; options?: unknown }>();

  setCellEditor(range: string, type: string, options?: unknown): void {
    const rect = parseRange(range);
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        this.cellEditors.set(`${r},${c}`, { type, options });
      }
    }
  }

  getEditorFor(row: number, column: number): { type: string; options?: unknown } | undefined {
    return this.cellEditors.get(`${row},${column}`);
  }

  // ── Cell styles (§23): cell-level properties with range application ─────

  readonly styles = new Map<string, CellStyle>();

  setStyle(range: string, style: CellStyle): void {
    const rect = parseRange(range);
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        const key = `${r},${c}`;
        const current = this.styles.get(key) ?? {};
        this.styles.set(key, { ...current, ...style });
      }
    }
  }

  clearStyle(range: string): void {
    const rect = parseRange(range);
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        this.styles.delete(`${r},${c}`);
      }
    }
  }

  getStyle(row: number, column: number): CellStyle | undefined {
    return this.styles.get(`${row},${column}`);
  }

  // ── Notes (§29.1): plain per-cell annotations ────────────────────────────

  readonly notes = new Map<string, string>();

  setNote(range: string, text: string): void {
    const rect = parseRange(range);
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        this.notes.set(`${r},${c}`, text);
      }
    }
  }

  getNote(row: number, column: number): string | undefined {
    return this.notes.get(`${row},${column}`);
  }

  clearNote(range: string): void {
    const rect = parseRange(range);
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        this.notes.delete(`${r},${c}`);
      }
    }
  }

  // ── Nested headers (§17.2): multi-level column header groups ────────────

  private nestedHeadersConfig: (string | { title: string; span: number })[][] = [];

  setNestedHeaders(levels: (string | { title: string; span: number })[][]): void {
    this.nestedHeadersConfig = levels;
  }

  get nestedHeaders(): readonly (readonly (string | { title: string; span: number })[])[] {
    return this.nestedHeadersConfig;
  }

  // ── Row groups (§15.1): outline collapse/expand ──────────────────────────

  private rowGroupsConfig: { start: number; end: number; collapsed: boolean }[] = [];
  private groupHiddenRows = new Set<number>();

  groupRows(start: number, end: number): void {
    if (end <= start) return;
    this.rowGroupsConfig.push({ start, end, collapsed: false });
  }

  ungroupRows(start: number): void {
    const group = this.rowGroupsConfig.find((g) => g.start === start);
    if (!group) return;
    if (group.collapsed) this.expandGroup(start);
    this.rowGroupsConfig = this.rowGroupsConfig.filter((g) => g.start !== start);
  }

  collapseGroup(start: number): void {
    const group = this.rowGroupsConfig.find((g) => g.start === start);
    if (!group || group.collapsed) return;
    group.collapsed = true;
    for (let r = group.start; r <= group.end; r++) this.groupHiddenRows.add(r);
  }

  expandGroup(start: number): void {
    const group = this.rowGroupsConfig.find((g) => g.start === start);
    if (!group || !group.collapsed) return;
    group.collapsed = false;
    for (let r = group.start; r <= group.end; r++) this.groupHiddenRows.delete(r);
  }

  getGroups(): readonly { start: number; end: number; collapsed: boolean }[] {
    return this.rowGroupsConfig;
  }

  isRowHidden(row: number): boolean {
    return this.hiddenRows.has(row) || this.groupHiddenRows.has(row);
  }

  constructor(workbook: Workbook, config: WorksheetConfig = {}) {
    this.workbook = workbook;
    this.id = config.id ?? createId('sheet');
    this.name = config.name ?? 'Sheet1';
    this.rowCount = config.rows ?? 1000;
    this.columnCount = config.columns ?? 26;
    this.rowSizes = new SizeIndex(this.rowCount, DEFAULT_ROW_HEIGHT);
    this.columnSizes = new SizeIndex(this.columnCount, DEFAULT_COLUMN_WIDTH);
    if (config.data) this.load2DArray(config.data);
  }

  private load2DArray(data: unknown[][]): void {
    for (let r = 0; r < data.length; r++) {
      const row = data[r]!;
      for (let c = 0; c < row.length; c++) {
        const v = row[c]!;
        if (v === null || v === undefined || v === '') continue;
        if (typeof v === 'string' && v.startsWith('=')) {
          this.setCellRaw(r, c, undefined, v);
        } else {
          this.setCellRaw(r, c, v);
        }
      }
    }
  }

  private setCellRaw(row: number, column: number, raw?: unknown, formula?: string): void {
    // Fully empty records are dropped so the used range and spill blocking
    // see the true content.
    if (formula === undefined && (raw === undefined || raw === null)) {
      this.cells.setCell(row, column, undefined);
      return;
    }
    const record: CellRecord = formula !== undefined ? { formula } : { raw };
    this.cells.setCell(row, column, record);
    if (formula !== undefined) {
      const graph = this.workbook.formulaGraph;
      graph.setCurrentSheet(this.name);
      graph.setFormula(this.name, row, column, formula, Parser.parse(formula.slice(1)));
      // Evaluate eagerly so spills register immediately (§14.2).
      this.getValue(row, column);
    }
  }

  /** Get the calculated display value of a cell (formulas evaluated via dependency graph). */
  getValue(row: number, column: number): unknown {
    // Spill-covered cells derive their value from the anchor formula.
    const coveredBy = this.spillCover.get(`${row},${column}`);
    const record = this.cells.getCell(row, column);
    if (coveredBy && !record) {
      const [anchorRow, anchorColumn] = coveredBy.split(',').map(Number) as [number, number];
      const result = this.evaluateAnchor(anchorRow, anchorColumn);
      if (result.matrix) {
        return result.matrix.values[row - anchorRow]?.[column - anchorColumn] ?? null;
      }
      return result.value;
    }
    if (!record) return null;
    if (record.formula !== undefined) {
      return this.evaluateAnchor(row, column).value;
    }
    return record.raw ?? null;
  }

  /** Evaluate an anchor formula, registering or clearing its spill. */
  private evaluateAnchor(row: number, column: number): { matrix?: MatrixValue; value: unknown } {
    const graph = this.workbook.formulaGraph;
    graph.setCurrentSheet(this.name);
    const value = graph.recalculate(this.name, row, column, (s, r, c) =>
      this.readRawValue(s ?? this.name, r, c),
    );
    const key = `${row},${column}`;
    if (isMatrix(value)) {
      if (this.isSpillBlocked(row, column, value.rows, value.columns)) {
        this.clearSpill(key);
        this.spillError.set(key, true);
        return { value: '#SPILL!' };
      }
      this.spillError.delete(key);
      this.registerSpill(row, column, value);
      return { matrix: value, value: value.values[0]?.[0] ?? null };
    }
    this.clearSpill(key);
    this.spillError.delete(key);
    return { value: value instanceof FormulaError ? value.value : value };
  }

  /** Spills keyed by anchor "row,column". */
  private spills = new Map<string, { rows: number; columns: number }>();
  private spillCover = new Map<string, string>();
  private spillError = new Map<string, boolean>();

  isSpilled(row: number, column: number): boolean {
    return this.spillCover.has(`${row},${column}`);
  }

  hasSpillError(row: number, column: number): boolean {
    return this.spillError.has(`${row},${column}`);
  }

  private isSpillBlocked(row: number, column: number, rows: number, columns: number): boolean {
    for (let r = row; r < row + rows; r++) {
      for (let c = column; c < column + columns; c++) {
        if (r === row && c === column) continue;
        if (this.cells.getCell(r, c) !== undefined) return true;
      }
    }
    return false;
  }

  private registerSpill(row: number, column: number, value: MatrixValue): void {
    const key = `${row},${column}`;
    this.spills.set(key, { rows: value.rows, columns: value.columns });
    for (let r = row; r < row + value.rows; r++) {
      for (let c = column; c < column + value.columns; c++) {
        if (r === row && c === column) continue;
        this.spillCover.set(`${r},${c}`, key);
      }
    }
  }

  private clearSpill(key: string): void {
    const spill = this.spills.get(key);
    if (!spill) return;
    const [row, column] = key.split(',').map(Number) as [number, number];
    for (let r = row; r < row + spill.rows; r++) {
      for (let c = column; c < column + spill.columns; c++) {
        this.spillCover.delete(`${r},${c}`);
      }
    }
    this.spills.delete(key);
  }

  private clearAllSpills(): void {
    for (const key of [...this.spills.keys()]) this.clearSpill(key);
    this.spillError.clear();
  }

  /**
   * Evaluated value of a cell for formula readers: raw records resolve
   * directly; formula cells and spill-covered cells resolve through the
   * graph (with spill support and cycle protection via the graph's
   * evaluating flags). Named ranges, tables and cross-sheet refs therefore
   * see formula-valued cells.
   */
  readRawValue(sheetName: string, row: number, column: number): RuntimeValue {
    const sheet = sheetName === this.name ? this : this.workbook.getWorksheet(sheetName);
    if (!sheet) return new FormulaError('#REF!') as unknown as RuntimeValue;
    return sheet.resolveEvaluatedValue(row, column);
  }

  /**
   * Runtime value used by formula readers: formulas evaluate through the
   * graph, spill-covered cells resolve via their anchor's matrix, and raw
   * records pass through.
   */
  resolveEvaluatedValue(row: number, column: number): RuntimeValue {
    const coveredBy = this.spillCover.get(`${row},${column}`);
    if (coveredBy) {
      const [anchorRow, anchorColumn] = coveredBy.split(',').map(Number) as [number, number];
      const result = this.evaluateAnchor(anchorRow, anchorColumn);
      if (result.matrix) {
        return (result.matrix.values[row - anchorRow]?.[column - anchorColumn] ?? null) as RuntimeValue;
      }
      return result.value as RuntimeValue;
    }
    const record = this.cells.getCell(row, column);
    if (!record) return null;
    if (record.formula !== undefined) {
      const result = this.evaluateAnchor(row, column);
      return result.value as RuntimeValue;
    }
    return (record.raw ?? null) as RuntimeValue;
  }

  /**
   * Set a cell value; strings starting with "=" become formulas. Emits an
   * operation. Pass `{ literal: true }` to store text verbatim (CSV import
   * with formulas disabled).
   */
  setValue(row: number, column: number, value: unknown, options?: { literal?: boolean }): Operation | null {
    // Validation (§24): rejected writes are not applied.
    if (value !== null && value !== undefined) {
      const result = this.validations.check(this, row, column, value);
      if (result.action === 'reject' && !result.allowed) {
        this.workbook.emitOperation(
          op(this.workbook.id, 'validation.reject', { row, column, value, message: result.message }, this.id),
        );
        return null;
      }
    }
    let formula: string | undefined;
    let raw: unknown = value;
    if (!options?.literal && typeof value === 'string' && value.startsWith('=')) {
      // Parse completely BEFORE touching any state, so malformed formulas
      // leave the previous value in place (recoverable validation error).
      try {
        Parser.parse(value.slice(1));
      } catch (e) {
        this.workbook.emitOperation(
          op(
            this.workbook.id,
            'validation.reject',
            { row, column, value, message: `Invalid formula: ${(e as Error).message}` },
            this.id,
          ),
        );
        return null;
      }
      formula = value;
      raw = undefined;
    }
    // Overwriting any part of a spill removes it (anchor or covered cell).
    const spillOwner = this.spillCover.get(`${row},${column}`) ?? `${row},${column}`;
    if (this.spills.has(spillOwner)) this.clearSpill(spillOwner);
    if (this.spillError.has(`${row},${column}`)) this.spillError.delete(`${row},${column}`);
    const previous = this.cells.getCell(row, column);
    const previousSnapshot: import('@ezygrid/model').CellRecordSnapshot | undefined = previous
      ? { raw: previous.raw, formula: previous.formula, styleId: previous.styleId }
      : undefined;
    // clear previous formula registration
    if (previous?.formula !== undefined) {
      this.workbook.formulaGraph.removeFormula(this.name, row, column);
    }
    this.setCellRaw(row, column, raw, formula);
    const operation = op<import('@ezygrid/model').SetCellPayload>(
      this.workbook.id,
      'cell.set',
      { row, column, raw, formula, previous: previousSnapshot },
      this.id,
    );
    this.workbook.emitOperation(operation);
    return operation;
  }

  getAddress(row: number, column: number): string {
    return toA1(row, column);
  }

  /**
   * Register every formula cell of EVERY worksheet with the dependency
   * graph. The graph is workbook-wide, so clearing it and re-registering
   * only this sheet would orphan other sheets' formulas.
   */
  private registerAllFormulas(): void {
    this.workbook.refreshFormulaGraph();
  }

  /** Rewrite formulas that reference this sheet after a structural change, then re-register. */
  private rewriteFormulas(shift: RefTransform): void {
    this.workbook.transformFormulasForStructuralChange(this.name, shift);
  }

  insertRows(index: number, count = 1): void {
    this.clearAllSpills();
    this.cells.insertRows(index, count);
    this.rowCount += count;
    this.transformMetadata('row', index, count);
    this.transformSizes('row', index, count);
    this.rewriteFormulas({ kind: 'row', at: index, delta: count });
    this.workbook.transformHistory(this.id, 'row', index, count);
    this.workbook.emitOperation(
      op(this.workbook.id, 'rows.insert', { index, count }, this.id),
    );
  }

  deleteRows(index: number, count = 1): void {
    this.clearAllSpills();
    this.cells.deleteRows(index, count);
    this.rowCount = Math.max(1, this.rowCount - count);
    this.transformMetadata('row', index, -count);
    this.transformSizes('row', index, -count);
    this.rewriteFormulas({ kind: 'row', at: index, delta: -count });
    this.workbook.transformHistory(this.id, 'row', index, -count);
    this.workbook.emitOperation(
      op(this.workbook.id, 'rows.delete', { index, count }, this.id),
    );
  }

  insertColumns(index: number, count = 1): void {
    this.clearAllSpills();
    this.cells.insertColumns(index, count);
    this.columnCount += count;
    this.transformMetadata('column', index, count);
    this.transformSizes('column', index, count);
    this.rewriteFormulas({ kind: 'column', at: index, delta: count });
    this.workbook.transformHistory(this.id, 'column', index, count);
    this.workbook.emitOperation(
      op(this.workbook.id, 'columns.insert', { index, count }, this.id),
    );
  }

  deleteColumns(index: number, count = 1): void {
    this.clearAllSpills();
    this.cells.deleteColumns(index, count);
    this.columnCount = Math.max(1, this.columnCount - count);
    this.transformMetadata('column', index, -count);
    this.transformSizes('column', index, -count);
    this.rewriteFormulas({ kind: 'column', at: index, delta: -count });
    this.workbook.transformHistory(this.id, 'column', index, -count);
    this.workbook.emitOperation(
      op(this.workbook.id, 'columns.delete', { index, count }, this.id),
    );
  }

  /**
   * Shift every coordinate-keyed and range-anchored metadata structure so
   * data stays attached to its styles, formats, notes, editors, validation
   * rules, merges, tables, visibility and floating objects.
   */
  private transformMetadata(kind: 'row' | 'column', at: number, delta: number): void {
    const shift = (pos: number): number | undefined => shiftPosition(pos, at, delta);
    const edge = (pos: number, isStart: boolean): number | undefined =>
      shiftRangeEdge(pos, at, delta, isStart);

    // "row,column"-keyed maps: styles, number formats, notes, editors.
    for (const map of [
      this.styles,
      this.numberFormats,
      this.notes,
      this.cellEditors,
    ] as Map<string, unknown>[]) {
      const entries: [string, unknown][] = [];
      for (const [key, value] of map) {
        const [r, c] = key.split(',').map(Number) as [number, number];
        const row = kind === 'row' ? shift(r) : r;
        const column = kind === 'column' ? shift(c) : c;
        if (row === undefined || column === undefined) continue;
        entries.push([`${row},${column}`, value]);
      }
      map.clear();
      for (const [key, value] of entries) map.set(key, value);
    }

    // Hidden rows/columns and group visibility.
    const remapSet = (set: Set<number>): void => {
      const mapped = new Set<number>();
      for (const pos of set) {
        const m = shift(pos);
        if (m !== undefined) mapped.add(m);
      }
      set.clear();
      for (const v of mapped) set.add(v);
    };
    if (kind === 'row') {
      remapSet(this.hiddenRows);
      remapSet(this.groupHiddenRows);
      const rowIds: [number, string][] = [];
      for (const [row, id] of this.rowIds) {
        const m = shift(row);
        if (m !== undefined) rowIds.push([m, id]);
      }
      this.rowIds.clear();
      for (const [row, id] of rowIds) this.rowIds.set(row, id);
      this.rowGroupsConfig = this.rowGroupsConfig
        .map((g) => ({
          ...g,
          start: edge(g.start, true) ?? Number.NaN,
          end: edge(g.end, false) ?? Number.NaN,
        }))
        .filter((g) => Number.isInteger(g.start) && Number.isInteger(g.end) && g.end >= g.start);
    } else {
      remapSet(this.hiddenColumns);
    }

    // Range-string-anchored rules: keep any sheet qualifier prefix.
    const transformRangeString = (range: string): string | undefined => {
      const rect = parseRange(range);
      const bang = range.lastIndexOf('!');
      const prefix = bang >= 0 ? range.slice(0, bang + 1) : '';
      const top = kind === 'row' ? edge(rect.top, true) : rect.top;
      const bottom = kind === 'row' ? edge(rect.bottom, false) : rect.bottom;
      const left = kind === 'column' ? edge(rect.left, true) : rect.left;
      const right = kind === 'column' ? edge(rect.right, false) : rect.right;
      if (
        top === undefined ||
        bottom === undefined ||
        left === undefined ||
        right === undefined ||
        bottom < top ||
        right < left
      ) {
        return undefined;
      }
      return prefix + rectToRange({ top, left, bottom, right });
    };

    for (const rule of [...this.validations.all()]) {
      const mapped = transformRangeString(rule.range);
      if (mapped === undefined) this.validations.remove(rule.id);
      else rule.range = mapped;
    }
    for (const rule of [...this.conditionalFormats.all()]) {
      const mapped = transformRangeString(rule.range);
      if (mapped === undefined) this.conditionalFormats.remove(rule.id);
      else rule.range = mapped;
    }

    // Merges.
    this.merges.transform(edge, kind);

    // Tables.
    this.tables.transform(edge, kind);

    // Floating objects (charts, pivots, media) follow their anchors.
    const anchorShift = (pos: number): number => shift(pos) ?? at;
    const transformAnchor = (obj: { anchor: { row: number; column: number } }): void => {
      if (kind === 'row') obj.anchor.row = anchorShift(obj.anchor.row);
      else obj.anchor.column = anchorShift(obj.anchor.column);
    };
    for (const chart of this.charts.all()) {
      transformAnchor(chart);
      const mapped = transformRangeString(chart.source);
      if (mapped !== undefined) chart.source = mapped;
    }
    for (const media of this.media.all()) transformAnchor(media);
  }

  /** Preserve custom sizes across structural changes (no reset to defaults). */
  private transformSizes(kind: 'row' | 'column', at: number, delta: number): void {
    const source = kind === 'row' ? this.rowSizes : this.columnSizes;
    const defaultSize = kind === 'row' ? DEFAULT_ROW_HEIGHT : DEFAULT_COLUMN_WIDTH;
    const newCount = kind === 'row' ? this.rowCount : this.columnCount;
    const oldCount = newCount - delta;
    const fresh = new SizeIndex(newCount, defaultSize);
    for (let i = 0; i < oldCount; i++) {
      const mapped = shiftPosition(i, at, delta);
      if (mapped === undefined) continue;
      const size = source.sizeOf(i);
      if (size !== defaultSize) fresh.setSize(mapped, size);
    }
    if (kind === 'row') Object.assign(this, { rowSizes: fresh });
    else Object.assign(this, { columnSizes: fresh });
  }
}

export interface WorkbookOptions {
  id?: string;
  worksheets?: WorksheetConfig[];
  /** Plugins (§44) run when a grid renderer attaches. */
  extensions?: EzygridPlugin[];
}

export type DefinedNameDefinition =
  | { type: 'range'; ref: string }
  | { type: 'value'; value: unknown };

/** Workbook: owns worksheets, formula graph, history and operation events. */
export class Workbook {
  readonly id: string;
  readonly worksheets: Worksheet[] = [];
  readonly formulaGraph = new DependencyGraph();
  readonly history = new HistoryService();
  /** Defined names (26): named ranges, constants and formulas. */
  readonly definedNames = new Map<string, DefinedNameDefinition>();
  readonly pluginManager: PluginManager;
  private listeners = new Set<(op: Operation) => void>();

  constructor(options: WorkbookOptions = {}) {
    this.id = options.id ?? createId('wb');
    this.pluginManager = new PluginManager(options.extensions ?? []);
    for (const config of options.worksheets ?? []) {
      this.worksheets.push(new Worksheet(this, config));
    }
    if (this.worksheets.length === 0) {
      this.worksheets.push(new Worksheet(this, { name: 'Sheet1' }));
    }
    this.formulaGraph.setNamesResolver((name) => this.resolveNameValue(name));
    this.formulaGraph.setTableResolver((table, column, _item) => {
      const sheet = this.activeWorksheet;
      const tableDef = sheet.tables.get(table);
      if (!tableDef) return new FormulaError('#NAME?');
      const rect = tableDef.range;
      const top = tableDef.headerRow ? rect.top + 1 : rect.top;
      if (column === undefined) {
        return this.matrixFromRange(sheet, rect.left, rect.right, top, rect.bottom);
      }
      const colDef = tableDef.columns.find((c) => c.name === column);
      if (!colDef) return new FormulaError('#REF!');
      return this.matrixFromRange(sheet, colDef.index, colDef.index, top, rect.bottom);
    });
  }

  /** Build a matrix value from a worksheet rectangle. */
  private matrixFromRange(sheet: Worksheet, left: number, right: number, top: number, bottom: number): RuntimeValue {
    const values: RuntimeValue[][] = [];
    for (let r = top; r <= bottom; r++) {
      const row: RuntimeValue[] = [];
      for (let c = left; c <= right; c++) {
        row.push(sheet.readRawValue(this.activeWorksheet.name, r, c));
      }
      values.push(row);
    }
    return { kind: 'matrix', rows: values.length, columns: values[0]?.length ?? 0, values };
  }

  setDefinedName(name: string, definition: DefinedNameDefinition): void {
    this.definedNames.set(name, definition);
  }

  removeDefinedName(name: string): void {
    this.definedNames.delete(name);
  }

  /** Resolve a defined name to a runtime value (constant) or matrix (range). */
  private resolveNameValue(name: string): RuntimeValue {
    const definition = this.definedNames.get(name);
    if (!definition) {
      // Fall back to structured table references (bare table name, §25).
      const tableDef = this.activeWorksheet.tables.get(name);
      if (tableDef) {
        const rect = tableDef.range;
        return this.matrixFromRange(
          this.activeWorksheet,
          rect.left,
          rect.right,
          tableDef.headerRow ? rect.top + 1 : rect.top,
          rect.bottom,
        );
      }
      return new FormulaError('#NAME?');
    }
    if (definition.type === 'value') {
      const value = definition.value;
      if (typeof value === 'string' && value.startsWith('=')) {
        // Named formula: evaluate against the active sheet raw values.
        const graph = this.formulaGraph;
        const sheet = this.activeWorksheet;
        const ast = Parser.parse(value.slice(1));
        const ctx = graph.createContext(sheet.name, (s, r, c) => {
          if (r < 0 || c < 0) return null;
          return sheet.readRawValue(s ?? sheet.name, r, c);
        });
        return graph.evaluateNode(ast, ctx);
      }
      return (value ?? null) as RuntimeValue;
    }
    const rect = parseRange(definition.ref);
    const sheet = rect.sheet ? this.getWorksheet(rect.sheet) : this.activeWorksheet;
    if (!sheet) return new FormulaError('#REF!');
    const values: RuntimeValue[][] = [];
    for (let r = rect.top; r <= rect.bottom; r++) {
      const row: RuntimeValue[] = [];
      for (let c = rect.left; c <= rect.right; c++) {
        row.push(sheet.readRawValue(rect.sheet ?? this.activeWorksheet.name, r, c) as RuntimeValue);
      }
      values.push(row);
    }
    return { kind: 'matrix', rows: values.length, columns: values[0]?.length ?? 0, values };
  }

  getWorksheet(idOrName: string): Worksheet | undefined {
    return (
      this.worksheets.find((w) => w.id === idOrName) ??
      this.worksheets.find((w) => w.name === idOrName)
    );
  }

  get activeWorksheet(): Worksheet {
    return this.worksheets[0]!;
  }

  addWorksheet(config: WorksheetConfig = {}): Worksheet {
    const sheet = new Worksheet(this, config);
    this.worksheets.push(sheet);
    return sheet;
  }

  removeWorksheet(id: string): void {
    const index = this.worksheets.findIndex((w) => w.id === id);
    if (index === -1) throw new Error(`worksheet not found: ${id}`);
    if (this.worksheets.length === 1) throw new Error('cannot remove the last worksheet');
    this.worksheets.splice(index, 1);
  }

  onOperation(listener: (op: Operation) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitOperation(operation: Operation): void {
    this.recordWithInverse(operation);
    for (const listener of this.listeners) listener(operation);
  }
  private recordWithInverse(operation: Operation): void {
    if (operation.type === 'cell.set') {
      const payload = operation.payload as import('@ezygrid/model').SetCellPayload;
      const inverse = op<import('@ezygrid/model').SetCellPayload>(
        this.id,
        'cell.set',
        {
          row: payload.row,
          column: payload.column,
          raw: payload.previous?.raw,
          formula: payload.previous?.formula,
          previous: {
            raw: payload.raw,
            formula: payload.formula,
          },
        },
        operation.worksheetId,
      );
      this.history.push(operation, inverse);
    }
  }

  /** Apply a cell.set operation without re-recording history. */
  private applyCellSet(payload: import('@ezygrid/model').SetCellPayload, worksheetId?: string): void {
    const sheet =
      worksheetId !== undefined
        ? this.worksheets.find((w) => w.id === worksheetId)
        : this.activeWorksheet;
    // Operations referencing a removed sheet cannot be replayed; reject
    // instead of silently targeting the active worksheet.
    if (!sheet) return;
    const existing = sheet.cells.getCell(payload.row, payload.column);
    if (existing?.formula !== undefined) {
      this.formulaGraph.removeFormula(sheet.name, payload.row, payload.column);
    }
    if (payload.formula !== undefined) {
      // Parse before touching state so malformed payloads change nothing.
      const ast = Parser.parse(payload.formula.slice(1));
      sheet.cells.setCell(payload.row, payload.column, { formula: payload.formula });
      this.formulaGraph.setFormula(
        sheet.name,
        payload.row,
        payload.column,
        payload.formula,
        ast,
      );
    } else {
      sheet.cells.setCell(
        payload.row,
        payload.column,
        payload.raw === null || payload.raw === undefined ? undefined : { raw: payload.raw },
      );
    }
  }

  /** Rebuild the workbook-wide formula graph from every worksheet's records. */
  refreshFormulaGraph(): void {
    const graph = this.formulaGraph;
    graph.clear();
    for (const sheet of this.worksheets) {
      sheet.cells.forEach((row, column, record) => {
        if (record.formula !== undefined) {
          graph.setFormula(sheet.name, row, column, record.formula, Parser.parse(record.formula.slice(1)));
        }
      });
    }
  }

  /**
   * Rewrite formulas on EVERY sheet whose references point at the sheet
   * whose rows/columns moved, then rebuild the graph.
   */
  transformFormulasForStructuralChange(sheetName: string, shift: RefTransform): void {
    for (const sheet of this.worksheets) {
      const updates: { row: number; column: number; formula: string }[] = [];
      sheet.cells.forEach((row, column, record) => {
        if (record.formula === undefined) return;
        const body = record.formula.slice(1);
        const transformed = transformFormulaRefs(body, shift, {
          ownerSheet: sheet.name,
          targetSheet: sheetName,
        });
        if (transformed !== body) {
          updates.push({ row, column, formula: `=${transformed}` });
        }
      });
      for (const u of updates) {
        const record = sheet.cells.getCell(u.row, u.column);
        if (record) record.formula = u.formula;
      }
    }
    this.refreshFormulaGraph();
  }

  /** Keep undo/redo cell targets aligned with structural row/column changes. */
  transformHistory(sheetId: string, kind: 'row' | 'column', at: number, delta: number): void {
    this.history.transformCells(sheetId, (row, column) => {
      const mappedRow = kind === 'row' ? shiftPosition(row, at, delta) : row;
      const mappedColumn = kind === 'column' ? shiftPosition(column, at, delta) : column;
      if (mappedRow === undefined || mappedColumn === undefined) return undefined;
      return { row: mappedRow, column: mappedColumn };
    });
  }

  undo(): void {
    const operation = this.history.popUndo();
    if (!operation) return;
    const sheet = this.worksheets.find((w) => w.id === operation.worksheetId);
    // A removed target sheet makes the operation unreplayable; reject it
    // rather than writing to the active worksheet.
    if (!sheet) return;
    const payload = operation.payload as import('@ezygrid/model').SetCellPayload;
    this.applyCellSet(
      {
        row: payload.row,
        column: payload.column,
        raw: payload.previous?.raw,
        formula: payload.previous?.formula,
      },
      operation.worksheetId,
    );
    this.emitOperation({ ...operation, type: 'undo', payload: { of: operation.id } });
  }

  redo(): void {
    const operation = this.history.popRedo();
    if (!operation || operation.type !== 'cell.set') return;
    const sheet = this.worksheets.find((w) => w.id === operation.worksheetId);
    if (!sheet) return;
    this.applyCellSet(operation.payload as import('@ezygrid/model').SetCellPayload, operation.worksheetId);
    // Replay is NOT recording: emitting the raw cell.set through
    // emitOperation would push it onto the undo stack again and clear the
    // remaining redo entries.
    this.emitOperation({ ...operation, type: 'redo', payload: { of: operation.id } });
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  /** Native JSON snapshot (format v1). */
  toJSON(): Record<string, unknown> {
    return {
      format: 'ezygrid',
      version: 1,
      id: this.id,
      worksheets: this.worksheets.map((sheet) => {
        const rows: unknown[][] = [];
        const used = sheet.cells.usedRange;
        if (used) {
          for (let r = 0; r <= used.bottom; r++) {
            const row: unknown[] = [];
            for (let c = 0; c <= used.right; c++) {
              const record = sheet.cells.getCell(r, c);
              if (!record) {
                row.push(null);
                continue;
              }
              row.push(record.formula ?? record.raw ?? null);
            }
            rows.push(row);
          }
        }
        return {
          id: sheet.id,
          name: sheet.name,
          dimensions: { rows: sheet.rowCount, columns: sheet.columnCount },
          data: rows,
        };
      }),
    };
  }
}

export interface CreateGridOptions extends WorkbookOptions {
  /** Target element for future rendering phase. */
  element?: HTMLElement | null;
}

/**
 * Phase 0 entry point. Rendering is not attached yet; this creates the
 * workbook model that the DOM renderer will project.
 */
export function createGrid(_element?: HTMLElement | null, options: CreateGridOptions = {}): Workbook {
  return new Workbook(options);
}

/** Shift a plain position through a structural row/column change (undefined = removed). */
function shiftPosition(pos: number, at: number, delta: number): number | undefined {
  if (delta > 0) return pos >= at ? pos + delta : pos;
  const count = -delta;
  if (pos < at) return pos;
  if (pos < at + count) return undefined;
  return pos - count;
}

/**
 * Shift a range edge through a structural change: edges inside a deleted
 * band collapse to the band boundary so partially surviving ranges shrink
 * and fully deleted ranges invert (and are then dropped by callers).
 */
function shiftRangeEdge(pos: number, at: number, delta: number, isStart: boolean): number | undefined {
  if (delta > 0) return pos >= at ? pos + delta : pos;
  const count = -delta;
  if (pos < at) return pos;
  if (pos < at + count) return isStart ? at : at - 1;
  return pos - count;
}



