// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createGrid, GridRenderer } from '../src/index.js';

const renderers: GridRenderer[] = [];

afterEach(() => {
  renderers.splice(0).forEach((renderer) => renderer.destroy());
  document.body.replaceChildren();
});

function setup(data: unknown[][] = [[7]]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const workbook = createGrid(host, { worksheets: [{ rows: 100, columns: 20, data }] });
  const renderer = new GridRenderer(host, workbook);
  renderers.push(renderer);
  return { host, renderer, workbook, sheet: workbook.activeWorksheet };
}

function mouse(target: Element, type: string, init: MouseEventInit = {}) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }));
}

describe('fill drag and selection paint', () => {
  it.each([null, 'seed'])('ordinary corner dragging preserves all cell contents (seed=%s)', (seed) => {
    const { host, renderer, workbook, sheet } = setup([
      [seed, 12, 'keep'],
      [3, '=B1+A2', false],
      [0, 'bottom', 99],
    ]);
    sheet.setStyle('B2', { bold: true, background: '#ffff00' });
    renderer.render();
    const original = workbook.toJSON();
    const writes: string[] = [];
    workbook.onOperation((operation) => writes.push(operation.type));
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown');
    const destination = renderer.getCellElement(2, 2)!;
    mouse(destination, 'mousemove');
    expect(workbook.toJSON()).toEqual(original);
    expect(renderer['fillRangeLabel'].textContent).toBe('A1:C3');
    mouse(destination, 'mouseup');
    expect(renderer.selection.describe()).toBe('A1:C3');
    expect(workbook.toJSON()).toEqual(original);
    expect(writes).toEqual([]);
    expect(sheet.getValue(1, 1)).toBe(15);
    expect(sheet.getStyle(1, 1)).toMatchObject({ bold: true, background: '#ffff00' });
    expect(renderer.getCellElement(0, 1)?.textContent).toBe('12');
    expect(renderer.getCellElement(2, 2)?.textContent).toBe('99');
    expect(host.querySelectorAll('[aria-selected="true"]')).toHaveLength(9);
  });

  it.each([[0, 0], [0, 4], [4, 0], [4, 4]])('ordinary diagonal dragging to (%i, %i) only changes selection', (row, column) => {
    const { host, renderer, workbook } = setup(Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => r * 5 + c)));
    const original = workbook.toJSON();
    mouse(renderer.getCellElement(2, 2)!, 'mousedown');
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown');
    const destination = renderer.getCellElement(row, column)!;
    mouse(destination, 'mousemove');
    mouse(destination, 'mouseup');
    expect(renderer.selection.primary).toEqual({ top: Math.min(2, row), bottom: Math.max(2, row), left: Math.min(2, column), right: Math.max(2, column) });
    expect(workbook.toJSON()).toEqual(original);
  });

  it('does not switch to autofill when Alt is pressed after a selection drag starts', () => {
    const { host, renderer, workbook } = setup([[null, 'keep'], ['also keep', '=1+2']]);
    const original = workbook.toJSON();
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown');
    const destination = renderer.getCellElement(1, 1)!;
    mouse(destination, 'mousemove', { altKey: true });
    mouse(destination, 'mouseup', { altKey: true });
    expect(workbook.toJSON()).toEqual(original);
    expect(renderer.selection.describe()).toBe('A1:B2');
  });

  it('returns to selection-only behavior after an explicit autofill gesture', () => {
    const { host, renderer, workbook } = setup();
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown', { altKey: true });
    mouse(renderer.getCellElement(1, 1)!, 'mousemove');
    mouse(renderer.getCellElement(1, 1)!, 'mouseup');
    const original = workbook.toJSON();
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown');
    mouse(renderer.getCellElement(3, 3)!, 'mousemove');
    mouse(renderer.getCellElement(3, 3)!, 'mouseup');
    expect(renderer.selection.describe()).toBe('A1:D4');
    expect(workbook.toJSON()).toEqual(original);
  });

  it('Alt+drag previews and fills the complete rectangle, then clears old tint on click', () => {
    const { host, renderer, sheet } = setup([[1, 2], [3, 4]]);
    mouse(renderer.getCellElement(0, 0)!, 'mousedown');
    mouse(renderer.getCellElement(1, 1)!, 'mousedown', { shiftKey: true });
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown', { altKey: true });
    const destination = renderer.getCellElement(3, 3)!;
    mouse(destination, 'mousemove');
    const preview = host.querySelector<HTMLElement>('.ezygrid-fill-preview')!;
    expect(preview.style.width).toBe('400px');
    expect(preview.style.height).toBe('96px');
    expect(renderer['fillRangeLabel'].textContent).toBe('A1:D4');
    expect(sheet.getValue(3, 3)).toBeNull(); // Preview must not write values.
    mouse(destination, 'mouseup');
    expect(sheet.getValue(3, 3)).toBe(10);
    expect(renderer.selection.describe()).toBe('A1:D4');
    expect(preview.style.display).toBe('none');
    const oldCell = renderer.getCellElement(1, 1)!;
    expect(oldCell.style.background).toContain('--ezygrid-selection-soft');
    mouse(renderer.getCellElement(5, 5)!, 'mousedown');
    expect(renderer.selection.describe()).toBe('F6');
    expect(oldCell.style.background).toBe('');
    expect(oldCell.getAttribute('aria-selected')).toBe('false');
  });

  it.each([[0, 0], [0, 4], [4, 0], [4, 4]])('Alt+drag fills diagonally to (%i, %i)', (row, column) => {
    const { host, renderer, sheet } = setup([]);
    sheet.setValue(2, 2, 9);
    mouse(renderer.getCellElement(2, 2)!, 'mousedown');
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown', { altKey: true });
    const destination = renderer.getCellElement(row, column)!;
    mouse(destination, 'mousemove');
    mouse(destination, 'mouseup');
    const selected = renderer.selection.primary;
    expect(selected).toEqual({ top: Math.min(2, row), bottom: Math.max(2, row), left: Math.min(2, column), right: Math.max(2, column) });
    for (let r = selected.top; r <= selected.bottom; r++) {
      for (let c = selected.left; c <= selected.right; c++) expect(sheet.getValue(r, c)).toBe(9);
    }
  });

  it('preserves the last valid target when mouseup is delivered to the host', () => {
    const { host, renderer, sheet } = setup();
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown', { altKey: true });
    mouse(renderer.getCellElement(2, 2)!, 'mousemove');
    mouse(host, 'mouseup');
    expect(sheet.getValue(2, 2)).toBe(7);
    expect(renderer.selection.describe()).toBe('A1:C3');
  });

  it.each(['escape', 'outside', 'selection change'])('cancels the drag on %s without writing or leaving a preview', (action) => {
    const { host, renderer, sheet } = setup();
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown', { altKey: true });
    mouse(renderer.getCellElement(2, 2)!, 'mousemove');
    if (action === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else if (action === 'outside') mouse(document.body, 'mouseup');
    else renderer.selection.setActive(5, 5);
    expect(renderer['fillPreview'].style.display).toBe('none');
    expect(renderer['fillRangeLabel'].style.display).toBe('none');
    mouse(renderer.getCellElement(2, 2)!, 'mouseup');
    expect(sheet.getValue(2, 2)).toBeNull();
  });

  it('restores explicit, conditional, and table backgrounds when a range is replaced', () => {
    const { host, renderer, sheet } = setup([['Header'], ['red'], ['band'], ['conditional']]);
    sheet.setStyle('A2', { background: '#ff0000' });
    sheet.addTable({ name: 'Colors', range: 'A1:B4' });
    sheet.conditionalFormats.add({ range: 'A4', type: 'containsText', text: 'conditional', style: { background: '#ffff00' }, priority: 1 });
    renderer.render();
    const cells = [1, 2, 3].map((row) => renderer.getCellElement(row, 0)!);
    const original = cells.map((cell) => cell.style.background);
    renderer.selection.setActive(1, 0);
    renderer.selection.extendTo(3, 0);
    for (const cell of cells) {
      expect(cell.style.background).toContain('--ezygrid-selection-soft');
      expect(cell.getAttribute('aria-selected')).toBe('true');
    }
    mouse(renderer.getCellElement(5, 3)!, 'mousedown');
    expect(cells.map((cell) => cell.style.background)).toEqual(original);
    expect(host.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
  });

  it('updates tint and accessibility state when selection changes through the keyboard or API', () => {
    const { renderer } = setup();
    renderer.selection.setActive(1, 1);
    renderer.selection.extendTo(3, 3);
    const oldCell = renderer.getCellElement(1, 1)!;
    expect(oldCell.style.background).toContain('--ezygrid-selection-soft');
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(oldCell.style.background).toBe('');
    expect(oldCell.getAttribute('aria-selected')).toBe('false');
  });

  it('hides the tint and fill handle when focus leaves and restores only the current selection on return', () => {
    const { renderer } = setup();
    const root = renderer['root'];
    root.focus();
    renderer.selection.extendTo(2, 2);
    const selected = renderer.getCellElement(1, 1)!;
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(selected.style.background).toBe('');
    expect(renderer['fillHandle']!.style.display).toBe('none');
    expect(renderer['selectionOverlay'].style.display).toBe('none');
    root.focus();
    expect(selected.style.background).toContain('--ezygrid-selection-soft');
    mouse(renderer.getCellElement(4, 4)!, 'mousedown');
    expect(selected.style.background).toBe('');
  });

  it('clears stale tint in frozen copies and recycled cells', () => {
    const { renderer, sheet } = setup();
    (sheet as typeof sheet & { freezeRows: number }).freezeRows = 1;
    renderer.render();
    renderer.selection.setActive(0, 0);
    renderer.selection.extendTo(1, 1);
    const frozen = renderer['frozenTopEl'].querySelector<HTMLElement>('[data-row="0"][data-col="1"]')!;
    expect(frozen.style.background).toContain('--ezygrid-selection-soft');
    renderer.selection.setActive(4, 4);
    expect(frozen.style.background).toBe('');
    expect(frozen.getAttribute('aria-selected')).toBe('false');
    renderer.scrollTo(50, 0);
    renderer.scrollTo(0, 0);
    expect(renderer.getCellElement(0, 1)!.style.background).toBe('');
  });
});
