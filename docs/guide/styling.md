# Styling & number formats

Apply cell formatting through the Home ribbon or the worksheet API. Formatting is stored with the workbook and used by rendering, printing, and supported Excel exports.

## Cell styles

Styles are applied to ranges using A1 notation and are undoable (`meta.set` operations):

```ts
const sheet = editor.workbook.activeWorksheet;

sheet.setStyle('A1:D1', { bold: true, background: '#e6fff4', align: 'center' });
sheet.setStyle('B2:B50', { color: '#b91c1c' });
sheet.setStyle('C1', { italic: true, underline: true });

sheet.getStyle(0, 0);   // CellStyle at A1
sheet.clearStyle('A1:D1');
```

```ts
interface CellStyle {
  fontFamily?: string;
  fontSize?: number; // pixels
  wrap?: boolean;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  borders?: Partial<Record<'top' | 'right' | 'bottom' | 'left', {
    color: string;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
  } | null>>;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  background?: string;
  align?: 'left' | 'center' | 'right';
}
```

## Number formats

Masks apply at **display** time — raw values are stored untouched and formatting is applied for rendering, CSV export and printing:

```ts
sheet.setNumberFormat('B2:B50', '#,##0.00');   // 12,345.68
sheet.setNumberFormat('C2:C50', '0.00%');      // 0.185 → 18.50%
sheet.setNumberFormat('D2', '$#,##0.00');      // currency prefix
sheet.setNumberFormat('E2:E50', 'yyyy-mm-dd'); // date masks over Excel serials
sheet.getNumberFormat(1, 1);
```

Supported masks: `#,##0`, `#,##0.00`, `0.00%`, `$#,##0.00`, `yyyy-mm-dd`, `dd/mm/yyyy`, `mm/dd/yyyy`, and `General`.

## Conditional formatting

Rules are evaluated per cell and merged into a style patch, ordered by priority:

```ts
import type { ConditionalFormatRule } from '@ezygrid/core';

sheet.conditionalFormats.add({
  range: 'B2:B50',
  type: 'cellIs',
  operator: 'lt',
  value: 0,
  style: { color: '#b91c1c' },
  priority: 1,
});

sheet.conditionalFormats.add({
  range: 'A2:A50',
  type: 'containsText',
  text: 'urgent',
  style: { bold: true },
  priority: 2,
});
```

| Field | Values |
| --- | --- |
| `type` | `cellIs`, `containsText`, `expression`, `topN`, `duplicates` |
| `operator` (cellIs) | `gt`, `lt`, `gte`, `lte`, `eq`, `neq` |
| `predicate` | custom `(value) => boolean` for `expression` |
| `n` | count for `topN` |
| `stopIfTrue` | stop evaluating lower-priority rules |

```ts
sheet.conditionalFormats.all();       // rules sorted by priority
sheet.conditionalFormats.evaluate(1, 1); // merged CellStyle patch
sheet.conditionalFormats.remove(id);
```

## Row/column sizes

Sizes live in `SizeIndex` (a Fenwick tree, O(log n) queries):

```ts
sheet.columnSizes.setSize(0, 160);  // widen column A
sheet.rowSizes.setSize(3, 48);      // taller row 4
sheet.columnSizes.sizeOf(0);
sheet.rowSizes.offsetOf(10);        // pixel offset of row 11
```

## Themes

Colors and fonts come from CSS variables; see [Theming](/guide/theming) to control the palette globally.
