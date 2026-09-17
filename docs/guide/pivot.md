# Pivot tables

The pivot engine aggregates a source range and writes the result at an anchor cell.

## Computing a pivot

```ts
const pivot = sheet.addPivot({
  source: 'A1:E50',        // data range with header row
  anchor: 'G2',            // where the output lands
  rows: [0, 1],            // group by source column indexes
  values: [
    { column: 3, agg: 'SUM', label: 'Total revenue' },
    { column: 2, agg: 'COUNT', label: 'Records' },
  ],
});
```

## Aggregations

`SUM`, `COUNT`, `COUNTA`, `AVG`, `MIN`, `MAX`

## Refresh

```ts
sheet.pivots.compute(sheet, spec);  // PivotOutput { header, rows, grandTotals }
sheet.pivots.refresh(sheet, spec);  // re-aggregate and rewrite the anchor
```

`compute` returns the aggregation without writing; `refresh` recomputes and rewrites the anchored output after source data changes.
