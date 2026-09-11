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

export type OperationType =
  | 'cell.set'
  | 'cells.set'
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
