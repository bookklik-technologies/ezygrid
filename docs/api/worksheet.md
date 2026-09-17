# Worksheet

`Worksheet` holds the sparse cell store and every feature engine for one sheet.

## Members

| Member | Description |
| --- | --- |
| `id: string` | Stable sheet id |
| `name: string` | Name (setter validates; renames rewrite cross-sheet refs) |
| `workbook: Workbook` | Owning workbook |
| `cells: SparseCellStore` | Paged sparse cell store |
| `rowSizes / columnSizes: SizeIndex` | Fenwick size indexes |
| `rowCount / columnCount: number` | Dimensions |
| `rowIds: Map<number, string>` | Stable row identities |
| `merges: MergeStore` | Merged cells |
| `tables: TableStore` | Structured tables |
| `numberFormats: Map<string, string>` | Range → mask |
| `validations: ValidationService` | Validation rules |
| `conditionalFormats: ConditionalFormatEngine` | Conditional styles |
| `charts: ChartEngine` | Charts |
| `pivots: PivotEngine` | Pivot aggregations |
| `media: MediaStore` | Images and shapes |
| `filters: Map<number, (value) => boolean>` | Column predicates |
| `hiddenRows / hiddenColumns: Set<number>` | Manually hidden indexes |
| `freezeRows / freezeColumns: number` | Frozen pane counts |

## Values

```ts
setValue(row, column, value: unknown, options?: { literal?: boolean }): Operation | null;
getValue(row, column): unknown;
getAddress(row, column): string;          // A1 address
loadFormulaCell(row, column, formula): void;
refreshFormulas(): void;                  // full recalculation pass
```

## Styles, formats, notes, editors

```ts
setStyle(range: string, style: CellStyle): void;
clearStyle(range: string): void;
getStyle(row, column): CellStyle | undefined;

setNumberFormat(range: string, mask: string): void;
getNumberFormat(row, column): string | undefined;

setNote(range: string, text: string): void;
getNote(row, column): string | undefined;
clearNote(range: string): void;

setCellEditor(range: string, type: string, options?: unknown): void;
getEditorFor(row, column): EditorAssignment | undefined;
```

## Structure

```ts
insertRows(index: number, count?: number): void;   // default count 1
deleteRows(index: number, count?: number): void;
insertColumns(index: number, count?: number): void;
deleteColumns(index: number, count?: number): void;

merge(range: string): void;
unmerge(range: string): void;

hideRows(index: number, count?: number): void;
hideColumns(index: number, count?: number): void;
showRows(index: number, count?: number): void;
showColumns(index: number, count?: number): void;
isRowHidden(row: number): boolean;
isColumnHidden(column: number): boolean;
```

## Groups, filters, headers

```ts
groupRows(start: number, end: number): void;
ungroupRows(start: number): void;
collapseGroup(start: number): void;
expandGroup(start: number): void;
getGroups(): RowGroup[];

setFilter(column: number, predicate: (value) => boolean): void;
clearFilter(column?: number): void;
refreshFilters(): void;

setNestedHeaders(levels: (string | { title: string; span: number })[][]): void;
get nestedHeaders(): NestedHeaderLevel[] | undefined;
```

## Rich content & data

```ts
addChart(spec: ChartSpec): ChartSpec;
addPivot(spec: PivotSpec): void;
addImage(image: ImageMediaInput): ImageMedia;
addShape(shape: ShapeMediaInput): ShapeMedia;

addTable(definition: { name: string; range: string; headerRow?: boolean; totalRow?: boolean }): TableDefinition;
getTable(name: string): TableDefinition | undefined;

addValidation(rule: Omit<ValidationRule, 'id'>): ValidationRule;
removeValidation(id: string): void;

toCsv(options?): string;
fromCsv(text: string, options?): void;
```
