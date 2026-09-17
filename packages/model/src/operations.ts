/**
 * Serializable operation format (Phase 0 draft). All workbook mutations flow
 * through operations so history, persistence and collaboration share one path.
 */
export interface Operation<T = unknown> {
  id: string;
  actorId?: string;
  workbookId: string;
  worksheetId?: string;
  type: string;
  payload: T;
  timestamp: number;
}

export interface SetCellPayload {
  row: number;
  column: number;
  raw?: unknown;
  formula?: string;
  previous?: CellRecordSnapshot;
}

export interface CellRecordSnapshot {
  raw?: unknown;
  formula?: string;
  styleId?: number;
}

/** Per-cell metadata snapshot for `meta.set` (styles/notes/formats/editors, F08). */
export interface MetaCellSnapshot {
  row: number;
  column: number;
  /** null = absent (delete); a value = set; undefined = leave unchanged. */
  style?: unknown | null;
  note?: string | null;
  format?: string | null;
  editor?: { type: string; options?: unknown } | null;
}

export interface MetaSetPayload {
  cells: MetaCellSnapshot[];
}

/** Forward: merge `added`, unmerge `removed`. Inverse swaps both (F08). */
export interface MergesSetPayload {
  added?: { top: number; left: number; bottom: number; right: number }[];
  removed?: { top: number; left: number; bottom: number; right: number }[];
}

export type OperationType =
  | 'cell.set'
  | 'cells.set'
  | 'cells.replace'
  | 'meta.set'
  | 'merges.set'
  | 'rows.insert'
  | 'rows.delete'
  | 'rows.move'
  | 'columns.insert'
  | 'columns.delete'
  | 'columns.move'
  | 'worksheet.add'
  | 'worksheet.remove'
  | 'worksheet.rename';

export const op = <T>(
  workbookId: string,
  type: string,
  payload: T,
  worksheetId?: string,
  actorId?: string,
): Operation<T> => ({
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  actorId,
  workbookId,
  worksheetId,
  type,
  payload,
  timestamp: Date.now(),
});
