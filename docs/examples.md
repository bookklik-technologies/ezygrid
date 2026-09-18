# Examples

The repository ships runnable demos using the standalone browser loader (`examples/` folder). Each example is a single self-contained HTML file; build the distribution and open the files directly or serve the repository root.

| Example | File | Shows |
| --- | --- | --- |
| Declarative embed | [declarative.html](https://github.com/bookklik-technologies/ezygrid/tree/main/examples/declarative.html) | Zero-JS startup via `data-ezg-editor` |
| Programmatic embed | [programmatic.html](https://github.com/bookklik-technologies/ezygrid/tree/main/examples/programmatic.html) | Constructor with `worksheets`, header styling after `Ezygrid.ready` |
| Events | [events.html](https://github.com/bookklik-technologies/ezygrid/tree/main/examples/events.html) | `workbook.onOperation` live recalculation |
| Advanced sheet | [advanced.html](https://github.com/bookklik-technologies/ezygrid/tree/main/examples/advanced.html) | Toolbar + formula bar, validation, conditional formats, tables, CSV export |

## Running locally

```bash
pnpm build   # generates packages/core/dist/browser/
```

Serve the repository root with any static file server and open `examples/declarative.html`.

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
