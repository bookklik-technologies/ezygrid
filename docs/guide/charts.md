# Charts

Charts are anchored floating objects rendered as inline SVG by the renderer.

## Insert a chart in the editor

1. Select a category column and one or more numeric columns, including their headers.
2. Open **Insert → Chart**. Check the data range or choose **Use selected cells**.
3. Choose Column, Bar, Line, Pie or Doughnut and review the live preview. Set an optional title and whether the first row contains headers.
4. Choose **Insert chart**. The chart appears beside the source range, or below it when there is insufficient space to the right.

The first source column supplies categories and the remaining columns supply numeric series. An inline message explains an invalid or nonnumeric range. Previewing or cancelling does not change the workbook.

Select the chart to activate the **Chart** ribbon tab. Change its type, title, source range, header setting, or dimensions directly; each completed change is undoable. Drag its body to move it or use one of its eight handles to resize it. **Properties** opens a dialog with a preview; **Advanced** contains precise position, size and custom colors. Choose **Apply changes** to save the draft or **Cancel** to discard it.

With a chart focused, arrow keys move it by one worksheet pixel, or ten with Shift. Delete or Backspace removes the chart; Escape deselects it. Keyboard users can resize through the Advanced fields. **Objects on this sheet** provides another way to find and edit existing objects.

See [Images and shapes](/guide/media) for related object controls.

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
