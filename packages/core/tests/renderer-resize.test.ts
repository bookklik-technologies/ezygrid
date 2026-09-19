// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGrid, GridRenderer } from '../src/index.js';

const renderers: GridRenderer[] = [];
afterEach(() => {
  renderers.splice(0).forEach((renderer) => renderer.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function setup(mode: 'editor' | 'grid' = 'grid', zoom = 1) {
  const host = document.createElement('div');
  document.body.append(host);
  const workbook = createGrid(host, { worksheets: [{ rows: 100, columns: 30 }] });
  const sheet = workbook.activeWorksheet;
  const renderer = new GridRenderer(host, workbook, { mode });
  renderers.push(renderer);
  renderer.setZoom(zoom);
  const scroll = host.querySelector<HTMLElement>('.ezygrid-scroll')!;
  Object.defineProperties(scroll, {
    clientWidth: { configurable: true, value: 400 },
    clientHeight: { configurable: true, value: 240 },
  });
  return { host, workbook, sheet, renderer, scroll };
}

function pointer(target: EventTarget, type: string, x: number, y: number, pointerId = 1, button = 0) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId, button, clientX: x, clientY: y,
  }));
}

function start(host: HTMLElement, axis: 'row' | 'column', index = 0) {
  const handle = host.querySelector<HTMLElement>(`[data-resize-axis="${axis}"][data-resize-index="${index}"]`)!;
  expect(handle).not.toBeNull();
  pointer(handle, 'pointerdown', 100, 100);
  return handle;
}

describe('header drag resizing', () => {
  it.each(['grid', 'editor'] as const)('previews without model mutations and commits one undo step in %s mode', (mode) => {
    const { host, workbook, sheet, renderer } = setup(mode);
    const before = workbook.toJSON();
    const selection = structuredClone(renderer.selection.state);
    const header = host.querySelector<HTMLElement>('.ezygrid-colheader')!;
    const capture = vi.fn();
    Object.assign(header, { setPointerCapture: capture });
    start(host, 'column');
    pointer(document, 'pointermove', 150, 100);
    pointer(document, 'pointermove', 180, 100);
    expect(capture).toHaveBeenCalledWith(1);
    expect(renderer.getCellElement(0, 0)!.style.width).toBe('180px');
    expect(renderer.getCellElement(0, 1)!.style.left).toBe('180px');
    expect(sheet.columnSizes.sizeOf(0)).toBe(100);
    expect(workbook.toJSON()).toEqual(before);
    expect(workbook.canUndo).toBe(false);
    expect(renderer.selection.state).toEqual(selection);
    pointer(document, 'pointerup', 180, 100);
    expect(sheet.columnSizes.sizeOf(0)).toBe(180);
    workbook.undo();
    expect(renderer.getCellElement(0, 0)!.style.width).toBe('100px');
    expect(workbook.canUndo).toBe(false);
    workbook.redo();
    expect(renderer.getCellElement(0, 0)!.style.width).toBe('180px');
  });

  it.each([0.5, 1, 1.25, 2])('resizes custom rows and columns while scrolled at zoom %s', (zoom) => {
    const { host, sheet, renderer, workbook, scroll } = setup('grid', zoom);
    sheet.setColumnWidth(4, 160);
    sheet.setRowHeight(15, 40);
    workbook.history.clear();
    renderer.scrollTo(15, 4);
    start(host, 'column', 4);
    pointer(document, 'pointermove', 100 + 30 * zoom, 100);
    const cell = renderer.getCellElement(15, 4)!;
    const colHeader = host.querySelector<HTMLElement>('[data-resize-axis="column"][data-resize-index="4"]')!.parentElement!;
    expect(cell.style.width).toBe(`${190 * zoom}px`);
    expect(parseFloat(cell.style.left) - scroll.scrollLeft).toBe(parseFloat(colHeader.style.left));
    pointer(document, 'pointerup', 100 + 30 * zoom, 100);
    start(host, 'row', 15);
    pointer(document, 'pointermove', 100, 100 - 10 * zoom);
    expect(renderer.getCellElement(15, 4)!.style.height).toBe(`${30 * zoom}px`);
    pointer(document, 'pointerup', 100, 100 - 10 * zoom);
    expect(sheet.rowSizes.sizeOf(15)).toBe(30);
    expect(sheet.columnSizes.sizeOf(4)).toBe(190);
  });

  it.each(['row', 'column'] as const)('clamps %s shrinking and ignores a click without movement', (axis) => {
    const { host, sheet, workbook } = setup();
    start(host, axis);
    pointer(document, 'pointerup', 100, 100);
    expect(workbook.canUndo).toBe(false);
    start(host, axis);
    pointer(document, 'pointermove', -1000, -1000);
    pointer(document, 'pointerup', -1000, -1000);
    expect(axis === 'row' ? sheet.rowSizes.sizeOf(0) : sheet.columnSizes.sizeOf(0)).toBe(axis === 'row' ? 16 : 24);
  });

  it.each(['escape', 'pointercancel', 'lostcapture', 'blur', 'zoom', 'edit', 'structure', 'sheet', 'destroy'])('cancels safely on %s', (reason) => {
    const { host, sheet, workbook, renderer } = setup();
    const other = workbook.addWorksheet({ rows: 100, columns: 30 });
    workbook.setActiveWorksheet(sheet.id);
    workbook.history.clear();
    start(host, 'column', 1);
    pointer(document, 'pointermove', 170, 100);
    if (reason === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (reason === 'pointercancel') pointer(document, 'pointercancel', 170, 100);
    if (reason === 'lostcapture') pointer(host.querySelector('.ezygrid-colheader')!, 'lostpointercapture', 170, 100);
    if (reason === 'blur') window.dispatchEvent(new Event('blur'));
    if (reason === 'zoom') renderer.setZoom(2);
    if (reason === 'edit') sheet.setValue(0, 0, 'changed');
    if (reason === 'structure') sheet.deleteColumns(0);
    if (reason === 'sheet') workbook.setActiveWorksheet(other.id);
    if (reason === 'destroy') renderer.destroy();
    pointer(document, 'pointermove', 250, 100);
    pointer(document, 'pointerup', 250, 100);
    expect(sheet.columnSizes.getCustomSizes().size).toBe(0);
    expect(other.columnSizes.getCustomSizes().size).toBe(0);
    if (reason !== 'destroy') {
      const root = host.querySelector<HTMLElement>('.ezygrid')!;
      expect(root.style.cursor).not.toBe('col-resize');
      expect(renderer.getCellElement(0, 1)!.style.width).toBe(reason === 'zoom' ? '200px' : '100px');
    }
  });

  it('ignores secondary buttons and other pointers, and releases capture and listeners', () => {
    const { host, workbook, renderer } = setup();
    const header = host.querySelector<HTMLElement>('.ezygrid-rowheader')!;
    const release = vi.fn();
    Object.assign(header, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: release });
    const remove = vi.spyOn(document, 'removeEventListener');
    const handle = host.querySelector<HTMLElement>('[data-resize-axis="row"]')!;
    pointer(handle, 'pointerdown', 100, 100, 1, 2);
    pointer(document, 'pointerup', 100, 160);
    expect(workbook.canUndo).toBe(false);
    start(host, 'row');
    pointer(document, 'pointermove', 100, 200, 2);
    pointer(document, 'pointerup', 100, 200, 2);
    expect(renderer.getCellElement(0, 0)!.style.height).toBe('24px');
    pointer(document, 'pointerup', 100, 130);
    expect(renderer.getCellElement(0, 0)!.style.height).toBe('54px');
    expect(release).toHaveBeenCalledWith(1);
    for (const event of ['pointermove', 'pointerup', 'pointercancel', 'keydown']) {
      expect(remove.mock.calls.some(([name]) => name === event)).toBe(true);
    }
  });

  it('updates merged cells, selection, nested headers, floating objects and scroll extent in preview', () => {
    const { host, sheet, renderer } = setup();
    sheet.merge('A1:B2');
    sheet.setNestedHeaders([[{ title: 'Group', span: 2 }]]);
    sheet.addShape({ shape: 'rect', anchor: { row: 2, column: 2 }, width: 20, height: 20 });
    renderer.selection.setActive(0, 0);
    renderer.selection.extendTo(1, 1);
    renderer.render();
    start(host, 'column');
    pointer(document, 'pointermove', 140, 100);
    expect(renderer.getCellElement(0, 0)!.style.width).toBe('240px');
    expect(host.querySelector<HTMLElement>('.ezygrid-selection')!.style.width).toBe('240px');
    expect(host.querySelector<HTMLElement>('.ezygrid-nestedheader')!.style.width).toBe('240px');
    expect(host.querySelector<HTMLElement>('.ezygrid-media-object')!.style.left).toBe('240px');
    expect(host.querySelector<HTMLElement>('.ezygrid-spacer')!.style.width).toBe('3040px');
    expect(host.querySelector<HTMLElement>('.ezygrid-colheader')!.style.height).toBe('48px');
    pointer(document, 'pointerup', 140, 100);
    start(host, 'row');
    pointer(document, 'pointermove', 100, 120);
    expect(renderer.getCellElement(0, 0)!.style.height).toBe('68px');
    expect(host.querySelector<HTMLElement>('.ezygrid-selection')!.style.height).toBe('68px');
    expect(host.querySelector<HTMLElement>('.ezygrid-media-object')!.style.top).toBe('68px');
  });

  it('keeps frozen headers reachable and frozen dimensions aligned after scrolling', () => {
    const { host, sheet, renderer } = setup();
    sheet.freezeRows = 1;
    sheet.freezeColumns = 1;
    renderer.scrollTo(10, 3);
    const handle = start(host, 'column');
    expect(handle.parentElement!.style.left).toBe('0px');
    pointer(document, 'pointermove', 130, 100);
    const frozenLeft = host.querySelector<HTMLElement>('.ezygrid-frozen-left')!;
    expect(frozenLeft.style.width).toBe('130px');
    expect((frozenLeft.firstElementChild as HTMLElement).style.width).toBe('130px');
    pointer(document, 'pointerup', 130, 100);
    start(host, 'row');
    pointer(document, 'pointermove', 100, 115);
    const frozenTop = host.querySelector<HTMLElement>('.ezygrid-frozen-top')!;
    expect(frozenTop.style.height).toBe('39px');
    expect((frozenTop.firstElementChild as HTMLElement).style.height).toBe('39px');
  });

  it('commits a pending cell edit before resizing and leaves it intact when cancelled', () => {
    const { host, sheet, renderer, workbook } = setup();
    const root = host.querySelector<HTMLElement>('.ezygrid')!;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    renderer.getEditorInput()!.value = 'saved edit';
    start(host, 'column');
    expect(sheet.getValue(0, 0)).toBe('saved edit');
    pointer(document, 'pointermove', 160, 100);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sheet.columnSizes.sizeOf(0)).toBe(100);
    workbook.undo();
    expect(sheet.getValue(0, 0)).toBeNull();
    expect(workbook.canUndo).toBe(false);
  });
});
