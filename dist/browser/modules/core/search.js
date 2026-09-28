document.currentScript.__ezygridRegister("core/search", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchService = void 0;
/**
 * Search service (§21): scans the used range of a worksheet in row-major
 * order against displayed values.
 */
class SearchService {
    find(worksheet, query, options = {}) {
        const results = [];
        const used = worksheet.cells.usedRange;
        if (!used || query === '')
            return results;
        const needle = options.matchCase ? query : query.toLowerCase();
        for (let r = used.top; r <= used.bottom; r++) {
            for (let c = used.left; c <= used.right; c++) {
                const record = worksheet.cells.getCell(r, c);
                if (!record)
                    continue;
                let haystack;
                if (options.searchFormulas && record.formula !== undefined) {
                    haystack = record.formula;
                }
                else {
                    const value = worksheet.getValue(r, c);
                    haystack = value === null || value === undefined ? '' : String(value);
                }
                // Keep the ORIGINAL text in the result so replacement writes back
                // the same casing; comparison uses a lowercase copy.
                const comparable = options.matchCase ? haystack : haystack.toLowerCase();
                const hit = options.wholeCell ? comparable === needle : comparable.includes(needle);
                if (hit)
                    results.push({ row: r, column: c, text: haystack });
            }
        }
        return results;
    }
    /** Next match at or after the given cell, wrapping around. */
    findNext(worksheet, query, from, options = {}) {
        const results = this.find(worksheet, query, options);
        if (results.length === 0)
            return undefined;
        const after = results.find((r) => r.row > from.row || (r.row === from.row && r.column > from.column));
        return after ?? results[0];
    }
}
exports.SearchService = SearchService;

});
