(function() {
"use strict";
var exports = {};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBrowserLoader = startBrowserLoader;
/** Compiled alone into the small classic loader, with a generated manifest. */
function startBrowserLoader(manifest) {
    if (typeof window === 'undefined' || typeof document === 'undefined')
        return;
    if (typeof window.Ezygrid?.ready?.then === 'function')
        return;
    const loaderScript = document.currentScript;
    const notReady = () => {
        throw new Error('Ezygrid: wait for Ezygrid.ready before initializing or accessing editors.');
    };
    const pending = function Ezygrid() { notReady(); };
    pending.getInstance = notReady;
    pending.initAll = notReady;
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    Object.defineProperty(pending, 'ready', { value: ready });
    window.Ezygrid = pending;
    if (!loaderScript?.src) {
        rejectReady(new Error('Ezygrid: load ezygrid.js with an external script tag.'));
        return;
    }
    const base = new URL('.', loaderScript.src);
    const factories = new Map();
    const cache = new Map();
    function requireModule(id) {
        const existing = cache.get(id);
        if (existing)
            return existing.exports;
        const factory = factories.get(id);
        const definition = manifest.modules[id];
        if (!factory || !definition)
            throw new Error(`Ezygrid: missing module "${id}".`);
        const module = { exports: {} };
        cache.set(id, module); // Cache first so circular imports share exports.
        try {
            factory((request) => {
                const dependency = definition.dependencies[request];
                if (!dependency)
                    throw new Error(`Unknown dependency "${request}" in "${id}".`);
                return requireModule(dependency);
            }, module, module.exports);
        }
        catch (error) {
            cache.delete(id);
            throw new Error(`Ezygrid: module "${id}" failed to initialize.`, { cause: error });
        }
        return module.exports;
    }
    function loadModule(id, file) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = new URL(file, base).href;
            script.async = true;
            if (loaderScript?.nonce)
                script.nonce = loaderScript.nonce;
            let registrationError;
            script.__ezygridRegister = (registeredId, factory) => {
                if (registeredId !== id || typeof factory !== 'function' || factories.has(id)) {
                    registrationError = new Error(`Ezygrid: invalid module registration for "${id}".`);
                }
                else {
                    factories.set(id, factory);
                }
            };
            const cleanup = () => {
                script.onload = script.onerror = null;
                delete script.__ezygridRegister;
                script.remove();
            };
            script.onload = () => {
                cleanup();
                if (registrationError)
                    reject(registrationError);
                else if (!factories.has(id))
                    reject(new Error(`Ezygrid: "${script.src}" did not register module "${id}".`));
                else
                    resolve();
            };
            script.onerror = () => {
                cleanup();
                reject(new Error(`Ezygrid: failed to load module "${id}" from ${script.src}.`));
            };
            document.head.appendChild(script);
        });
    }
    const domReady = document.readyState === 'loading'
        ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }))
        : Promise.resolve();
    Promise.all(Object.entries(manifest.modules).map(([id, entry]) => loadModule(id, entry.file)))
        .then(async () => {
        await domReady;
        const constructor = requireModule(manifest.entries.constructor).Ezygrid;
        if (typeof constructor !== 'function')
            throw new Error('Ezygrid: constructor module did not export Ezygrid.');
        Object.defineProperty(constructor, 'ready', { value: ready });
        window.Ezygrid = constructor;
        // Waiting for the DOM makes auto startup and its errors synchronous.
        requireModule(manifest.entries.auto);
        resolveReady(constructor);
    })
        .catch((error) => {
        window.Ezygrid = pending;
        rejectReady(error instanceof Error ? error : new Error(`Ezygrid: initialization failed: ${String(error)}`));
    });
}

exports.startBrowserLoader({
  "entries": {
    "constructor": "core/ezy-grid",
    "auto": "core/auto"
  },
  "modules": {
    "core/ezy-grid": {
      "file": "modules/core/ezy-grid.js",
      "dependencies": {
        "./workbook.js": "core/workbook",
        "./renderer.js": "core/renderer"
      }
    },
    "core/workbook": {
      "file": "modules/core/workbook.js",
      "dependencies": {
        "@ezygrid/model": "model/index",
        "@ezygrid/formula": "formula/index",
        "./merges.js": "core/merges",
        "./tables.js": "core/tables",
        "./validation.js": "core/validation",
        "./conditional-format.js": "core/conditional-format",
        "./charts.js": "core/charts",
        "./pivot.js": "core/pivot",
        "./media.js": "core/media",
        "./csv-export.js": "core/csv-export",
        "./plugins.js": "core/plugins"
      }
    },
    "model/index": {
      "file": "modules/model/index.js",
      "dependencies": {
        "./coordinates.js": "model/coordinates",
        "./ids.js": "model/ids",
        "./sparse-store.js": "model/sparse-store",
        "./size-index.js": "model/size-index",
        "./operations.js": "model/operations",
        "./history.js": "model/history",
        "./ref-transform.js": "model/ref-transform"
      }
    },
    "model/coordinates": {
      "file": "modules/model/coordinates.js",
      "dependencies": {}
    },
    "model/ids": {
      "file": "modules/model/ids.js",
      "dependencies": {}
    },
    "model/sparse-store": {
      "file": "modules/model/sparse-store.js",
      "dependencies": {}
    },
    "model/size-index": {
      "file": "modules/model/size-index.js",
      "dependencies": {}
    },
    "model/operations": {
      "file": "modules/model/operations.js",
      "dependencies": {}
    },
    "model/history": {
      "file": "modules/model/history.js",
      "dependencies": {}
    },
    "model/ref-transform": {
      "file": "modules/model/ref-transform.js",
      "dependencies": {
        "./coordinates.js": "model/coordinates"
      }
    },
    "formula/index": {
      "file": "modules/formula/index.js",
      "dependencies": {
        "./errors.js": "formula/errors",
        "./lexer.js": "formula/lexer",
        "./parser.js": "formula/parser",
        "./functions.js": "formula/functions",
        "./matrix.js": "formula/matrix",
        "./dependency-graph.js": "formula/dependency-graph",
        "./registry.js": "formula/registry",
        "./worker.js": "formula/worker"
      }
    },
    "formula/errors": {
      "file": "modules/formula/errors.js",
      "dependencies": {}
    },
    "formula/lexer": {
      "file": "modules/formula/lexer.js",
      "dependencies": {}
    },
    "formula/parser": {
      "file": "modules/formula/parser.js",
      "dependencies": {
        "./lexer.js": "formula/lexer",
        "@ezygrid/model": "model/index"
      }
    },
    "formula/functions": {
      "file": "modules/formula/functions.js",
      "dependencies": {
        "./errors.js": "formula/errors",
        "./matrix.js": "formula/matrix"
      }
    },
    "formula/matrix": {
      "file": "modules/formula/matrix.js",
      "dependencies": {
        "./errors.js": "formula/errors"
      }
    },
    "formula/dependency-graph": {
      "file": "modules/formula/dependency-graph.js",
      "dependencies": {
        "./parser.js": "formula/parser",
        "./functions.js": "formula/functions",
        "./errors.js": "formula/errors",
        "./matrix.js": "formula/matrix"
      }
    },
    "formula/registry": {
      "file": "modules/formula/registry.js",
      "dependencies": {
        "./functions.js": "formula/functions"
      }
    },
    "formula/worker": {
      "file": "modules/formula/worker.js",
      "dependencies": {
        "./parser.js": "formula/parser",
        "./dependency-graph.js": "formula/dependency-graph",
        "./matrix.js": "formula/matrix"
      }
    },
    "core/merges": {
      "file": "modules/core/merges.js",
      "dependencies": {
        "@ezygrid/model": "model/index"
      }
    },
    "core/tables": {
      "file": "modules/core/tables.js",
      "dependencies": {
        "@ezygrid/model": "model/index"
      }
    },
    "core/validation": {
      "file": "modules/core/validation.js",
      "dependencies": {
        "@ezygrid/model": "model/index"
      }
    },
    "core/conditional-format": {
      "file": "modules/core/conditional-format.js",
      "dependencies": {
        "@ezygrid/model": "model/index"
      }
    },
    "core/charts": {
      "file": "modules/core/charts.js",
      "dependencies": {
        "@ezygrid/model": "model/index"
      }
    },
    "core/pivot": {
      "file": "modules/core/pivot.js",
      "dependencies": {
        "@ezygrid/model": "model/index"
      }
    },
    "core/media": {
      "file": "modules/core/media.js",
      "dependencies": {
        "@ezygrid/model": "model/index"
      }
    },
    "core/csv-export": {
      "file": "modules/core/csv-export.js",
      "dependencies": {
        "@ezygrid/model": "model/index",
        "@ezygrid/csv": "csv/index",
        "./format.js": "core/format"
      }
    },
    "csv/index": {
      "file": "modules/csv/index.js",
      "dependencies": {
        "./csv.js": "csv/csv"
      }
    },
    "csv/csv": {
      "file": "modules/csv/csv.js",
      "dependencies": {}
    },
    "core/format": {
      "file": "modules/core/format.js",
      "dependencies": {}
    },
    "core/plugins": {
      "file": "modules/core/plugins.js",
      "dependencies": {}
    },
    "core/renderer": {
      "file": "modules/core/renderer.js",
      "dependencies": {
        "./selection.js": "core/selection",
        "./editing.js": "core/editing",
        "./clipboard.js": "core/clipboard",
        "./commands.js": "core/commands",
        "./fill.js": "core/fill",
        "./format.js": "core/format",
        "./floating-objects.js": "core/floating-objects",
        "@ezygrid/formula": "formula/index",
        "@ezygrid/model": "model/index",
        "./workbook.js": "core/workbook",
        "./ui/editor-shell.js": "core/ui/editor-shell",
        "./ui/cell-style.js": "core/ui/cell-style",
        "./ui/select.js": "core/ui/select"
      }
    },
    "core/selection": {
      "file": "modules/core/selection.js",
      "dependencies": {
        "@ezygrid/model": "model/index"
      }
    },
    "core/editing": {
      "file": "modules/core/editing.js",
      "dependencies": {}
    },
    "core/clipboard": {
      "file": "modules/core/clipboard.js",
      "dependencies": {
        "@ezygrid/model": "model/index"
      }
    },
    "core/commands": {
      "file": "modules/core/commands.js",
      "dependencies": {}
    },
    "core/fill": {
      "file": "modules/core/fill.js",
      "dependencies": {
        "./clipboard.js": "core/clipboard"
      }
    },
    "core/floating-objects": {
      "file": "modules/core/floating-objects.js",
      "dependencies": {
        "./charts.js": "core/charts",
        "./chart-svg.js": "core/chart-svg"
      }
    },
    "core/chart-svg": {
      "file": "modules/core/chart-svg.js",
      "dependencies": {
        "./charts.js": "core/charts"
      }
    },
    "core/ui/editor-shell": {
      "file": "modules/core/ui/editor-shell.js",
      "dependencies": {
        "../workbook.js": "core/workbook",
        "@ezygrid/model": "model/index",
        "./dom.js": "core/ui/dom",
        "./select.js": "core/ui/select",
        "./styles.js": "core/ui/styles",
        "./panels.js": "core/ui/panels",
        "./layout-ribbon.js": "core/ui/layout-ribbon",
        "./headers-ribbon.js": "core/ui/headers-ribbon",
        "./tools-ribbon.js": "core/ui/tools-ribbon",
        "../xlsx/index.js": "core/xlsx/index",
        "../print.js": "core/print",
        "../theme.js": "core/theme",
        "./suite-topbar.js": "core/ui/suite-topbar"
      }
    },
    "core/ui/dom": {
      "file": "modules/core/ui/dom.js",
      "dependencies": {
        "./select.js": "core/ui/select"
      }
    },
    "core/ui/select": {
      "file": "modules/core/ui/select.js",
      "dependencies": {}
    },
    "core/ui/styles": {
      "file": "modules/core/ui/styles.js",
      "dependencies": {
        "./suite-topbar-styles.js": "core/ui/suite-topbar-styles"
      }
    },
    "core/ui/suite-topbar-styles": {
      "file": "modules/core/ui/suite-topbar-styles.js",
      "dependencies": {}
    },
    "core/ui/panels": {
      "file": "modules/core/ui/panels.js",
      "dependencies": {
        "./dom.js": "core/ui/dom",
        "@ezygrid/model": "model/index",
        "../search.js": "core/search",
        "../replace.js": "core/replace",
        "../sort.js": "core/sort",
        "../fill.js": "core/fill",
        "./object-panel.js": "core/ui/object-panel",
        "./table-panel.js": "core/ui/table-panel",
        "./ribbon-actions.js": "core/ui/ribbon-actions"
      }
    },
    "core/search": {
      "file": "modules/core/search.js",
      "dependencies": {}
    },
    "core/replace": {
      "file": "modules/core/replace.js",
      "dependencies": {
        "./search.js": "core/search"
      }
    },
    "core/sort": {
      "file": "modules/core/sort.js",
      "dependencies": {
        "./clipboard.js": "core/clipboard"
      }
    },
    "core/ui/object-panel": {
      "file": "modules/core/ui/object-panel.js",
      "dependencies": {
        "@ezygrid/model": "model/index",
        "./dom.js": "core/ui/dom",
        "../charts.js": "core/charts",
        "../chart-svg.js": "core/chart-svg",
        "./ribbon-actions.js": "core/ui/ribbon-actions"
      }
    },
    "core/ui/ribbon-actions": {
      "file": "modules/core/ui/ribbon-actions.js",
      "dependencies": {
        "@ezygrid/model": "model/index",
        "../charts.js": "core/charts"
      }
    },
    "core/ui/table-panel": {
      "file": "modules/core/ui/table-panel.js",
      "dependencies": {
        "@ezygrid/model": "model/index",
        "../format.js": "core/format",
        "./dom.js": "core/ui/dom"
      }
    },
    "core/ui/layout-ribbon": {
      "file": "modules/core/ui/layout-ribbon.js",
      "dependencies": {
        "../workbook.js": "core/workbook",
        "./dom.js": "core/ui/dom",
        "./suite-topbar.js": "core/ui/suite-topbar",
        "./layout-actions.js": "core/ui/layout-actions"
      }
    },
    "core/ui/suite-topbar": {
      "file": "modules/core/ui/suite-topbar.js",
      "dependencies": {}
    },
    "core/ui/layout-actions": {
      "file": "modules/core/ui/layout-actions.js",
      "dependencies": {
        "../workbook.js": "core/workbook",
        "../format.js": "core/format"
      }
    },
    "core/ui/headers-ribbon": {
      "file": "modules/core/ui/headers-ribbon.js",
      "dependencies": {
        "./dom.js": "core/ui/dom",
        "./select.js": "core/ui/select",
        "./layout-actions.js": "core/ui/layout-actions"
      }
    },
    "core/ui/tools-ribbon": {
      "file": "modules/core/ui/tools-ribbon.js",
      "dependencies": {
        "@ezygrid/model": "model/index",
        "@ezygrid/formula": "formula/index",
        "./dom.js": "core/ui/dom",
        "./select.js": "core/ui/select",
        "./panels.js": "core/ui/panels",
        "./object-panel.js": "core/ui/object-panel",
        "./table-panel.js": "core/ui/table-panel",
        "./ribbon-actions.js": "core/ui/ribbon-actions",
        "../search.js": "core/search",
        "../sort.js": "core/sort",
        "./suite-topbar.js": "core/ui/suite-topbar"
      }
    },
    "core/xlsx/index": {
      "file": "modules/core/xlsx/index.js",
      "dependencies": {
        "../workbook.js": "core/workbook",
        "../format.js": "core/format",
        "@ezygrid/model": "model/index",
        "./writer.js": "core/xlsx/writer",
        "./reader.js": "core/xlsx/reader",
        "./zip.js": "core/xlsx/zip",
        "./styles.js": "core/xlsx/styles"
      }
    },
    "core/xlsx/writer": {
      "file": "modules/core/xlsx/writer.js",
      "dependencies": {
        "@ezygrid/model": "model/index",
        "../format.js": "core/format",
        "./zip.js": "core/xlsx/zip",
        "./styles.js": "core/xlsx/styles"
      }
    },
    "core/xlsx/zip": {
      "file": "modules/core/xlsx/zip.js",
      "dependencies": {}
    },
    "core/xlsx/styles": {
      "file": "modules/core/xlsx/styles.js",
      "dependencies": {
        "./reader.js": "core/xlsx/reader"
      }
    },
    "core/xlsx/reader": {
      "file": "modules/core/xlsx/reader.js",
      "dependencies": {}
    },
    "core/print": {
      "file": "modules/core/print.js",
      "dependencies": {
        "./format.js": "core/format"
      }
    },
    "core/theme": {
      "file": "modules/core/theme.js",
      "dependencies": {}
    },
    "core/ui/cell-style": {
      "file": "modules/core/ui/cell-style.js",
      "dependencies": {}
    },
    "core/auto": {
      "file": "modules/core/auto.js",
      "dependencies": {
        "./ezy-grid.js": "core/ezy-grid"
      }
    }
  }
});
})();
