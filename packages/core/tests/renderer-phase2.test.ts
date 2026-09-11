// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { GridRenderer, createGrid } from '../src/index.js';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

describe('GridRenderer Phase 2 features', () => {
  it('skips covered merge cells and spans the anchor', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['title']] }],
    });
    const ws = wb.activeWorksheet;
    ws.merge('A1:B2');
    const renderer = new GridRenderer(container, wb);
    expect(renderer.getCellElement(1, 1)).toBeUndefined();
    const anchor = renderer.getCellElement(0, 0)!;
    expect(parseFloat(anchor.style.width)).toBe(200);
    expect(parseFloat(anchor.style.height)).toBe(48);
    renderer.destroy();
  });

  it('clicking a covered merge cell selects the anchor', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['title']] }],
    });
    const ws = wb.activeWorksheet;
    ws.merge('A1:B2');
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    // simulate a click on the covered cell via a fresh element carrying data attributes
    const covered = document.createElement('div');
    covered.dataset.row = '1';
    covered.dataset.col = '1';
    renderer['cellLayer'].appendChild(covered);
    covered.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(renderer.selection.describe()).toBe('A1');
    renderer.destroy();
  });

  it('formats displayed numbers with the cell mask', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [[1234.5]] }],
    });
    const ws = wb.activeWorksheet;
    ws.setNumberFormat('A1', '#,##0.00');
    const renderer = new GridRenderer(container, wb);
    expect(renderer.getCellElement(0, 0)?.textContent).toBe('1,234.50');
    renderer.destroy();
  });

  it('fill handle drag down extends a numeric series', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [[2], [4]] }],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer.getCellElement(1, 0)!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, shiftKey: true }),
    );
    renderer['fillHandle']!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const target = renderer.getCellElement(4, 0)!;
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const ws = wb.activeWorksheet;
    expect(ws.getValue(2, 0)).toBe(6);
    expect(ws.getValue(3, 0)).toBe(8);
    expect(ws.getValue(4, 0)).toBe(10);
    renderer.destroy();
  });

  it('fill handle drag right extends a series', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [[1, 3]] }],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer.getCellElement(0, 1)!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, shiftKey: true }),
    );
    renderer['fillHandle']!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer.getCellElement(0, 4)!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const ws = wb.activeWorksheet;
    expect(ws.getValue(0, 2)).toBe(5);
    expect(ws.getValue(0, 3)).toBe(7);
    expect(ws.getValue(0, 4)).toBe(9);
    renderer.destroy();
  });

  it('Mod+D fills the selection down', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [[5]] }],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(1, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }),
    );
    const ws = wb.activeWorksheet;
    expect(ws.getValue(1, 0)).toBe(5);
    renderer.destroy();
  });

  it('fill handle is positioned on the selection corner', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const handle = renderer['fillHandle']!;
    expect(handle.style.display).toBe('block');
    expect(parseInt(handle.style.left)).toBeGreaterThan(0);
    renderer.destroy();
  });
});
