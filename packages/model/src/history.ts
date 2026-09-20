import type { Operation, ResizePayload } from './operations.js';

/**
 * History service: undo/redo over inverse-producing operations.
 *
 * Entries are transactions: a batched group of operations is stored as one
 * entry so a single user action (paste, clear, fill) needs a single Undo.
 * Undo targets logical identities via the stored inverse, so it remains
 * correct after unrelated structural edits (collaboration-aware design).
 */
export interface HistoryEntry {
  /** Forward operations, applied in order on redo. */
  forward: Operation[];
  /** Inverse operations, applied in the stored order on undo. */
  inverse: Operation[];
}

export type CoordinateMapper = (
  row: number,
  column: number,
) => { row: number; column: number } | undefined;

/**
 * Rewrites formula strings stored inside history payloads after a
 * structural edit. Receives the formula (with leading "=") and the
 * operation's worksheet id so qualified refs can be resolved.
 */
export type HistoryFormulaRewriter = (formula: string, worksheetId: string | undefined) => string;

/** Maps a rectangle (e.g. a stored merge) through a structural change. */
export type RangeMapper = (
  rect: { top: number; left: number; bottom: number; right: number },
) => { top: number; left: number; bottom: number; right: number } | undefined;

export class HistoryService {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private limit: number;
  private batching = 0;
  private pending: HistoryEntry | null = null;
  /**
   * The entry currently being replayed by undo/redo. Structural ops inside
   * its own replay trigger transforms that must NOT touch it: its remaining
   * payloads are expressed in the geometry its earlier ops just restored,
   * and shifting them mid-replay corrupts the restore (F07).
   */
  private excluded: HistoryEntry | null = null;

  constructor(limit = 500) {
    this.limit = limit;
  }

  /** Mark the entry being replayed so transforms skip it (F07). */
  setTransformExclusion(entry: HistoryEntry | null): void {
    this.excluded = entry;
  }

  push(operation: Operation, inverse?: Operation | Operation[]): void {
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

  private trimUndo(): void {
    while (this.undoStack.length > this.limit) this.undoStack.shift();
  }

  beginBatch(): void {
    this.batching += 1;
  }

  endBatch(): void {
    this.batching = Math.max(0, this.batching - 1);
    if (this.batching === 0) this.pending = null;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  popUndo(): HistoryEntry | undefined {
    const entry = this.undoStack.pop();
    if (entry) this.redoStack.push(entry);
    return entry;
  }

  popRedo(): HistoryEntry | undefined {
    const entry = this.redoStack.pop();
    if (entry) this.undoStack.push(entry);
    return entry;
  }

  /**
   * Return a popped entry to its originating stack after a failed replay
   * (L10): popUndo/popRedo move the entry immediately, so a replay that
   * throws mid-application would otherwise leave the workbook half-restored
   * with the entry stranded on the opposite stack.
   */
  restoreUndo(entry: HistoryEntry): void {
    const index = this.redoStack.indexOf(entry);
    if (index >= 0) {
      this.redoStack.splice(index, 1);
      this.undoStack.push(entry);
    }
  }

  restoreRedo(entry: HistoryEntry): void {
    const index = this.undoStack.indexOf(entry);
    if (index >= 0) {
      this.undoStack.splice(index, 1);
      this.redoStack.push(entry);
    }
  }

  clear(): void {
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
  transformCells(
    sheetId: string,
    mapper: CoordinateMapper,
    rewriter?: HistoryFormulaRewriter,
    rangeMapper?: RangeMapper,
    axisMapper?: (axis: 'row' | 'column', index: number) => number | undefined,
  ): void {
    const apply = (entry: HistoryEntry): void => {
      // The in-flight entry is expressed in the geometry its own replay is
      // currently restoring; transforming it mid-replay corrupts state (F07).
      if (entry === this.excluded) return;
      for (const operations of [entry.forward, entry.inverse]) {
        for (let i = operations.length - 1; i >= 0; i--) {
          const operation = operations[i]!;
          if (rewriter) this.rewriteFormulas(operation, rewriter);
          if (rangeMapper && operation.type === 'merges.set') {
            this.mapOperationRanges(operation, rangeMapper);
          }
          if (operation.worksheetId !== sheetId) continue;
          if (axisMapper && (operation.type === 'rows.resize' || operation.type === 'columns.resize')) {
            const payload = operation.payload as ResizePayload;
            const mapped = axisMapper(operation.type === 'rows.resize' ? 'row' : 'column', payload.index);
            if (mapped === undefined) operations.splice(i, 1);
            else payload.index = mapped;
            continue;
          }
          const dropped = this.mapOperationCells(operation, mapper);
          if (dropped) operations.splice(i, 1);
        }
      }
      if (entry.forward.length === 0 && entry.inverse.length === 0) {
        const index = this.undoStack.indexOf(entry);
        if (index >= 0) this.undoStack.splice(index, 1);
        const redoIndex = this.redoStack.indexOf(entry);
        if (redoIndex >= 0) this.redoStack.splice(redoIndex, 1);
      }
    };
    for (const entry of [...this.undoStack, ...this.redoStack]) apply(entry);
  }

  private rewriteFormulas(operation: Operation, rewriter: HistoryFormulaRewriter): void {
    const payloads: unknown[] = [operation.payload];
    // Bulk payloads keep per-cell snapshots with their own formulas.
    if (operation.type === 'cells.replace' || operation.type === 'cells.set') {
      const cells = (operation.payload as { cells?: unknown[] }).cells;
      if (Array.isArray(cells)) payloads.push(...cells);
    }
    for (const payload of payloads) {
      if (payload === null || typeof payload !== 'object') continue;
      const record = payload as { formula?: unknown; previous?: { formula?: string } | null };
      if (typeof record.formula === 'string') {
        record.formula = rewriter(record.formula, operation.worksheetId);
      }
      if (record.previous && typeof record.previous.formula === 'string') {
        record.previous.formula = rewriter(record.previous.formula, operation.worksheetId);
      }
    }
  }

  /** Remap coordinates of a single operation. Returns true when it must be dropped. */
  private mapOperationCells(operation: Operation, mapper: CoordinateMapper): boolean {
    const payload = operation.payload as {
      row?: unknown;
      column?: unknown;
      cells?: { row: number; column: number }[];
    };
    if (typeof payload.row === 'number' && typeof payload.column === 'number') {
      const mapped = mapper(payload.row, payload.column);
      if (!mapped) return true;
      payload.row = mapped.row;
      payload.column = mapped.column;
      return false;
    }
    if (Array.isArray(payload.cells)) {
      const kept: { row: number; column: number }[] = [];
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
  private mapOperationRanges(operation: Operation, rangeMapper: RangeMapper): void {
    const payload = operation.payload as {
      added?: { top: number; left: number; bottom: number; right: number }[];
      removed?: { top: number; left: number; bottom: number; right: number }[];
    };
    const map = (list: { top: number; left: number; bottom: number; right: number }[] | undefined) => {
      if (!list) return undefined;
      const kept = [];
      for (const rect of list) {
        const mapped = rangeMapper(rect);
        if (mapped) kept.push(mapped);
      }
      return kept;
    };
    payload.added = map(payload.added);
    payload.removed = map(payload.removed);
  }
}
