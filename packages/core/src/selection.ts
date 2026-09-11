import { rectContains, type Rect, toA1 } from '@ezygrid/model';

/** Cursor model: active cell, anchor, and selected ranges are separate concerns (§11.2). */
export interface SelectionState {
  active: { row: number; column: number };
  anchor: { row: number; column: number };
  ranges: Rect[];
}

export interface NavigationKey {
  key: string;
  shift?: boolean;
  ctrl?: boolean;
}

export class SelectionService {
  state: SelectionState;
  private rowCount: number;
  private columnCount: number;
  private listeners = new Set<(s: SelectionState) => void>();

  constructor(rowCount: number, columnCount: number) {
    this.rowCount = rowCount;
    this.columnCount = columnCount;
    this.state = {
      active: { row: 0, column: 0 },
      anchor: { row: 0, column: 0 },
      ranges: [{ top: 0, left: 0, bottom: 0, right: 0 }],
    };
  }

  onChange(listener: (s: SelectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }

  private clamp(row: number, column: number): { row: number; column: number } {
    return {
      row: Math.max(0, Math.min(this.rowCount - 1, row)),
      column: Math.max(0, Math.min(this.columnCount - 1, column)),
    };
  }

  setActive(row: number, column: number): void {
    const p = this.clamp(row, column);
    this.state.active = p;
    this.state.anchor = p;
    this.state.ranges = [{ top: p.row, left: p.column, bottom: p.row, right: p.column }];
    this.emit();
  }

  beginRangeExpand(row: number, column: number): void {
    const p = this.clamp(row, column);
    this.state.anchor = p;
    this.state.ranges = [{ top: p.row, left: p.column, bottom: p.row, right: p.column }];
    this.emit();
  }

  extendTo(row: number, column: number): void {
    const a = this.state.anchor;
    const p = this.clamp(row, column);
    this.state.active = p;
    this.state.ranges = [
      {
        top: Math.min(a.row, p.row),
        left: Math.min(a.column, p.column),
        bottom: Math.max(a.row, p.row),
        right: Math.max(a.column, p.column),
      },
    ];
    this.emit();
  }

  addRange(row: number, column: number): void {
    // Ctrl+click: add an independent single-cell range
    const p = this.clamp(row, column);
    this.state.active = p;
    this.state.anchor = p;
    this.state.ranges.push({ top: p.row, left: p.column, bottom: p.row, right: p.column });
    this.emit();
  }

  selectAll(): void {
    this.state = {
      active: { row: 0, column: 0 },
      anchor: { row: 0, column: 0 },
      ranges: [{ top: 0, left: 0, bottom: this.rowCount - 1, right: this.columnCount - 1 }],
    };
    this.emit();
  }

  selectRow(row: number): void {
    this.state = {
      active: { row, column: 0 },
      anchor: { row, column: 0 },
      ranges: [{ top: row, left: 0, bottom: row, right: this.columnCount - 1 }],
    };
    this.emit();
  }

  selectColumn(column: number): void {
    this.state = {
      active: { row: 0, column },
      anchor: { row: 0, column },
      ranges: [{ top: 0, left: column, bottom: this.rowCount - 1, right: column }],
    };
    this.emit();
  }

  get primary(): Rect {
    return this.state.ranges[this.state.ranges.length - 1]!;
  }

  isActive(row: number, column: number): boolean {
    return this.state.active.row === row && this.state.active.column === column;
  }

  isWithin(row: number, column: number): boolean {
    return this.state.ranges.some((r) => rectContains(r, row, column));
  }

  /** Expand to the data-region boundary (Ctrl+Arrow) using a filled-cell predicate. */
  move(direction: 'up' | 'down' | 'left' | 'right', shift: boolean, ctrl: boolean, isFilled: (row: number, column: number) => boolean): void {
    const { active } = this.state;
    let target = { ...active };

    if (ctrl) {
      target = this.dataBoundary(active.row, active.column, direction, isFilled);
    } else {
      switch (direction) {
        case 'up': target = { row: active.row - 1, column: active.column }; break;
        case 'down': target = { row: active.row + 1, column: active.column }; break;
        case 'left': target = { row: active.row, column: active.column - 1 }; break;
        case 'right': target = { row: active.row, column: active.column + 1 }; break;
      }
    }

    const p = this.clamp(target.row, target.column);
    if (shift) {
      this.extendTo(p.row, p.column);
    } else {
      this.setActive(p.row, p.column);
    }
  }

  /** Ctrl+Arrow jumps to the edge of the contiguous data region. */
  private dataBoundary(
    row: number,
    column: number,
    direction: 'up' | 'down' | 'left' | 'right',
    isFilled: (row: number, column: number) => boolean,
  ): { row: number; column: number } {
    const dr = direction === 'down' ? 1 : direction === 'up' ? -1 : 0;
    const dc = direction === 'right' ? 1 : direction === 'left' ? -1 : 0;
    let r = row;
    let c = column;
    const inBounds = (row: number, column: number): boolean =>
      row >= 0 && row < this.rowCount && column >= 0 && column < this.columnCount;

    if (isFilled(r, c)) {
      // move to the last contiguous filled cell
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(r, c) && isFilled(nr, nc)) {
        r = nr;
        c = nc;
        nr += dr;
        nc += dc;
      }
      // already at the block edge: jump to the edge of the next data block
      if (r === row && c === column) {
        let br = r + dr;
        let bc = c + dc;
        while (inBounds(br, bc) && !isFilled(br, bc)) {
          br += dr;
          bc += dc;
        }
        if (inBounds(br, bc)) {
          r = br;
          c = bc;
          let nr2 = r + dr;
          let nc2 = c + dc;
          while (inBounds(nr2, nc2) && isFilled(nr2, nc2)) {
            r = nr2;
            c = nc2;
            nr2 += dr;
            nc2 += dc;
          }
        } else {
          r = Math.max(0, Math.min(this.rowCount - 1, br));
          c = Math.max(0, Math.min(this.columnCount - 1, bc));
        }
      }
    } else {
      // skip blanks, then land on the first filled cell (or sheet edge)
      while (inBounds(r, c) && !isFilled(r, c)) {
        r += dr;
        c += dc;
      }
      if (inBounds(r, c)) {
        let nr = r + dr;
        let nc = c + dc;
        while (inBounds(nr, nc) && isFilled(nr, nc)) {
          r = nr;
          c = nc;
          nr += dr;
          nc += dc;
        }
      } else {
        r = Math.max(0, Math.min(this.rowCount - 1, r));
        c = Math.max(0, Math.min(this.columnCount - 1, c));
      }
    }
    return { row: r, column: c };
  }

  describe(): string {
    const r = this.primary;
    if (r.top === r.bottom && r.left === r.right) return toA1(r.top, r.left);
    return `${toA1(r.top, r.left)}:${toA1(r.bottom, r.right)}`;
  }
}

