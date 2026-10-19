// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createGrid, GridRenderer } from '../src/index.js';

const renderers: GridRenderer[] = [];

afterEach(() => {
  renderers.splice(0).forEach((renderer) => renderer.destroy());
  document.body.replaceChildren();
});

function setup(mode: 'editor' | 'grid' = 'editor') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const workbook = createGrid(host, { worksheets: [{ rows: 20, columns: 10 }] });
  const renderer = new GridRenderer(host, workbook, { mode });
  renderers.push(renderer);
  return { host, renderer, workbook, sheet: workbook.activeWorksheet };
}

function mouse(target: Element, type: string, init: MouseEventInit = {}) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }));
}

function expectOutline(host: HTMLElement, left: number, top: number, width: number, height: number) {
  const outline = host.querySelector<HTMLElement>('.ezygrid-selection')!;
  const handle = host.querySelector<HTMLElement>('.ezygrid-fillhandle')!;
  expect(outline.style.left).toBe(`${left}px`);
  expect(outline.style.top).toBe(`${top}px`);
  expect(outline.style.width).toBe(`${width}px`);
  expect(outline.style.height).toBe(`${height}px`);
  expect(handle.style.left).toBe(`${left + width - 4}px`);
  expect(handle.style.top).toBe(`${top + height - 4}px`);
}

describe('merged-cell selection geometry', () => {
  it.each([
    ['B2:D2', 300, 24],
    ['B2:B4', 100, 72],
    ['B2:D4', 300, 72],
  ] as const)('outlines the complete merge %s on click', (range, width, height) => {
    const { host, renderer, sheet } = setup();
    sheet.merge(range);
    mouse(renderer.getCellElement(1, 1)!, 'mousedown');
    expectOutline(host, 100, 24, width, height);
    expect(renderer.selection.describe()).toBe('B2');
    expect(renderer.selection.state.active).toEqual({ row: 1, column: 1 });
    expect(renderer.selection.state.anchor).toEqual({ row: 1, column: 1 });
    expect(renderer['nameBox']!.value).toBe('B2');
  });

  it('outlines the merge when a covered coordinate is selected programmatically', () => {
    const { host, renderer, sheet } = setup();
    sheet.merge('B2:D4');
    renderer.selection.setActive(2, 2);
    const state = structuredClone(renderer.selection.state);
    renderer.render();
    expectOutline(host, 100, 24, 300, 72);
    expect(renderer.selection.state).toEqual(state);
    expect(renderer.selection.describe()).toBe('C3');
  });

  it('expands a partially intersecting range in every required direction', () => {
    const { host, renderer, sheet } = setup();
    sheet.merge('B2:C3');
    renderer.selection.setActive(2, 2);
    renderer.selection.extendTo(3, 3);
    expectOutline(host, 100, 24, 300, 72);
    expect(renderer.selection.describe()).toBe('C3:D4');
  });

  it('revisits earlier merges when expansion creates another intersection', () => {
    const { host, renderer, sheet } = setup();
    sheet.merge('E1:F2');
    sheet.merge('C3:E3');
    renderer.selection.setActive(0, 0);
    renderer.selection.extendTo(2, 2);
    expectOutline(host, 0, 0, 600, 72);
    expect(renderer.selection.describe()).toBe('A1:C3');
  });

  it.each([0.5, 1, 1.25, 2])('uses custom dimensions and zoom %s', (zoom) => {
    const { host, renderer, sheet } = setup();
    sheet.setColumnWidth(0, 80);
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 160);
    sheet.setRowHeight(0, 30);
    sheet.setRowHeight(1, 40);
    sheet.setRowHeight(2, 50);
    sheet.merge('B2:C3');
    renderer.setZoom(zoom);
    renderer.selection.setActive(1, 1);
    expectOutline(host, 80 * zoom, 30 * zoom, 280 * zoom, 90 * zoom);
  });

  it('refreshes geometry on merge, unmerge, undo and redo', () => {
    const { host, renderer, workbook, sheet } = setup();
    renderer.selection.setActive(1, 1);
    const state = structuredClone(renderer.selection.state);
    sheet.merge('B2:D3');
    expectOutline(host, 100, 24, 300, 48);
    sheet.unmerge('B2:D3');
    expectOutline(host, 100, 24, 100, 24);
    workbook.undo();
    expectOutline(host, 100, 24, 300, 48);
    workbook.redo();
    expectOutline(host, 100, 24, 100, 24);
    expect(renderer.selection.state).toEqual(state);
  });

  it('preserves ordinary geometry and keyboard movement', () => {
    const { host, renderer, sheet } = setup();
    sheet.merge('B2:D2');
    renderer.selection.setActive(1, 1);
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(renderer.selection.describe()).toBe('C2');
    expectOutline(host, 100, 24, 300, 24);
    renderer.selection.setActive(5, 5);
    expectOutline(host, 500, 120, 100, 24);
    renderer.selection.extendTo(6, 6);
    expectOutline(host, 500, 120, 200, 48);
  });

  it('expands preview geometry without changing its logical address or writing data', () => {
    const { host, renderer, workbook, sheet } = setup();
    sheet.setValue(1, 1, 'keep');
    sheet.merge('B2:D2');
    renderer.selection.setActive(1, 1);
    const original = workbook.toJSON();
    mouse(host.querySelector('.ezygrid-fillhandle')!, 'mousedown');
    const preview = host.querySelector<HTMLElement>('.ezygrid-fill-preview')!;
    expect(preview.style.left).toBe('100px');
    expect(preview.style.top).toBe('24px');
    expect(preview.style.width).toBe('300px');
    expect(preview.style.height).toBe('24px');
    expect(renderer['fillRangeLabel'].textContent).toBe('B2:B2');
    const target = renderer.getCellElement(2, 2)!;
    mouse(target, 'mousemove');
    expect(preview.style.width).toBe('300px');
    expect(preview.style.height).toBe('48px');
    expect(renderer['fillRangeLabel'].textContent).toBe('B2:C3');
    expect(renderer['nameBox']!.value).toBe('B2:C3');
    expect(renderer.selection.describe()).toBe('B2');
    expect(workbook.toJSON()).toEqual(original);
    mouse(target, 'mouseup');
    expect(renderer.selection.describe()).toBe('B2:C3');
    expectOutline(host, 100, 24, 300, 48);
    expect(preview.style.display).toBe('none');
    expect(workbook.toJSON()).toEqual(original);
  });
});

describe('merged-cell editing geometry', () => {
  it.each([
    ['B2:D2', 300, 24],
    ['B2:B4', 100, 72],
    ['B2:D4', 300, 72],
  ] as const)('fits the editor to %s', (range, width, height) => {
    const { renderer, sheet } = setup();
    sheet.setValue(1, 1, 'original');
    sheet.merge(range);
    mouse(renderer.getCellElement(1, 1)!, 'mousedown');
    mouse(renderer.getCellElement(1, 1)!, 'dblclick');
    const input = renderer.getEditorInput()!;
    expect(input.value).toBe('original');
    expect(input.style.left).toBe('100px');
    expect(input.style.top).toBe('24px');
    expect(input.style.width).toBe(`${width}px`);
    expect(input.style.height).toBe(`${height}px`);
    expect(Number.parseFloat(input.style.minHeight)).toBe(0);
    expect(Number.parseFloat(input.style.borderRadius)).toBe(0);
    expect(input.style.outlineStyle).toBe('none');
  });

  it('edits and commits the anchor value when F2 starts on a covered coordinate', () => {
    const { renderer, sheet } = setup();
    sheet.setValue(1, 1, 'anchor');
    sheet.merge('B2:D3');
    renderer.selection.setActive(2, 2);
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    const input = renderer.getEditorInput()!;
    expect(input.value).toBe('anchor');
    expect(renderer.editing.session).toMatchObject({ row: 1, column: 1 });
    input.value = 'updated';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(sheet.getValue(1, 1)).toBe('updated');
    expect(sheet.cells.getCell(2, 2)).toBeUndefined();
    expect(renderer.getEditorInput()).toBeNull();
    expect(renderer.selection.describe()).toBe('C3');
  });

  it('preserves the value when typed replacement is cancelled', () => {
    const { renderer, sheet, workbook } = setup();
    sheet.setValue(1, 1, 'keep');
    sheet.merge('B2:D2');
    renderer.selection.setActive(1, 1);
    const original = workbook.toJSON();
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    const input = renderer.getEditorInput()!;
    expect(input.value).toBe('x');
    expect(input.style.width).toBe('300px');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(renderer.getEditorInput()).toBeNull();
    expect(workbook.toJSON()).toEqual(original);
  });

  it.each(['editor', 'grid'] as const)('fits custom dimensions during resize and zoom in %s mode', (mode) => {
    const { renderer, sheet } = setup(mode);
    sheet.setColumnWidth(0, 80);
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 160);
    sheet.setRowHeight(0, 30);
    sheet.setRowHeight(1, 40);
    sheet.setRowHeight(2, 50);
    sheet.merge('B2:C3');
    renderer.setZoom(0.5);
    renderer.selection.setActive(1, 1);
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    const input = renderer.getEditorInput()!;
    expect(input.style.left).toBe('40px');
    expect(input.style.top).toBe('15px');
    expect(input.style.width).toBe('140px');
    expect(input.style.height).toBe('45px');
    sheet.setColumnWidth(2, 200);
    expect(input.style.width).toBe('160px');
    renderer.setZoom(1.25);
    expect(renderer.getEditorInput()).toBe(input);
    expect(input.style.left).toBe('100px');
    expect(input.style.top).toBe('37.5px');
    expect(input.style.width).toBe('400px');
    expect(input.style.height).toBe('112.5px');
  });

  it('sizes dropdown editors to the merge and uses the anchor editor definition', () => {
    const { renderer, sheet } = setup();
    sheet.setCellEditor('B2', 'dropdown', { values: ['low', 'high'] });
    sheet.setValue(1, 1, 'low');
    sheet.merge('B2:D3');
    renderer.selection.setActive(2, 2);
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    const select = renderer.getEditorInput()!;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('low');
    expect(select.style.width).toBe('300px');
    expect(select.style.height).toBe('48px');
    select.value = 'high';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(sheet.getValue(1, 1)).toBe('high');
    expect(renderer.getEditorInput()).toBeNull();
  });

  it('keeps unmerged editors within their cell height', () => {
    const { renderer } = setup();
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    const input = renderer.getEditorInput()!;
    expect(input.style.width).toBe('100px');
    expect(input.style.height).toBe('24px');
    expect(Number.parseFloat(input.style.minHeight)).toBe(0);
  });
});
