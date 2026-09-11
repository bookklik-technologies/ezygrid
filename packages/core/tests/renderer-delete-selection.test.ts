// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createGrid, GridRenderer } from '../src/index.js';

const renderers: GridRenderer[] = [];
afterEach(() => {
  renderers.splice(0).forEach((renderer) => renderer.destroy());
  document.body.replaceChildren();
});

function setup(rows = 100) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const workbook = createGrid(host, { worksheets: [{ rows, columns: 20, data: [
    [1, 2, 'keep'], [0, '=A1+B1', false], ['outside', 8, 9],
  ] }] });
  const renderer = new GridRenderer(host, workbook);
  renderers.push(renderer);
  return { host, workbook, renderer, sheet: workbook.activeWorksheet };
}

function mouse(target: Element, type: string, init: MouseEventInit = {}) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }));
}

function key(renderer: GridRenderer, key: string) {
  renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('delete selected contents', () => {
  it.each(['Delete', 'Backspace'])('%s clears a corner-dragged range and preserves formatting and selection', (deleteKey) => {
    const { host, renderer, sheet } = setup();
    sheet.setStyle('A1:B2', { bold: true, background: '#ffff00' });
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown');
    const end = renderer.getCellElement(1, 1)!;
    mouse(end, 'mousemove');
    mouse(end, 'mouseup');
    expect(renderer.selection.state.active).toEqual({ row: 1, column: 1 });
    key(renderer, deleteKey);
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 2; column++) {
        expect(sheet.getValue(row, column)).toBeNull();
        expect(renderer.getCellElement(row, column)?.textContent).toBe('');
        expect(sheet.getStyle(row, column)).toMatchObject({ bold: true, background: '#ffff00' });
      }
    }
    expect(sheet.getValue(0, 2)).toBe('keep');
    expect(sheet.getValue(1, 2)).toBe(false);
    expect(sheet.getValue(2, 0)).toBe('outside');
    expect(renderer.selection.describe()).toBe('A1:B2');
  });

  it('clears a reverse Shift selection and recalculates formulas outside it', () => {
    const { renderer, sheet } = setup();
    sheet.setValue(2, 2, '=SUM(A1:B2)');
    mouse(renderer.getCellElement(1, 1)!, 'mousedown');
    mouse(renderer.getCellElement(0, 0)!, 'mousedown', { shiftKey: true });
    key(renderer, 'Delete');
    expect(sheet.getValue(0, 1)).toBeNull();
    expect(sheet.getValue(1, 1)).toBeNull();
    expect(sheet.cells.getCell(1, 1)?.formula).toBeUndefined();
    expect(sheet.getValue(2, 2)).toBe(0);
    expect(renderer.getCellElement(2, 2)?.textContent).toBe('0');
  });

  it('clears separate Ctrl-selected cells once each without clearing gaps', () => {
    const { renderer, sheet, workbook } = setup();
    mouse(renderer.getCellElement(0, 0)!, 'mousedown');
    mouse(renderer.getCellElement(2, 2)!, 'mousedown', { ctrlKey: true });
    mouse(renderer.getCellElement(0, 0)!, 'mousedown', { ctrlKey: true });
    const writes: unknown[] = [];
    workbook.onOperation((operation) => { if (operation.type === 'cell.set') writes.push(operation.payload); });
    key(renderer, 'Delete');
    expect(sheet.getValue(0, 0)).toBeNull();
    expect(sheet.getValue(2, 2)).toBeNull();
    expect(sheet.getValue(0, 1)).toBe(2);
    expect(sheet.getValue(1, 1)).toBe(2);
    expect(writes).toHaveLength(2);
  });

  it('clears offscreen content in a whole-column selection without writing empty cells', () => {
    const { renderer, sheet, workbook } = setup(1_000_000);
    sheet.setValue(900_000, 0, 'far away');
    renderer.selection.selectColumn(0);
    const writes: unknown[] = [];
    workbook.onOperation((operation) => { if (operation.type === 'cell.set') writes.push(operation.payload); });
    key(renderer, 'Delete');
    expect(sheet.getValue(900_000, 0)).toBeNull();
    expect(sheet.getValue(0, 0)).toBeNull();
    expect(sheet.getValue(1, 0)).toBeNull();
    expect(sheet.getValue(2, 0)).toBeNull();
    expect(sheet.getValue(0, 1)).toBe(2);
    expect(writes).toHaveLength(4);
    key(renderer, 'Delete');
    expect(writes).toHaveLength(4);
  });

  it('keeps Delete inside an open cell editor from clearing the selected range', () => {
    const { renderer, sheet } = setup();
    renderer.selection.extendTo(1, 1);
    key(renderer, 'F2');
    const editor = renderer.getEditorInput()!;
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(sheet.getValue(0, 0)).toBe(1);
    expect(sheet.getValue(0, 1)).toBe(2);
    expect(sheet.getValue(1, 1)).toBe(3);
  });
});
