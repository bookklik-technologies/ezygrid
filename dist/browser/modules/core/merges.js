document.currentScript.__ezygridRegister("core/merges", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MergeStore = void 0;
const model_1 = require("@ezygrid/model");
/**
 * Merge store (§16): only the anchor cell (top-left) stores a value; all
 * covered cells are merge-membership only. Overlapping merges are rejected.
 */
class MergeStore {
    merges = [];
    merge(rect) {
        if (rect.top === rect.bottom && rect.left === rect.right)
            return undefined;
        if (this.merges.some((m) => overlaps(m, rect)))
            return undefined;
        const merge = { ...rect, id: (0, model_1.createId)('merge') };
        this.merges.push(merge);
        return merge;
    }
    unmergeAt(row, column) {
        const index = this.merges.findIndex((m) => row >= m.top && row <= m.bottom && column >= m.left && column <= m.right);
        if (index === -1)
            return false;
        this.merges.splice(index, 1);
        return true;
    }
    /** The merge covering a cell (anchor or covered), if any. */
    findAt(row, column) {
        return this.merges.find((m) => row >= m.top && row <= m.bottom && column >= m.left && column <= m.right);
    }
    isCovered(row, column) {
        const merge = this.findAt(row, column);
        return merge !== undefined && !(merge.top === row && merge.left === column);
    }
    get all() {
        return this.merges;
    }
    clear() {
        this.merges.length = 0;
    }
    /**
     * Shift merge bounds after a structural row/column change. `mapper` maps an
     * axis position to its new position (or undefined when the whole merge
     * collapses). Merges whose bounds invert are removed.
     */
    transform(mapper, axis) {
        for (let i = this.merges.length - 1; i >= 0; i--) {
            const m = this.merges[i];
            const start = mapper(axis === 'row' ? m.top : m.left, true);
            const end = mapper(axis === 'row' ? m.bottom : m.right, false);
            if (start === undefined || end === undefined || end < start) {
                this.merges.splice(i, 1);
                continue;
            }
            if (axis === 'row') {
                m.top = start;
                m.bottom = end;
            }
            else {
                m.left = start;
                m.right = end;
            }
        }
    }
}
exports.MergeStore = MergeStore;
function overlaps(a, b) {
    return !(a.bottom < b.top || a.top > b.bottom || a.right < b.left || a.left > b.right);
}

});
