# Full editor

Ezygrid opens a complete single-workbook editor by default, including a ribbon, formula bar, worksheet tabs, contextual panels, and selection statistics. The same default applies to every framework integration and the browser loader.

## Start editing

Give the host a height and initialize the editor. Shell styles load automatically; theme packages are optional overrides.

```html
<div id="app" style="height: 640px"></div>
```

```ts
import { Ezygrid } from '@ezygrid/core';

const editor = new Ezygrid({
  target: '#app',
  filename: 'Quarterly budget',
  worksheets: [{ name: 'Budget', data: [['Item', 'Amount'], ['Hosting', 50]] }],
});
```

Use Home for formatting, Insert for tables and floating objects, Layout for row and column operations, Formulas for functions and names, Data for rules and analysis, Review for notes, and View for display settings. The ribbon scrolls horizontally in smaller hosts; advanced controls open in a side panel.

## Manage sheets and files

Use the plus button to add a sheet. Open Sheet settings, double-click a tab, or right-click it to rename, reorder, or delete it. Switching sheets restores their selection and scroll position. The last worksheet cannot be deleted.

Save downloads an Ezygrid JSON file. Open accepts JSON or XLSX; File also provides CSV import and export. Excel support is included in the editor. CSV applies to the active worksheet. JSON retains the supported workbook features; XLSX supports cell values, formulas, merges, basic formatting, and sizes, but does not provide complete Excel feature fidelity.

::: warning File-based saving
There is no autosave or cloud storage. Download JSON before closing the page. New and Open request confirmation before replacing a workbook with unsaved changes. Custom JavaScript predicates cannot be saved in JSON.
:::

## Use the compact grid

Existing integrations that need only the grid and formula bar can select grid mode explicitly:

```ts
const editor = new Ezygrid({
  target: '#app',
  renderer: { mode: 'grid' },
});
```

```html
<div data-ezg-editor data-ezg-mode="grid" style="height: 400px"></div>
<script src="./packages/core/dist/browser/ezygrid.js"></script>
```

React forwards this through its `renderer` prop; Vue and Angular use `options`; the web component uses `setRendererOptions`. Grid mode keeps the optional basic toolbar, disabled by default.

## Customize visible controls

```ts
const editor = new Ezygrid({
  target: '#app',
  renderer: {
    topbar: false,
    toolbar: true,
    formulaBar: true,
    sheetTabs: true,
    statusBar: true,
    contextMenu: true,
    direction: 'ltr',
  },
});
```

In editor mode, `toolbar` controls the ribbon controls. The ribbon tabs remain available so users can expand it again. Outfit is the default UI font, with system-font fallbacks. See [theming](/guide/theming) for scoped CSS variables.

## Update documents programmatically

```ts
const workbook = editor.workbook;
const next = workbook.addWorksheet({ name: 'Forecast' });
workbook.setActiveWorksheet(next.id);

workbook.transaction(() => {
  next.setValue(0, 0, 250);
  next.setStyle('A1', { fontSize: 18, bold: true });
});

const saved = workbook.toJSON();
workbook.loadJSON(saved);
```

`transaction` groups synchronous changes into one reversible action and rolls back failures. `loadJSON` validates before replacing contents, preserves the workbook instance and its subscriptions, and resets history. `createGrid()` continues to create a model without mounting UI.

See [Ezygrid](/api/ezygrid), [renderer options](/api/renderer), and [Workbook](/api/workbook) for the public interfaces.
