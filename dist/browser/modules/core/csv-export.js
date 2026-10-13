document.currentScript.__ezygridRegister("core/csv-export", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.worksheetToCsv = worksheetToCsv;
exports.worksheetFromCsv = worksheetFromCsv;
const model_1 = require("@ezygrid/model");
const csv_1 = require("@ezygrid/csv");
const format_js_1 = require("./format.js");
/**
 * Export the used range (or a given range) as CSV, using display formatting.
 * Formula-escaping defaults to true (CSV injection safety); pass
 * `{ escapeFormulas: false }` to write raw values.
 */
function worksheetToCsv(worksheet, options = {}) {
    const rect = options.range ? (0, model_1.parseRange)(options.range) : worksheet.cells.usedRange;
    if (!rect)
        return '';
    const rows = [];
    for (let r = rect.top; r <= rect.bottom; r++) {
        const row = [];
        for (let c = rect.left; c <= rect.right; c++) {
            const value = worksheet.getValue(r, c);
            const mask = worksheet.getNumberFormat(r, c);
            row.push((0, format_js_1.formatValue)(value, mask));
        }
        rows.push(row);
    }
    return (0, csv_1.stringifyCsv)(rows, {
        delimiter: options.delimiter,
        escapeFormulas: options.escapeFormulas,
    });
}
/** Import CSV text into the worksheet. */
function worksheetFromCsv(worksheet, text, options = {}) {
    const parsed = (0, csv_1.parseCsv)(text, options);
    const anchorRect = options.anchor ? (0, model_1.parseRange)(options.anchor) : { top: 0, left: 0, bottom: 0, right: 0 };
    // One notification transaction for the whole import: one render pass (F02).
    worksheet.workbook.beginUpdate();
    worksheet.workbook.history.beginBatch();
    try {
        for (let r = 0; r < parsed.rows.length; r++) {
            const row = parsed.rows[r];
            for (let c = 0; c < row.length; c++) {
                const value = row[c];
                // Only honor the formula interpretation when the import opts in;
                // otherwise write literally so "=1+1" stays text.
                const asFormula = options.formulas === true && typeof value === 'string' && value.startsWith('=');
                worksheet.setValue(anchorRect.top + r, anchorRect.left + c, value, { literal: !asFormula });
            }
        }
    }
    finally {
        try {
            worksheet.workbook.endUpdate();
        }
        finally {
            worksheet.workbook.history.endBatch();
        }
    }
}

});
