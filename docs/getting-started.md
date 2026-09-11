# Getting started

Ezygrid is a framework-agnostic spreadsheet engine and UI. This cookbook covers the essentials; see `ezygrid-devplan.md` for the full specification.

## Vanilla JS/TS

```ts
import { createGrid } from '@ezygrid/core';
import '@ezygrid/theme-default/index.css';

const workbook = createGrid(document.querySelector('#grid'), {
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

const sheet = workbook.activeWorksheet;
sheet.setValue(3, 3, '=B4-C4');       // formulas recalculate automatically
sheet.setStyle('D2:D3', { bold: true });
sheet.setNumberFormat('B2:B3', '#,##0.00');
```

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
