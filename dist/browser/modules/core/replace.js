document.currentScript.__ezygridRegister("core/replace", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replace = replace;
exports.replaceAll = replaceAll;
const search_js_1 = require("./search.js");
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Replace every occurrence of `query` inside `text`, honoring matchCase. */
function replaceOccurrences(text, query, replacement, options) {
    if (!options.matchCase) {
        return text.replace(new RegExp(escapeRegExp(query), 'gi'), () => replacement);
    }
    return text.split(query).join(replacement);
}
/** Replace helpers extending the search service (§21). */
function replace(worksheet, query, replacement, from, options = {}) {
    const search = new search_js_1.SearchService();
    // Excel-like: the hit at or after the given position is replaced.
    const hits = search.find(worksheet, query, options);
    const hit = hits.find((h) => h.row > from.row || (h.row === from.row && h.column >= from.column)) ??
        hits[0];
    if (!hit)
        return undefined;
    // SearchResult.text is the ORIGINAL cell text (never lowercased), so the
    // rest of the string keeps its casing.
    const updated = replaceOccurrences(hit.text, query, replacement, options);
    // Replacement text stays literal (M10): a replacement beginning with "="
    // must not silently turn a text cell into a live formula.
    const operation = worksheet.setValue(hit.row, hit.column, updated, { literal: true });
    return operation ? hit : undefined;
}
function replaceAll(worksheet, query, replacement, options = {}) {
    const search = new search_js_1.SearchService();
    const hits = search.find(worksheet, query, options);
    let count = 0;
    for (const hit of hits) {
        // Replace every occurrence within the cell, not just the first.
        const updated = replaceOccurrences(hit.text, query, replacement, options);
        if (updated === hit.text)
            continue;
        const operation = worksheet.setValue(hit.row, hit.column, updated, { literal: true });
        // Only successful writes count as replacements.
        if (operation)
            count += 1;
    }
    return count;
}

});
