---
name: ezygrid-visualization-creation
description: "Create or update Ezygrid charts, pivot summaries, images and shapes. Use for worksheet-bound visualizations and floating media, not unrelated charting libraries or UI themes."
---

# Ezygrid Visualization Creation

## Inputs and approach

Identify the source range, headers, intended comparison or aggregation, anchor cell and dimensions. Prefer a built-in chart or pivot before adding decorative media.

Read [charts](../../../docs/guide/charts.md), [pivots](../../../docs/guide/pivot.md), [images and shapes](../../../docs/guide/media.md), [chart implementation](../../../packages/core/src/charts.ts), [pivot implementation](../../../packages/core/src/pivot.ts) and [media implementation](../../../packages/core/src/media.ts).

## Workflow and contracts

- Charts bind to an A1 source range and support `column`, `bar`, `line`, `pie` and `doughnut`. The first source column becomes categories; remaining columns become series.
- Preserve category slots for missing or nonnumeric chart data as null. Use `readChartData` when inspecting the normalized series.
- Chart colors accept plain CSS color values through an allowlist. Do not pass arbitrary markup or attributes into color fields.
- Pivot row/value column indexes are relative to the source range's left edge. `compute` is read-only; `refresh` rewrites the output at the anchor.
- `sheet.addPivot` performs the initial write and returns the pivot id. Pivots do not refresh automatically when source data changes; retrieve the saved spec from `sheet.pivotSpecs` and re-run `refresh` at the requested lifecycle point.
- Images accept only `https:`, base64 `data:image/...` or `blob:` sources. Revoke owned blob URLs only after the media no longer needs them.
- Shapes support `rect`, `ellipse` and `textbox`. Charts and media are anchored to cells but sized and offset in pixels; they survive workbook JSON persistence.

## Example

```ts
const sheet = editor.workbook.activeWorksheet;

sheet.addChart({
  type: 'column', source: 'A1:B6', firstRowIsHeader: true,
  title: 'Revenue by month', anchor: { row: 8, column: 1 },
  width: 420, height: 260, colors: ['#2563eb'],
});

const pivotId = sheet.addPivot({
  source: 'D1:H50', anchor: 'J2', rows: [0],
  values: [{ column: 3, agg: 'SUM', label: 'Revenue' }],
});

const pivot = sheet.pivotSpecs.find((spec) => spec.id === pivotId);
if (pivot) sheet.pivots.refresh(sheet, pivot);
```

## Deliverables and verification

Deliver visualization specifications and refresh/removal wiring. Review empty and missing data, headers, multiple series, invalid colors or image URLs, pivot aggregation, output overlap, floating placement, serialization and rendering after resize. Ask before running unit tests; do not run `pnpm test` or individual Vitest files without permission.
