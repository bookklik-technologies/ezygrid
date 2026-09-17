# Cells & values

Rows and columns are **zero-based** everywhere in the API. Use A1 helpers from `@ezygrid/model` when you prefer addresses.

## Reading and writing

```ts
import { toA1, fromA1 } from '@ezygrid/model';

const sheet = editor.workbook.activeWorksheet;

sheet.setValue(1, 2, 42);            // C2 = 42
sheet.setValue(1, 3, '=C2*2');       // strings starting with "=" become formulas
sheet.setValue(1, 3, '=C2*2', { literal: true }); // force literal "=C2*2" text

sheet.getValue(1, 2);                // evaluated value: number | string | boolean | null | FormulaError
sheet.getAddress(1, 2);              // "C2"
```

Rules:

- `value` is a literal — it is never reinterpreted as a formula.
- `formula` accepts an optional leading `=`.
- Strings written through `setValue` starting with `=` become formulas; pass `{ literal: true }` to opt out.
- Writes are parse-before-mutate, run validation (see [Validation](/guide/validation)) and emit a `cell.set` operation.

The underlying cell record is `{ raw?, formula?, styleId? }` — formulas store the AST-linked source text, raw values store literals.

## Bulk seed data

```ts
const workbook = createGrid(el, {
  worksheets: [{
    name: 'Budget',
    rows: 200,
    columns: 10,
    data: [
      ['Item', 'Qty', 'Price'],
      ['Widgets', 10, 3.5],
    ],
  }],
});
```

## Notes

```ts
sheet.setNote('B2', 'Verified against Q3 report');
sheet.getNote(1, 1);      // "Verified against Q3 report"
sheet.clearNote('B2');
```

## Cell editors

Assign specialized editors to ranges; the renderer uses them when the user starts editing:

```ts
sheet.setCellEditor('C2:C50', 'dropdown', { values: ['Low', 'Medium', 'High'] });
sheet.setCellEditor('D2:D50', 'checkbox');
sheet.setCellEditor('E2:E50', 'number');
sheet.setCellEditor('F2:F50', 'date');
sheet.getEditorFor(1, 2);
```

Editor types honored by the renderer: `dropdown` (options `{ values }`), `checkbox`, `number`, `date`, plus the default text editor. See [Editing cells](/guide/editing).

## Sparse storage

`SparseCellStore` pages cells in 256×256 blocks allocated lazily, so empty regions have no cost:

```ts
sheet.cells.getCell(row, column);          // CellRecord | undefined
sheet.cells.forEach((row, column, rec) => { ... });
sheet.cells.usedRange;                     // Rect | undefined
```

## Coordinate helpers

```ts
import { toA1, fromA1, indexToColumn, columnToIndex, parseRange, rectToRange } from '@ezygrid/model';

toA1(0, 0);                 // "A1"
fromA1('C2');               // { row: 1, column: 2 }
indexToColumn(26);          // "AA"
columnToIndex('AA');        // 26
parseRange('A1:C3');        // { top: 0, left: 0, bottom: 2, right: 2 }
parseRange('Sheet2!A1:B3'); // with sheet
rectToRange(rect);          // "A1:C3"
```

Addresses may contain `$` markers; `parseRef` supports `'My Sheet'!$A$1` quoted sheet names and absolute/relative flags.
