document.currentScript.__ezygridRegister("core/ezy-grid", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ezygrid = void 0;
const workbook_js_1 = require("./workbook.js");
const renderer_js_1 = require("./renderer.js");
const instances = new WeakMap();
const initializing = new WeakSet();
const marker = '[data-ezg-editor]';
function currentDocument() {
    if (typeof document === 'undefined') {
        throw new Error('Ezygrid: a document is required for selectors and automatic scanning.');
    }
    return document;
}
function resolveTarget(target) {
    let element;
    if (typeof target === 'string') {
        const doc = currentDocument();
        try {
            element = doc.querySelector(target);
        }
        catch {
            throw new Error(`Ezygrid: invalid target selector "${target}".`);
        }
        if (!element)
            throw new Error(`Ezygrid: no element matches target "${target}".`);
    }
    else {
        element = target;
    }
    const HTMLElementClass = element?.ownerDocument?.defaultView?.HTMLElement;
    if (!HTMLElementClass || !(element instanceof HTMLElementClass)) {
        throw new TypeError('Ezygrid: target must be an HTML element or a selector matching one.');
    }
    return element;
}
/** A mounted spreadsheet, owning one workbook and its renderer. */
class Ezygrid {
    target;
    workbook;
    renderer;
    destroyed = false;
    constructor(options) {
        this.target = resolveTarget(options?.target);
        if (instances.has(this.target) || initializing.has(this.target)) {
            throw new Error('Ezygrid: target is already initialized; use Ezygrid.getInstance(target).');
        }
        const { target: _target, renderer, ...workbookOptions } = options;
        initializing.add(this.target);
        try {
            this.workbook = (0, workbook_js_1.createGrid)(this.target, workbookOptions);
            try {
                this.renderer = new renderer_js_1.GridRenderer(this.target, this.workbook, renderer);
            }
            catch (error) {
                this.workbook.pluginManager.destroy();
                throw error;
            }
            instances.set(this.target, this);
        }
        finally {
            initializing.delete(this.target);
        }
    }
    /** Returns undefined for an existing host that has no live Ezygrid instance. */
    static getInstance(target) {
        return instances.get(resolveTarget(target));
    }
    /** Mount marked hosts, including root itself. Existing instances retain their data. */
    static initAll(root = currentDocument()) {
        const hosts = [];
        if ('matches' in root && root.matches(marker))
            hosts.push(root);
        hosts.push(...root.querySelectorAll(marker));
        return hosts.map((host) => {
            const target = resolveTarget(host);
            return instances.get(target) ?? new Ezygrid({ target, renderer: {
                    mode: target.getAttribute('data-ezg-mode') === 'grid' ? 'grid' : 'editor',
                } });
        });
    }
    /** Dispose before removing an ordinary div from the page. Safe to call twice. */
    destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        try {
            this.renderer.destroy();
        }
        finally {
            this.workbook.pluginManager.destroy();
            instances.delete(this.target);
        }
    }
}
exports.Ezygrid = Ezygrid;

});
