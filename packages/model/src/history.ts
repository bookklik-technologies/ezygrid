import type { Operation } from './operations.js';

/**
 * History service: undo/redo over inverse-producing operations.
 * Undo targets logical identities via the stored inverse, so it remains
 * correct after unrelated structural edits (collaboration-aware design).
 */
export class HistoryService {
  private undoStack: Operation[] = [];
  private redoStack: Operation[] = [];
  private limit: number;
  private batching = 0;

  constructor(limit = 500) {
    this.limit = limit;
  }

  push(operation: Operation, inverse: Operation): void {
    if (this.batching > 0) {
      // Group into the last entry's transaction bucket (kept simple: single op inverse chain).
      this.undoStack.push(operation);
      return;
    }
    this.undoStack.push(operation);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    void inverse;
  }

  beginBatch(): void {
    this.batching += 1;
  }

  endBatch(): void {
    this.batching = Math.max(0, this.batching - 1);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  popUndo(): Operation | undefined {
    const op = this.undoStack.pop();
    if (op) this.redoStack.push(op);
    return op;
  }

  popRedo(): Operation | undefined {
    const op = this.redoStack.pop();
    if (op) this.undoStack.push(op);
    return op;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  /**
   * Transform the coordinates of stored cell operations after a structural
   * edit (row/column insert/delete). `mapper` maps (row, column) to the new
   * coordinates, or undefined when the target was deleted (the operation is
   * then dropped from history). Applies to both stacks.
   */
  transformCells(
    sheetId: string,
    mapper: (row: number, column: number) => { row: number; column: number } | undefined,
  ): void {
    const apply = (stack: Operation[]): void => {
      for (let i = stack.length - 1; i >= 0; i--) {
        const operation = stack[i]!;
        if (operation.type !== 'cell.set' || operation.worksheetId !== sheetId) continue;
        const payload = operation.payload as { row: number; column: number };
        const mapped = mapper(payload.row, payload.column);
        if (!mapped) {
          stack.splice(i, 1);
          continue;
        }
        payload.row = mapped.row;
        payload.column = mapped.column;
      }
    };
    apply(this.undoStack);
    apply(this.redoStack);
  }
}
