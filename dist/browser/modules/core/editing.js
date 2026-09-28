document.currentScript.__ezygridRegister("core/editing", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditService = void 0;
exports.parseEditorValue = parseEditorValue;
class EditService {
    mode = 'idle';
    events;
    constructor(events = {}) {
        this.events = events;
    }
    get editing() {
        return this.mode === 'editing';
    }
    get session() {
        return this.session_ ?? null;
    }
    session_ = null;
    beginEdit(sheet, row, column, initial) {
        const raw = sheet.cells.getCell(row, column);
        const initialText = initial !== undefined
            ? initial
            : raw?.formula !== undefined
                ? raw.formula
                : raw?.raw === null || raw?.raw === undefined
                    ? ''
                    : String(raw.raw);
        this.session_ = { row, column, initial: initialText, mode: initial === undefined ? 'replace' : 'edit' };
        this.mode = 'editing';
        this.events.onEditStart?.(this.session_);
        return this.session_;
    }
    /** Commit the pending text; returns true when a value was written. */
    commit(sheet, text) {
        if (!this.session_)
            return false;
        const { row, column } = this.session_;
        const value = text ?? this.session_.initial;
        this.events.onCommit?.(this.session_, value);
        if (value !== '') {
            const parsed = value.startsWith('=') ? value : parseEditorValue(value);
            sheet.setValue(row, column, parsed);
        }
        else {
            sheet.setValue(row, column, null);
        }
        this.end();
        return true;
    }
    cancel() {
        if (!this.session_)
            return false;
        this.events.onEditCancel?.(this.session_);
        this.end();
        return true;
    }
    end() {
        this.session_ = null;
        this.mode = 'idle';
    }
}
exports.EditService = EditService;
/** Typed-value parsing used when committing editor text into the model. */
function parseEditorValue(text) {
    const trimmed = text.trim();
    if (trimmed === '')
        return null;
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed))
        return Number(trimmed);
    if (/^(true|TRUE|True)$/.test(trimmed))
        return true;
    if (/^(false|FALSE|False)$/.test(trimmed))
        return false;
    return text;
}

});
