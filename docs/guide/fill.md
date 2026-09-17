# Fill & series

The fill service powers the **Alt+drag** fill handle and the **Ctrl+D** fill-down command.

## API

```ts
import { FillService } from '@ezygrid/core';

const fill = new FillService();

fill.fillRange(sheet, sourceRect, targetRect); // target must contain source
fill.fill(sheet, 'down', rect, targetEnd);     // 'down' | 'up' | 'right' | 'left'
```

## Series inference

| Source | Result |
| --- | --- |
| Two or more numeric seeds | Arithmetic progression continuation (`1, 3 → 5, 7, 9…`) |
| Single number | Copy |
| Text ending in digits | Increment the suffix (`Item 1 → Item 2`) |
| Anything else | Copy |
| Formulas | Translated by fill delta (relative refs shift) |

## Fill handle UX

- Plain drag from the corner handle = extend the selection (no writes).
- **Alt** (Option on macOS) + drag = autofill — writes values, series, or translated formulas into the destination and **can overwrite** its contents.
- A floating A1 range label shows the target rectangle while dragging.
- **Escape** cancels the gesture at any point.

All fills are atomic, undoable history entries.
