document.currentScript.__ezygridRegister("core/fill", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FillService = void 0;
const clipboard_js_1 = require("./clipboard.js");
/**
 * Fill engine (§12.4): copy values, translate formulas, and infer series.
 * Series rules per seed column/row:
 * - numbers (>=2 seeds): arithmetic progression with observed step
 * - single number seed: copy
 * - text ending in digits: increment the numeric suffix
 * - otherwise: copy
 */
class FillService {
    /** Extend a seed rectangle along both axes, without overwriting its cells.
     * Rows are extended first; columns then extend the resulting row patterns.
     * The whole fill is one history transaction (F09).
     */
    fillRange(worksheet, source, target) {
        if (target.top > source.top || target.bottom < source.bottom ||
            target.left > source.left || target.right < source.right) {
            throw new Error('Fill target must contain the source range.');
        }
        const history = worksheet.workbook.history;
        history.beginBatch();
        worksheet.workbook.beginUpdate();
        try {
            if (target.top < source.top)
                this.fill(worksheet, 'up', source, target.top);
            if (target.bottom > source.bottom)
                this.fill(worksheet, 'down', source, target.bottom);
            const rows = { ...source, top: target.top, bottom: target.bottom };
            if (target.left < source.left)
                this.fill(worksheet, 'left', rows, target.left);
            if (target.right > source.right)
                this.fill(worksheet, 'right', rows, target.right);
        }
        finally {
            worksheet.workbook.endUpdate();
            history.endBatch();
        }
    }
    fill(worksheet, direction, rect, targetEnd) {
        const history = worksheet.workbook.history;
        history.beginBatch();
        worksheet.workbook.beginUpdate();
        try {
            if (direction === 'down' || direction === 'up') {
                const step = direction === 'down' ? 1 : -1;
                const start = direction === 'down' ? rect.bottom + 1 : rect.top - 1;
                for (let row = start; direction === 'down' ? row <= targetEnd : row >= targetEnd; row += step) {
                    for (let c = rect.left; c <= rect.right; c++) {
                        worksheet.setValue(row, c, this.inferValue(worksheet, rect.top, rect.bottom, c, row - rect.top, 'row'));
                    }
                }
                return;
            }
            const step = direction === 'right' ? 1 : -1;
            const start = direction === 'right' ? rect.right + 1 : rect.left - 1;
            for (let column = start; direction === 'right' ? column <= targetEnd : column >= targetEnd; column += step) {
                for (let r = rect.top; r <= rect.bottom; r++) {
                    worksheet.setValue(r, column, this.inferValue(worksheet, rect.left, rect.right, r, column - rect.left, 'column'));
                }
            }
        }
        finally {
            worksheet.workbook.endUpdate();
            history.endBatch();
        }
    }
    inferValue(worksheet, from, to, other, distance, axis) {
        const get = (index) => axis === 'row'
            ? worksheet.cells.getCell(index, other)
            : worksheet.cells.getCell(other, index);
        const count = to - from + 1;
        const first = get(from);
        if (!first)
            return null;
        if (first.formula !== undefined) {
            return (0, clipboard_js_1.translateFormula)(first.formula, axis === 'row' ? distance : 0, axis === 'column' ? distance : 0);
        }
        if (count >= 2) {
            const second = get(from + 1);
            if (typeof first.raw === 'number' &&
                second &&
                typeof second.raw === 'number' &&
                second.formula === undefined) {
                const stepValue = second.raw - first.raw;
                return first.raw + stepValue * distance;
            }
            // date series (Excel serial numbers with date formats) fall through to copy
        }
        // text with trailing digits: "Item 1" -> "Item 2"
        if (typeof first.raw === 'string') {
            const m = /^(.*?)(\d+)$/.exec(first.raw);
            if (m && count >= 2) {
                const second = get(from + 1);
                const m2 = second?.raw !== undefined ? /^(\D*?)(\d+)$/.exec(String(second.raw)) : undefined;
                if (m2 && m2[1] === m[1]) {
                    const stepNum = Number(m2[2]) - Number(m[2]) || 1;
                    const value = Number(m[2]) + stepNum * distance;
                    return `${m[1]}${value}`;
                }
            }
            return first.raw;
        }
        return first.raw ?? null;
    }
}
exports.FillService = FillService;

});
