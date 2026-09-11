import type { Rect } from '@ezygrid/model';
import { createId } from '@ezygrid/model';

export interface MergeRect extends Rect {
  id: string;
}

/**
 * Merge store (§16): only the anchor cell (top-left) stores a value; all
 * covered cells are merge-membership only. Overlapping merges are rejected.
 */
export class MergeStore {
  private merges: MergeRect[] = [];

  merge(rect: Rect): MergeRect | undefined {
    if (rect.top === rect.bottom && rect.left === rect.right) return undefined;
    if (this.merges.some((m) => overlaps(m, rect))) return undefined;
    const merge: MergeRect = { ...rect, id: createId('merge') };
    this.merges.push(merge);
    return merge;
  }

  unmergeAt(row: number, column: number): boolean {
    const index = this.merges.findIndex(
      (m) => row >= m.top && row <= m.bottom && column >= m.left && column <= m.right,
    );
    if (index === -1) return false;
    this.merges.splice(index, 1);
    return true;
  }

  /** The merge covering a cell (anchor or covered), if any. */
  findAt(row: number, column: number): MergeRect | undefined {
    return this.merges.find((m) => row >= m.top && row <= m.bottom && column >= m.left && column <= m.right);
  }

  isCovered(row: number, column: number): boolean {
    const merge = this.findAt(row, column);
    return merge !== undefined && !(merge.top === row && merge.left === column);
  }

  get all(): readonly MergeRect[] {
    return this.merges;
  }

  clear(): void {
    this.merges.length = 0;
  }

  /**
   * Shift merge bounds after a structural row/column change. `mapper` maps an
   * axis position to its new position (or undefined when the whole merge
   * collapses). Merges whose bounds invert are removed.
   */
  transform(mapper: (pos: number, isStart: boolean) => number | undefined, axis: 'row' | 'column'): void {
    for (let i = this.merges.length - 1; i >= 0; i--) {
      const m = this.merges[i]!;
      const start = mapper(axis === 'row' ? m.top : m.left, true);
      const end = mapper(axis === 'row' ? m.bottom : m.right, false);
      if (start === undefined || end === undefined || end < start) {
        this.merges.splice(i, 1);
        continue;
      }
      if (axis === 'row') {
        m.top = start;
        m.bottom = end;
      } else {
        m.left = start;
        m.right = end;
      }
    }
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return !(a.bottom < b.top || a.top > b.bottom || a.right < b.left || a.left > b.right);
}
