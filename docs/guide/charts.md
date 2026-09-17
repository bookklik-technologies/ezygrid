# Charts

Charts are anchored floating objects rendered as inline SVG by the renderer.

## Adding a chart

```ts
const chart = sheet.addChart({
  type: 'column',            // 'column' | 'bar' | 'line' | 'pie' | 'doughnut'
  source: 'A1:B6',           // range: categories + series
  firstRowIsHeader: true,    // first row names the series
  title: 'Revenue by month',
  anchor: { row: 8, column: 1 },  // floating anchor cell
  width: 420,
  height: 260,
  colors: ['#2563eb', '#00b374'],
});

sheet.charts.all();
sheet.charts.remove(chart.id);
```

## Reading chart data

```ts
import { readChartData } from '@ezygrid/core';

const data = readChartData(sheet, spec);
// { categories: string[]; series: { name: string; values: (number | null)[] }[] }
```

## Rendering

`renderChartSVG(spec, data)` is a pure function producing SVG markup — used by the renderer's floating media layer, but also usable standalone. Colors pass through an XSS-safe allowlist (`sanitizeChartColor`).

## Chart types

| Type | Best for |
| --- | --- |
| `column` | Comparing categories vertically |
| `bar` | Comparing categories horizontally |
| `line` | Trends over ordered categories |
| `pie` | Part-of-whole, few categories |
| `doughnut` | Part-of-whole with center space |

Default palette is available as `DEFAULT_CHART_COLORS`.
