document.currentScript.__ezygridRegister("model/sparse-store", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SparseCellStore = exports.PAGE_MASK = exports.PAGE_SIZE = exports.PAGE_BITS = void 0;
exports.PAGE_BITS = 8; // 256x256 cells per page
exports.PAGE_SIZE = 1 << exports.PAGE_BITS;
exports.PAGE_MASK = exports.PAGE_SIZE - 1;
function pageKey(pageRow, pageCol) {
    return pageRow * 0x40000000 + pageCol;
}
function cellOffset(row, column) {
    return (row & exports.PAGE_MASK) * exports.PAGE_SIZE + (column & exports.PAGE_MASK);
}
/**
 * Sparse paged cell store. Allocates pages of 256x256 only when a contained
 * cell is written, so a 1,000,000-row empty sheet costs no per-cell memory.
 */
class SparseCellStore {
    pages = new Map();
    used;
    getCell(row, column) {
        const page = this.pages.get(pageKey(Math.floor(row / exports.PAGE_SIZE), Math.floor(column / exports.PAGE_SIZE)));
        return page?.cells.get(cellOffset(row, column));
    }
    setCell(row, column, record) {
        const pKey = pageKey(Math.floor(row / exports.PAGE_SIZE), Math.floor(column / exports.PAGE_SIZE));
        if (!record) {
            const page = this.pages.get(pKey);
            if (page) {
                page.cells.delete(cellOffset(row, column));
                if (page.cells.size === 0) {
                    this.pages.delete(pKey);
                }
                this.recomputeUsedRange();
            }
            return;
        }
        let page = this.pages.get(pKey);
        if (!page) {
            page = { cells: new Map() };
            this.pages.set(pKey, page);
        }
        page.cells.set(cellOffset(row, column), record);
        this.updateUsedRange(row, column);
    }
    get pageCount() {
        return this.pages.size;
    }
    /** Iterate every stored cell (sparse: only used cells are visited). */
    forEach(visit) {
        for (const [pKey, page] of this.pages) {
            const baseRow = Math.floor(pKey / 0x40000000) * exports.PAGE_SIZE;
            const baseCol = (pKey % 0x40000000) * exports.PAGE_SIZE;
            for (const [offset, record] of page.cells) {
                visit(baseRow + Math.floor(offset / exports.PAGE_SIZE), baseCol + (offset % exports.PAGE_SIZE), record);
            }
        }
    }
    get usedRange() {
        return this.used;
    }
    updateUsedRange(row, column) {
        if (!this.used) {
            this.used = { top: row, left: column, bottom: row, right: column };
            return;
        }
        const u = this.used;
        if (row < u.top)
            u.top = row;
        if (column < u.left)
            u.left = column;
        if (row > u.bottom)
            u.bottom = row;
        if (column > u.right)
            u.right = column;
    }
    /** Shift every stored cell by a structural row change at `index`. */
    insertRows(index, count) {
        this.transformRows(index, (r) => (r >= index ? r + count : r));
    }
    deleteRows(index, count) {
        this.transformRows(index, (r) => {
            if (r < index)
                return r;
            if (r < index + count)
                return -1;
            return r - count;
        });
    }
    insertColumns(index, count) {
        this.transformColumns(index, (c) => (c >= index ? c + count : c));
    }
    deleteColumns(index, count) {
        this.transformColumns(index, (c) => {
            if (c < index)
                return c;
            if (c < index + count)
                return -1;
            return c - count;
        });
    }
    rebuild() {
        this.recomputeUsedRange();
    }
    /** Drop every cell in a row band (used for structural undo prototype). */
    recomputeUsedRange() {
        // Recompute used range from scratch, using absolute coordinates
        // (page base offsets must be added to in-page positions).
        this.used = undefined;
        for (const [pKey, page] of this.pages) {
            const baseRow = Math.floor(pKey / 0x40000000) * exports.PAGE_SIZE;
            const baseCol = (pKey % 0x40000000) * exports.PAGE_SIZE;
            for (const offset of page.cells.keys()) {
                const row = baseRow + Math.floor(offset / exports.PAGE_SIZE);
                const column = baseCol + (offset % exports.PAGE_SIZE);
                this.updateUsedRange(row, column);
            }
        }
    }
    transformRows(index, map) {
        const entries = [];
        for (const [pKey, page] of this.pages) {
            for (const [offset, record] of page.cells) {
                const baseRow = Math.floor(pKey / 0x40000000) * exports.PAGE_SIZE;
                const baseCol = (pKey % 0x40000000) * exports.PAGE_SIZE;
                const row = baseRow + Math.floor(offset / exports.PAGE_SIZE);
                const column = baseCol + (offset % exports.PAGE_SIZE);
                const mapped = map(row);
                if (mapped === -1) {
                    page.cells.delete(offset);
                }
                else if (mapped !== row) {
                    entries.push({ row: mapped, column, record });
                    page.cells.delete(offset);
                }
            }
            if (page.cells.size === 0)
                this.pages.delete(pKey);
        }
        for (const e of entries)
            this.setCell(e.row, e.column, e.record);
        this.rebuild();
    }
    transformColumns(index, map) {
        const entries = [];
        for (const [pKey, page] of this.pages) {
            for (const [offset, record] of page.cells) {
                const baseRow = Math.floor(pKey / 0x40000000) * exports.PAGE_SIZE;
                const baseCol = (pKey % 0x40000000) * exports.PAGE_SIZE;
                const row = baseRow + Math.floor(offset / exports.PAGE_SIZE);
                const column = baseCol + (offset % exports.PAGE_SIZE);
                const mapped = map(column);
                if (mapped === -1) {
                    page.cells.delete(offset);
                }
                else if (mapped !== column) {
                    entries.push({ row, column: mapped, record });
                    page.cells.delete(offset);
                }
            }
            if (page.cells.size === 0)
                this.pages.delete(pKey);
        }
        for (const e of entries)
            this.setCell(e.row, e.column, e.record);
        this.rebuild();
    }
}
exports.SparseCellStore = SparseCellStore;

});
