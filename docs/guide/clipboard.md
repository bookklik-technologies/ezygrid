# Clipboard

Copy, cut and paste work through the browser clipboard plus an internal buffer for full fidelity between grids.

## Native behavior

Copy/cut/paste events are intercepted on the grid. External exchange uses `text/plain` TSV (quote-aware, multiline cells supported); the internal buffer preserves formulas, styles and literal flags. Writes go through `navigator.clipboard` with a textarea `execCommand` fallback.

## API

```ts
import { ClipboardService } from '@ezygrid/core';

const clipboard = new ClipboardService();

// Copy a range (values + formulas + styles)
const buffer = clipboard.copyFrom(sheet, 0, 0, 9, 3, { valuesOnly: false });
clipboard.getBuffer();

// External text
clipboard.loadTSV('A\tB\n1\t2');  // external text — no formula translation
clipboard.toTSV();                // TSV of the buffer

// Paste at an anchor (relative refs shift; absolute stay; one history transaction)
clipboard.pasteTo(workbook, sheet, 5, 1);

// Static parse
const range = ClipboardService.fromTSV('x\ty\n1\t2');
```

## Formula translation

Pasting translates relative references by the paste delta; `$`-anchored parts stay fixed:

```ts
import { translateFormula } from '@ezygrid/core';

translateFormula('=SUM(A1:A5)', 2, 1); // pasted 2 rows down, 1 col right → =SUM(B3:B7)
```

Off-sheet targets degrade to `#REF!`.

## Paste special

The service accepts `{ valuesOnly: true }` on copy for value-only workflows.

## Fill handle interplay

The **Ctrl+D** fill-down command reuses the fill engine — see [Fill & series](/guide/fill).
