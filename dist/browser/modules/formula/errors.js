document.currentScript.__ezygridRegister("formula/errors", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERR = exports.FormulaError = void 0;
class FormulaError extends Error {
    value;
    constructor(value, message) {
        super(message ?? value);
        this.value = value;
    }
}
exports.FormulaError = FormulaError;
exports.ERR = {
    NULL: () => new FormulaError('#NULL!'),
    DIV0: () => new FormulaError('#DIV/0!'),
    VALUE: () => new FormulaError('#VALUE!'),
    REF: () => new FormulaError('#REF!'),
    NAME: () => new FormulaError('#NAME?'),
    NUM: () => new FormulaError('#NUM!'),
    NA: () => new FormulaError('#N/A'),
    SPILL: () => new FormulaError('#SPILL!'),
    CALC: () => new FormulaError('#CALC!'),
    CIRCULAR: () => new FormulaError('#CIRCULAR!'),
};

});
