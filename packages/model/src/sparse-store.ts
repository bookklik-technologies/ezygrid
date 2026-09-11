import type { Rect } from './coordinates.js';

export const PAGE_BITS = 8; // 256x256 cells per page
export const PAGE_SIZE = 1 << PAGE_BITS;
export const PAGE_MASK = PAGE_SIZE - 1;

/** Compact per-cell record. Only allocated for used cells. */
export interface CellRecord {
  raw?: unknown;
  formula?: string;
  styleId?: number;
}

export interface CellPage {
  /** Row-major within the page; sparse via Map to avoid dense allocation. */
  cells: Map<number, CellRecord>;
}

function pageKey(pageRow: number, pageCol: number): number {
  return pageRow * 0x40000000 + pageCol;
}

function cellOffset(row: number, column: number): number {
  return (row & PAGE_MASK) * PAGE_SIZE + (column & PAGE_MASK);
}

/**
 * Sparse paged cell store. Allocates pages of 256x256 only when a contained
 * cell is written, so a 1,000,000-row empty sheet costs no per-cell memory.
 */
export class SparseCellStore {
  private pages = new Map<number, CellPage>();
  private used: Rect | undefined;

  getCell(row: number, column: number): CellRecord | undefined {
    const page = this.pages.get(pageKey(Math.floor(row / PAGE_SIZE), Math.floor(column / PAGE_SIZE)));
    return page?.cells.get(cellOffset(row, column));
  }

  setCell(row: number, column: number, record: CellRecord | undefined): void {
    const pKey = pageKey(Math.floor(row / PAGE_SIZE), Math.floor(column / PAGE_SIZE));
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

  get pageCount(): number {
    return this.pages.size;
  }

  /** Iterate every stored cell (sparse: only used cells are visited). */
  forEach(visit: (row: number, column: number, record: CellRecord) => void): void {
    for (const [pKey, page] of this.pages) {
      const baseRow = Math.floor(pKey / 0x40000000) * PAGE_SIZE;
      const baseCol = (pKey % 0x40000000) * PAGE_SIZE;
      for (const [offset, record] of page.cells) {
        visit(
          baseRow + Math.floor(offset / PAGE_SIZE),
          baseCol + (offset % PAGE_SIZE),
          record,
        );
      }
    }
  }

  get usedRange(): Rect | undefined {
    return this.used;
  }

  private updateUsedRange(row: number, column: number): void {
    if (!this.used) {
      this.used = { top: row, left: column, bottom: row, right: column };
      return;
    }
    const u = this.used;
    if (row < u.top) u.top = row;
    if (column < u.left) u.left = column;
    if (row > u.bottom) u.bottom = row;
    if (column > u.right) u.right = column;
  }

  /** Shift every stored cell by a structural row change at `index`. */
  insertRows(index: number, count: number): void {
    this.transformRows(index, (r) => (r >= index ? r + count : r));
  }

  deleteRows(index: number, count: number): void {
    this.transformRows(index, (r) => {
      if (r < index) return r;
      if (r < index + count) return -1;
      return r - count;
    });
  }

  insertColumns(index: number, count: number): void {
    this.transformColumns(index, (c) => (c >= index ? c + count : c));
  }

  deleteColumns(index: number, count: number): void {
    this.transformColumns(index, (c) => {
      if (c < index) return c;
      if (c < index + count) return -1;
      return c - count;
    });
  }

  private rebuild(): void {
    this.recomputeUsedRange();
  }

  /** Drop every cell in a row band (used for structural undo prototype). */
  private recomputeUsedRange(): void {
    // Recompute used range from scratch, using absolute coordinates
    // (page base offsets must be added to in-page positions).
    this.used = undefined;
    for (const [pKey, page] of this.pages) {
      const baseRow = Math.floor(pKey / 0x40000000) * PAGE_SIZE;
      const baseCol = (pKey % 0x40000000) * PAGE_SIZE;
      for (const offset of page.cells.keys()) {
        const row = baseRow + Math.floor(offset / PAGE_SIZE);
        const column = baseCol + (offset % PAGE_SIZE);
        this.updateUsedRange(row, column);
      }
    }
  }

  private transformRows(index: number, map: (row: number) => number): void {
    const entries: { row: number; column: number; record: CellRecord }[] = [];
    for (const [pKey, page] of this.pages) {
      for (const [offset, record] of page.cells) {
        const baseRow = Math.floor(pKey / 0x40000000) * PAGE_SIZE;
        const baseCol = (pKey % 0x40000000) * PAGE_SIZE;
        const row = baseRow + Math.floor(offset / PAGE_SIZE);
        const column = baseCol + (offset % PAGE_SIZE);
        const mapped = map(row);
        if (mapped === -1) {
          page.cells.delete(offset);
        } else if (mapped !== row) {
          entries.push({ row: mapped, column, record });
          page.cells.delete(offset);
        }
      }
      if (page.cells.size === 0) this.pages.delete(pKey);
    }
    for (const e of entries) this.setCell(e.row, e.column, e.record);
    this.rebuild();
  }

  private transformColumns(index: number, map: (column: number) => number): void {
    const entries: { row: number; column: number; record: CellRecord }[] = [];
    for (const [pKey, page] of this.pages) {
      for (const [offset, record] of page.cells) {
        const baseRow = Math.floor(pKey / 0x40000000) * PAGE_SIZE;
        const baseCol = (pKey % 0x40000000) * PAGE_SIZE;
        const row = baseRow + Math.floor(offset / PAGE_SIZE);
        const column = baseCol + (offset % PAGE_SIZE);
        const mapped = map(column);
        if (mapped === -1) {
          page.cells.delete(offset);
        } else if (mapped !== column) {
          entries.push({ row, column: mapped, record });
          page.cells.delete(offset);
        }
      }
      if (page.cells.size === 0) this.pages.delete(pKey);
    }
    for (const e of entries) this.setCell(e.row, e.column, e.record);
    this.rebuild();
  }
}
