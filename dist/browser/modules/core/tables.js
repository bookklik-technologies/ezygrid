document.currentScript.__ezygridRegister("core/tables", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableStore = void 0;
const model_1 = require("@ezygrid/model");
/**
 * Structured worksheet tables (§25): named ranges with header rows, banded
 * styling and structured references (TableName, TableName[Column]).
 */
class TableStore {
    tables = [];
    /** Owning worksheet (set by the Worksheet field initializer). */
    owner;
    constructor(owner) {
        this.owner = owner;
    }
    invalidateOpaqueReaders() {
        // Table definitions resolve dynamically: readers recompute (F02).
        this.owner?.workbook.formulaGraph.invalidateOpaqueFormulas();
    }
    add(worksheet, options) {
        const rect = (0, model_1.parseRange)(options.range);
        const name = options.name;
        if (this.tables.some((t) => t.name === name)) {
            throw new Error(`table name already in use: ${name}`);
        }
        const columns = [];
        if (options.headerRow !== false) {
            for (let c = rect.left; c <= rect.right; c++) {
                const header = worksheet.getValue(rect.top, c);
                columns.push({ name: header === null || header === undefined ? `Column${c - rect.left + 1}` : String(header), index: c });
            }
        }
        const table = {
            id: (0, model_1.createId)('table'),
            name,
            range: rect,
            headerRow: options.headerRow ?? true,
            totalRow: options.totalRow ?? false,
            columns,
        };
        this.tables.push(table);
        this.invalidateOpaqueReaders();
        return table;
    }
    get(name) {
        return this.tables.find((t) => t.name === name);
    }
    at(row, column) {
        return this.tables.find((t) => row >= t.range.top && row <= t.range.bottom && column >= t.range.left && column <= t.range.right);
    }
    all() {
        return this.tables;
    }
    remove(name) {
        this.tables = this.tables.filter((t) => t.name !== name);
        this.invalidateOpaqueReaders();
    }
    /**
     * Shift table bounds after a structural row/column change. `mapper` maps an
     * axis position to its new position; undefined removes the position. Tables
     * whose range collapses are dropped; affected column definitions follow.
     */
    transform(mapper, axis) {
        for (const t of [...this.tables]) {
            const start = mapper(axis === 'row' ? t.range.top : t.range.left, true);
            const end = mapper(axis === 'row' ? t.range.bottom : t.range.right, false);
            if (start === undefined || end === undefined || end < start) {
                this.remove(t.name);
                continue;
            }
            if (axis === 'row') {
                t.range = { ...t.range, top: start, bottom: end };
            }
            else {
                t.range = { ...t.range, left: start, right: end };
                t.columns = t.columns
                    .map((c) => ({ ...c, index: mapper(c.index, true) ?? Number.NaN }))
                    .filter((c) => Number.isInteger(c.index) && c.index >= t.range.left && c.index <= t.range.right);
            }
        }
    }
}
exports.TableStore = TableStore;

});
