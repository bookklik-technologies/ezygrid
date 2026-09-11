# Getting started

Ezygrid is a framework-agnostic spreadsheet engine and UI. This cookbook covers the essentials; see `ezygrid-devplan.md` for the full specification.

## Vanilla JS/TS

```ts
import { Ezygrid } from '@ezygrid/core';
import '@ezygrid/theme-default/index.css';

// Run after <div id="editor" style="height: 460px"></div> exists.
const editor = new Ezygrid({
  target: '#editor', // Also accepts an HTMLElement.
  renderer: { toolbar: true },
  worksheets: [
    {
      name: 'Sales',
      rows: 1000,
      columns: 26,
      data: [
        ['Month', 'Revenue', 'Cost', 'Profit'],
        ['Jan', 12000, 7000, '=B2-C2'],
        ['Feb', 15000, 8000, '=B3-C3'],
      ],
    },
  ],
});

const sheet = editor.workbook.activeWorksheet;
sheet.setValue(3, 3, '=B4-C4');       // formulas recalculate automatically
sheet.setStyle('D2:D3', { bold: true });
sheet.setNumberFormat('B2:B3', '#,##0.00');
```

The instance exposes readonly `target`, `workbook`, and `renderer` properties.
Workbook options (`id`, `worksheets`, `extensions`) go at the top level;
presentation options go inside `renderer`. Host dimensions are controlled by your CSS.
The main package import does not scan or modify the DOM.

## Declarative initialization

```html
<div id="declarative-editor" data-ezg-editor style="height: 460px"></div>
```

```js
import '@ezygrid/core/auto';
```

The auto entry point scans once at `DOMContentLoaded`, or immediately if the DOM
is already ready. Each marker creates a default empty spreadsheet. Configuration
belongs in JavaScript; attribute values and JSON options are not interpreted.
Both package entry points are safe to import on the server; mounting requires a DOM.

## Standalone browser script

The browser distribution contains a small loader and separate JavaScript dependency
files. Copy the **entire** `packages/core/dist/browser/` directory to your static
assets directory, preserving its layout. For example, copy its contents to `/ezygrid/`:

```html
<div data-ezg-editor style="height: 460px"></div>
<div id="editor" style="height: 460px"></div>
<script src="/ezygrid/ezygrid.js"></script>
<script>
  Ezygrid.ready.then(() => {
    const editor = new Ezygrid({ target: '#editor' });
  }).catch(console.error);
</script>
```

The ordinary script tag exposes `window.Ezygrid` immediately and loads dependencies
relative to its own URL. `Ezygrid.ready` resolves with the constructor after the files
and DOM are ready and declarative startup has completed. Always wait for it before
construction, lookup, or scanning. Construction before readiness throws a descriptive
error. Failed file requests or module initialization reject the promise; handle the
rejection to show an error in your application. Repeated loader tags reuse the same
constructor and readiness promise, without loading the library twice.

There is no consumer bundling step, import map, runtime package manager, or CDN
dependency. Repository contributors generate the distribution with `pnpm build`;
`npm run examples:build` also generates it alongside the existing demos.
The loader is exported as `@ezygrid/core/browser`, with typings for the browser
global and its readiness promise. For TypeScript script consumers, include
`@ezygrid/core/browser` in `compilerOptions.types`. Normal package imports keep
their synchronous API and do not require `ready`.

Use either the script loader or package imports on a page to keep one instance registry.

## Instance lookup and cleanup

```js
import { Ezygrid } from '@ezygrid/core';

// Call after automatic startup, or explicitly scan now.
const editors = Ezygrid.initAll();
const editor = Ezygrid.getInstance('#declarative-editor');
editor.workbook.activeWorksheet.setValue(0, 0, 'Hello');

// Call after adding marked elements dynamically. Includes container itself.
Ezygrid.initAll(document.querySelector('#new-section'));

// Dispose before removing the host. Repeated destroy calls are safe.
editor.destroy();
```

`initAll(root)` accepts a document, element, or document fragment and returns the
matching instances in DOM order. Repeated scans reuse instances and preserve edits.
There is no DOM observer; dynamic hosts need an explicit scan or constructor call.
`getInstance(target)` returns `undefined` for an existing host without an instance.
Both lookup and construction reject invalid selectors, missing hosts, and non-HTML targets.
Selectors resolve to the first match. Constructing twice on the same host throws;
retrieve the existing instance or destroy it before creating a replacement.
Automatic scanning also reuses instances initialized programmatically before the scan.
`destroy()` removes the grid UI, disposes plugins, and permits reinitialization,
while preserving unrelated host content. Removing an ordinary div alone does not clean up its instance.

Drag the small corner handle to expand a rectangular selection without changing
cell contents. Hold **Alt** (Option on macOS) before starting the drag to autofill
the destination with values, series, or translated formulas. Autofill can overwrite
destination cells. Press **Escape** during either gesture to cancel it.

The lower-level `createGrid` (workbook only), `GridRenderer`, framework wrappers,
and `<ezy-grid>` custom element remain available.

## React

```tsx
import { Spreadsheet } from '@ezygrid/react';

<Spreadsheet
  worksheets={[{ name: 'Sheet1', data: [['A', 'B'], [1, '=B1*2']] }]}
  renderer={{ formulaBar: true, toolbar: true }}
  onReady={(workbook, renderer) => console.log('ready', workbook, renderer)}
/>
```

The component is uncontrolled: the workbook model owns state, so parent re-renders never repaint the grid.

## Vue 3

```vue
<script setup>
import { Spreadsheet } from '@ezygrid/vue';
const onReady = (workbook) => console.log('ready', workbook);
</script>
<template>
  <Spreadsheet :config="{ worksheets: [{ name: 'Sheet1', data: [[1, '=A1+1']] }] }" @ready="onReady" />
</template>
```

## Web component

```html
<script type="module">
  import '@ezygrid/web-component';
  document.querySelector('ezy-grid').setConfig({
    worksheets: [{ name: 'Sheet1', data: [['hello', '=B1&" world"']] }],
  });
</script>
<ezy-grid></ezy-grid>
```

## Angular

```ts
import { EzyGridComponent } from '@ezygrid/angular';

@Component({
  standalone: true,
  imports: [EzyGridComponent],
  template: `<ezy-grid [config]="config" />`,
})
export class HostComponent { config = { worksheets: [{ name: 'Sheet1', data: [[1]] }] }; }
```

Requires `@angular/core >= 17` (standalone components).

## Themes

```ts
import { buildThemeCss, darkThemeTokens } from '@ezygrid/core';
// generate a CSS custom-properties block from tokens:
const css = buildThemeCss({ ...darkThemeTokens, selection: '#a78bfa' });
```

Ships `@ezygrid/theme-default` and `@ezygrid/theme-dark`; every variable is documented in `ThemeTokens`.
