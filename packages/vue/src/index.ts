import { defineComponent, h, onBeforeUnmount, onMounted, ref, type PropType } from 'vue';
import {
  createGrid,
  GridRenderer,
  type Workbook,
  type CreateGridOptions,
  type GridRendererOptions,
} from '@ezygrid/core';

export interface EzySpreadsheetExpose {
  getWorkbook(): Workbook | undefined;
  getRenderer(): GridRenderer | undefined;
}

/**
 * Vue 3 wrapper (§46.2): composition API, mount/unmount lifecycle, exposes
 * the workbook and renderer through refs.
 */
export const Spreadsheet = defineComponent({
  name: 'EzySpreadsheet',
  props: {
    config: { type: Object as PropType<CreateGridOptions>, default: undefined },
    options: { type: Object as PropType<GridRendererOptions>, default: undefined },
  },
  emits: {
    ready: (_workbook: Workbook, _renderer: GridRenderer) => true,
  },
  setup(props, { emit, expose }) {
    const el = ref<HTMLElement | null>(null);
    let workbook: Workbook | undefined;
    let renderer: GridRenderer | undefined;

    onMounted(() => {
      if (!el.value) return;
      workbook = createGrid(el.value, props.config);
      renderer = new GridRenderer(el.value, workbook, props.options);
      emit('ready', workbook, renderer);
    });

    onBeforeUnmount(() => {
      renderer?.destroy();
      renderer = undefined;
    });

    expose({
      getWorkbook: () => workbook,
      getRenderer: () => renderer,
    } satisfies EzySpreadsheetExpose);

    return () => h('div', { ref: el, class: 'ezygrid-vue-host' });
  },
});
