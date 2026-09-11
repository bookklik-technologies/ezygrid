// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createGrid, GridRenderer } from '../src/index.js';

const renderers: GridRenderer[] = [];

afterEach(() => {
  renderers.splice(0).forEach((renderer) => renderer.destroy());
  document.body.replaceChildren();
});

function setup(zoom = 1) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const workbook = createGrid(host, { worksheets: [{ rows: 200, columns: 50 }] });
  const sheet = workbook.activeWorksheet;
    sheet.rowSizes.setSize(2, 41);
  sheet.columnSizes.setSize(1, 137);
  const renderer = new GridRenderer(host, workbook, { overscanRows: 0, overscanColumns: 0 });
  renderers.push(renderer);
  const scroll = host.querySelector<HTMLElement>('.ezygrid-scroll')!;
  Object.defineProperties(scroll, {
    clientHeight: { configurable: true, value: 240 },
    clientWidth: { configurable: true, value: 350 },
  });
  renderer.setZoom(zoom);
  return { host, sheet, renderer, scroll };
}

describe('scrolled grid alignment', () => {
  it.each([0.5, 1, 1.25, 2])('aligns headers and cells and covers the viewport at zoom %s', (zoom) => {
    const { host, sheet, renderer, scroll } = setup(zoom);
    scroll.scrollTop = sheet.rowSizes.offsetOf(15) * zoom + 7.5;
    scroll.scrollLeft = sheet.columnSizes.offsetOf(3) * zoom + 12.5;
    scroll.dispatchEvent(new Event('scroll'));

    const cellLayer = host.querySelector<HTMLElement>('.ezygrid-cells')!;
    expect(cellLayer.style.position).toBe('absolute');
    expect(cellLayer.style.top).toBe('0px');
    expect(cellLayer.style.left).toBe('0px');
    for (const header of host.querySelectorAll<HTMLElement>('.ezygrid-rowheader-label')) {
      const row = Number(header.textContent) - 1;
      const cell = renderer.getCellElement(row, 3)!;
      expect(cell).toBeDefined();
      // Headers are outside the scroller; cells also receive native scrolling.
      expect(parseFloat(cell.style.top) - scroll.scrollTop).toBeCloseTo(parseFloat(header.style.top));
      expect(cell.style.height).toBe(header.style.height);
    }
    const columnHeader = Array.from(host.querySelectorAll<HTMLElement>('.ezygrid-colheader-label'))
      .find((header) => header.textContent === 'D')!;
    const firstCell = renderer.getCellElement(15, 3)!;
    expect(parseFloat(firstCell.style.left) - scroll.scrollLeft).toBeCloseTo(parseFloat(columnHeader.style.left));
    expect(firstCell.style.width).toBe(columnHeader.style.width);

    const lastRow = sheet.rowSizes.indexAt((scroll.scrollTop + scroll.clientHeight - 0.01) / zoom);
    const lastColumn = sheet.columnSizes.indexAt((scroll.scrollLeft + scroll.clientWidth - 0.01) / zoom);
    expect(renderer.getCellElement(lastRow, lastColumn)).toBeDefined();
    expect(renderer.getCellElement(lastRow + 1, lastColumn)).toBeUndefined();
    expect(renderer.getCellElement(lastRow, lastColumn + 1)).toBeUndefined();
  });

  it('keeps selection, corner preview, editor and floating objects anchored after scrolling', () => {
    const { host, sheet, renderer, scroll } = setup(1.25);
    renderer.scrollTo(15, 3);
    renderer.selection.setActive(16, 4);
    const cell = renderer.getCellElement(16, 4)!;
    const overlay = host.querySelector<HTMLElement>('.ezygrid-selection')!;
    expect(overlay.style.top).toBe(cell.style.top);
    expect(overlay.style.left).toBe(cell.style.left);
    const handle = host.querySelector<HTMLElement>('.ezygrid-fillhandle')!;
    expect(parseFloat(handle.style.top)).toBe(parseFloat(cell.style.top) + parseFloat(cell.style.height) - 4);
    expect(parseFloat(handle.style.left)).toBe(parseFloat(cell.style.left) + parseFloat(cell.style.width) - 4);
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const destination = renderer.getCellElement(18, 5)!;
    destination.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    const preview = host.querySelector<HTMLElement>('.ezygrid-fill-preview')!;
    expect(preview.style.top).toBe(cell.style.top);
    expect(preview.style.left).toBe(cell.style.left);
    destination.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    renderer.selection.setActive(16, 4);
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    const editor = renderer.getEditorInput()!;
    expect(editor.style.top).toBe(cell.style.top);
    expect(editor.style.left).toBe(cell.style.left);
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    sheet.addShape({ shape: 'rect', anchor: { row: 16, column: 4 }, width: 80, height: 30 });
    renderer.render();
    const shape = host.querySelector<HTMLElement>('.ezygrid-media-object')!;
    expect(shape.style.top).toBe(cell.style.top);
    expect(shape.style.left).toBe(cell.style.left);
    scroll.scrollTop += 5;
    scroll.dispatchEvent(new Event('scroll'));
    expect(renderer.getCellElement(16, 4)!.style.top).toBe(editor.style.top);
  });

  it.each([0.5, 1.25, 2])('navigates to offscreen cells using scaled scroll distances at zoom %s', (zoom) => {
    const { sheet, renderer, scroll } = setup(zoom);
    renderer.navigateToAddress('J41');
    const cell = renderer.getCellElement(40, 9)!;
    expect(cell).toBeDefined();
    expect(scroll.scrollTop).toBeCloseTo(sheet.rowSizes.offsetOf(41) * zoom - scroll.clientHeight);
    expect(scroll.scrollLeft).toBeCloseTo(sheet.columnSizes.offsetOf(10) * zoom - scroll.clientWidth);
    expect(parseFloat(cell.style.top) - scroll.scrollTop).toBeGreaterThanOrEqual(0);
    renderer.navigateToAddress('D16');
    expect(scroll.scrollTop).toBeCloseTo(sheet.rowSizes.offsetOf(15) * zoom);
    expect(scroll.scrollLeft).toBeCloseTo(sheet.columnSizes.offsetOf(3) * zoom);
    expect(renderer.getCellElement(15, 3)).toBeDefined();
  });

  it('refreshes visible columns when zoom changes before a scroll event', () => {
    const { host, renderer } = setup();
    renderer.scrollTo(30, 8);
    renderer.setZoom(2);
    expect(renderer.getCellElement(14, 3)).toBeDefined();
    expect(host.querySelector('.ezygrid-colheader-label')?.textContent).toBe('D');
  });
});
