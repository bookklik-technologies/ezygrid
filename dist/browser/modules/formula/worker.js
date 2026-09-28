document.currentScript.__ezygridRegister("formula/worker", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateStandalone = evaluateStandalone;
exports.shapeResult = shapeResult;
const parser_js_1 = require("./parser.js");
const dependency_graph_js_1 = require("./dependency-graph.js");
const matrix_js_1 = require("./matrix.js");
/**
 * Standalone formula evaluation used by the calculation worker (§14.4).
 * Transport-efficient: only the values a formula needs are shipped.
 */
function evaluateStandalone(expression, values) {
    const graph = new dependency_graph_js_1.DependencyGraph();
    graph.setCurrentSheet('Sheet1');
    // Register the formula away from the value grid to avoid self-reference.
    const anchorRow = 9999;
    const anchorColumn = 9999;
    graph.setFormula('Sheet1', anchorRow, anchorColumn, `=${expression}`, parser_js_1.Parser.parse(expression));
    return graph.recalculate('Sheet1', anchorRow, anchorColumn, (_sheet, row, column) => values[`${row},${column}`] ?? null);
}
/** Shape a matrix result for transport. */
function shapeResult(result) {
    if ((0, matrix_js_1.isMatrix)(result)) {
        const m = result;
        return { rows: m.rows, columns: m.columns, values: m.values };
    }
    return undefined;
}

});
