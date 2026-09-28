document.currentScript.__ezygridRegister("model/ids", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createId = createId;
let counter = 0;
/** Generate a stable unique id for rows/columns/sheets/etc. */
function createId(prefix = 'id') {
    counter += 1;
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${rand}`;
}

});
