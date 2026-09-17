# @ezygrid/model

Coordinates, A1 utilities, sparse storage, size indexes, operations and history primitives. `core` re-exports what it needs; import the package directly for lower-level work.

## Coordinates & A1

```ts
indexToColumn(index: number): string;        // 0 → "A", 25 → "Z", 26 → "AA"
columnToIndex(letters: string): number;
toA1(row: number, column: number): string;   // zero-based → "A1"
fromA1(address: string): { row: number; column: number };

interface Rect { top: number; left: number; bottom: number; right: number }

parseRange(range: string): Rect & { sheet?: string }; // "A1", "A1:B3", "Sheet1!A1:B3"
rectToRange(rect: Rect): string;
iterateRect(rect: Rect): Generator<{ row: number; column: number }>;
rectContains(rect: Rect, row: number, column: number): boolean;
rectsIntersect(a: Rect, b: Rect): boolean;
```

## References

```ts
const enum RefFlags { None = 0, AbsoluteColumn = 1, AbsoluteRow = 2 }

interface ParsedRef { sheet?: string; row: number; column: number; flags: RefFlags }
parseRef(ref: string): ParsedRef;  // "Sheet1!$A$1", "'My Sheet'!B2"
```

## IDs

```ts
createId(prefix?: string): string;  // stable, collaboration-ready ids
```

## Sparse store

```ts
interface CellRecord { raw?: unknown; formula?: string; styleId?: number }

class SparseCellStore {
  getCell(row: number, column: number): CellRecord | undefined;
  setCell(row: number, column: number, record: CellRecord | undefined): void;
  forEach(visit: (row: number, column: number, record: CellRecord) => void): void;
  insertRows(index: number, count: number): void;
  deleteRows(index: number, count: number): void;
  insertColumns(index: number, count: number): void;
  deleteColumns(index: number, count: number): void;
  get pageCount(): number;
  get usedRange(): Rect | undefined;
}
```

Pages are 256×256 blocks allocated lazily (`PAGE_BITS = 8`).

## Size index

```ts
class SizeIndex {
  constructor(logicalSize: number, defaultSize: number);
  prefixSum(count: number): number;
  totalSize(): number;
  offsetOf(index: number): number;
  indexAt(pixel: number): number;
  setSize(index: number, size: number): void;
  sizeOf(index: number): number;
  getCustomSizes(): ReadonlyMap<number, number>;
}
```

Fenwick tree over size deltas — O(log n) for every query.

## Operations

```ts
interface Operation<T = unknown> {
  id: string; actorId?: string; workbookId: string; worksheetId?: string;
  type: OperationType; payload: T; timestamp: number;
}

type OperationType =
  | 'cell.set' | 'cells.set' | 'cells.replace'
  | 'meta.set' | 'merges.set'
  | 'rows.insert' | 'rows.delete' | 'rows.move'
  | 'columns.insert' | 'columns.delete' | 'columns.move'
  | 'worksheet.add' | 'worksheet.remove' | 'worksheet.rename';

function op<T>(workbookId: string, type: OperationType, payload: T, worksheetId?: string, actorId?: string): Operation<T>;
```

Cell payloads (`SetCellPayload`) carry `row`, `column`, `raw?`, `formula?` and an optional `previous` snapshot.

## History primitives

```ts
class HistoryService {
  constructor(limit?: number);  // default 500
  push(operation: Operation, inverse?: Operation): void;
  beginBatch(): void;  endBatch(): void;  // batch = single undo entry
  popUndo(): HistoryEntry | undefined;
  popRedo(): HistoryEntry | undefined;
  clear(): void;
  get canUndo(): boolean;  get canRedo(): boolean;
  transformCells(sheetId: string, mapper: CoordinateMapper, rewriter?: HistoryFormulaRewriter, rangeMapper?: RangeMapper): void;
  setTransformExclusion(entry: HistoryEntry | null): void;
}

interface HistoryEntry { forward: Operation[]; inverse: Operation[] }
```

## Reference transform

```ts
tokenizeFormula(formula: string): Token[];
transformFormula(formula: string, shift: unknown): string;
transformFormulaRefs(formula: string, shift: unknown, options?: FormulaRefTransformOptions): string;
transformAddress(address: string, shift: unknown): string;
renameSheetRefs(formula: string, from: string, to: string): string;
```

Transformations are token-based (never regex over raw text); deleting referenced regions yields `#REF!`.
