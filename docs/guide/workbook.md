# Workbook & worksheets

The headless model lives in `Workbook` and `Worksheet`. You rarely construct them directly — `new Ezygrid({...})` creates one for you, or use [`createGrid`](/api/ezygrid) for a workbook without UI:

```ts
import { createGrid } from '@ezygrid/core';

const workbook = createGrid(undefined, {
  worksheets: [{ name: 'Sheet1', rows: 500, columns: 20, data: [[1, 2, 3]] }],
});
```

## Workbook options

```ts
interface WorkbookOptions {
  id?: string;                       // stable workbook id
  worksheets?: WorksheetConfig[];
  extensions?: EzygridPlugin[];      // plugins, run when a renderer attaches
}

interface WorksheetConfig {
  id?: string;
  name?: string;
  rows?: number;      // default 1000 (max 1,048,576)
  columns?: number;   // default 26 (max 16,384)
  data?: unknown[][]; // seed values; strings starting with "=" become formulas
}
```

## Managing sheets

```ts
const workbook = editor.workbook;

workbook.worksheets;                       // Worksheet[]
workbook.getWorksheet('Sheet1');           // by id or name
workbook.activeWorksheet;                  // currently the first sheet

workbook.addWorksheet({ name: 'Targets', rows: 200, columns: 12 });
workbook.removeWorksheet('Targets');       // cannot remove the last sheet
workbook.uniqueSheetName('Report');        // dedupes: "Report (2)"
```

Renaming a sheet rewrites cross-sheet formula references automatically:

```ts
const sheet = workbook.getWorksheet('Sheet1');
sheet.name = 'Sales'; // =Targets!Sheet1!B2 style refs become =Targets!Sales!B2
```

## Worksheet surface

A `Worksheet` bundles the sparse cell store, size indexes and every feature engine:

```ts
sheet.cells;              // SparseCellStore
sheet.rowSizes;           // SizeIndex (default row height 24)
sheet.columnSizes;        // SizeIndex (default column width 100)
sheet.rowCount / columnCount;
sheet.merges;             // MergeStore
sheet.tables;             // TableStore
sheet.validations;        // ValidationService
sheet.conditionalFormats; // ConditionalFormatEngine
sheet.charts;             // ChartEngine
sheet.pivots;             // PivotEngine
sheet.media;              // MediaStore
```

## Batching operations

Group mutations so they collapse into a single undo entry and a single aggregated operation:

```ts
workbook.beginUpdate();
try {
  sheet.setValue(0, 0, 'Total');
  sheet.setValue(0, 1, '=SUM(B2:B100)');
} finally {
  workbook.endUpdate(); // emits one workbook.update operation
}
```

## Defined names

```ts
workbook.setDefinedName('TaxRate', { type: 'value', value: 0.19 });
workbook.setDefinedName('SalesData', { type: 'range', ref: 'Sales!A2:D12' });
workbook.definedNames;   // Map<string, DefinedNameDefinition>
workbook.removeDefinedName('TaxRate');
```

Names are resolvable in formulas (`=TaxRate * B2`), including names pointing at ranges.

## Structural limits

- `MAX_WORKSHEET_ROWS` = 1,048,576
- `MAX_WORKSHEET_COLUMNS` = 16,384
- Defaults: row height 24px, column width 100px

## Serialization

```ts
const json = workbook.toJSON();      // { format: 'ezygrid', version: 2, ... }
const restored = Workbook.fromJSON(json);
```

See [Persistence](/guide/persistence).
