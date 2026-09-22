---
name: ezygrid-workbook-creation
description: "Create or modify Ezygrid workbooks, worksheets, cells and structural layout with correct batching, history and serialization. Use for spreadsheet data and structure, not formulas, visualizations or file interchange."
---

# Ezygrid Workbook Creation

## Inputs and approach

Identify sheet names, dimensions, source data, cell types, structural operations and whether the result needs UI. Prefer `Ezygrid` for an editor and `createGrid` for a headless workbook.

Read [workbooks](../../../docs/guide/workbook.md), [cells](../../../docs/guide/cells.md), [structure](../../../docs/guide/structure.md), [workbook implementation](../../../packages/core/src/workbook.ts) and [model operations](../../../packages/model/src/operations.ts).

## Workflow and contracts

- Seed sheets through `worksheets` or add them with `workbook.addWorksheet`. Row and column indexes are zero-based; user-facing addresses use A1 notation.
- Use `setValue` for values and formulas. A string beginning with `=` is stored as a formula, so use the formula skill for nontrivial calculation behavior.
- Group related writes with `workbook.transaction(fn)` when rollback on failure matters. Use `beginUpdate`/`endUpdate` with `try/finally` for manually bounded batches.
- Structural edits, merges, sizes and sheet renames are undoable and translate affected formula references. Do not rewrite references with regular expressions.
- Respect the maximum 1,048,576 rows and 16,384 columns. The last worksheet cannot be removed.
- `toJSON` stores workbook state, not undo history. `Workbook.fromJSON` creates a new workbook; `workbook.loadJSON` replaces contents while preserving the instance and subscriptions.
- Keep values and workbook metadata serializable. Custom callback fields belong to host configuration and may need reattachment after load.

## Example

```ts
import { Ezygrid } from '@ezygrid/core';

const editor = new Ezygrid({
  target: '#app',
  worksheets: [{
    name: 'Budget',
    rows: 200,
    columns: 12,
    data: [['Item', 'Amount'], ['Hosting', 50]],
  }],
});

const sheet = editor.workbook.activeWorksheet;
editor.workbook.transaction(() => {
  sheet.setValue(2, 0, 'Software');
  sheet.setValue(2, 1, 125);
  sheet.merge('D2:E2');
  sheet.columnSizes.setSize(0, 180);
});
```

## Deliverables and verification

Deliver initialization or mutation code plus any save/load wiring. Review bounds, empty data, sheet-name collisions, structural reference translation, transaction rollback, undo/redo and JSON round-trip. Ask before running unit tests; do not run `pnpm test` or individual Vitest files without permission.
