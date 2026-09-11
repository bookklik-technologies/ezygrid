// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, defineComponent, h, type App } from 'vue';
import { Spreadsheet, type EzySpreadsheetExpose } from '../src/index.js';

let host: HTMLElement;
let app: App | null = null;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

function mountSpreadsheet(props: Record<string, unknown>): EzySpreadsheetExpose {
  let exposed: EzySpreadsheetExpose | undefined;
  app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(Spreadsheet, {
            ...props,
            ref: (instance: EzySpreadsheetExpose) => {
              exposed = instance;
            },
          });
      },
    }),
  );
  app.mount(host);
  return exposed!;
}

describe('@ezygrid/vue (§46.2)', () => {
  it('mounts the grid and renders cells', () => {
    let ready = false;
    mountSpreadsheet({
      config: { worksheets: [{ name: 'Sheet1', data: [['hello vue']] }] },
      onReady: () => {
        ready = true;
      },
    });
    const cell = host.querySelector('.ezygrid-cell');
    expect(cell?.textContent).toBe('hello vue');
    expect(ready).toBe(true);
  });

  it('exposes workbook and renderer and unmounts cleanly', () => {
    const exposed = mountSpreadsheet({ config: { worksheets: [{ data: [['x']] }] } });
    expect(exposed.getWorkbook()).toBeDefined();
    expect(exposed.getRenderer()).toBeDefined();
    app!.unmount();
    expect(host.querySelector('.ezygrid')).toBeNull();
  });

  it('renderer options are forwarded', () => {
    mountSpreadsheet({
      config: { worksheets: [{ data: [['x']] }] },
      options: { formulaBar: false },
    });
    expect(host.querySelector('.ezygrid-formulabar')).toBeNull();
  });
});
