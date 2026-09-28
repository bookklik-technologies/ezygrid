document.currentScript.__ezygridRegister("core/plugins", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginManager = void 0;
exports.definePlugin = definePlugin;
/** Identity helper giving plugin authors a typed authoring surface (§44). */
function definePlugin(plugin) {
    return plugin;
}
class PluginManager {
    plugins;
    constructor(plugins = []) {
        this.plugins = plugins;
    }
    get names() {
        return this.plugins.map((p) => p.name);
    }
    /**
     * Run all plugin setups and return a disposer owning THIS attachment.
     * Renderer replacement on the same workbook no longer accumulates
     * disposers: each attachment disposes exactly what it created (F17).
     * If a plugin fails mid-run, already-set-up plugins are disposed first.
     */
    run(context) {
        const disposers = [];
        for (const plugin of this.plugins) {
            try {
                const disposer = plugin.setup(context);
                if (typeof disposer === 'function')
                    disposers.push(disposer);
            }
            catch (error) {
                for (const disposer of disposers.reverse()) {
                    try {
                        disposer();
                    }
                    catch {
                        // plugin disposal errors are non-fatal
                    }
                }
                throw new Error(`plugin "${plugin.name}" failed during setup: ${error.message}`);
            }
        }
        return () => {
            for (const disposer of disposers.reverse()) {
                try {
                    disposer();
                }
                catch {
                    // plugin disposal errors are non-fatal
                }
            }
            disposers.length = 0;
        };
    }
    /** Dispose every live attachment (workbook-lifetime teardown, F17). */
    attachments = [];
    /**
     * Register an attachment so workbook teardown can dispose all of them.
     * Returns the attachment's own disposer.
     */
    attach(context) {
        const disposer = this.run(context);
        this.attachments.push(disposer);
        return () => {
            disposer();
            const index = this.attachments.indexOf(disposer);
            if (index >= 0)
                this.attachments.splice(index, 1);
        };
    }
    destroy() {
        for (const disposer of this.attachments.reverse()) {
            try {
                disposer();
            }
            catch {
                // plugin disposal errors are non-fatal
            }
        }
        this.attachments.length = 0;
    }
}
exports.PluginManager = PluginManager;

});
