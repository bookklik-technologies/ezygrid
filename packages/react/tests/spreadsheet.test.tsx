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

function renderSpreadsheet(props: SpreadsheetProps): void {
  root = createRoot(host);
  act(() => {
    root!.render(createElement(Spreadsheet, props));
  });
  act(async () => {
    await Promise.resolve();
  });
}

describe('@ezygrid/react (§46.1)', () => {
  it('mounts the grid with data and renders cells', () => {
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

  it('formula editing commits through the model', () => {
    let workbookRef: { activeWorksheet: { getValue(r: number, c: number): unknown } } | undefined;
    renderSpreadsheet({
      worksheets: [{ data: [[10]] }],
      onReady: (workbook) => {
        workbookRef = workbook as never;
      },
    });
    const cell = host.querySelector('[data-row="0"][data-col="0"]') as HTMLElement;
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const grid = host.querySelector('.ezygrid') as HTMLElement;
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
    const input = host.querySelector('.ezygrid-editor') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = '=A1*3';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(workbookRef!.activeWorksheet.getValue(0, 0)).toBe(30);
  });
});
