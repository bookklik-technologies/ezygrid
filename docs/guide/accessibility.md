# Accessibility

Accessibility is part of the DOM contract, not an add-on. The renderer implements the **ARIA grid model**.

## Roles

- The grid container carries `role="grid"` with `aria-rowcount` and `aria-colcount`
- Each rendered row is `role="row"` with `aria-rowindex`
- Cells are `role="gridcell"` with `aria-colindex` and `aria-selected`
- The active cell is exposed through `aria-activedescendant`
- Column headers use `role="columnheader"`, row headers `role="rowheader"`

## Screen-reader semantics

- Only viewport cells exist in the DOM (virtualization), but indexes reflect the full sheet, so AT receives consistent coordinates.
- Selection state is announced per cell via `aria-selected`.
- The formula bar's name box and input are labeled inputs.

## Keyboard parity

The full [keyboard matrix](/guide/selection) is mouse-free: navigation, selection, editing, clipboard, undo/redo and formatting shortcuts all work without a pointer.

## High contrast

`highContrastThemeTokens` provides a high-contrast palette:

```ts
import { buildThemeCss, highContrastThemeTokens } from '@ezygrid/core';
const css = buildThemeCss(highContrastThemeTokens);
```

## Testing advice

Run axe-core or a similar scanner against pages containing a grid, and manually verify tab order, arrow-key navigation with a screen reader, and that edits announce correctly.
