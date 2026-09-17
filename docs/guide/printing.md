# Printing & PDF

`buildPrintHtml` produces a self-contained HTML document with `@page` rules, ready for `window.print()` or headless PDF generation.

## Usage

```ts
import { buildPrintHtml } from '@ezygrid/core';

const html = buildPrintHtml(editor.workbook, 'Sales', {
  orientation: 'landscape',
  paperSize: 'A4',            // 'A4' | 'Letter'
  marginMm: 12,
  repeatHeaderRows: 1,        // repeat row 1 on every page
  gridlines: true,
  includeHeaders: true,       // A/B/C + 1/2/3 headers
});

// Open and print, or send to a headless browser for PDF
const win = window.open('', '_blank');
win.document.write(html);
win.print();
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `orientation` | `portrait` | `portrait` or `landscape` |
| `paperSize` | `A4` | `A4` or `Letter` |
| `marginMm` | — | Page margins in millimeters |
| `repeatHeaderRows` | — | Repeat the first N rows on each page |
| `gridlines` | `false` | Print cell gridlines |
| `includeHeaders` | `true` | Include row/column headers |

## Formatting fidelity

Values render through the same [number format engine](/guide/styling) used on screen, and styles (bold, color, background, align) carry into the print document.
