# Selection & keyboard

The renderer owns a `SelectionService` and a keyboard matrix that mirrors spreadsheet conventions.

## Selection model

```ts
interface SelectionState {
  active: { row: number; column: number };  // cursor cell
  anchor: { row: number; column: number };  // range anchor
  ranges: Rect[];                            // all selected rectangles
}
```

```ts
const selection = renderer.selection;

selection.state;
selection.setActive(2, 3);
selection.extendTo(5, 6);            // expand range from anchor
selection.addRange(9, 1);            // Ctrl+click multi-range
selection.selectAll();               // Ctrl+A
selection.selectRow(2);              // Shift+Space
selection.selectColumn(3);           // Ctrl+Space
selection.primary;                   // first Rect
selection.describe();                // "B3" or "B3:G7"
selection.isActive(row, column);
selection.isWithin(row, column);
selection.onChange(listener);        // unsubscribe fn
```

Selection follows structural edits (`transformAxis`) and clamps to sheet size (`resize`) automatically.

## Keyboard matrix

| Key | Action |
| --- | --- |
| Arrow keys | Move cursor |
| Shift + Arrow | Extend range |
| Tab / Shift+Tab | Move horizontally |
| Enter / Shift+Enter | Move vertically |
| PageUp / PageDown | Page scrolling |
| Home / End | Row start/end |
| Ctrl + Arrow | Jump to data-region boundary |
| Ctrl + A | Select all |
| Shift + Space | Select row |
| Ctrl + Space | Select column |
| F2 | Edit active cell |
| Escape | Cancel edit / cancel fill or selection drag |
| Delete / Backspace | Clear contents |
| Ctrl + Z / Ctrl + Y | Undo / redo |
| Ctrl + C / X / V | Copy / cut / paste |
| Ctrl + D | Fill down |
| Ctrl + B / I / U | Bold / italic / underline |
| F4 (while editing formula) | Cycle reference `$`-flags |
| Tab (suggestion popup) | Accept formula suggestion |

Typing a printable character starts editing in *replace* mode; F2 or double-click starts in *edit* mode.

## Navigation helpers

```ts
renderer.scrollTo(10, 3);          // ensure a cell is visible
renderer.navigateToAddress('D12'); // name-box style navigation
renderer.getCellElement(2, 3);     // DOM node for a cell
```

## Fill handle vs. range drag

Dragging the small corner handle expands the selection; holding **Alt** before dragging turns it into an autofill gesture. Escape cancels either. See [Fill & series](/guide/fill).

## Context menu

Right-click offers Cut, Copy, Paste, Edit cell, Fill down, Clear contents and Clear formatting. Disable with `renderer: { contextMenu: false }`.
