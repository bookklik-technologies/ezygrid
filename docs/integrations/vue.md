# Vue 3

`@ezygrid/vue` ships an `<Spreadsheet>` component (peer dependency: `vue` **>= 3.3**).

## Install

```bash
pnpm add @ezygrid/vue @ezygrid/core @ezygrid/theme-default
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
