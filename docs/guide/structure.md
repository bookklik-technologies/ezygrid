# Structure

Structural operations — rows, columns, merges, groups, nested headers, freeze panes, visibility — all produce undoable operations and keep formulas and selection consistent.

## Rows & columns

```ts
sheet.insertRows(2, 3);     // insert 3 rows at index 2
sheet.deleteRows(2, 3);
sheet.insertColumns(1, 2);
sheet.deleteColumns(1, 2);
```

Structural changes:

- Emit `rows.insert` / `rows.delete` / `columns.insert` / `columns.delete` operations
- Transform undo/redo history so entries survive the shift
- Translate relative formula references (absolute refs stay put; off-sheet refs become `#REF!`)
- Clamp selection ranges and merges

## Merged cells

```ts
sheet.merge('A1:B2');         // undoable, rejects overlaps and degenerate rects
sheet.unmerge('A1:B2');
sheet.merges.findAt(0, 0);    // MergeRect | undefined
sheet.merges.isCovered(0, 1); // true — covered by the anchor
```

Merges render with the anchor cell spanning the region; covered cells are recycled by the virtualizer. Sorting refuses ranges containing merges.

## Row & column groups

```ts
sheet.groupRows(1, 4);        // group rows 2-5
sheet.ungroupRows(1);
sheet.collapseGroup(1);       // hides grouped rows
sheet.expandGroup(1);
sheet.getGroups();
```

## Nested headers

Multi-level column headers with spans:

```ts
sheet.setNestedHeaders([
  [{ title: 'Revenue', span: 2 }, { title: 'Costs', span: 2 }],
  ['Q1', 'Q2', 'Q1', 'Q2'],
]);
sheet.nestedHeaders;
```

Strings are single-span titles; `{ title, span }` merges that many columns.

## Freeze panes

Set the frozen row/column counts directly on the worksheet:

```ts
sheet.freezeRows = 1;    // header row stays visible
sheet.freezeColumns = 2;
```

Frozen rows/columns render in dedicated overlay layers and remain visible while scrolling.

## Visibility

```ts
sheet.hideRows(4, 2);        // hide rows 5-6
sheet.hideColumns(1);
sheet.showRows(4, 2);
sheet.isRowHidden(4);
sheet.hiddenRows;            // Set<number>
```

## Pagination (renderer view)

The renderer can present rows in pages without touching the model:

```ts
const renderer = editor.renderer;
renderer.enablePagination(50);  // 50 rows per page
renderer.setPage(3);
renderer.pageCount;
renderer.disablePagination();
```

## Zoom

```ts
renderer.setZoom(1.25);
renderer.getZoom();
```

## Formula translation

Reference rewriting is token-based (never regex over raw text). During structural changes, `transformFormulaRefs(formula, shift, options)` shifts relative references; deleting referenced rows/cols turns them into `#REF!`. `renameSheetRefs(formula, from, to)` handles sheet renames.
