document.currentScript.__ezygridRegister("core/auto", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ezygrid = void 0;
const ezy_grid_js_1 = require("./ezy-grid.js");
var ezy_grid_js_2 = require("./ezy-grid.js");
Object.defineProperty(exports, "Ezygrid", { enumerable: true, get: function () { return ezy_grid_js_2.Ezygrid; } });
// This opt-in entry point is also safe to import during server-side rendering.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ezy_grid_js_1.Ezygrid.initAll(), { once: true });
    }
    else {
        ezy_grid_js_1.Ezygrid.initAll();
    }
}

});
