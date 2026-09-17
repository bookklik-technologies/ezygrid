# Examples

The repository ships an interactive gallery of runnable demos using the standalone browser loader (`examples/` folder). Run the dev server or open the built gallery to explore them.

| Demo | Shows |
| --- | --- |
| [Initialization](https://github.com/bookklik-technologies/ezygrid/tree/main/examples/initialization.html) | Declarative host vs constructor, `Ezygrid.initAll()` rescans preserving edits, styling a header row |
| [Formulas](https://github.com/bookklik-technologies/ezygrid/tree/main/examples/basic.html) | Two sheets, cross-sheet references, `SUM`, number formats, column sizes, live recalculation via `workbook.onOperation` |
| [Inventory](https://github.com/bookklik-technologies/ezygrid/tree/main/examples/full.html) | Toolbar + formula bar, validation, conditional formats, structured tables, column chart, textbox shape, CSV download |
| [Lifecycle](https://github.com/bookklik-technologies/ezygrid/tree/main/examples/initialization-global.html) | Browser loader, `Ezygrid.getInstance`, `destroy()` and re-`initAll` |
| [React](https://github.com/bookklik-technologies/ezygrid/tree/main/examples/react.html) | First-party React `<Spreadsheet>` with `onReady` styling |

## Running locally

```bash
pnpm examples:build   # builds the gallery + browser distribution
```

Serve the repository root with any static file server and open `examples/index.html`.

## Key snippets

### Live recalculation hook

```js
workbook.onOperation((op) => {
  if (op.type === 'cell.set') status.textContent = `changed ${op.payload.row},${op.payload.column}`;
});
```

### Full-featured sheet

```js
const sheet = editor.workbook.activeWorksheet;
sheet.addValidation({ range: 'B2:B100', type: 'number', action: 'reject', min: 0, max: 1000 });
sheet.conditionalFormats.add({ range: 'B2:B100', type: 'cellIs', operator: 'lt', value: 0, style: { color: '#b91c1c' }, priority: 1 });
sheet.addTable({ name: 'Inventory', range: 'A1:E50' });
sheet.addChart({ type: 'column', source: 'A1:B10', title: 'Stock', anchor: { row: 12, column: 6 }, width: 420, height: 260 });
sheet.toCsv({ escapeFormulas: true });
```
