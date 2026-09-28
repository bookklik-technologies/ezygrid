document.currentScript.__ezygridRegister("model/index", function(require, module, exports) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./coordinates.js"), exports);
__exportStar(require("./ids.js"), exports);
__exportStar(require("./sparse-store.js"), exports);
__exportStar(require("./size-index.js"), exports);
__exportStar(require("./operations.js"), exports);
__exportStar(require("./history.js"), exports);
__exportStar(require("./ref-transform.js"), exports);

});
