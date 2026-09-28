document.currentScript.__ezygridRegister("model/operations", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.op = void 0;
const op = (workbookId, type, payload, worksheetId, actorId) => ({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    actorId,
    workbookId,
    worksheetId,
    type,
    payload,
    timestamp: Date.now(),
});
exports.op = op;

});
