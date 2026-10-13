# Vue 3

`@ezygrid/vue` ships an `<Spreadsheet>` component (peer dependency: `vue` **>= 3.3**).

## Install

::: warning Local workspace adapter
The `@ezygrid/*` adapters are built from this repository and are not published on public npm. The `@bookklik/ezygrid` package ships the framework-neutral editor. These instructions link a built local checkout; adjust the relative paths for your application.
:::


```bash
# Build the cloned Ezygrid checkout first: pnpm install && pnpm build
# From a consuming app beside the ezygrid checkout:
pnpm add @ezygrid/vue@link:../ezygrid/packages/vue @ezygrid/core@link:../ezygrid/packages/core @ezygrid/theme-default@link:../ezygrid/packages/theme-default
```

## Usage

```vue
<script setup>
import { Spreadsheet } from '@ezygrid/vue';
import '@ezygrid/theme-default/index.css';

const onReady = (workbook, renderer) => {
  workbook.activeWorksheet.setValue(0, 0, 'Hello');
};
</script>

<template>
  <Spreadsheet
    :config="{ worksheets: [{ name: 'Sheet1', data: [[1, '=A1+1']] }] }"
    :options="{ formulaBar: true, toolbar: true }"
    style="height: 480px"
    @ready="onReady"
  />
</template>
```

## Props and events

| Prop | Type | Description |
| --- | --- | --- |
| `config` | `CreateGridOptions` | Workbook options (worksheets, extensions, id) |
| `options` | `GridRendererOptions` | Presentation options |

| Event | Payload | Description |
| --- | --- | --- |
| `ready` | `(workbook: Workbook, renderer: GridRenderer)` | Fired once mounted |

## Exposed methods

```vue
<script setup>
import { ref } from 'vue';
const grid = ref();
// after mount:
grid.value.getWorkbook();  // Workbook | undefined
grid.value.getRenderer();  // GridRenderer | undefined
</script>
<template>
  <Spreadsheet ref="grid" :config="{ worksheets: [] }" />
</template>
```

The component is uncontrolled: the workbook owns state, and Vue re-renders do not repaint the grid.
