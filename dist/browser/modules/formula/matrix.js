document.currentScript.__ezygridRegister("formula/matrix", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matrix = matrix;
exports.isMatrix = isMatrix;
exports.flatten = flatten;
exports.matrixFromCells = matrixFromCells;
exports.scalarOf = scalarOf;
const errors_js_1 = require("./errors.js");
function matrix(values) {
    return { kind: 'matrix', rows: values.length, columns: values[0]?.length ?? 0, values };
}
function isMatrix(v) {
    return typeof v === 'object' && v !== null && v.kind === 'matrix';
}
/** Flatten a value into a list of scalars (matrices are traversed row-major). */
function flatten(v) {
    if (isMatrix(v)) {
        const out = [];
        for (const row of v.values)
            for (const item of row)
                out.push(item);
        return out;
    }
    return [v];
}
function matrixFromCells(cells) {
    return matrix(cells);
}
/** Coerce a scalar; matrices must be single-element to be usable as scalars. */
function scalarOf(v) {
    if (isMatrix(v)) {
        if (v.rows === 1 && v.columns === 1)
            return v.values[0][0];
        throw new errors_js_1.FormulaError('#VALUE!');
    }
    return v;
}

});
