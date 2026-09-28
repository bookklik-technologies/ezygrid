document.currentScript.__ezygridRegister("model/history", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryService = void 0;
class HistoryService {
    undoStack = [];
    redoStack = [];
    limit;
    batching = 0;
    pending = null;
    /**
     * The entry currently being replayed by undo/redo. Structural ops inside
     * its own replay trigger transforms that must NOT touch it: its remaining
     * payloads are expressed in the geometry its earlier ops just restored,
     * and shifting them mid-replay corrupts the restore (F07).
     */
    excluded = null;
    constructor(limit = 500) {
        this.limit = limit;
    }
    /** Mark the entry being replayed so transforms skip it (F07). */
    setTransformExclusion(entry) {
        this.excluded = entry;
    }
    push(operation, inverse) {
        if (this.batching > 0) {
            if (!this.pending) {
                // The first mutation of a batch invalidates stale redo entries and
                // enforces the history limit (a batch is a single entry).
                this.redoStack.length = 0;
                this.pending = { forward: [], inverse: [] };
                this.undoStack.push(this.pending);
                this.trimUndo();
            }
            this.pending.forward.push(operation);
            for (const i of Array.isArray(inverse) ? inverse : inverse ? [inverse] : []) {
                this.pending.inverse.push(i);
            }
            return;
        }
        this.undoStack.push({
            forward: [operation],
            inverse: Array.isArray(inverse) ? [...inverse] : inverse ? [inverse] : [],
        });
        this.trimUndo();
        this.redoStack.length = 0;
    }
    trimUndo() {
        while (this.undoStack.length > this.limit)
            this.undoStack.shift();
    }
    beginBatch() {
        this.batching += 1;
    }
    endBatch() {
        this.batching = Math.max(0, this.batching - 1);
        if (this.batching === 0)
            this.pending = null;
    }
    get canUndo() {
        return this.undoStack.length > 0;
    }
    get canRedo() {
        return this.redoStack.length > 0;
    }
    popUndo() {
        const entry = this.undoStack.pop();
        if (entry)
            this.redoStack.push(entry);
        return entry;
    }
    popRedo() {
        const entry = this.redoStack.pop();
        if (entry)
            this.undoStack.push(entry);
        return entry;
    }
    /**
     * Return a popped entry to its originating stack after a failed replay
     * (L10): popUndo/popRedo move the entry immediately, so a replay that
     * throws mid-application would otherwise leave the workbook half-restored
     * with the entry stranded on the opposite stack.
     */
    restoreUndo(entry) {
        const index = this.redoStack.indexOf(entry);
        if (index >= 0) {
            this.redoStack.splice(index, 1);
            this.undoStack.push(entry);
        }
    }
    restoreRedo(entry) {
        const index = this.undoStack.indexOf(entry);
        if (index >= 0) {
            this.undoStack.splice(index, 1);
            this.redoStack.push(entry);
        }
    }
    clear() {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.pending = null;
    }
    /**
     * Transform stored operations after a structural edit (row/column
     * insert/delete). Cell coordinates of entries targeting `sheetId` are
     * remapped (dropped when deleted), and every stored formula is rewritten
     * through `rewriter` when its references point at the changed sheet,
     * across both stacks and both forward/inverse payloads.
     */
    transformCells(sheetId, mapper, rewriter, rangeMapper, axisMapper) {
        const apply = (entry) => {
            // The in-flight entry is expressed in the geometry its own replay is
            // currently restoring; transforming it mid-replay corrupts state (F07).
            if (entry === this.excluded)
                return;
            for (const operations of [entry.forward, entry.inverse]) {
                for (let i = operations.length - 1; i >= 0; i--) {
                    const operation = operations[i];
                    if (rewriter)
                        this.rewriteFormulas(operation, rewriter);
                    if (rangeMapper && operation.type === 'merges.set') {
                        this.mapOperationRanges(operation, rangeMapper);
                    }
                    if (operation.worksheetId !== sheetId)
                        continue;
                    if (axisMapper && (operation.type === 'rows.resize' || operation.type === 'columns.resize')) {
                        const payload = operation.payload;
                        const mapped = axisMapper(operation.type === 'rows.resize' ? 'row' : 'column', payload.index);
                        if (mapped === undefined)
                            operations.splice(i, 1);
                        else
                            payload.index = mapped;
                        continue;
                    }
                    const dropped = this.mapOperationCells(operation, mapper);
                    if (dropped)
                        operations.splice(i, 1);
                }
            }
            if (entry.forward.length === 0 && entry.inverse.length === 0) {
                const index = this.undoStack.indexOf(entry);
                if (index >= 0)
                    this.undoStack.splice(index, 1);
                const redoIndex = this.redoStack.indexOf(entry);
                if (redoIndex >= 0)
                    this.redoStack.splice(redoIndex, 1);
            }
        };
        for (const entry of [...this.undoStack, ...this.redoStack])
            apply(entry);
    }
    rewriteFormulas(operation, rewriter) {
        const payloads = [operation.payload];
        // Bulk payloads keep per-cell snapshots with their own formulas.
        if (operation.type === 'cells.replace' || operation.type === 'cells.set') {
            const cells = operation.payload.cells;
            if (Array.isArray(cells))
                payloads.push(...cells);
        }
        for (const payload of payloads) {
            if (payload === null || typeof payload !== 'object')
                continue;
            const record = payload;
            if (typeof record.formula === 'string') {
                record.formula = rewriter(record.formula, operation.worksheetId);
            }
            if (record.previous && typeof record.previous.formula === 'string') {
                record.previous.formula = rewriter(record.previous.formula, operation.worksheetId);
            }
        }
    }
    /** Remap coordinates of a single operation. Returns true when it must be dropped. */
    mapOperationCells(operation, mapper) {
        const payload = operation.payload;
        if (typeof payload.row === 'number' && typeof payload.column === 'number') {
            const mapped = mapper(payload.row, payload.column);
            if (!mapped)
                return true;
            payload.row = mapped.row;
            payload.column = mapped.column;
            return false;
        }
        if (Array.isArray(payload.cells)) {
            const kept = [];
            for (const cell of payload.cells) {
                const mapped = mapper(cell.row, cell.column);
                // Preserve the full per-cell snapshot: only the coordinates are
                // remapped, every other field (raw/formula/style/note/...) stays.
                if (mapped) {
                    cell.row = mapped.row;
                    cell.column = mapped.column;
                    kept.push(cell);
                }
            }
            payload.cells = kept;
            return payload.cells.length === 0;
        }
        return false;
    }
    /** Remap stored merge ranges after a structural edit (F08). */
    mapOperationRanges(operation, rangeMapper) {
        const payload = operation.payload;
        const map = (list) => {
            if (!list)
                return undefined;
            const kept = [];
            for (const rect of list) {
                const mapped = rangeMapper(rect);
                if (mapped)
                    kept.push(mapped);
            }
            return kept;
        };
        payload.added = map(payload.added);
        payload.removed = map(payload.removed);
    }
}
exports.HistoryService = HistoryService;

});
