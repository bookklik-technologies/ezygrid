import {
  SparseCellStore,
  SizeIndex,
  toA1,
  createId,
  op,
  transformFormulaRefs,
  renameSheetRefs,
  rectToRange,
  HistoryService,
  type Operation,
  type CellRecord,
  type RefTransform,
  type Rect,
  type MetaCellSnapshot,
  type MetaSetPayload,
  type MergesSetPayload,
} from '@ezygrid/model';
import { Parser, DependencyGraph, FormulaError, type RuntimeValue, isMatrix, type MatrixValue } from '@ezygrid/formula';
import { MergeStore } from './merges.js';
import { TableStore } from './tables.js';
import { ValidationService, type ValidationRule } from './validation.js';
import { ConditionalFormatEngine } from './conditional-format.js';
import { ChartEngine } from './charts.js';
import { PivotEngine } from './pivot.js';
import { MediaStore } from './media.js';
import { worksheetToCsv, worksheetFromCsv, type ToCsvOptions, type FromCsvOptions } from './csv-export.js';
import { PluginManager, type EzygridPlugin } from './plugins.js';
import { parseRange } from '@ezygrid/model';


export interface CellInput {
  /** Literal stored value (never reinterpreted as a formula). */
  value?: unknown;
  /** Explicit formula string (leading "=" optional). */
  formula?: string;
  /** Force value to be stored as literal text even if it starts with "=" (§F04). */
  literal?: boolean;
}

export function isCellInput(value: unknown): value is CellInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ('value' in value || 'formula' in value || 'literal' in value)
  );
}

/** Supported sheet dimension limits (XLSX-compatible). */
export const MAX_WORKSHEET_ROWS = 1_048_576;
export const MAX_WORKSHEET_COLUMNS = 16_384;

export interface WorksheetConfig {
  id?: string;
  name?: string;
  rows?: number;
  columns?: number;
  /** 2D matrix of literals, CellInput records, or formula strings. */
  data?: unknown[][];
}

/** Cell-level style properties (§23.2 subset for Phase 2). */
export interface CellStyle {
  fontFamily?: string;
  fontSize?: number;
  wrap?: boolean;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  borders?: Partial<Record<'top' | 'right' | 'bottom' | 'left', { color: string; width: number; style: 'solid' | 'dashed' | 'dotted' } | null>>;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  background?: string;
  align?: 'left' | 'center' | 'right';
}

export interface FilterCriteria {
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'notEmpty';
  value?: string;
}

export const DEFAULT_ROW_HEIGHT = 24;
export const DEFAULT_COLUMN_WIDTH = 100;

/**
 * Worksheet: sparse store + size indexes + formula graph wiring.
 * Model is authoritative; rendering is a projection.
 */
export class Worksheet {
  readonly id: string;
  workbook: Workbook;
  freezeRows = 0;
  freezeColumns = 0;
  readonly pivotSpecs: import('./pivot.js').PivotSpec[] = [];
  readonly filterCriteria = new Map<number, FilterCriteria>();
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
  readonly tables = new TableStore(this);
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
    const created = this.merges.merge(rect);
    if (!created) return;
    // Merges are metadata mutations and must be undoable (F08).
    const payloadRect = { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right };
    this.workbook.emitOperation(
      op(this.workbook.id, 'merges.set', { added: [payloadRect], removed: [] }, this.id),
      [op(this.workbook.id, 'merges.set', { added: [], removed: [payloadRect] }, this.id)],
    );
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
    this.pivotSpecs.push(full);
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
    const existing = this.merges.findAt(rect.top, rect.left);
    if (!this.merges.unmergeAt(rect.top, rect.left)) return;
    const payloadRect = existing
      ? { top: existing.top, left: existing.left, bottom: existing.bottom, right: existing.right }
      : { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right };
    // Unmerging is undoable: the inverse recreates the exact merge (F08).
    this.workbook.emitOperation(
      op(this.workbook.id, 'merges.set', { added: [], removed: [payloadRect] }, this.id),
      [op(this.workbook.id, 'merges.set', { added: [payloadRect], removed: [] }, this.id)],
    );
  }

  /** Apply a number format mask to a range (A1 notation). */
  setNumberFormat(range: string, mask: string): void {
    const rect = parseRange(range);
    // Number formats are metadata mutations and must be undoable (F08).
    this.recordMetaChange(rect, (r, c) => {
      this.numberFormats.set(`${r},${c}`, mask);
    });
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
  /** Rows hidden exclusively by filters — separate from manual hides (F19). */
  private filterHiddenRows = new Set<number>();

  setFilter(column: number, predicate: (value: unknown) => boolean): void {
    this.filterCriteria.delete(column);
    this.filters.set(column, predicate);
    this.applyFilters();
  }

  clearFilter(column?: number): void {
    if (column === undefined) this.filterCriteria.clear();
    else this.filterCriteria.delete(column);
    if (column === undefined) this.filters.clear();
    else this.filters.delete(column);
    this.applyFilters();
  }

  setFilterCriteria(column: number, criteria: FilterCriteria): void {
    if (!Number.isInteger(column) || column < 0 || column >= this.columnCount) throw new Error('invalid filter column');
    const predicate = (value: unknown): boolean => {
      const text = String(value ?? '');
      switch (criteria.operator) {
        case 'equals': return text === (criteria.value ?? '');
        case 'contains': return text.toLowerCase().includes((criteria.value ?? '').toLowerCase());
        case 'gt': return Number(value) > Number(criteria.value);
        case 'lt': return Number(value) < Number(criteria.value);
        case 'notEmpty': return text !== '';
        default: return true;
      }
    };
    this.setFilter(column, predicate);
    this.filterCriteria.set(column, { ...criteria });
  }

  /** Re-evaluate filters after data or formula changes (F19). */
  refreshFilters(): void {
    if (this.filters.size > 0) this.applyFilters();
  }

  private applyFilters(): void {
    // Filters own their own visibility set: manual hides survive
    // clear/reapply, and stale filter rows never leak into hiddenRows.
    this.filterHiddenRows.clear();
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
      if (!visible) this.filterHiddenRows.add(r);
    }
  }

  // ── Cell editor assignment (§13.2 prototype) ─────────────────────────────

  readonly cellEditors = new Map<string, { type: string; options?: unknown }>();

  setCellEditor(range: string, type: string, options?: unknown): void {
    const rect = parseRange(range);
    this.recordMetaChange(rect, (r, c) => {
      this.cellEditors.set(`${r},${c}`, { type, options });
    });
  }

  getEditorFor(row: number, column: number): { type: string; options?: unknown } | undefined {
    return this.cellEditors.get(`${row},${column}`);
  }

  // ── Cell styles (§23): cell-level properties with range application ─────

  readonly styles = new Map<string, CellStyle>();

  setStyle(range: string, style: CellStyle): void {
    const rect = parseRange(range);
    this.recordMetaChange(rect, (r, c) => {
      const key = `${r},${c}`;
      const current = this.styles.get(key) ?? {};
      this.styles.set(key, { ...current, ...style });
    });
  }

  clearStyle(range: string): void {
    const rect = parseRange(range);
    this.recordMetaChange(rect, (r, c) => {
      this.styles.delete(`${r},${c}`);
    });
  }

  getStyle(row: number, column: number): CellStyle | undefined {
    return this.styles.get(`${row},${column}`);
  }

  // ── Notes (§29.1): plain per-cell annotations ────────────────────────────

  readonly notes = new Map<string, string>();

  setNote(range: string, text: string): void {
    const rect = parseRange(range);
    this.recordMetaChange(rect, (r, c) => {
      this.notes.set(`${r},${c}`, text);
    });
  }

  getNote(row: number, column: number): string | undefined {
    return this.notes.get(`${row},${column}`);
  }

  clearNote(range: string): void {
    const rect = parseRange(range);
    this.recordMetaChange(rect, (r, c) => {
      this.notes.delete(`${r},${c}`);
    });
  }

  /**
   * Apply a metadata mutation across a range with a reversible history
   * record: forward op carries the new per-cell values, inverse carries
   * the previous ones (F08). Unchanged cells are omitted from both.
   */
  private recordMetaChange(rect: Rect, mutate: (row: number, column: number) => void): void {
    const before: MetaCellSnapshot[] = [];
    const after: MetaCellSnapshot[] = [];
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        const beforeSnap = this.metaSnapshotFor(r, c);
        mutate(r, c);
        const afterSnap = this.metaSnapshotFor(r, c);
        if (metaSnapshotsDiffer(beforeSnap, afterSnap)) {
          before.push(beforeSnap);
          after.push(afterSnap);
        }
      }
    }
    if (before.length === 0) return;
    this.workbook.emitOperation(
      op<MetaSetPayload>(this.workbook.id, 'meta.set', { cells: after }, this.id),
      [op<MetaSetPayload>(this.workbook.id, 'meta.set', { cells: before }, this.id)],
    );
  }

  /** Complete per-cell metadata snapshot (null = absent). */
  private metaSnapshotFor(row: number, column: number): MetaCellSnapshot {
    const key = `${row},${column}`;
    return {
      row,
      column,
      style: this.styles.get(key) ?? null,
      note: this.notes.get(key) ?? null,
      format: this.numberFormats.get(key) ?? null,
      editor: this.cellEditors.get(key) ?? null,
    };
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
    return this.hiddenRows.has(row) || this.groupHiddenRows.has(row) || this.filterHiddenRows.has(row);
  }

  constructor(workbook: Workbook, config: WorksheetConfig = {}) {
    this.workbook = workbook;
    this.id = config.id ?? createId('sheet');
    // Names are workbook-unique (F11): duplicates and defaults are resolved
    // through the workbook so the formula graph never collides.
    this.name_ = workbook.uniqueSheetName(config.name);
    this.rowCount = validateDimension(config.rows ?? 1000, 'rows');
    this.columnCount = validateDimension(config.columns ?? 26, 'columns');
    this.rowSizes = new SizeIndex(this.rowCount, DEFAULT_ROW_HEIGHT);
    this.columnSizes = new SizeIndex(this.columnCount, DEFAULT_COLUMN_WIDTH);
    if (config.data) this.load2DArray(config.data);
  }

  private name_: string;

  get name(): string {
    return this.name_;
  }

  /** Controlled rename: keeps the formula graph and cross-sheet refs in sync (F11). */
  set name(value: string) {
    if (typeof value !== 'string' || value.trim() === '' || value.includes('!')) {
      throw new Error('worksheet name must be a non-empty string without "!"');
    }
    const next = this.workbook.uniqueSheetName(value, this);
    const previous = this.name_;
    if (next === previous) {
      this.name_ = next;
      return;
    }
    this.name_ = next;
    this.workbook.onWorksheetRenamed(this, previous, next);
  }

  private load2DArray(data: unknown[][]): void {
    for (let r = 0; r < data.length; r++) {
      const row = data[r]!;
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (v === null || v === undefined || v === '') continue;
        if (isCellInput(v)) {
          // Typed cell records: explicit formulas and literal flags (F04).
          if (v.formula !== undefined) {
            this.setCellRaw(r, c, undefined, v.formula.startsWith('=') ? v.formula : `=${v.formula}`);
          } else {
            this.setCellRaw(r, c, v.value);
          }
        } else if (typeof v === 'string' && v.startsWith('=')) {
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
      // Clearing a raw cell invalidates readers of it (F02).
      this.workbook.formulaGraph.notifyCellChange(this.name, row, column);
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
    } else {
      // Raw changes invalidate dependents and range readers (F02).
      this.workbook.formulaGraph.notifyCellChange(this.name, row, column);
    }
  }

  /** Direct formula-cell registration used by snapshot loading (F13). */
  loadFormulaCell(row: number, column: number, formula: string): void {
    if (!formula.startsWith('=')) formula = `=${formula}`;
    this.setCellRaw(row, column, undefined, formula);
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
    const key = `${row},${column}`;
    // Drop this anchor's previous footprint first so blocked checks see only
    // OTHER anchors' coverage (F10).
    this.clearSpill(key);
    const value = graph.recalculate(this.name, row, column, (s, r, c) =>
      this.readRawValue(s ?? this.name, r, c),
    );
    if (isMatrix(value)) {
      if (this.isSpillBlocked(row, column, value.rows, value.columns)) {
        this.spillError.set(key, true);
        return { value: '#SPILL!' };
      }
      this.spillError.delete(key);
      this.registerSpill(row, column, value);
      return { matrix: value, value: value.values[0]?.[0] ?? null };
    }
    this.spillError.delete(key);
    return { value: value instanceof FormulaError ? value.value : value };
  }

  /**
   * Remove the spill occupying a cell: the cell's own spill if it is an
   * anchor, otherwise the anchor that covers it. Undo/redo replay and
   * overwrites use this so ownership never goes stale (F10).
   */
  releaseSpillAt(row: number, column: number): void {
    const key = `${row},${column}`;
    const owner = this.spillCover.get(key) ?? key;
    this.clearSpill(owner);
    this.spillError.delete(key);
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
        // Spills must stay inside the worksheet bounds.
        if (r >= this.rowCount || c >= this.columnCount) return true;
        if (this.cells.getCell(r, c) !== undefined) return true;
        // Another anchor already owns coverage here (this anchor's own
        // footprint was cleared before the check).
        if (this.spillCover.has(`${r},${c}`)) return true;
        // Merged cells must stay anchor-only; a spill cannot enter a merge.
        if (this.merges.findAt(r, c)) return true;
      }
    }
    return false;
  }

  private registerSpill(row: number, column: number, value: MatrixValue): void {
    const key = `${row},${column}`;
    // Atomically replace the previous footprint of this anchor (F10).
    this.clearSpill(key);
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
    assertCoordinate(row, 'row');
    assertCoordinate(column, 'column');
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
    this.releaseSpillAt(row, column);
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
    // Data changed: filters over the affected sheet stay live (F19).
    this.refreshFilters();
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
    const amount = this.validateInsert(index, count, this.rowCount, MAX_WORKSHEET_ROWS);
    this.applyRowsInsert(index, amount);
    this.workbook.emitOperation(
      op(this.workbook.id, 'rows.insert', { index, count: amount }, this.id),
      // Inserted rows hold no data, so deleting them restores the prior state (F08).
      [op(this.workbook.id, 'rows.delete', { index, count: amount }, this.id)],
    );
  }

  deleteRows(index: number, count = 1): void {
    const amount = this.validateDelete(index, count, this.rowCount);
    // Capture the full band (cells + metadata + visibility) BEFORE deletion
    // so the inverse can restore it completely (F08).
    const captured = this.captureRowBand(index, amount);
    this.applyRowsDelete(index, amount);
    this.workbook.emitOperation(
      op(this.workbook.id, 'rows.delete', { index, count: amount }, this.id),
      [
        op(this.workbook.id, 'rows.insert', { index, count: amount }, this.id),
        op(this.workbook.id, 'cells.replace', { cells: captured.cells, hiddenRows: captured.hiddenRows }, this.id),
      ],
    );
  }

  insertColumns(index: number, count = 1): void {
    const amount = this.validateInsert(index, count, this.columnCount, MAX_WORKSHEET_COLUMNS);
    this.applyColumnsInsert(index, amount);
    this.workbook.emitOperation(
      op(this.workbook.id, 'columns.insert', { index, count: amount }, this.id),
      [op(this.workbook.id, 'columns.delete', { index, count: amount }, this.id)],
    );
  }

  deleteColumns(index: number, count = 1): void {
    const amount = this.validateDelete(index, count, this.columnCount);
    const captured = this.captureColumnBand(index, amount);
    this.applyColumnsDelete(index, amount);
    this.workbook.emitOperation(
      op(this.workbook.id, 'columns.delete', { index, count: amount }, this.id),
      [
        op(this.workbook.id, 'columns.insert', { index, count: amount }, this.id),
        op(this.workbook.id, 'cells.replace', { cells: captured.cells, hiddenColumns: captured.hiddenColumns }, this.id),
      ],
    );
  }

  /**
   * Raw structural application used by undo/redo replay: identical to the
   * public operations but emits nothing and records no history.
   */
  applyRowsInsert(index: number, count: number): void {
    this.clearAllSpills();
    this.cells.insertRows(index, count);
    this.rowCount += count;
    this.transformMetadata('row', index, count);
    this.transformSizes('row', index, count);
    this.rewriteFormulas({ kind: 'row', at: index, delta: count });
    this.workbook.transformHistory(this.id, 'row', index, count);
  }

  applyRowsDelete(index: number, count: number): void {
    this.clearAllSpills();
    this.cells.deleteRows(index, count);
    this.rowCount = Math.max(1, this.rowCount - count);
    this.transformMetadata('row', index, -count);
    this.transformSizes('row', index, -count);
    this.rewriteFormulas({ kind: 'row', at: index, delta: -count });
    this.workbook.transformHistory(this.id, 'row', index, -count);
  }

  applyColumnsInsert(index: number, count: number): void {
    this.clearAllSpills();
    this.cells.insertColumns(index, count);
    this.columnCount += count;
    this.transformMetadata('column', index, count);
    this.transformSizes('column', index, count);
    this.rewriteFormulas({ kind: 'column', at: index, delta: count });
    this.workbook.transformHistory(this.id, 'column', index, count);
  }

  applyColumnsDelete(index: number, count: number): void {
    this.clearAllSpills();
    this.cells.deleteColumns(index, count);
    this.columnCount = Math.max(1, this.columnCount - count);
    this.transformMetadata('column', index, -count);
    this.transformSizes('column', index, -count);
    this.rewriteFormulas({ kind: 'column', at: index, delta: -count });
    this.workbook.transformHistory(this.id, 'column', index, -count);
  }

  private validateInsert(index: number, count: number, dimension: number, limit: number): number {
    if (!Number.isInteger(index) || index < 0 || index > dimension) {
      throw new RangeError(`insert index must be an integer within [0, ${dimension}], got ${index}`);
    }
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError(`insert count must be a positive integer, got ${count}`);
    }
    if (dimension + count > limit) {
      throw new RangeError(`structural insert exceeds the supported dimension limit (${limit})`);
    }
    return count;
  }

  private validateDelete(index: number, count: number, dimension: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= dimension) {
      throw new RangeError(`delete index must be an integer within [0, ${dimension - 1}], got ${index}`);
    }
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError(`delete count must be a positive integer, got ${count}`);
    }
    return Math.min(count, dimension - index);
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
      remapSet(this.filterHiddenRows);
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

  /** Snapshot a row band (cells, metadata, visibility) for undo restore (F08). */
  private captureRowBand(index: number, count: number): { cells: CellSnapshot[]; hiddenRows: number[] } {
    const cells: CellSnapshot[] = [];
    for (let r = index; r < index + count; r++) {
      this.cells.forEach((row, column, record) => {
        if (row < index || row >= index + count) return;
        cells.push({
          row,
          column,
          raw: record.raw,
          formula: record.formula,
          style: this.styles.get(`${row},${column}`) ?? null,
          note: this.notes.get(`${row},${column}`) ?? null,
          format: this.numberFormats.get(`${row},${column}`) ?? null,
          editor: this.cellEditors.get(`${row},${column}`) ?? null,
        });
      });
    }
    const hiddenRows = [...this.hiddenRows].filter((r) => r >= index && r < index + count);
    return { cells, hiddenRows };
  }

  /** Snapshot a column band for undo restore (F08). */
  private captureColumnBand(index: number, count: number): { cells: CellSnapshot[]; hiddenColumns: number[] } {
    const cells: CellSnapshot[] = [];
    this.cells.forEach((row, column, record) => {
      if (column < index || column >= index + count) return;
      cells.push({
        row,
        column,
        raw: record.raw,
        formula: record.formula,
        style: this.styles.get(`${row},${column}`) ?? null,
        note: this.notes.get(`${row},${column}`) ?? null,
        format: this.numberFormats.get(`${row},${column}`) ?? null,
        editor: this.cellEditors.get(`${row},${column}`) ?? null,
      });
    });
    const hiddenColumns = [...this.hiddenColumns].filter((c) => c >= index && c < index + count);
    return { cells, hiddenColumns };
  }
}

export interface WorkbookOptions {
  filename?: string;
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
  filename: string;
  private activeSheetId?: string;
  private transactionDepth = 0;
  readonly id: string;
  readonly worksheets: Worksheet[] = [];
  readonly formulaGraph = new DependencyGraph();
  readonly history = new HistoryService();
  /** Defined names (26): named ranges, constants and formulas. */
  readonly definedNames = new Map<string, DefinedNameDefinition>();
  readonly pluginManager: PluginManager;
  private listeners = new Set<(op: Operation) => void>();
  /** Update-transaction state for batched notifications (F02). */
  private updateDepth = 0;
  private suppressedOps = 0;
  private pendingOperations: Operation[] = [];

  constructor(options: WorkbookOptions = {}) {
    this.filename = options.filename ?? 'Untitled workbook';
    this.id = options.id ?? createId('wb');
    this.pluginManager = new PluginManager(options.extensions ?? []);
    for (const config of options.worksheets ?? []) {
      this.worksheets.push(new Worksheet(this, config));
    }
    if (this.worksheets.length === 0) {
      this.worksheets.push(new Worksheet(this, { name: 'Sheet1' }));
    }
    this.formulaGraph.setNamesResolver((name) => this.resolveNameValue(name));
    this.formulaGraph.setTableResolver((table, column, item, context) => {
      // Structured references resolve workbook-wide, preferring the formula's
      // own sheet, and support current-row (@item) semantics (F21).
      const sheet = this.findTableSheet(table, context.sheet);
      if (!sheet) return new FormulaError('#NAME?');
      const tableDef = sheet.tables.get(table);
      if (!tableDef) return new FormulaError('#NAME?');
      const rect = tableDef.range;
      const top = tableDef.headerRow ? rect.top + 1 : rect.top;
      if (column === undefined) {
        return this.matrixFromRange(sheet, rect.left, rect.right, top, rect.bottom);
      }
      const colDef = tableDef.columns.find((c) => c.name === column);
      if (!colDef) return new FormulaError('#REF!');
      if (item) {
        // Table[@Column]: the current row's value (scalar), not the column.
        const row = context.row;
        if (row < top || row > rect.bottom) return new FormulaError('#VALUE!');
        return sheet.readRawValue(sheet.name, row, colDef.index);
      }
      return this.matrixFromRange(sheet, colDef.index, colDef.index, top, rect.bottom);
    });
  }

  /** Find a table by name: the formula's sheet first, then any sheet (F21). */
  private findTableSheet(table: string, formulaSheet: string): Worksheet | undefined {
    const owner = this.getWorksheet(formulaSheet);
    if (owner?.tables.get(table)) return owner;
    return this.worksheets.find((sheet) => sheet.tables.get(table) !== undefined);
  }

  /** Build a matrix value from a worksheet rectangle. */
  private matrixFromRange(sheet: Worksheet, left: number, right: number, top: number, bottom: number): RuntimeValue {
    const values: RuntimeValue[][] = [];
    for (let r = top; r <= bottom; r++) {
      const row: RuntimeValue[] = [];
      for (let c = left; c <= right; c++) {
        row.push(sheet.readRawValue(sheet.name, r, c));
      }
      values.push(row);
    }
    return { kind: 'matrix', rows: values.length, columns: values[0]?.length ?? 0, values };
  }

  setDefinedName(name: string, definition: DefinedNameDefinition): void {
    this.definedNames.set(name, definition);
    // Name definitions resolve dynamically: readers must recompute (F02).
    this.formulaGraph.invalidateOpaqueFormulas();
  }

  removeDefinedName(name: string): void {
    this.definedNames.delete(name);
    this.formulaGraph.invalidateOpaqueFormulas();
  }

  /** Resolve a defined name to a runtime value (constant) or matrix (range). */
  private resolveNameValue(name: string): RuntimeValue {
    const definition = this.definedNames.get(name);
    if (!definition) {
      // Fall back to structured table references (bare table name, §25).
      // Tables resolve workbook-wide (F21).
      const sheet = this.findTableSheet(name, this.activeWorksheet.name);
      const tableDef = sheet?.tables.get(name);
      if (sheet && tableDef) {
        const rect = tableDef.range;
        return this.matrixFromRange(
          sheet,
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
    return this.worksheets.find((sheet) => sheet.id === this.activeSheetId) ?? this.worksheets[0]!;
  }

  setActiveWorksheet(id: string): void {
    const sheet = this.getWorksheet(id);
    if (!sheet) throw new Error(`worksheet not found: ${id}`);
    if (sheet === this.activeWorksheet) return;
    this.activeSheetId = sheet.id;
    this.emitOperation(op(this.id, 'worksheet.activate', { id: sheet.id }, sheet.id));
  }

  moveWorksheet(id: string, index: number): void {
    const sheet = this.getWorksheet(id);
    if (!sheet || !Number.isInteger(index) || index < 0 || index >= this.worksheets.length) {
      throw new Error('invalid worksheet position');
    }
    this.transaction(() => {
      this.worksheets.splice(this.worksheets.indexOf(sheet), 1);
      this.worksheets.splice(index, 0, sheet);
    });
  }

  /** One reversible editor action, including feature metadata; failures roll back. */
  transaction(action: () => void): void {
    if (this.transactionDepth > 0) { action(); return; }
    const before = this.captureDocument();
    this.transactionDepth++;
    this.beginUpdate();
    try {
      action();
      const after = this.captureDocument();
      this.history.push(op(this.id, 'document.restore', after), op(this.id, 'document.restore', before));
      this.suppressedOps++;
    } catch (error) {
      this.restoreDocument(before);
      this.pendingOperations = [];
      this.suppressedOps++;
      throw error;
    } finally {
      this.transactionDepth--;
      this.endUpdate();
    }
  }

  private captureDocument(): Record<string, unknown> {
    const snapshot = this.toJSON();
    // Runtime history preserves callbacks even though exported JSON cannot.
    const sheets = snapshot.worksheets as Record<string, unknown>[];
    this.worksheets.forEach((sheet, index) => {
      sheets[index]!.validations = sheet.validations.all().map((rule) => ({ ...rule }));
      sheets[index]!.conditionalFormats = sheet.conditionalFormats.all().map((rule) => ({ ...rule, style: { ...rule.style } }));
      sheets[index]!.runtimeFilters = [...sheet.filters].filter(([column]) => !sheet.filterCriteria.has(column));
    });
    return cloneSnapshot(snapshot);
  }

  /** Replace a validated document while retaining this workbook and its listeners. */
  loadJSON(data: unknown): void {
    const staged = Workbook.fromJSON(data);
    this.adoptDocument(staged);
    this.history.clear();
    this.emitOperation(op(this.id, 'document.load', {}));
  }

  private restoreDocument(data: unknown): void {
    this.adoptDocument(Workbook.fromJSON(data));
  }

  private adoptDocument(staged: Workbook): void {
    const activeId = staged.activeWorksheet.id;
    const sheets = staged.worksheets.map((sheet) => {
      sheet.workbook = this;
      const existing = this.getWorksheet(sheet.id);
      return existing ? Object.assign(existing, sheet) : sheet;
    });
    this.worksheets.splice(0, this.worksheets.length, ...sheets);
    this.filename = staged.filename;
    this.activeSheetId = activeId;
    this.definedNames.clear();
    for (const [name, definition] of staged.definedNames) this.definedNames.set(name, definition);
    this.refreshFormulaGraph();
  }

  /**
   * Resolve a workbook-unique worksheet display name. Duplicate or empty
   * requests get a deterministic suffix (F11).
   */
  uniqueSheetName(desired: string | undefined, exclude?: Worksheet): string {
    const taken = new Set(
      this.worksheets.filter((sheet) => sheet !== exclude).map((sheet) => sheet.name),
    );
    const base =
      typeof desired === 'string' && desired.trim() !== '' && !desired.includes('!')
        ? desired
        : 'Sheet1';
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) {
      const candidate = `${base}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  /** Sync formula text and the graph after a controlled rename (F11). */
  onWorksheetRenamed(sheet: Worksheet, previous: string, next: string): void {
    if (previous === next) return;
    for (const other of this.worksheets) {
      other.cells.forEach((row, column, record) => {
        if (record.formula === undefined) return;
        const body = record.formula.slice(1);
        const renamed = renameSheetRefs(body, previous, next);
        if (renamed !== body) record.formula = `=${renamed}`;
      });
    }
    this.refreshFormulaGraph();
    this.emitOperation(op(this.id, 'worksheet.rename', { previous, next }, sheet.id));
  }

  addWorksheet(config: WorksheetConfig = {}): Worksheet {
    const sheet = new Worksheet(this, config);
    this.worksheets.push(sheet);
    this.emitOperation(op(this.id, 'worksheet.add', {}, sheet.id));
    return sheet;
  }

  removeWorksheet(id: string): void {
    const index = this.worksheets.findIndex((w) => w.id === id);
    if (index === -1) throw new Error(`worksheet not found: ${id}`);
    if (this.worksheets.length === 1) throw new Error('cannot remove the last worksheet');
    const removed = this.worksheets[index]!;
    // Removed sheets must never keep evaluating through the graph (F11):
    // drop every registration before splicing.
    this.formulaGraph.removeSheet(removed.name);
    this.worksheets.splice(index, 1);
    this.refreshFormulaGraph();
    this.emitOperation(op(this.id, 'worksheet.remove', {}, id));
  }

  onOperation(listener: (op: Operation) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Batch model notifications: during an update, operations are recorded
   * (history) but listeners receive ONE aggregated `workbook.update` event
   * at the end, so bulk actions (paste, fill, CSV import) produce one
   * render pass instead of one per cell (F02). Synchronous: the final
   * notification happens inside endUpdate.
   */
  beginUpdate(): void {
    this.updateDepth += 1;
  }

  endUpdate(): void {
    this.updateDepth = Math.max(0, this.updateDepth - 1);
    if (this.updateDepth > 0) return;
    const count = this.suppressedOps;
    const operations = this.pendingOperations;
    this.pendingOperations = [];
    this.suppressedOps = 0;
    if (count === 0) return;
    const reference = this.activeWorksheet;
    for (const listener of this.listeners) {
      listener({
        id: `update-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        workbookId: this.id,
        worksheetId: reference?.id,
        type: 'workbook.update',
        payload: { count, operations },
        timestamp: Date.now(),
      });
    }
  }

  emitOperation(operation: Operation, inverse?: Operation[]): void {
    if (!this.transactionDepth) this.recordWithInverse(operation, inverse);
    // Inside an update transaction listeners get one aggregated event (F02).
    if (this.updateDepth > 0) {
      this.suppressedOps += 1;
      this.pendingOperations.push(operation);
      return;
    }
    for (const listener of this.listeners) listener(operation);
  }

  private recordWithInverse(operation: Operation, providedInverse?: Operation[]): void {
    let inverse = providedInverse;
    if (!inverse && operation.type === 'cell.set') {
      const payload = operation.payload as import('@ezygrid/model').SetCellPayload;
      inverse = [
        op<import('@ezygrid/model').SetCellPayload>(
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
        ),
      ];
    }
    // Only reversible operations enter history; a missing inverse would
    // otherwise produce an undo that restores nothing (F08).
    if (inverse && inverse.length > 0) {
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
    // Spill ownership first: stale coverage must not survive replay (F10).
    sheet.releaseSpillAt(payload.row, payload.column);
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
      // Replay of raw writes must invalidate dependents/range readers (F02).
      this.formulaGraph.notifyCellChange(sheet.name, payload.row, payload.column);
    }
    sheet.refreshFilters();
  }

  /**
   * Apply a bulk cell snapshot (cells + per-cell metadata) used by the
   * inverse of deletes and sorts (F08).
   */
  private applyCellsReplace(
    payload: { cells?: CellSnapshot[]; hiddenRows?: number[]; hiddenColumns?: number[] },
    worksheetId?: string,
  ): void {
    const sheet = worksheetId ? this.worksheets.find((w) => w.id === worksheetId) : undefined;
    if (!sheet) return;
    for (const cell of payload.cells ?? []) {
      sheet.releaseSpillAt(cell.row, cell.column);
      const existing = sheet.cells.getCell(cell.row, cell.column);
      if (existing?.formula !== undefined) {
        this.formulaGraph.removeFormula(sheet.name, cell.row, cell.column);
      }
      sheet.cells.setCell(
        cell.row,
        cell.column,
        cell.raw === undefined && cell.formula === undefined
          ? undefined
          : cell.formula !== undefined
            ? { formula: cell.formula }
            : { raw: cell.raw },
      );
      const key = `${cell.row},${cell.column}`;
      if (cell.style === null || cell.style === undefined) sheet.styles.delete(key);
      else sheet.styles.set(key, cell.style);
      if (cell.note === null) sheet.notes.delete(key);
      else if (cell.note !== undefined) sheet.notes.set(key, cell.note);
      if (cell.format === null) sheet.numberFormats.delete(key);
      else if (cell.format !== undefined) sheet.numberFormats.set(key, cell.format);
      if (cell.editor === null) sheet.cellEditors.delete(key);
      else if (cell.editor !== undefined) sheet.cellEditors.set(key, cell.editor);
    }
    if (payload.hiddenRows) for (const row of payload.hiddenRows) sheet.hiddenRows.add(row);
    if (payload.hiddenColumns) for (const column of payload.hiddenColumns) sheet.hiddenColumns.add(column);
    this.refreshFormulaGraph();
    sheet.refreshFilters();
  }

  /** Replay per-cell metadata (style/note/format/editor) snapshots (F08). */
  private applyMetaSet(payload: MetaSetPayload, worksheetId?: string): void {
    const sheet = worksheetId ? this.worksheets.find((w) => w.id === worksheetId) : undefined;
    if (!sheet) return;
    for (const cell of payload.cells) {
      const key = `${cell.row},${cell.column}`;
      if (cell.style === null) sheet.styles.delete(key);
      else if (cell.style !== undefined) sheet.styles.set(key, cell.style as CellStyle);
      if (cell.note === null) sheet.notes.delete(key);
      else if (cell.note !== undefined) sheet.notes.set(key, cell.note);
      if (cell.format === null) sheet.numberFormats.delete(key);
      else if (cell.format !== undefined) sheet.numberFormats.set(key, cell.format);
      if (cell.editor === null) sheet.cellEditors.delete(key);
      else if (cell.editor !== undefined) sheet.cellEditors.set(key, cell.editor);
    }
  }

  /** Replay merge/unmerge state: removals first, then creations (F08). */
  private applyMergesSet(payload: MergesSetPayload, worksheetId?: string): void {
    const sheet = worksheetId ? this.worksheets.find((w) => w.id === worksheetId) : undefined;
    if (!sheet) return;
    for (const rect of payload.removed ?? []) {
      sheet.merges.unmergeAt(rect.top, rect.left);
    }
    for (const rect of payload.added ?? []) {
      sheet.merges.merge(rect);
    }
  }

  /** Replay a stored history operation (cell, bulk or structural). */
  private applyHistoryOperation(operation: Operation): void {
    switch (operation.type) {
      case 'document.restore':
        this.restoreDocument(operation.payload);
        break;
      case 'cell.set':
        this.applyCellSet(operation.payload as import('@ezygrid/model').SetCellPayload, operation.worksheetId);
        break;
      case 'cells.replace':
        this.applyCellsReplace(
          operation.payload as { cells?: CellSnapshot[]; hiddenRows?: number[]; hiddenColumns?: number[] },
          operation.worksheetId,
        );
        break;
      case 'meta.set':
        this.applyMetaSet(operation.payload as MetaSetPayload, operation.worksheetId);
        break;
      case 'merges.set':
        this.applyMergesSet(operation.payload as MergesSetPayload, operation.worksheetId);
        break;
      case 'rows.insert': {
        const { index, count } = operation.payload as { index: number; count: number };
        this.worksheets.find((w) => w.id === operation.worksheetId)?.applyRowsInsert(index, count);
        break;
      }
      case 'rows.delete': {
        const { index, count } = operation.payload as { index: number; count: number };
        this.worksheets.find((w) => w.id === operation.worksheetId)?.applyRowsDelete(index, count);
        break;
      }
      case 'columns.insert': {
        const { index, count } = operation.payload as { index: number; count: number };
        this.worksheets.find((w) => w.id === operation.worksheetId)?.applyColumnsInsert(index, count);
        break;
      }
      case 'columns.delete': {
        const { index, count } = operation.payload as { index: number; count: number };
        this.worksheets.find((w) => w.id === operation.worksheetId)?.applyColumnsDelete(index, count);
        break;
      }
      default:
        break;
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

  /**
   * Keep undo/redo targets aligned with structural row/column changes.
   * Coordinates of entries on the edited sheet are remapped, and every
   * stored formula (forward, inverse and snapshot) is rewritten when its
   * references point at the changed sheet (F07).
   */
  transformHistory(sheetId: string, kind: 'row' | 'column', at: number, delta: number): void {
    if (this.transactionDepth) return;
    const targetSheet = this.worksheets.find((w) => w.id === sheetId);
    if (!targetSheet) return;
    const shift: RefTransform = { kind, at, delta };
    // Edge-based mapping mirrors the live merge transform: edges inside a
    // deleted band collapse to the boundary, inverted ranges are dropped.
    const edge = (pos: number, isStart: boolean): number | undefined =>
      shiftRangeEdge(pos, at, delta, isStart);
    const mapRange = (rect: Rect) => {
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
      return { top, left, bottom, right };
    };
    this.history.transformCells(
      sheetId,
      (row, column) => {
        const mappedRow = kind === 'row' ? shiftPosition(row, at, delta) : row;
        const mappedColumn = kind === 'column' ? shiftPosition(column, at, delta) : column;
        if (mappedRow === undefined || mappedColumn === undefined) return undefined;
        return { row: mappedRow, column: mappedColumn };
      },
      (formula, operationSheetId) => {
        const owner = this.worksheets.find((w) => w.id === operationSheetId);
        if (!owner) return formula;
        const body = formula.slice(1);
        const transformed = transformFormulaRefs(body, shift, {
          ownerSheet: owner.name,
          targetSheet: targetSheet.name,
        });
        return transformed === body ? formula : `=${transformed}`;
      },
      mapRange,
    );
  }

  undo(): void {
    const entry = this.history.popUndo();
    if (!entry) return;
    // Replay is NOT recording: applying through applyHistoryOperation never
    // re-pushes onto the undo stack or clears remaining redo entries.
    // The in-flight entry is excluded from its own replay's transforms (F07).
    this.history.setTransformExclusion(entry);
    try {
      // A removed target sheet makes its operations unreplayable; they are
      // skipped rather than silently writing to the active worksheet.
      for (const operation of entry.inverse) {
        this.applyHistoryOperation(operation);
      }
    } finally {
      this.history.setTransformExclusion(null);
    }
    this.emitMarker(entry, 'undo');
  }

  redo(): void {
    const entry = this.history.popRedo();
    if (!entry) return;
    this.history.setTransformExclusion(entry);
    try {
      for (const operation of entry.forward) {
        this.applyHistoryOperation(operation);
      }
    } finally {
      this.history.setTransformExclusion(null);
    }
    this.emitMarker(entry, 'redo');
  }

  private emitMarker(entry: { forward: Operation[]; inverse: Operation[] }, type: 'undo' | 'redo'): void {
    const reference = entry.forward[0] ?? entry.inverse[0];
    this.listeners.forEach((listener) =>
      listener({
        id: `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        workbookId: this.id,
        worksheetId: reference?.worksheetId,
        type,
        payload: { of: reference?.id ?? null },
        timestamp: Date.now(),
      }),
    );
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  /**
   * Versioned, sparse document snapshot (format v2, F13). Serializes every
   * serializable feature with explicit cell typing: a cell is a formula
   * only when `formula` is present, so literal "="-prefixed text survives
   * round-trips. Non-serializable state (custom predicates in validation /
   * conditional-format rules, pivot caches) is omitted rather than silently
   * degraded.
   */
  toJSON(): Record<string, unknown> {
    return {
      format: 'ezygrid',
      version: 2,
      id: this.id,
      filename: this.filename,
      activeWorksheetId: this.activeWorksheet.id,
      definedNames: [...this.definedNames.entries()]
        .filter(([, definition]) => definition.type === 'range' || (definition.type === 'value' && typeof definition.value !== 'function'))
        .map(([name, definition]) => ({ name, definition })),
      worksheets: this.worksheets.map((sheet) => {
        const cells: [number, number, { raw?: unknown; formula?: string }][] = [];
        sheet.cells.forEach((row, column, record) => {
          const entry: { raw?: unknown; formula?: string } = {};
          if (record.formula !== undefined) entry.formula = record.formula;
          if (record.raw !== undefined) entry.raw = record.raw;
          cells.push([row, column, entry]);
        });
        return {
          id: sheet.id,
          name: sheet.name,
          rows: sheet.rowCount,
          columns: sheet.columnCount,
          cells,
          styles: [...sheet.styles.entries()],
          numberFormats: [...sheet.numberFormats.entries()],
          notes: [...sheet.notes.entries()],
          cellEditors: [...sheet.cellEditors.entries()],
          merges: sheet.merges.all.map((m) => rectToRange(m)),
          hiddenRows: [...sheet.hiddenRows],
          hiddenColumns: [...sheet.hiddenColumns],
          rowSizes: [...sheet.rowSizes.getCustomSizes().entries()],
          columnSizes: [...sheet.columnSizes.getCustomSizes().entries()],
          rowGroups: [...sheet.getGroups()],
          nestedHeaders: sheet.nestedHeaders.map((level) => [...level]),
          filterCriteria: [...sheet.filterCriteria],
          freezeRows: sheet.freezeRows,
          freezeColumns: sheet.freezeColumns,
          pivots: sheet.pivotSpecs.map((spec) => ({ ...spec, rows: [...spec.rows], values: spec.values.map((value) => ({ ...value })) })),
          tables: sheet.tables.all().map((table) => ({
            name: table.name,
            range: rectToRange(table.range),
            headerRow: table.headerRow,
            totalRow: table.totalRow,
          })),
          validations: [...sheet.validations.all()]
            .filter((rule) => rule.predicate === undefined)
            .map((rule) => ({ range: rule.range, type: rule.type, action: rule.action, min: rule.min, max: rule.max, values: rule.values, length: rule.length, message: rule.message })),
          conditionalFormats: [...sheet.conditionalFormats.all()]
            .filter((rule) => rule.predicate === undefined)
            .map((rule) => ({ range: rule.range, type: rule.type, operator: rule.operator, value: rule.value, text: rule.text, n: rule.n, style: rule.style, priority: rule.priority, stopIfTrue: rule.stopIfTrue })),
          charts: sheet.charts.all().map((chart) => ({ ...chart })),
          media: sheet.media.all().map((object) => ({ ...object })),
        };
      }),
    };
  }

  /** Load a snapshot produced by toJSON (F13); throws on unknown formats. */
  static fromJSON(data: unknown): Workbook {
    if (data === null || typeof data !== 'object') {
      throw new Error('invalid ezygrid snapshot: expected an object');
    }
    const snapshot = data as {
      format?: unknown;
      version?: unknown;
      id?: unknown;
      filename?: unknown;
      activeWorksheetId?: unknown;
      definedNames?: unknown;
      worksheets?: unknown;
    };
    if (snapshot.format !== 'ezygrid') {
      throw new Error('invalid ezygrid snapshot: unknown format');
    }
    if (snapshot.version !== 2) {
      throw new Error(`unsupported ezygrid snapshot version: ${String(snapshot.version)}`);
    }
    const worksheetSnapshots = Array.isArray(snapshot.worksheets) ? snapshot.worksheets : [];
    const workbook = new Workbook({
      filename: typeof snapshot.filename === 'string' ? snapshot.filename : undefined,
      id: typeof snapshot.id === 'string' ? snapshot.id : undefined,
      worksheets: worksheetSnapshots.map((raw: any) => ({
        id: typeof raw?.id === 'string' ? raw.id : undefined,
        name: typeof raw?.name === 'string' ? raw.name : undefined,
        rows: typeof raw?.rows === 'number' ? raw.rows : undefined,
        columns: typeof raw?.columns === 'number' ? raw.columns : undefined,
      })),
    });
    worksheetSnapshots.forEach((raw: any, index: number) => {
      const sheet = workbook.worksheets[index];
      if (!sheet) return;
      const cells = Array.isArray(raw?.cells) ? raw.cells : [];
      for (const entry of cells) {
        if (!Array.isArray(entry) || entry.length < 3) continue;
        const [row, column, payload] = entry as [number, number, { raw?: unknown; formula?: string }];
        if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0) continue;
        if (payload?.formula !== undefined) {
          sheet.loadFormulaCell(row, column, payload.formula);
        } else if (payload?.raw !== undefined) {
          sheet.cells.setCell(row, column, { raw: payload.raw });
        }
      }
      applyEntries(sheet.styles, raw?.styles);
      applyEntries(sheet.numberFormats, raw?.numberFormats);
      applyEntries(sheet.notes, raw?.notes);
      applyEntries(sheet.cellEditors, raw?.cellEditors);
      for (const merge of Array.isArray(raw?.merges) ? raw.merges : []) {
        try {
          sheet.merge(String(merge));
        } catch {
          // invalid merge refs are skipped rather than failing the load
        }
      }
      for (const row of Array.isArray(raw?.hiddenRows) ? raw.hiddenRows : []) {
        if (Number.isInteger(row) && row >= 0) sheet.hiddenRows.add(row);
      }
      for (const column of Array.isArray(raw?.hiddenColumns) ? raw.hiddenColumns : []) {
        if (Number.isInteger(column) && column >= 0) sheet.hiddenColumns.add(column);
      }
      // Custom sizes restore through SizeIndex validation; invalid entries
      // are skipped rather than failing the whole load (F13).
      for (const entry of Array.isArray(raw?.rowSizes) ? raw.rowSizes : []) {
        try {
          if (Array.isArray(entry) && Number.isInteger(entry[0]) && entry[0] >= 0) {
            sheet.rowSizes.setSize(entry[0]!, entry[1] as number);
          }
        } catch {
          // out-of-range or invalid sizes are skipped
        }
      }
      for (const entry of Array.isArray(raw?.columnSizes) ? raw.columnSizes : []) {
        try {
          if (Array.isArray(entry) && Number.isInteger(entry[0]) && entry[0] >= 0) {
            sheet.columnSizes.setSize(entry[0]!, entry[1] as number);
          }
        } catch {
          // out-of-range or invalid sizes are skipped
        }
      }
      for (const group of Array.isArray(raw?.rowGroups) ? raw.rowGroups : []) {
        if (
          group && Number.isInteger(group.start) && Number.isInteger(group.end) &&
          Number.isInteger(group.end) && group.end >= group.start
        ) {
          sheet.groupRows(group.start, group.end);
          if (group.collapsed) sheet.collapseGroup(group.start);
        }
      }
      if (Array.isArray(raw?.nestedHeaders)) sheet.setNestedHeaders(raw.nestedHeaders);
      sheet.freezeRows = Math.max(0, Math.min(sheet.rowCount, Number(raw?.freezeRows) || 0));
      sheet.freezeColumns = Math.max(0, Math.min(sheet.columnCount, Number(raw?.freezeColumns) || 0));
      for (const [column, criteria] of Array.isArray(raw?.filterCriteria) ? raw.filterCriteria : []) sheet.setFilterCriteria(column, criteria);
      for (const [column, predicate] of Array.isArray(raw?.runtimeFilters) ? raw.runtimeFilters : []) {
        if (typeof predicate === 'function') sheet.setFilter(column, predicate);
      }
      for (const spec of Array.isArray(raw?.pivots) ? raw.pivots : []) sheet.pivotSpecs.push(spec);
      for (const table of Array.isArray(raw?.tables) ? raw.tables : []) {
        if (table && typeof table.name === 'string' && typeof table.range === 'string') {
          try {
            sheet.addTable({
              name: table.name,
              range: table.range,
              headerRow: table.headerRow !== false,
              totalRow: table.totalRow === true,
            });
          } catch {
            // duplicate/invalid tables are skipped rather than failing the load
          }
        }
      }
      for (const rule of Array.isArray(raw?.validations) ? raw.validations : []) {
        if (rule && typeof rule.range === 'string' && typeof rule.type === 'string') {
          sheet.addValidation({
            ...rule,
            range: rule.range,
            type: rule.type,
            action: rule.action ?? 'mark',
            min: rule.min,
            max: rule.max,
            values: rule.values,
            length: rule.length,
            message: rule.message,
            predicate: typeof rule.predicate === 'function' ? rule.predicate : undefined,
          });
        }
      }
      for (const rule of Array.isArray(raw?.conditionalFormats) ? raw.conditionalFormats : []) {
        if (rule && typeof rule.range === 'string' && typeof rule.type === 'string') {
          sheet.conditionalFormats.add({
            ...rule,
            range: rule.range,
            type: rule.type,
            operator: rule.operator,
            value: rule.value,
            text: rule.text,
            n: rule.n,
            style: rule.style ?? {},
            priority: rule.priority ?? 0,
            stopIfTrue: rule.stopIfTrue,
            predicate: typeof rule.predicate === 'function' ? rule.predicate : undefined,
          });
        }
      }
      for (const chart of Array.isArray(raw?.charts) ? raw.charts : []) {
        if (chart && typeof chart === 'object' && typeof chart.type === 'string' && typeof chart.source === 'string') {
          sheet.addChart(chart);
        }
      }
      for (const object of Array.isArray(raw?.media) ? raw.media : []) {
        if (object && typeof object === 'object' && object.kind === 'image') {
          sheet.addImage(object);
        } else if (object && typeof object === 'object') {
          sheet.addShape(object);
        }
      }
    });
    if (Array.isArray(snapshot.definedNames)) {
      for (const entry of snapshot.definedNames) {
        if (entry && typeof entry.name === 'string' && entry.definition) {
          workbook.setDefinedName(entry.name, entry.definition);
        }
      }
    }
    // Loading replays recorded mutations (merges); a fresh document starts
    // with an empty history so its first undo is the first user edit.
    workbook.history.clear();
    if (typeof snapshot.activeWorksheetId === 'string' && workbook.getWorksheet(snapshot.activeWorksheetId)) {
      workbook.activeSheetId = snapshot.activeWorksheetId;
    }
    return workbook;
  }
}

/** Apply serialized map entries to a worksheet map (F13 loader helper). */
function cloneSnapshot<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneSnapshot(entry)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneSnapshot(entry)])) as T;
  }
  return value;
}

/** Apply serialized map entries to a worksheet map (F13 loader helper). */
function applyEntries<T>(target: Map<string, T>, raw: unknown): void {
  if (!Array.isArray(raw)) return;
  for (const entry of raw) {
    if (Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === 'string') {
      target.set(entry[0]!, entry[1] as T);
    }
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
 * Serialized cell snapshot used by undo/redo replay and document snapshots
 * (F08/F13): explicit typing so raw "="-strings never re-enter as formulas.
 */
export interface CellSnapshot {
  row: number;
  column: number;
  raw?: unknown;
  formula?: string;
  style?: CellStyle | null;
  note?: string | null;
  format?: string | null;
  editor?: { type: string; options?: unknown } | null;
}

function assertCoordinate(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`cell ${label} must be a non-negative integer, got ${value}`);
  }
}

/** Compare two metadata snapshots field-by-field (styles compare by value). */
function metaSnapshotsDiffer(a: MetaCellSnapshot, b: MetaCellSnapshot): boolean {
  const same = (x: unknown, y: unknown): boolean =>
    x === y || (x !== null && y !== null && x !== undefined && y !== undefined && JSON.stringify(x) === JSON.stringify(y));
  return (
    !same(a.style, b.style) ||
    !same(a.note, b.note) ||
    !same(a.format, b.format) ||
    !same(a.editor, b.editor)
  );
}

function validateDimension(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`worksheet ${label} must be a positive integer, got ${value}`);
  }
  const limit = label === 'columns' ? MAX_WORKSHEET_COLUMNS : MAX_WORKSHEET_ROWS;
  if (value > limit) {
    throw new RangeError(`worksheet ${label} exceeds the supported limit (${limit})`);
  }
  return value;
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



