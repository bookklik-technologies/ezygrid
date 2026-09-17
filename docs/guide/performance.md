# Performance

Ezygrid targets smooth interaction on large sheets through a layered strategy.

## Storage

- **Paged sparse store**: cells are held in lazily-allocated 256×256 pages — a million empty rows cost almost nothing; `usedRange` bounds work.
- **String/style interning**: repeated styles and values are interned to integers (`styleId`).

## Rendering

- **Two-axis virtualization**: only visible rows/columns (plus overscan: 5 rows, 2 columns by default) are in the DOM.
- **DOM recycling**: cells are pooled and recycled instead of created/destroyed per scroll frame.
- **Native scrolling**: a spacer-based native scroller keeps scrolling compositor-friendly.
- **Hidden-region skipping** and pagination clamping avoid wasted work.
- Targets: 60 FPS interaction via DOM recycling (no canvas required).

## Size math

Row/column sizes live in `SizeIndex` — a Fenwick tree over size deltas giving O(log n) prefix sums, pixel-offset lookups and index-at-pixel queries even with millions of custom sizes.

## Calculation

- **Incremental recalculation**: only dirty cells re-evaluate per pass; range dependencies are stored as rectangles, never expanded per cell.
- **Memoization** within a pass; results cached until invalidated.
- **Resource budgets**: `maxRangeCells` (2,000,000) and `maxDepth` (1000) bound pathological workbooks; cycles surface as `#CIRCULAR!` instead of hanging.
- **Web Worker** evaluation is available via `@ezygrid/formula/worker-main` for off-main-thread computation.

## Tuning tips

```ts
new Ezygrid({
  target: el,
  renderer: {
    overscanRows: 5,     // raise for slower scroll on huge sheets
    overscanColumns: 2,
  },
  worksheets: [{ rows: 1_048_576, columns: 16_384 }], // fine — sparse
});
```

- Prefer `beginUpdate()`/`endUpdate()` around bulk mutations.
- Use [pagination](/guide/structure) for fixed-size views of large sheets.
- Keep number formats at display time (they already are) rather than pre-formatting values.
