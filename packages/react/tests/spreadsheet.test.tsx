// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { Spreadsheet, type SpreadsheetProps } from '../src/index.js';

let host: HTMLElement;
let root: Root | null = null;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
});

async function renderSpreadsheet(props: SpreadsheetProps): Promise<void> {
  root = createRoot(host);
  act(() => {
    root!.render(createElement(Spreadsheet, props));
  });
  // Async act returns a thenable that must be awaited, otherwise the act
  // scope stays open and later mounts never flush their effects.
  await act(async () => {
    await Promise.resolve();
  });
}

describe('@ezygrid/react (§46.1)', () => {
  it('mounts the grid with data and renders cells', async () => {
    let ready: unknown;
    renderSpreadsheet({
      worksheets: [{ name: 'Sheet1', data: [['hello react']] }],
      onReady: (workbook) => {
        ready = workbook;
      },
    });
    const cell = host.querySelector('.ezygrid-cell');
    expect(cell?.textContent).toBe('hello react');
    expect(ready).toBeDefined();
  });

  it('cleanup destroys the renderer on unmount', () => {
    renderSpreadsheet({ worksheets: [{ data: [['x']] }] });
    act(() => {
      root!.unmount();
    });
    root = null;
    expect(host.querySelector('.ezygrid')).toBeNull();
  });

  it('forwards renderer options (formula bar, toolbar)', () => {
    renderSpreadsheet({
      worksheets: [{ data: [['x']] }],
      renderer: { formulaBar: false },
    });
    expect(host.querySelector('.ezygrid-formulabar')).toBeNull();
  });

  it('formula editing commits through the model', async () => {
    let workbookRef: { activeWorksheet: { getValue(r: number, c: number): unknown } } | undefined;
    renderSpreadsheet({
      worksheets: [{ data: [[10], ['edit here']] }],
      onReady: (workbook) => {
        workbookRef = workbook as never;
      },
    });
    // Edit B1 (not A1): a formula referencing its own cell is circular.
    const cell = host.querySelector('[data-row="0"][data-col="1"]') as HTMLElement;
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const grid = host.querySelector('.ezygrid') as HTMLElement;
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
    const input = host.querySelector('.ezygrid-editor') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = '=A1*3';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(workbookRef!.activeWorksheet.getValue(0, 1)).toBe(30);
  });
});
