import { createId, parseRange } from '@ezygrid/model';
import type { Rect } from '@ezygrid/model';
import type { Worksheet } from './workbook.js';

export interface TableColumn {
  name: string;
  index: number;
}

export interface TableDefinition {
  id: string;
  name: string;
  range: Rect;
  headerRow: boolean;
  totalRow: boolean;
  /** Computed column names from the header row. */
  columns: TableColumn[];
}

/**
 * Structured worksheet tables (§25): named ranges with header rows, banded
 * styling and structured references (TableName, TableName[Column]).
 */
export class TableStore {
  private tables: TableDefinition[] = [];
  /** Owning worksheet (set by the Worksheet field initializer). */
  private owner?: Worksheet;

  constructor(owner?: Worksheet) {
    this.owner = owner;
  }

  private invalidateOpaqueReaders(): void {
    // Table definitions resolve dynamically: readers recompute (F02).
    this.owner?.workbook.formulaGraph.invalidateOpaqueFormulas();
  }

  add(worksheet: Worksheet, options: { name: string; range: string; headerRow?: boolean; totalRow?: boolean }): TableDefinition {
    const rect = parseRange(options.range);
    const name = options.name;
    if (this.tables.some((t) => t.name === name)) {
      throw new Error(`table name already in use: ${name}`);
    }
    const columns: TableColumn[] = [];
    if (options.headerRow !== false) {
      for (let c = rect.left; c <= rect.right; c++) {
        const header = worksheet.getValue(rect.top, c);
        columns.push({ name: header === null || header === undefined ? `Column${c - rect.left + 1}` : String(header), index: c });
      }
    }
    const table: TableDefinition = {
      id: createId('table'),
      name,
      range: rect,
      headerRow: options.headerRow ?? true,
      totalRow: options.totalRow ?? false,
      columns,
    };
    this.tables.push(table);
    this.invalidateOpaqueReaders();
    return table;
  }

  get(name: string): TableDefinition | undefined {
    return this.tables.find((t) => t.name === name);
  }

  at(row: number, column: number): TableDefinition | undefined {
    return this.tables.find(
      (t) => row >= t.range.top && row <= t.range.bottom && column >= t.range.left && column <= t.range.right,
    );
  }

  all(): readonly TableDefinition[] {
    return this.tables;
  }

  remove(name: string): void {
    this.tables = this.tables.filter((t) => t.name !== name);
    this.invalidateOpaqueReaders();
  }

  /**
   * Shift table bounds after a structural row/column change. `mapper` maps an
   * axis position to its new position; undefined removes the position. Tables
   * whose range collapses are dropped; affected column definitions follow.
   */
  transform(
    mapper: (pos: number, isStart: boolean) => number | undefined,
    axis: 'row' | 'column',
  ): void {
    for (const t of [...this.tables]) {
      const start = mapper(axis === 'row' ? t.range.top : t.range.left, true);
      const end = mapper(axis === 'row' ? t.range.bottom : t.range.right, false);
      if (start === undefined || end === undefined || end < start) {
        this.remove(t.name);
        continue;
      }
      if (axis === 'row') {
        t.range = { ...t.range, top: start, bottom: end };
      } else {
        t.range = { ...t.range, left: start, right: end };
        t.columns = t.columns
          .map((c) => ({ ...c, index: mapper(c.index, true) ?? Number.NaN }))
          .filter((c) => Number.isInteger(c.index) && c.index >= t.range.left && c.index <= t.range.right);
      }
    }
  }
}
