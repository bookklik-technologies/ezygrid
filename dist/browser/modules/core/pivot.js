document.currentScript.__ezygridRegister("core/pivot", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PivotEngine = void 0;
exports.newPivotSpec = newPivotSpec;
const model_1 = require("@ezygrid/model");
const AGGREGATORS = {
    SUM: (v) => v.reduce((a, b) => a + b, 0),
    COUNT: (v) => v.length,
    COUNTA: (v) => v.length,
    AVG: (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0),
    MIN: (v) => (v.length ? Math.min(...v) : 0),
    MAX: (v) => (v.length ? Math.max(...v) : 0),
};
/**
 * Pivot tables v1 (§33): row-grouped aggregation over a source range,
 * written as raw values anchored at the pivot position.
 */
class PivotEngine {
    compute(worksheet, spec) {
        const rect = (0, model_1.parseRange)(spec.source);
        const headerOffset = 1;
        const valueCols = spec.values;
        const groups = new Map();
        const rowOrder = [];
        for (let r = rect.top + headerOffset; r <= rect.bottom; r++) {
            const key = spec.rows.map((c) => String(worksheet.getValue(r, rect.left + c) ?? '')).join('');
            if (!groups.has(key)) {
                groups.set(key, []);
                rowOrder.push(key);
            }
            const record = [];
            for (let c = rect.left; c <= rect.right; c++) {
                record.push(worksheet.getValue(r, c));
            }
            groups.get(key).push(record);
        }
        const header = [
            ...spec.rows.map((c) => String(worksheet.getValue(rect.top, rect.left + c) ?? `F${c}`)),
            ...spec.values.map((v) => v.label ?? `${v.agg}`),
        ];
        const rows = [];
        for (const key of rowOrder) {
            const records = groups.get(key);
            const row = [];
            for (const groupCol of spec.rows) {
                row.push(records[0]?.[groupCol] ?? null);
            }
            for (const valueField of valueCols) {
                // values[].column is relative to the source range's left edge,
                // matching the record layout (index 0 = rect.left).
                const valueIndex = valueField.column;
                const nums = [];
                for (const record of records) {
                    const v = record[valueIndex];
                    if (typeof v === 'number')
                        nums.push(v);
                }
                row.push(AGGREGATORS[valueField.agg](nums));
            }
            rows.push(row);
        }
        const grandTotals = spec.rows.map(() => 'Total');
        for (const valueField of valueCols) {
            const nums = [];
            for (const record of groups.values()) {
                for (const record2 of record) {
                    const v = record2[valueField.column];
                    if (typeof v === 'number')
                        nums.push(v);
                }
            }
            grandTotals.push(AGGREGATORS[valueField.agg](nums));
        }
        return { header, rows, grandTotals };
    }
    /** Compute and write the pivot at its anchor. */
    refresh(worksheet, spec) {
        const anchor = (0, model_1.parseRange)(spec.anchor);
        const { header, rows, grandTotals } = this.compute(worksheet, spec);
        const allRows = [header, ...rows, grandTotals];
        for (let i = 0; i < allRows.length; i++) {
            const row = allRows[i];
            for (let c = 0; c < row.length; c++) {
                worksheet.setValue(anchor.top + i, anchor.left + c, row[c]);
            }
        }
    }
}
exports.PivotEngine = PivotEngine;
/** Convenience: build a pivot spec id. */
function newPivotSpec(partial) {
    return { ...partial, id: (0, model_1.createId)('pivot') };
}

});
