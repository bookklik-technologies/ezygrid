document.currentScript.__ezygridRegister("core/workbook", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Workbook = exports.Worksheet = exports.DEFAULT_COLUMN_WIDTH = exports.DEFAULT_ROW_HEIGHT = exports.MAX_WORKSHEET_COLUMNS = exports.MAX_WORKSHEET_ROWS = void 0;
exports.isCellInput = isCellInput;
exports.createGrid = createGrid;
const model_1 = require("@ezygrid/model");
const formula_1 = require("@ezygrid/formula");
const merges_js_1 = require("./merges.js");
const tables_js_1 = require("./tables.js");
const validation_js_1 = require("./validation.js");
const conditional_format_js_1 = require("./conditional-format.js");
const charts_js_1 = require("./charts.js");
const pivot_js_1 = require("./pivot.js");
const media_js_1 = require("./media.js");
const csv_export_js_1 = require("./csv-export.js");
const plugins_js_1 = require("./plugins.js");
const model_2 = require("@ezygrid/model");
function isCellInput(value) {
    return (typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        ('value' in value || 'formula' in value || 'literal' in value));
}
/** Supported sheet dimension limits (XLSX-compatible). */
exports.MAX_WORKSHEET_ROWS = 1_048_576;
exports.MAX_WORKSHEET_COLUMNS = 16_384;
exports.DEFAULT_ROW_HEIGHT = 24;
exports.DEFAULT_COLUMN_WIDTH = 100;
/**
 * Worksheet: sparse store + size indexes + formula graph wiring.
 * Model is authoritative; rendering is a projection.
 */
class Worksheet {
    id;
    workbook;
    /** Frozen leading rows (0 = none); assigning repaints via a view marker. */
    get freezeRows() {
        return this.freezeRows_;
    }
    set freezeRows(value) {
        const next = Math.max(0, Math.min(this.rowCount, Number(value) || 0));
        if (next === this.freezeRows_)
            return;
        this.freezeRows_ = next;
        this.emitViewMarker('freeze');
    }
    /** Frozen leading columns (0 = none); assigning repaints via a view marker. */
    get freezeColumns() {
        return this.freezeColumns_;
    }
    set freezeColumns(value) {
        const next = Math.max(0, Math.min(this.columnCount, Number(value) || 0));
        if (next === this.freezeColumns_)
            return;
        this.freezeColumns_ = next;
        this.emitViewMarker('freeze');
    }
    /**
     * Repaint marker for mutations that carry no history record: listeners
     * (the attached renderer) repaint, but the operation is emitted without
     * an inverse so undo history is not polluted (F08).
     */
    emitViewMarker(what) {
        this.workbook.emitOperation((0, model_1.op)(this.workbook.id, 'view.update', { what }, this.id));
    }
    freezeRows_ = 0;
    freezeColumns_ = 0;
    pivotSpecs = [];
    filterCriteria = new Map();
    cells = new model_1.SparseCellStore();
    rowSizes;
    columnSizes;
    rowCount;
    columnCount;
    /** Per-row overrides by row id (structural identity placeholder for Phase 0). */
    rowIds = new Map();
    /** Merged ranges (§16): anchor-only data rule. */
    merges = new merges_js_1.MergeStore();
    /** Structured tables (§25). */
    tables = new tables_js_1.TableStore(this);
    /** Number format masks keyed by "row,column". */
    numberFormats = new Map();
    /** Validation rules (§24). */
    validations = new validation_js_1.ValidationService();
    /** Conditional formatting rules (§24.5). */
    conditionalFormats = new conditional_format_js_1.ConditionalFormatEngine();
    /** Charts (§31). */
    charts = new charts_js_1.ChartEngine();
    /** Pivot engine (§33). */
    pivots = new pivot_js_1.PivotEngine();
    /** Floating media: images and shapes (§30/§32). */
    media = new media_js_1.MediaStore();
    /** Merge a range (A1 notation). Data lives on the anchor cell. */
    merge(range) {
        const rect = (0, model_2.parseRange)(range);
        const created = this.merges.merge(rect);
        if (!created)
            return;
        // Merges are metadata mutations and must be undoable (F08).
        const payloadRect = { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right };
        this.workbook.emitOperation((0, model_1.op)(this.workbook.id, 'merges.set', { added: [payloadRect], removed: [] }, this.id), [(0, model_1.op)(this.workbook.id, 'merges.set', { added: [], removed: [payloadRect] }, this.id)]);
    }
    /** Create a structured table from a range. */
    addTable(options) {
        this.tables.add(this, options);
    }
    getTable(name) {
        return this.tables.get(name);
    }
    // ── Validation (§24): applied on every write ────────────────────────────
    addValidation(rule) {
        return this.validations.add(rule);
    }
    removeValidation(id) {
        this.validations.remove(id);
    }
    // ── Charts / pivot / media convenience APIs ──────────────────────────────
    addChart(spec) {
        const id = this.charts.add(spec).id;
        this.emitViewMarker('chart');
        return id;
    }
    addPivot(spec) {
        const full = { ...spec, id: (0, model_1.createId)('pivot') };
        this.pivots.refresh(this, full);
        this.pivotSpecs.push(full);
        this.emitViewMarker('pivot');
        return full.id;
    }
    addImage(image) {
        const id = this.media.addImage(image).id;
        this.emitViewMarker('image');
        return id;
    }
    addShape(shape) {
        const id = this.media.addShape(shape).id;
        this.emitViewMarker('shape');
        return id;
    }
    // ── CSV import/export (§35.1) ────────────────────────────────────────────
    toCsv(options) {
        return (0, csv_export_js_1.worksheetToCsv)(this, options);
    }
    fromCsv(text, options) {
        (0, csv_export_js_1.worksheetFromCsv)(this, text, options);
    }
    unmerge(range) {
        const rect = (0, model_2.parseRange)(range);
        const existing = this.merges.findAt(rect.top, rect.left);
        if (!this.merges.unmergeAt(rect.top, rect.left))
            return;
        const payloadRect = existing
            ? { top: existing.top, left: existing.left, bottom: existing.bottom, right: existing.right }
            : { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right };
        // Unmerging is undoable: the inverse recreates the exact merge (F08).
        this.workbook.emitOperation((0, model_1.op)(this.workbook.id, 'merges.set', { added: [], removed: [payloadRect] }, this.id), [(0, model_1.op)(this.workbook.id, 'merges.set', { added: [payloadRect], removed: [] }, this.id)]);
    }
    /** Apply a number format mask to a range (A1 notation). */
    setNumberFormat(range, mask) {
        const rect = (0, model_2.parseRange)(range);
        // Number formats are metadata mutations and must be undoable (F08).
        this.recordMetaChange(rect, (r, c) => {
            this.numberFormats.set(`${r},${c}`, mask);
        });
    }
    getNumberFormat(row, column) {
        return this.numberFormats.get(`${row},${column}`);
    }
    /** Re-register all formulas after direct record manipulation (sort, paste). */
    refreshFormulas() {
        this.registerAllFormulas();
    }
    // ── Visibility (§15.1/§15.2): hide/show rows and columns ────────────────
    /** Set the height of a zero-based row in unscaled pixels, with undo/redo. */
    setRowHeight(index, height) {
        this.setAxisSize('row', index, height);
    }
    /** Set the width of a zero-based column in unscaled pixels, with undo/redo. */
    setColumnWidth(index, width) {
        this.setAxisSize('column', index, width);
    }
    setAxisSize(axis, index, size) {
        const sizes = axis === 'row' ? this.rowSizes : this.columnSizes;
        const previous = sizes.sizeOf(index);
        sizes.setSize(index, size);
        if (previous === size)
            return;
        const type = axis === 'row' ? 'rows.resize' : 'columns.resize';
        this.workbook.emitOperation((0, model_1.op)(this.workbook.id, type, { index, size }, this.id), [(0, model_1.op)(this.workbook.id, type, { index, size: previous }, this.id)]);
    }
    hiddenRows = new Set();
    hiddenColumns = new Set();
    hideRows(index, count = 1) {
        let changed = false;
        for (let i = 0; i < count; i++) {
            if (!this.hiddenRows.has(index + i)) {
                this.hiddenRows.add(index + i);
                changed = true;
            }
        }
        if (changed)
            this.emitViewMarker('visibility');
    }
    showRows(index, count = 1) {
        let changed = false;
        for (let i = 0; i < count; i++) {
            if (this.hiddenRows.delete(index + i))
                changed = true;
        }
        if (changed)
            this.emitViewMarker('visibility');
    }
    hideColumns(index, count = 1) {
        let changed = false;
        for (let i = 0; i < count; i++) {
            if (!this.hiddenColumns.has(index + i)) {
                this.hiddenColumns.add(index + i);
                changed = true;
            }
        }
        if (changed)
            this.emitViewMarker('visibility');
    }
    showColumns(index, count = 1) {
        let changed = false;
        for (let i = 0; i < count; i++) {
            if (this.hiddenColumns.delete(index + i))
                changed = true;
        }
        if (changed)
            this.emitViewMarker('visibility');
    }
    isColumnHidden(column) {
        return this.hiddenColumns.has(column);
    }
    // ── Filters (§20 prototype): value-predicate row filters ────────────────
    filters = new Map();
    /** Rows hidden exclusively by filters — separate from manual hides (F19). */
    filterHiddenRows = new Set();
    setFilter(column, predicate) {
        this.filterCriteria.delete(column);
        this.filters.set(column, predicate);
        this.applyFilters();
        this.emitViewMarker('filter');
    }
    clearFilter(column) {
        if (column === undefined)
            this.filterCriteria.clear();
        else
            this.filterCriteria.delete(column);
        if (column === undefined)
            this.filters.clear();
        else
            this.filters.delete(column);
        this.applyFilters();
        this.emitViewMarker('filter');
    }
    setFilterCriteria(column, criteria) {
        if (!Number.isInteger(column) || column < 0 || column >= this.columnCount)
            throw new Error('invalid filter column');
        const predicate = (value) => {
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
    refreshFilters() {
        if (this.filters.size > 0)
            this.applyFilters();
    }
    applyFilters() {
        // Filters own their own visibility set: manual hides survive
        // clear/reapply, and stale filter rows never leak into hiddenRows.
        this.filterHiddenRows.clear();
        if (this.filters.size === 0)
            return;
        const used = this.cells.usedRange;
        if (!used)
            return;
        for (let r = used.top; r <= used.bottom; r++) {
            let visible = true;
            for (const [column, predicate] of this.filters) {
                const record = this.cells.getCell(r, column);
                const value = record === undefined
                    ? null
                    : record.formula !== undefined
                        ? this.getValue(r, column)
                        : record.raw ?? null;
                if (!predicate(value)) {
                    visible = false;
                    break;
                }
            }
            if (!visible)
                this.filterHiddenRows.add(r);
        }
    }
    // ── Cell editor assignment (§13.2 prototype) ─────────────────────────────
    cellEditors = new Map();
    setCellEditor(range, type, options) {
        const rect = (0, model_2.parseRange)(range);
        this.recordMetaChange(rect, (r, c) => {
            this.cellEditors.set(`${r},${c}`, { type, options });
        });
    }
    getEditorFor(row, column) {
        return this.cellEditors.get(`${row},${column}`);
    }
    // ── Cell styles (§23): cell-level properties with range application ─────
    styles = new Map();
    setStyle(range, style) {
        const rect = (0, model_2.parseRange)(range);
        this.recordMetaChange(rect, (r, c) => {
            const key = `${r},${c}`;
            const current = this.styles.get(key) ?? {};
            this.styles.set(key, { ...current, ...style });
        });
    }
    clearStyle(range) {
        const rect = (0, model_2.parseRange)(range);
        this.recordMetaChange(rect, (r, c) => {
            this.styles.delete(`${r},${c}`);
        });
    }
    getStyle(row, column) {
        return this.styles.get(`${row},${column}`);
    }
    // ── Notes (§29.1): plain per-cell annotations ────────────────────────────
    notes = new Map();
    setNote(range, text) {
        const rect = (0, model_2.parseRange)(range);
        this.recordMetaChange(rect, (r, c) => {
            this.notes.set(`${r},${c}`, text);
        });
    }
    getNote(row, column) {
        return this.notes.get(`${row},${column}`);
    }
    clearNote(range) {
        const rect = (0, model_2.parseRange)(range);
        this.recordMetaChange(rect, (r, c) => {
            this.notes.delete(`${r},${c}`);
        });
    }
    /**
     * Apply a metadata mutation across a range with a reversible history
     * record: forward op carries the new per-cell values, inverse carries
     * the previous ones (F08). Unchanged cells are omitted from both.
     * Ranges are clamped to the sheet dimensions (M2): parsed A1 ranges are
     * unbounded, and iterating `A1:ZZZ9999999` raw would hang the tab.
     */
    recordMetaChange(rect, mutate) {
        const clamped = this.clampRect(rect);
        if (!clamped)
            return;
        const before = [];
        const after = [];
        for (let r = clamped.top; r <= clamped.bottom; r++) {
            for (let c = clamped.left; c <= clamped.right; c++) {
                const beforeSnap = this.metaSnapshotFor(r, c);
                mutate(r, c);
                const afterSnap = this.metaSnapshotFor(r, c);
                if (metaSnapshotsDiffer(beforeSnap, afterSnap)) {
                    before.push(beforeSnap);
                    after.push(afterSnap);
                }
            }
        }
        if (before.length === 0)
            return;
        this.workbook.emitOperation((0, model_1.op)(this.workbook.id, 'meta.set', { cells: after }, this.id), [(0, model_1.op)(this.workbook.id, 'meta.set', { cells: before }, this.id)]);
    }
    /** Complete per-cell metadata snapshot (null = absent). */
    metaSnapshotFor(row, column) {
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
    /** Clamp a parsed rect to the sheet dimensions; null when entirely outside (M2). */
    clampRect(rect) {
        const top = Math.max(0, rect.top);
        const left = Math.max(0, rect.left);
        const bottom = Math.min(this.rowCount - 1, rect.bottom);
        const right = Math.min(this.columnCount - 1, rect.right);
        if (top > bottom || left > right)
            return null;
        return { top, left, bottom, right };
    }
    // ── Nested headers (§17.2): multi-level column header groups ────────────
    nestedHeadersConfig = [];
    setNestedHeaders(levels) {
        this.nestedHeadersConfig = levels;
        this.emitViewMarker('nested-headers');
    }
    get nestedHeaders() {
        return this.nestedHeadersConfig;
    }
    // ── Row groups (§15.1): outline collapse/expand ──────────────────────────
    rowGroupsConfig = [];
    groupHiddenRows = new Set();
    groupRows(start, end) {
        if (end <= start)
            return;
        this.rowGroupsConfig.push({ start, end, collapsed: false });
        this.emitViewMarker('group');
    }
    ungroupRows(start) {
        const group = this.rowGroupsConfig.find((g) => g.start === start);
        if (!group)
            return;
        if (group.collapsed)
            this.expandGroup(start);
        this.rowGroupsConfig = this.rowGroupsConfig.filter((g) => g.start !== start);
        this.emitViewMarker('group');
    }
    collapseGroup(start) {
        const group = this.rowGroupsConfig.find((g) => g.start === start);
        if (!group || group.collapsed)
            return;
        group.collapsed = true;
        for (let r = group.start; r <= group.end; r++)
            this.groupHiddenRows.add(r);
        this.emitViewMarker('group');
    }
    expandGroup(start) {
        const group = this.rowGroupsConfig.find((g) => g.start === start);
        if (!group || !group.collapsed)
            return;
        group.collapsed = false;
        for (let r = group.start; r <= group.end; r++)
            this.groupHiddenRows.delete(r);
        this.emitViewMarker('group');
    }
    getGroups() {
        return this.rowGroupsConfig;
    }
    isRowHidden(row) {
        return this.hiddenRows.has(row) || this.groupHiddenRows.has(row) || this.filterHiddenRows.has(row);
    }
    constructor(workbook, config = {}) {
        this.workbook = workbook;
        this.id = config.id ?? (0, model_1.createId)('sheet');
        // Names are workbook-unique (F11): duplicates and defaults are resolved
        // through the workbook so the formula graph never collides.
        this.name_ = workbook.uniqueSheetName(config.name);
        this.rowCount = validateDimension(config.rows ?? 1000, 'rows');
        this.columnCount = validateDimension(config.columns ?? 26, 'columns');
        this.rowSizes = new model_1.SizeIndex(this.rowCount, exports.DEFAULT_ROW_HEIGHT);
        this.columnSizes = new model_1.SizeIndex(this.columnCount, exports.DEFAULT_COLUMN_WIDTH);
        if (config.data)
            this.load2DArray(config.data);
    }
    name_;
    get name() {
        return this.name_;
    }
    /** Controlled rename: keeps the formula graph and cross-sheet refs in sync (F11). */
    set name(value) {
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
    load2DArray(data) {
        // Data beyond the declared dimensions stays stored but is invisible (L9):
        // surface the mismatch so callers know to raise rows/columns.
        const dataRows = data.length;
        const dataColumns = data.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
        if (dataRows > this.rowCount || dataColumns > this.columnCount) {
            console.warn(`ezygrid: config.data exceeds sheet dimensions (${dataRows}x${dataColumns} > ` +
                `${this.rowCount}x${this.columnCount}); overflow rows/columns are stored but not visible.`);
        }
        for (let r = 0; r < data.length; r++) {
            const row = data[r];
            for (let c = 0; c < row.length; c++) {
                const v = row[c];
                if (v === null || v === undefined || v === '')
                    continue;
                if (isCellInput(v)) {
                    // Typed cell records: explicit formulas and literal flags (F04).
                    if (v.formula !== undefined) {
                        this.setCellRaw(r, c, undefined, v.formula.startsWith('=') ? v.formula : `=${v.formula}`);
                    }
                    else {
                        this.setCellRaw(r, c, v.value);
                    }
                }
                else if (typeof v === 'string' && v.startsWith('=')) {
                    this.setCellRaw(r, c, undefined, v);
                }
                else {
                    this.setCellRaw(r, c, v);
                }
            }
        }
    }
    setCellRaw(row, column, raw, formula) {
        // Fully empty records are dropped so the used range and spill blocking
        // see the true content.
        if (formula === undefined && (raw === undefined || raw === null)) {
            this.cells.setCell(row, column, undefined);
            // Clearing a raw cell invalidates readers of it (F02).
            this.workbook.formulaGraph.notifyCellChange(this.name, row, column);
            return;
        }
        const record = formula !== undefined ? { formula } : { raw };
        this.cells.setCell(row, column, record);
        if (formula !== undefined) {
            const graph = this.workbook.formulaGraph;
            graph.setCurrentSheet(this.name);
            graph.setFormula(this.name, row, column, formula, formula_1.Parser.parse(formula.slice(1)));
            // Evaluate eagerly so spills register immediately (§14.2).
            this.getValue(row, column);
        }
        else {
            // Raw changes invalidate dependents and range readers (F02).
            this.workbook.formulaGraph.notifyCellChange(this.name, row, column);
        }
    }
    /** Direct formula-cell registration used by snapshot loading (F13). */
    loadFormulaCell(row, column, formula) {
        if (!formula.startsWith('='))
            formula = `=${formula}`;
        this.setCellRaw(row, column, undefined, formula);
    }
    /** Get the calculated display value of a cell (formulas evaluated via dependency graph). */
    getValue(row, column) {
        // Spill-covered cells derive their value from the anchor formula.
        const coveredBy = this.spillCover.get(`${row},${column}`);
        const record = this.cells.getCell(row, column);
        if (coveredBy && !record) {
            const [anchorRow, anchorColumn] = coveredBy.split(',').map(Number);
            const result = this.evaluateAnchor(anchorRow, anchorColumn);
            if (result.matrix) {
                return result.matrix.values[row - anchorRow]?.[column - anchorColumn] ?? null;
            }
            return result.value;
        }
        if (!record)
            return null;
        if (record.formula !== undefined) {
            return this.evaluateAnchor(row, column).value;
        }
        return record.raw ?? null;
    }
    /** Evaluate an anchor formula, registering or clearing its spill. */
    evaluateAnchor(row, column) {
        const graph = this.workbook.formulaGraph;
        graph.setCurrentSheet(this.name);
        const key = `${row},${column}`;
        // Drop this anchor's previous footprint first so blocked checks see only
        // OTHER anchors' coverage (F10).
        this.clearSpill(key);
        const value = graph.recalculate(this.name, row, column, (s, r, c) => this.readRawValue(s ?? this.name, r, c));
        if ((0, formula_1.isMatrix)(value)) {
            if (this.isSpillBlocked(row, column, value.rows, value.columns)) {
                this.spillError.set(key, true);
                return { value: '#SPILL!' };
            }
            this.spillError.delete(key);
            this.registerSpill(row, column, value);
            return { matrix: value, value: value.values[0]?.[0] ?? null };
        }
        this.spillError.delete(key);
        return { value: value instanceof formula_1.FormulaError ? value.value : value };
    }
    /**
     * Remove the spill occupying a cell: the cell's own spill if it is an
     * anchor, otherwise the anchor that covers it. Undo/redo replay and
     * overwrites use this so ownership never goes stale (F10).
     */
    releaseSpillAt(row, column) {
        const key = `${row},${column}`;
        const owner = this.spillCover.get(key) ?? key;
        this.clearSpill(owner);
        this.spillError.delete(key);
    }
    /** Spills keyed by anchor "row,column". */
    spills = new Map();
    spillCover = new Map();
    spillError = new Map();
    isSpilled(row, column) {
        return this.spillCover.has(`${row},${column}`);
    }
    hasSpillError(row, column) {
        return this.spillError.has(`${row},${column}`);
    }
    isSpillBlocked(row, column, rows, columns) {
        for (let r = row; r < row + rows; r++) {
            for (let c = column; c < column + columns; c++) {
                if (r === row && c === column)
                    continue;
                // Spills must stay inside the worksheet bounds.
                if (r >= this.rowCount || c >= this.columnCount)
                    return true;
                if (this.cells.getCell(r, c) !== undefined)
                    return true;
                // Another anchor already owns coverage here (this anchor's own
                // footprint was cleared before the check).
                if (this.spillCover.has(`${r},${c}`))
                    return true;
                // Merged cells must stay anchor-only; a spill cannot enter a merge.
                if (this.merges.findAt(r, c))
                    return true;
            }
        }
        return false;
    }
    registerSpill(row, column, value) {
        const key = `${row},${column}`;
        // Atomically replace the previous footprint of this anchor (F10).
        this.clearSpill(key);
        this.spills.set(key, { rows: value.rows, columns: value.columns });
        for (let r = row; r < row + value.rows; r++) {
            for (let c = column; c < column + value.columns; c++) {
                if (r === row && c === column)
                    continue;
                this.spillCover.set(`${r},${c}`, key);
            }
        }
    }
    clearSpill(key) {
        const spill = this.spills.get(key);
        if (!spill)
            return;
        const [row, column] = key.split(',').map(Number);
        for (let r = row; r < row + spill.rows; r++) {
            for (let c = column; c < column + spill.columns; c++) {
                this.spillCover.delete(`${r},${c}`);
            }
        }
        this.spills.delete(key);
    }
    clearAllSpills() {
        for (const key of [...this.spills.keys()])
            this.clearSpill(key);
        this.spillError.clear();
    }
    /**
     * Evaluated value of a cell for formula readers: raw records resolve
     * directly; formula cells and spill-covered cells resolve through the
     * graph (with spill support and cycle protection via the graph's
     * evaluating flags). Named ranges, tables and cross-sheet refs therefore
     * see formula-valued cells.
     */
    readRawValue(sheetName, row, column) {
        const sheet = sheetName === this.name ? this : this.workbook.getWorksheet(sheetName);
        if (!sheet)
            return new formula_1.FormulaError('#REF!');
        return sheet.resolveEvaluatedValue(row, column);
    }
    /**
     * Runtime value used by formula readers: formulas evaluate through the
     * graph, spill-covered cells resolve via their anchor's matrix, and raw
     * records pass through.
     */
    resolveEvaluatedValue(row, column) {
        const coveredBy = this.spillCover.get(`${row},${column}`);
        if (coveredBy) {
            const [anchorRow, anchorColumn] = coveredBy.split(',').map(Number);
            const result = this.evaluateAnchor(anchorRow, anchorColumn);
            if (result.matrix) {
                return (result.matrix.values[row - anchorRow]?.[column - anchorColumn] ?? null);
            }
            return result.value;
        }
        const record = this.cells.getCell(row, column);
        if (!record)
            return null;
        if (record.formula !== undefined) {
            const result = this.evaluateAnchor(row, column);
            return result.value;
        }
        return (record.raw ?? null);
    }
    /**
     * Set a cell value; strings starting with "=" become formulas. Emits an
     * operation. Pass `{ literal: true }` to store text verbatim (CSV import
     * with formulas disabled).
     */
    setValue(row, column, value, options) {
        assertCoordinate(row, 'row');
        assertCoordinate(column, 'column');
        // Validation (§24): rejected writes are not applied.
        if (value !== null && value !== undefined) {
            const result = this.validations.check(this, row, column, value);
            if (result.action === 'reject' && !result.allowed) {
                this.workbook.emitOperation((0, model_1.op)(this.workbook.id, 'validation.reject', { row, column, value, message: result.message }, this.id));
                return null;
            }
        }
        let formula;
        let raw = value;
        if (!options?.literal && typeof value === 'string' && value.startsWith('=')) {
            // Parse completely BEFORE touching any state, so malformed formulas
            // leave the previous value in place (recoverable validation error).
            try {
                formula_1.Parser.parse(value.slice(1));
            }
            catch (e) {
                this.workbook.emitOperation((0, model_1.op)(this.workbook.id, 'validation.reject', { row, column, value, message: `Invalid formula: ${e.message}` }, this.id));
                return null;
            }
            formula = value;
            raw = undefined;
        }
        // Overwriting any part of a spill removes it (anchor or covered cell).
        this.releaseSpillAt(row, column);
        const previous = this.cells.getCell(row, column);
        const previousSnapshot = previous
            ? { raw: previous.raw, formula: previous.formula, styleId: previous.styleId }
            : undefined;
        // clear previous formula registration
        if (previous?.formula !== undefined) {
            this.workbook.formulaGraph.removeFormula(this.name, row, column);
        }
        this.setCellRaw(row, column, raw, formula);
        const operation = (0, model_1.op)(this.workbook.id, 'cell.set', { row, column, raw, formula, previous: previousSnapshot }, this.id);
        this.workbook.emitOperation(operation);
        // Data changed: filters over the affected sheet stay live (F19).
        this.refreshFilters();
        return operation;
    }
    getAddress(row, column) {
        return (0, model_1.toA1)(row, column);
    }
    /**
     * Register every formula cell of EVERY worksheet with the dependency
     * graph. The graph is workbook-wide, so clearing it and re-registering
     * only this sheet would orphan other sheets' formulas.
     */
    registerAllFormulas() {
        this.workbook.refreshFormulaGraph();
    }
    /** Rewrite formulas that reference this sheet after a structural change, then re-register. */
    rewriteFormulas(shift) {
        this.workbook.transformFormulasForStructuralChange(this.name, shift);
    }
    insertRows(index, count = 1) {
        const amount = this.validateInsert(index, count, this.rowCount, exports.MAX_WORKSHEET_ROWS);
        this.applyRowsInsert(index, amount);
        this.workbook.emitOperation((0, model_1.op)(this.workbook.id, 'rows.insert', { index, count: amount }, this.id), 
        // Inserted rows hold no data, so deleting them restores the prior state (F08).
        [(0, model_1.op)(this.workbook.id, 'rows.delete', { index, count: amount }, this.id)]);
    }
    deleteRows(index, count = 1) {
        const amount = this.validateDelete(index, count, this.rowCount);
        // Capture the full band (cells + metadata + visibility) BEFORE deletion
        // so the inverse can restore it completely (F08).
        const captured = this.captureRowBand(index, amount);
        this.applyRowsDelete(index, amount);
        this.workbook.emitOperation((0, model_1.op)(this.workbook.id, 'rows.delete', { index, count: amount }, this.id), [
            (0, model_1.op)(this.workbook.id, 'rows.insert', { index, count: amount }, this.id),
            (0, model_1.op)(this.workbook.id, 'cells.replace', { cells: captured.cells, hiddenRows: captured.hiddenRows }, this.id),
        ]);
    }
    insertColumns(index, count = 1) {
        const amount = this.validateInsert(index, count, this.columnCount, exports.MAX_WORKSHEET_COLUMNS);
        this.applyColumnsInsert(index, amount);
        this.workbook.emitOperation((0, model_1.op)(this.workbook.id, 'columns.insert', { index, count: amount }, this.id), [(0, model_1.op)(this.workbook.id, 'columns.delete', { index, count: amount }, this.id)]);
    }
    deleteColumns(index, count = 1) {
        const amount = this.validateDelete(index, count, this.columnCount);
        const captured = this.captureColumnBand(index, amount);
        this.applyColumnsDelete(index, amount);
        this.workbook.emitOperation((0, model_1.op)(this.workbook.id, 'columns.delete', { index, count: amount }, this.id), [
            (0, model_1.op)(this.workbook.id, 'columns.insert', { index, count: amount }, this.id),
            (0, model_1.op)(this.workbook.id, 'cells.replace', { cells: captured.cells, hiddenColumns: captured.hiddenColumns }, this.id),
        ]);
    }
    /**
     * Raw structural application used by undo/redo replay: identical to the
     * public operations but emits nothing and records no history.
     */
    applyRowsInsert(index, count) {
        this.clearAllSpills();
        this.cells.insertRows(index, count);
        this.rowCount += count;
        this.transformMetadata('row', index, count);
        this.transformSizes('row', index, count);
        this.rewriteFormulas({ kind: 'row', at: index, delta: count });
        this.workbook.transformHistory(this.id, 'row', index, count);
    }
    applyRowsDelete(index, count) {
        this.clearAllSpills();
        this.cells.deleteRows(index, count);
        this.rowCount = Math.max(1, this.rowCount - count);
        this.transformMetadata('row', index, -count);
        this.transformSizes('row', index, -count);
        this.rewriteFormulas({ kind: 'row', at: index, delta: -count });
        this.workbook.transformHistory(this.id, 'row', index, -count);
    }
    applyColumnsInsert(index, count) {
        this.clearAllSpills();
        this.cells.insertColumns(index, count);
        this.columnCount += count;
        this.transformMetadata('column', index, count);
        this.transformSizes('column', index, count);
        this.rewriteFormulas({ kind: 'column', at: index, delta: count });
        this.workbook.transformHistory(this.id, 'column', index, count);
    }
    applyColumnsDelete(index, count) {
        this.clearAllSpills();
        this.cells.deleteColumns(index, count);
        this.columnCount = Math.max(1, this.columnCount - count);
        this.transformMetadata('column', index, -count);
        this.transformSizes('column', index, -count);
        this.rewriteFormulas({ kind: 'column', at: index, delta: -count });
        this.workbook.transformHistory(this.id, 'column', index, -count);
    }
    validateInsert(index, count, dimension, limit) {
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
    validateDelete(index, count, dimension) {
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
    transformMetadata(kind, at, delta) {
        const shift = (pos) => shiftPosition(pos, at, delta);
        const edge = (pos, isStart) => shiftRangeEdge(pos, at, delta, isStart);
        // "row,column"-keyed maps: styles, number formats, notes, editors.
        for (const map of [
            this.styles,
            this.numberFormats,
            this.notes,
            this.cellEditors,
        ]) {
            const entries = [];
            for (const [key, value] of map) {
                const [r, c] = key.split(',').map(Number);
                const row = kind === 'row' ? shift(r) : r;
                const column = kind === 'column' ? shift(c) : c;
                if (row === undefined || column === undefined)
                    continue;
                entries.push([`${row},${column}`, value]);
            }
            map.clear();
            for (const [key, value] of entries)
                map.set(key, value);
        }
        // Hidden rows/columns and group visibility.
        const remapSet = (set) => {
            const mapped = new Set();
            for (const pos of set) {
                const m = shift(pos);
                if (m !== undefined)
                    mapped.add(m);
            }
            set.clear();
            for (const v of mapped)
                set.add(v);
        };
        if (kind === 'row') {
            remapSet(this.hiddenRows);
            remapSet(this.filterHiddenRows);
            remapSet(this.groupHiddenRows);
            const rowIds = [];
            for (const [row, id] of this.rowIds) {
                const m = shift(row);
                if (m !== undefined)
                    rowIds.push([m, id]);
            }
            this.rowIds.clear();
            for (const [row, id] of rowIds)
                this.rowIds.set(row, id);
            this.rowGroupsConfig = this.rowGroupsConfig
                .map((g) => ({
                ...g,
                start: edge(g.start, true) ?? Number.NaN,
                end: edge(g.end, false) ?? Number.NaN,
            }))
                .filter((g) => Number.isInteger(g.start) && Number.isInteger(g.end) && g.end >= g.start);
        }
        else {
            remapSet(this.hiddenColumns);
        }
        // Range-string-anchored rules: keep any sheet qualifier prefix.
        const transformRangeString = (range) => {
            const rect = (0, model_2.parseRange)(range);
            const bang = range.lastIndexOf('!');
            const prefix = bang >= 0 ? range.slice(0, bang + 1) : '';
            const top = kind === 'row' ? edge(rect.top, true) : rect.top;
            const bottom = kind === 'row' ? edge(rect.bottom, false) : rect.bottom;
            const left = kind === 'column' ? edge(rect.left, true) : rect.left;
            const right = kind === 'column' ? edge(rect.right, false) : rect.right;
            if (top === undefined ||
                bottom === undefined ||
                left === undefined ||
                right === undefined ||
                bottom < top ||
                right < left) {
                return undefined;
            }
            return prefix + (0, model_1.rectToRange)({ top, left, bottom, right });
        };
        for (const rule of [...this.validations.all()]) {
            const mapped = transformRangeString(rule.range);
            if (mapped === undefined)
                this.validations.remove(rule.id);
            else
                rule.range = mapped;
        }
        for (const rule of [...this.conditionalFormats.all()]) {
            const mapped = transformRangeString(rule.range);
            if (mapped === undefined)
                this.conditionalFormats.remove(rule.id);
            else
                rule.range = mapped;
        }
        // Merges.
        this.merges.transform(edge, kind);
        // Tables.
        this.tables.transform(edge, kind);
        // Floating objects (charts, pivots, media) follow their anchors.
        const anchorShift = (pos) => shift(pos) ?? at;
        const transformAnchor = (obj) => {
            if (kind === 'row')
                obj.anchor.row = anchorShift(obj.anchor.row);
            else
                obj.anchor.column = anchorShift(obj.anchor.column);
        };
        for (const chart of this.charts.all()) {
            transformAnchor(chart);
            const mapped = transformRangeString(chart.source);
            if (mapped !== undefined)
                chart.source = mapped;
        }
        for (const media of this.media.all())
            transformAnchor(media);
    }
    /** Preserve custom sizes across structural changes (no reset to defaults). */
    transformSizes(kind, at, delta) {
        const source = kind === 'row' ? this.rowSizes : this.columnSizes;
        const defaultSize = kind === 'row' ? exports.DEFAULT_ROW_HEIGHT : exports.DEFAULT_COLUMN_WIDTH;
        const newCount = kind === 'row' ? this.rowCount : this.columnCount;
        const oldCount = newCount - delta;
        const fresh = new model_1.SizeIndex(newCount, defaultSize);
        for (let i = 0; i < oldCount; i++) {
            const mapped = shiftPosition(i, at, delta);
            if (mapped === undefined)
                continue;
            const size = source.sizeOf(i);
            if (size !== defaultSize)
                fresh.setSize(mapped, size);
        }
        if (kind === 'row')
            Object.assign(this, { rowSizes: fresh });
        else
            Object.assign(this, { columnSizes: fresh });
    }
    /** Snapshot a row band (cells, metadata, visibility) for undo restore (F08). */
    captureRowBand(index, count) {
        const cells = [];
        for (let r = index; r < index + count; r++) {
            this.cells.forEach((row, column, record) => {
                if (row < index || row >= index + count)
                    return;
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
    captureColumnBand(index, count) {
        const cells = [];
        this.cells.forEach((row, column, record) => {
            if (column < index || column >= index + count)
                return;
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
exports.Worksheet = Worksheet;
/** Workbook: owns worksheets, formula graph, history and operation events. */
class Workbook {
    filename;
    activeSheetId;
    transactionDepth = 0;
    id;
    worksheets = [];
    formulaGraph = new formula_1.DependencyGraph();
    history = new model_1.HistoryService();
    /** Defined names (26): named ranges, constants and formulas. */
    definedNames = new Map();
    pluginManager;
    listeners = new Set();
    /** Monotonic mutation counter; caches (e.g. conditional-format scans) key on it. */
    revision = 0;
    /** Update-transaction state for batched notifications (F02). */
    updateDepth = 0;
    suppressedOps = 0;
    pendingOperations = [];
    constructor(options = {}) {
        this.filename = options.filename ?? 'Untitled workbook';
        this.id = options.id ?? (0, model_1.createId)('wb');
        this.pluginManager = new plugins_js_1.PluginManager(options.extensions ?? []);
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
            if (!sheet)
                return new formula_1.FormulaError('#NAME?');
            const tableDef = sheet.tables.get(table);
            if (!tableDef)
                return new formula_1.FormulaError('#NAME?');
            const rect = tableDef.range;
            const top = tableDef.headerRow ? rect.top + 1 : rect.top;
            if (column === undefined) {
                return this.matrixFromRange(sheet, rect.left, rect.right, top, rect.bottom);
            }
            const colDef = tableDef.columns.find((c) => c.name === column);
            if (!colDef)
                return new formula_1.FormulaError('#REF!');
            if (item) {
                // Table[@Column]: the current row's value (scalar), not the column.
                const row = context.row;
                if (row < top || row > rect.bottom)
                    return new formula_1.FormulaError('#VALUE!');
                return sheet.readRawValue(sheet.name, row, colDef.index);
            }
            return this.matrixFromRange(sheet, colDef.index, colDef.index, top, rect.bottom);
        });
    }
    /** Find a table by name: the formula's sheet first, then any sheet (F21). */
    findTableSheet(table, formulaSheet) {
        const owner = this.getWorksheet(formulaSheet);
        if (owner?.tables.get(table))
            return owner;
        return this.worksheets.find((sheet) => sheet.tables.get(table) !== undefined);
    }
    /** Build a matrix value from a worksheet rectangle. */
    matrixFromRange(sheet, left, right, top, bottom) {
        const values = [];
        for (let r = top; r <= bottom; r++) {
            const row = [];
            for (let c = left; c <= right; c++) {
                row.push(sheet.readRawValue(sheet.name, r, c));
            }
            values.push(row);
        }
        return { kind: 'matrix', rows: values.length, columns: values[0]?.length ?? 0, values };
    }
    setDefinedName(name, definition) {
        this.definedNames.set(name, definition);
        // Name definitions resolve dynamically: readers must recompute (F02).
        this.formulaGraph.invalidateOpaqueFormulas();
    }
    removeDefinedName(name) {
        this.definedNames.delete(name);
        this.formulaGraph.invalidateOpaqueFormulas();
    }
    /** Resolve a defined name to a runtime value (constant) or matrix (range). */
    resolveNameValue(name) {
        const definition = this.definedNames.get(name);
        if (!definition) {
            // Fall back to structured table references (bare table name, §25).
            // Tables resolve workbook-wide (F21).
            const sheet = this.findTableSheet(name, this.activeWorksheet.name);
            const tableDef = sheet?.tables.get(name);
            if (sheet && tableDef) {
                const rect = tableDef.range;
                return this.matrixFromRange(sheet, rect.left, rect.right, tableDef.headerRow ? rect.top + 1 : rect.top, rect.bottom);
            }
            return new formula_1.FormulaError('#NAME?');
        }
        if (definition.type === 'value') {
            const value = definition.value;
            if (typeof value === 'string' && value.startsWith('=')) {
                // Named formula: evaluate against the active sheet raw values.
                const graph = this.formulaGraph;
                const sheet = this.activeWorksheet;
                const ast = formula_1.Parser.parse(value.slice(1));
                const ctx = graph.createContext(sheet.name, (s, r, c) => {
                    if (r < 0 || c < 0)
                        return null;
                    return sheet.readRawValue(s ?? sheet.name, r, c);
                });
                return graph.evaluateNode(ast, ctx);
            }
            return (value ?? null);
        }
        const rect = (0, model_2.parseRange)(definition.ref);
        const sheet = rect.sheet ? this.getWorksheet(rect.sheet) : this.activeWorksheet;
        if (!sheet)
            return new formula_1.FormulaError('#REF!');
        const values = [];
        for (let r = rect.top; r <= rect.bottom; r++) {
            const row = [];
            for (let c = rect.left; c <= rect.right; c++) {
                row.push(sheet.readRawValue(rect.sheet ?? this.activeWorksheet.name, r, c));
            }
            values.push(row);
        }
        return { kind: 'matrix', rows: values.length, columns: values[0]?.length ?? 0, values };
    }
    getWorksheet(idOrName) {
        return (this.worksheets.find((w) => w.id === idOrName) ??
            this.worksheets.find((w) => w.name === idOrName));
    }
    get activeWorksheet() {
        return this.worksheets.find((sheet) => sheet.id === this.activeSheetId) ?? this.worksheets[0];
    }
    setActiveWorksheet(id) {
        const sheet = this.getWorksheet(id);
        if (!sheet)
            throw new Error(`worksheet not found: ${id}`);
        if (sheet === this.activeWorksheet)
            return;
        this.activeSheetId = sheet.id;
        this.emitOperation((0, model_1.op)(this.id, 'worksheet.activate', { id: sheet.id }, sheet.id));
    }
    moveWorksheet(id, index) {
        const sheet = this.getWorksheet(id);
        if (!sheet || !Number.isInteger(index) || index < 0 || index >= this.worksheets.length) {
            throw new Error('invalid worksheet position');
        }
        this.transaction(() => {
            this.worksheets.splice(this.worksheets.indexOf(sheet), 1);
            this.worksheets.splice(index, 0, sheet);
        });
    }
    /**
     * One reversible editor action, including feature metadata; failures roll
     * back. Reversible operations emitted by the action are coalesced into a
     * single history entry (undo reverts the whole action) instead of storing
     * two full-document snapshots per action (H1). A full-document snapshot
     * pair is only used when the action contains mutations history cannot
     * reverse, and for rollback when the action throws.
     */
    transaction(action) {
        if (this.transactionDepth > 0) {
            action();
            return;
        }
        const before = this.captureDocument();
        this.transactionDepth++;
        this.transactionOps = [];
        this.beginUpdate();
        try {
            action();
            this.recordTransactionOps(before);
            this.suppressedOps++;
        }
        catch (error) {
            this.restoreDocument(before);
            this.pendingOperations = [];
            this.suppressedOps++;
            throw error;
        }
        finally {
            this.transactionDepth--;
            this.transactionOps = [];
            this.endUpdate();
        }
    }
    /**
     * History record of the in-flight transaction (H1): every reversible op
     * the action emitted with its inverse. Falls back to document snapshots
     * when any recorded op is not reversible.
     */
    transactionOps = [];
    recordTransactionOps(before) {
        if (this.transactionOps.length === 0 || !this.transactionOps.every((entry) => entry.inverse)) {
            const after = this.captureDocument();
            this.history.push((0, model_1.op)(this.id, 'document.restore', after), (0, model_1.op)(this.id, 'document.restore', before));
            return;
        }
        this.history.beginBatch();
        try {
            for (const entry of this.transactionOps) {
                this.history.push(entry.operation, entry.inverse);
            }
        }
        finally {
            this.history.endBatch();
        }
    }
    captureDocument() {
        const snapshot = this.toJSON();
        // Runtime history preserves callbacks even though exported JSON cannot.
        const sheets = snapshot.worksheets;
        this.worksheets.forEach((sheet, index) => {
            sheets[index].validations = sheet.validations.all().map((rule) => ({ ...rule }));
            sheets[index].conditionalFormats = sheet.conditionalFormats.all().map((rule) => ({ ...rule, style: { ...rule.style } }));
            sheets[index].runtimeFilters = [...sheet.filters].filter(([column]) => !sheet.filterCriteria.has(column));
        });
        return cloneSnapshot(snapshot);
    }
    /** Replace a validated document while retaining this workbook and its listeners. */
    loadJSON(data) {
        const staged = Workbook.fromJSON(data);
        this.adoptDocument(staged);
        this.history.clear();
        this.emitOperation((0, model_1.op)(this.id, 'document.load', {}));
    }
    restoreDocument(data) {
        this.adoptDocument(Workbook.fromJSON(data));
    }
    adoptDocument(staged) {
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
        for (const [name, definition] of staged.definedNames)
            this.definedNames.set(name, definition);
        this.refreshFormulaGraph();
    }
    /**
     * Resolve a workbook-unique worksheet display name. Duplicate or empty
     * requests get a deterministic suffix (F11).
     */
    uniqueSheetName(desired, exclude) {
        const taken = new Set(this.worksheets.filter((sheet) => sheet !== exclude).map((sheet) => sheet.name));
        const base = typeof desired === 'string' && desired.trim() !== '' && !desired.includes('!')
            ? desired
            : 'Sheet1';
        if (!taken.has(base))
            return base;
        for (let i = 2;; i++) {
            const candidate = `${base}-${i}`;
            if (!taken.has(candidate))
                return candidate;
        }
    }
    /** Sync formula text and the graph after a controlled rename (F11). */
    onWorksheetRenamed(sheet, previous, next) {
        if (previous === next)
            return;
        for (const other of this.worksheets) {
            other.cells.forEach((row, column, record) => {
                if (record.formula === undefined)
                    return;
                const body = record.formula.slice(1);
                const renamed = (0, model_1.renameSheetRefs)(body, previous, next);
                if (renamed !== body)
                    record.formula = `=${renamed}`;
            });
        }
        this.refreshFormulaGraph();
        this.emitOperation((0, model_1.op)(this.id, 'worksheet.rename', { previous, next }, sheet.id));
    }
    addWorksheet(config = {}) {
        const sheet = new Worksheet(this, config);
        this.worksheets.push(sheet);
        this.emitOperation((0, model_1.op)(this.id, 'worksheet.add', {}, sheet.id));
        return sheet;
    }
    removeWorksheet(id) {
        const index = this.worksheets.findIndex((w) => w.id === id);
        if (index === -1)
            throw new Error(`worksheet not found: ${id}`);
        if (this.worksheets.length === 1)
            throw new Error('cannot remove the last worksheet');
        const removed = this.worksheets[index];
        // Removed sheets must never keep evaluating through the graph (F11):
        // drop every registration before splicing.
        this.formulaGraph.removeSheet(removed.name);
        this.worksheets.splice(index, 1);
        this.refreshFormulaGraph();
        this.emitOperation((0, model_1.op)(this.id, 'worksheet.remove', {}, id));
    }
    onOperation(listener) {
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
    beginUpdate() {
        this.updateDepth += 1;
    }
    endUpdate() {
        this.updateDepth = Math.max(0, this.updateDepth - 1);
        if (this.updateDepth > 0)
            return;
        const count = this.suppressedOps;
        const operations = this.pendingOperations;
        this.pendingOperations = [];
        this.suppressedOps = 0;
        if (count === 0)
            return;
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
    emitOperation(operation, inverse) {
        this.revision += 1;
        if (this.transactionDepth > 0) {
            // The transaction records (op, inverse) pairs and coalesces them into
            // one history entry at commit time (H1).
            this.transactionOps.push({ operation, inverse: this.inverseFor(operation, inverse) });
        }
        else {
            this.recordWithInverse(operation, inverse);
        }
        // Inside an update transaction listeners get one aggregated event (F02).
        if (this.updateDepth > 0) {
            this.suppressedOps += 1;
            this.pendingOperations.push(operation);
            return;
        }
        for (const listener of this.listeners)
            listener(operation);
    }
    /** Reversible ops enter history; inverse computation shared with transaction coalescing. */
    inverseFor(operation, providedInverse) {
        let inverse = providedInverse;
        if (!inverse && operation.type === 'cell.set') {
            const payload = operation.payload;
            inverse = [
                (0, model_1.op)(this.id, 'cell.set', {
                    row: payload.row,
                    column: payload.column,
                    raw: payload.previous?.raw,
                    formula: payload.previous?.formula,
                    previous: {
                        raw: payload.raw,
                        formula: payload.formula,
                    },
                }, operation.worksheetId),
            ];
        }
        // Only reversible operations enter history; a missing inverse would
        // otherwise produce an undo that restores nothing (F08).
        return inverse && inverse.length > 0 ? inverse : undefined;
    }
    recordWithInverse(operation, providedInverse) {
        const inverse = this.inverseFor(operation, providedInverse);
        if (inverse) {
            this.history.push(operation, inverse);
        }
    }
    /** Apply a cell.set operation without re-recording history. */
    applyCellSet(payload, worksheetId) {
        const sheet = worksheetId !== undefined
            ? this.worksheets.find((w) => w.id === worksheetId)
            : this.activeWorksheet;
        // Operations referencing a removed sheet cannot be replayed; reject
        // instead of silently targeting the active worksheet.
        if (!sheet)
            return;
        // Spill ownership first: stale coverage must not survive replay (F10).
        sheet.releaseSpillAt(payload.row, payload.column);
        const existing = sheet.cells.getCell(payload.row, payload.column);
        if (existing?.formula !== undefined) {
            this.formulaGraph.removeFormula(sheet.name, payload.row, payload.column);
        }
        if (payload.formula !== undefined) {
            // Parse before touching state so malformed payloads change nothing.
            const ast = formula_1.Parser.parse(payload.formula.slice(1));
            sheet.cells.setCell(payload.row, payload.column, { formula: payload.formula });
            this.formulaGraph.setFormula(sheet.name, payload.row, payload.column, payload.formula, ast);
        }
        else {
            sheet.cells.setCell(payload.row, payload.column, payload.raw === null || payload.raw === undefined ? undefined : { raw: payload.raw });
            // Replay of raw writes must invalidate dependents/range readers (F02).
            this.formulaGraph.notifyCellChange(sheet.name, payload.row, payload.column);
        }
        sheet.refreshFilters();
    }
    /**
     * Apply a bulk cell snapshot (cells + per-cell metadata) used by the
     * inverse of deletes and sorts (F08).
     */
    applyCellsReplace(payload, worksheetId) {
        const sheet = worksheetId ? this.worksheets.find((w) => w.id === worksheetId) : undefined;
        if (!sheet)
            return;
        for (const cell of payload.cells ?? []) {
            sheet.releaseSpillAt(cell.row, cell.column);
            const existing = sheet.cells.getCell(cell.row, cell.column);
            if (existing?.formula !== undefined) {
                this.formulaGraph.removeFormula(sheet.name, cell.row, cell.column);
            }
            sheet.cells.setCell(cell.row, cell.column, cell.raw === undefined && cell.formula === undefined
                ? undefined
                : cell.formula !== undefined
                    ? { formula: cell.formula }
                    : { raw: cell.raw });
            const key = `${cell.row},${cell.column}`;
            if (cell.style === null || cell.style === undefined)
                sheet.styles.delete(key);
            else
                sheet.styles.set(key, cell.style);
            if (cell.note === null)
                sheet.notes.delete(key);
            else if (cell.note !== undefined)
                sheet.notes.set(key, cell.note);
            if (cell.format === null)
                sheet.numberFormats.delete(key);
            else if (cell.format !== undefined)
                sheet.numberFormats.set(key, cell.format);
            if (cell.editor === null)
                sheet.cellEditors.delete(key);
            else if (cell.editor !== undefined)
                sheet.cellEditors.set(key, cell.editor);
        }
        if (payload.hiddenRows)
            for (const row of payload.hiddenRows)
                sheet.hiddenRows.add(row);
        if (payload.hiddenColumns)
            for (const column of payload.hiddenColumns)
                sheet.hiddenColumns.add(column);
        this.refreshFormulaGraph();
        sheet.refreshFilters();
    }
    /** Replay per-cell metadata (style/note/format/editor) snapshots (F08). */
    applyMetaSet(payload, worksheetId) {
        const sheet = worksheetId ? this.worksheets.find((w) => w.id === worksheetId) : undefined;
        if (!sheet)
            return;
        for (const cell of payload.cells) {
            const key = `${cell.row},${cell.column}`;
            if (cell.style === null)
                sheet.styles.delete(key);
            else if (cell.style !== undefined)
                sheet.styles.set(key, cell.style);
            if (cell.note === null)
                sheet.notes.delete(key);
            else if (cell.note !== undefined)
                sheet.notes.set(key, cell.note);
            if (cell.format === null)
                sheet.numberFormats.delete(key);
            else if (cell.format !== undefined)
                sheet.numberFormats.set(key, cell.format);
            if (cell.editor === null)
                sheet.cellEditors.delete(key);
            else if (cell.editor !== undefined)
                sheet.cellEditors.set(key, cell.editor);
        }
    }
    /** Replay merge/unmerge state: removals first, then creations (F08). */
    applyMergesSet(payload, worksheetId) {
        const sheet = worksheetId ? this.worksheets.find((w) => w.id === worksheetId) : undefined;
        if (!sheet)
            return;
        for (const rect of payload.removed ?? []) {
            sheet.merges.unmergeAt(rect.top, rect.left);
        }
        for (const rect of payload.added ?? []) {
            sheet.merges.merge(rect);
        }
    }
    /** Replay a stored history operation (cell, bulk or structural). */
    applyHistoryOperation(operation) {
        switch (operation.type) {
            case 'document.restore':
                this.restoreDocument(operation.payload);
                break;
            case 'cell.set':
                this.applyCellSet(operation.payload, operation.worksheetId);
                break;
            case 'cells.replace':
                this.applyCellsReplace(operation.payload, operation.worksheetId);
                break;
            case 'meta.set':
                this.applyMetaSet(operation.payload, operation.worksheetId);
                break;
            case 'merges.set':
                this.applyMergesSet(operation.payload, operation.worksheetId);
                break;
            case 'rows.resize':
            case 'columns.resize': {
                const sheet = this.worksheets.find((w) => w.id === operation.worksheetId);
                if (!sheet)
                    break;
                const { index, size } = operation.payload;
                const sizes = operation.type === 'rows.resize' ? sheet.rowSizes : sheet.columnSizes;
                sizes.setSize(index, size);
                break;
            }
            case 'rows.insert': {
                const { index, count } = operation.payload;
                this.worksheets.find((w) => w.id === operation.worksheetId)?.applyRowsInsert(index, count);
                break;
            }
            case 'rows.delete': {
                const { index, count } = operation.payload;
                this.worksheets.find((w) => w.id === operation.worksheetId)?.applyRowsDelete(index, count);
                break;
            }
            case 'columns.insert': {
                const { index, count } = operation.payload;
                this.worksheets.find((w) => w.id === operation.worksheetId)?.applyColumnsInsert(index, count);
                break;
            }
            case 'columns.delete': {
                const { index, count } = operation.payload;
                this.worksheets.find((w) => w.id === operation.worksheetId)?.applyColumnsDelete(index, count);
                break;
            }
            default:
                break;
        }
    }
    /** Rebuild the workbook-wide formula graph from every worksheet's records. */
    refreshFormulaGraph() {
        const graph = this.formulaGraph;
        graph.clear();
        for (const sheet of this.worksheets) {
            sheet.cells.forEach((row, column, record) => {
                if (record.formula !== undefined) {
                    graph.setFormula(sheet.name, row, column, record.formula, formula_1.Parser.parse(record.formula.slice(1)));
                }
            });
        }
    }
    /**
     * Rewrite formulas on EVERY sheet whose references point at the sheet
     * whose rows/columns moved, then rebuild the graph.
     */
    transformFormulasForStructuralChange(sheetName, shift) {
        for (const sheet of this.worksheets) {
            const updates = [];
            sheet.cells.forEach((row, column, record) => {
                if (record.formula === undefined)
                    return;
                const body = record.formula.slice(1);
                const transformed = (0, model_1.transformFormulaRefs)(body, shift, {
                    ownerSheet: sheet.name,
                    targetSheet: sheetName,
                });
                if (transformed !== body) {
                    updates.push({ row, column, formula: `=${transformed}` });
                }
            });
            for (const u of updates) {
                const record = sheet.cells.getCell(u.row, u.column);
                if (record)
                    record.formula = u.formula;
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
    transformHistory(sheetId, kind, at, delta) {
        if (this.transactionDepth)
            return;
        const targetSheet = this.worksheets.find((w) => w.id === sheetId);
        if (!targetSheet)
            return;
        const shift = { kind, at, delta };
        // Edge-based mapping mirrors the live merge transform: edges inside a
        // deleted band collapse to the boundary, inverted ranges are dropped.
        const edge = (pos, isStart) => shiftRangeEdge(pos, at, delta, isStart);
        const mapRange = (rect) => {
            const top = kind === 'row' ? edge(rect.top, true) : rect.top;
            const bottom = kind === 'row' ? edge(rect.bottom, false) : rect.bottom;
            const left = kind === 'column' ? edge(rect.left, true) : rect.left;
            const right = kind === 'column' ? edge(rect.right, false) : rect.right;
            if (top === undefined ||
                bottom === undefined ||
                left === undefined ||
                right === undefined ||
                bottom < top ||
                right < left) {
                return undefined;
            }
            return { top, left, bottom, right };
        };
        this.history.transformCells(sheetId, (row, column) => {
            const mappedRow = kind === 'row' ? shiftPosition(row, at, delta) : row;
            const mappedColumn = kind === 'column' ? shiftPosition(column, at, delta) : column;
            if (mappedRow === undefined || mappedColumn === undefined)
                return undefined;
            return { row: mappedRow, column: mappedColumn };
        }, (formula, operationSheetId) => {
            const owner = this.worksheets.find((w) => w.id === operationSheetId);
            if (!owner)
                return formula;
            const body = formula.slice(1);
            const transformed = (0, model_1.transformFormulaRefs)(body, shift, {
                ownerSheet: owner.name,
                targetSheet: targetSheet.name,
            });
            return transformed === body ? formula : `=${transformed}`;
        }, mapRange, (axis, index) => axis === kind ? shiftPosition(index, at, delta) : index);
    }
    undo() {
        const entry = this.history.popUndo();
        if (!entry)
            return;
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
        }
        catch (error) {
            // A failed replay must not strand the entry on the redo stack with a
            // half-restored workbook (L10): put it back so the state stays
            // consistent and the user can retry or continue editing.
            this.history.restoreUndo(entry);
            throw error;
        }
        finally {
            this.history.setTransformExclusion(null);
        }
        this.emitMarker(entry, 'undo');
    }
    redo() {
        const entry = this.history.popRedo();
        if (!entry)
            return;
        this.history.setTransformExclusion(entry);
        try {
            for (const operation of entry.forward) {
                this.applyHistoryOperation(operation);
            }
        }
        catch (error) {
            this.history.restoreRedo(entry);
            throw error;
        }
        finally {
            this.history.setTransformExclusion(null);
        }
        this.emitMarker(entry, 'redo');
    }
    emitMarker(entry, type) {
        const reference = entry.forward[0] ?? entry.inverse[0];
        this.listeners.forEach((listener) => listener({
            id: `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
            workbookId: this.id,
            worksheetId: reference?.worksheetId,
            type,
            payload: { of: reference?.id ?? null },
            timestamp: Date.now(),
        }));
    }
    get canUndo() {
        return this.history.canUndo;
    }
    get canRedo() {
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
    toJSON() {
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
                const cells = [];
                sheet.cells.forEach((row, column, record) => {
                    const entry = {};
                    if (record.formula !== undefined)
                        entry.formula = record.formula;
                    if (record.raw !== undefined)
                        entry.raw = record.raw;
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
                    merges: sheet.merges.all.map((m) => (0, model_1.rectToRange)(m)),
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
                        id: table.id,
                        name: table.name,
                        range: (0, model_1.rectToRange)(table.range),
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
    static fromJSON(data) {
        if (data === null || typeof data !== 'object') {
            throw new Error('invalid ezygrid snapshot: expected an object');
        }
        const snapshot = data;
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
            worksheets: worksheetSnapshots.map((raw) => ({
                id: typeof raw?.id === 'string' ? raw.id : undefined,
                name: typeof raw?.name === 'string' ? raw.name : undefined,
                rows: typeof raw?.rows === 'number' ? raw.rows : undefined,
                columns: typeof raw?.columns === 'number' ? raw.columns : undefined,
            })),
        });
        worksheetSnapshots.forEach((raw, index) => {
            const sheet = workbook.worksheets[index];
            if (!sheet)
                return;
            const cells = Array.isArray(raw?.cells) ? raw.cells : [];
            for (const entry of cells) {
                if (!Array.isArray(entry) || entry.length < 3)
                    continue;
                const [row, column, payload] = entry;
                if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0)
                    continue;
                if (payload?.formula !== undefined) {
                    sheet.loadFormulaCell(row, column, payload.formula);
                }
                else if (payload?.raw !== undefined) {
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
                }
                catch {
                    // invalid merge refs are skipped rather than failing the load
                }
            }
            for (const row of Array.isArray(raw?.hiddenRows) ? raw.hiddenRows : []) {
                if (Number.isInteger(row) && row >= 0)
                    sheet.hiddenRows.add(row);
            }
            for (const column of Array.isArray(raw?.hiddenColumns) ? raw.hiddenColumns : []) {
                if (Number.isInteger(column) && column >= 0)
                    sheet.hiddenColumns.add(column);
            }
            // Custom sizes restore through SizeIndex validation; invalid entries
            // are skipped rather than failing the whole load (F13).
            for (const entry of Array.isArray(raw?.rowSizes) ? raw.rowSizes : []) {
                try {
                    if (Array.isArray(entry) && Number.isInteger(entry[0]) && entry[0] >= 0) {
                        sheet.rowSizes.setSize(entry[0], entry[1]);
                    }
                }
                catch {
                    // out-of-range or invalid sizes are skipped
                }
            }
            for (const entry of Array.isArray(raw?.columnSizes) ? raw.columnSizes : []) {
                try {
                    if (Array.isArray(entry) && Number.isInteger(entry[0]) && entry[0] >= 0) {
                        sheet.columnSizes.setSize(entry[0], entry[1]);
                    }
                }
                catch {
                    // out-of-range or invalid sizes are skipped
                }
            }
            for (const group of Array.isArray(raw?.rowGroups) ? raw.rowGroups : []) {
                if (group && Number.isInteger(group.start) && Number.isInteger(group.end) &&
                    Number.isInteger(group.end) && group.end >= group.start) {
                    sheet.groupRows(group.start, group.end);
                    if (group.collapsed)
                        sheet.collapseGroup(group.start);
                }
            }
            if (Array.isArray(raw?.nestedHeaders))
                sheet.setNestedHeaders(raw.nestedHeaders);
            sheet.freezeRows = Math.max(0, Math.min(sheet.rowCount, Number(raw?.freezeRows) || 0));
            sheet.freezeColumns = Math.max(0, Math.min(sheet.columnCount, Number(raw?.freezeColumns) || 0));
            for (const [column, criteria] of Array.isArray(raw?.filterCriteria) ? raw.filterCriteria : [])
                sheet.setFilterCriteria(column, criteria);
            for (const [column, predicate] of Array.isArray(raw?.runtimeFilters) ? raw.runtimeFilters : []) {
                if (typeof predicate === 'function')
                    sheet.setFilter(column, predicate);
            }
            for (const spec of Array.isArray(raw?.pivots) ? raw.pivots : [])
                sheet.pivotSpecs.push(spec);
            for (const table of Array.isArray(raw?.tables) ? raw.tables : []) {
                if (table && typeof table.name === 'string' && typeof table.range === 'string') {
                    try {
                        sheet.addTable({
                            name: table.name,
                            range: table.range,
                            headerRow: table.headerRow !== false,
                            totalRow: table.totalRow === true,
                        });
                        if (typeof table.id === 'string' && table.id && !sheet.tables.all().some(item => item.name !== table.name && item.id === table.id))
                            sheet.getTable(table.name).id = table.id;
                    }
                    catch {
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
                    try {
                        sheet.addImage(object);
                    }
                    catch {
                        // Documents from older versions may carry non-allowlisted image
                        // sources (L2): skip them instead of failing the whole load.
                    }
                }
                else if (object && typeof object === 'object') {
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
exports.Workbook = Workbook;
/** Apply serialized map entries to a worksheet map (F13 loader helper). */
function cloneSnapshot(value) {
    if (Array.isArray(value))
        return value.map((entry) => cloneSnapshot(entry));
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneSnapshot(entry)]));
    }
    return value;
}
/** Apply serialized map entries to a worksheet map (F13 loader helper). */
function applyEntries(target, raw) {
    if (!Array.isArray(raw))
        return;
    for (const entry of raw) {
        if (Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === 'string') {
            target.set(entry[0], entry[1]);
        }
    }
}
/**
 * Phase 0 entry point. Rendering is not attached yet; this creates the
 * workbook model that the DOM renderer will project.
 */
function createGrid(_element, options = {}) {
    return new Workbook(options);
}
/** Shift a plain position through a structural row/column change (undefined = removed). */
function shiftPosition(pos, at, delta) {
    if (delta > 0)
        return pos >= at ? pos + delta : pos;
    const count = -delta;
    if (pos < at)
        return pos;
    if (pos < at + count)
        return undefined;
    return pos - count;
}
function assertCoordinate(value, label) {
    if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`cell ${label} must be a non-negative integer, got ${value}`);
    }
}
/** Compare two metadata snapshots field-by-field (styles compare by value). */
function metaSnapshotsDiffer(a, b) {
    const same = (x, y) => x === y || (x !== null && y !== null && x !== undefined && y !== undefined && JSON.stringify(x) === JSON.stringify(y));
    return (!same(a.style, b.style) ||
        !same(a.note, b.note) ||
        !same(a.format, b.format) ||
        !same(a.editor, b.editor));
}
function validateDimension(value, label) {
    if (!Number.isInteger(value) || value < 1) {
        throw new RangeError(`worksheet ${label} must be a positive integer, got ${value}`);
    }
    const limit = label === 'columns' ? exports.MAX_WORKSHEET_COLUMNS : exports.MAX_WORKSHEET_ROWS;
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
function shiftRangeEdge(pos, at, delta, isStart) {
    if (delta > 0)
        return pos >= at ? pos + delta : pos;
    const count = -delta;
    if (pos < at)
        return pos;
    if (pos < at + count)
        return isStart ? at : at - 1;
    return pos - count;
}

});
