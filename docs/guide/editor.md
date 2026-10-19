# Full editor

Ezygrid opens a complete single-workbook editor by default, including a ribbon, formula bar, worksheet tabs, contextual tools, and selection statistics. The same default applies to every framework integration and the browser loader.

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

Use Home for formatting, Insert for floating objects, Layout for row/column operations and grouped headers, Formulas for functions and names, Data for tables, rules and analysis, Review for notes, and View for display settings. Actions and common settings appear directly in compact ribbon groups. The ribbon and its tabs scroll horizontally in smaller hosts; longer editors open in dialogs.

Home includes vertical alignment, number formats, border presets, and Find next. Use **Replace options** for replacement and search options, **Border options** for detailed borders, or **Custom** in Number format for a format mask. Formulas provides a searchable function picker and a defined-name manager. Data includes ascending/descending sort, filters for the active column, and grouping controls for selected rows; rules, multilevel sort, and pivots use dialogs. Review saves notes to the selected range. View applies freeze counts and controls pagination directly.

Selecting a chart, image, or shape activates its contextual ribbon tab without moving keyboard focus from the object. Use its controls for common properties and size, or **Properties** for a preview and advanced settings. Direct changes commit when a control change finishes; dialogs commit on **Apply changes**, and **Cancel** discards the draft. **Objects on this sheet** lists all floating objects. Selecting cells entirely within a table reveals **Table** tools without switching tabs. See [charts](/guide/charts), [media](/guide/media), and [tables](/guide/tables).

Select the **Layout** tab to insert, delete, hide, show and auto-fit directly from the **Rows** and **Columns** ribbon groups. Their captions show the affected selection. Exact dimensions have height/width fields and Apply icons; Show menus list hidden ranges. Actions apply immediately and support Undo. Click a row number or column letter to select it, or Shift-click another header to select a range. Hover over an icon for its action name.

The **Grouped headers** ribbon group contains level/group selectors, label and column-range fields, and icons to add, remove and reorder levels and groups. **Preview grouped headers** opens a live preview below the ribbon. **Save headers** commits the draft; **Cancel header changes**, Escape in the header controls, or leaving the Layout tab discards it. See [worksheet structure](/guide/structure#nested-headers) for details.

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

In editor mode, `toolbar` controls the ribbon controls. The ribbon tabs remain available so users can expand it again. The chrome follows the shared Ezy suite UI standard: Outfit (weights 400–800) with system-font fallbacks and Lucide icons at 1.8 stroke. See [theming](/guide/theming) for scoped CSS variables.

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
