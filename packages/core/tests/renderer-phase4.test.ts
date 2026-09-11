// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { GridRenderer, createGrid } from '../src/index.js';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

describe('GridRenderer Phase 4 overlays', () => {
  it('renders chart objects in the media layer', () => {
    const wb = createGrid(container, {
      worksheets: [{
        rows: 100,
        columns: 10,
        data: [['Month', 'Revenue'], ['Jan', 100], ['Feb', 120]],
      }],
    });
    const ws = wb.activeWorksheet;
    ws.addChart({ type: 'column', source: 'A1:B3', firstRowIsHeader: true, anchor: { row: 5, column: 0 }, width: 320, height: 240 });
    const renderer = new GridRenderer(container, wb);
    const charts = [...renderer['mediaLayer']!.querySelectorAll('.ezygrid-chart')];
    expect(charts).toHaveLength(1);
    const svg = charts[0]!.querySelector('svg');
    expect(svg).not.toBeNull();
    renderer.destroy();
  });

  it('renders floating images and shapes', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.addImage({ src: 'data:image/png;base64,x', anchor: { row: 1, column: 1 }, width: 64, height: 64 });
    ws.addShape({ shape: 'rect', text: 'Note', anchor: { row: 3, column: 0 }, width: 100, height: 40, fill: '#ffe' });
    const renderer = new GridRenderer(container, wb);
    const objects = [...renderer['mediaLayer']!.querySelectorAll('.ezygrid-media-object')];
    expect(objects).toHaveLength(2);
    expect(objects[1]!.textContent).toBe('Note');
    renderer.destroy();
  });

  it('conditional formatting is reflected in rendered cell styles', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [[5], [50]] }],
    });
    const ws = wb.activeWorksheet;
    ws.conditionalFormats.add({
      range: 'A1:A2',
      type: 'cellIs',
      operator: 'gt',
      value: 10,
      style: { background: 'red' },
      priority: 1,
    });
    const renderer = new GridRenderer(container, wb);
    expect(renderer.getCellElement(1, 0)!.style.background).toBe('red');
    expect(renderer.getCellElement(0, 0)!.style.background).not.toBe('red');
    renderer.destroy();
  });

  it('structured tables show banded rows', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['H'], ['a'], ['b'], ['c']] }],
    });
    const ws = wb.activeWorksheet;
    ws.addTable({ name: 'T', range: 'A1:A4' });
    const renderer = new GridRenderer(container, wb);
    const b2 = renderer.getCellElement(2, 0)!;
    expect(b2.style.background).not.toBe('');
    renderer.destroy();
  });

  it('structured reference formulas render evaluated results', () => {
    const wb = createGrid(container, {
      worksheets: [{
        rows: 100,
        columns: 10,
        data: [['Region', 'Sales'], ['North', 10], ['South', 20]],
      }],
    });
    const ws = wb.activeWorksheet;
    ws.addTable({ name: 'SalesTable', range: 'A1:B3' });
    ws.setValue(5, 0, '=SUM(SalesTable[Sales])');
    const renderer = new GridRenderer(container, wb);
    expect(renderer.getCellElement(5, 0)?.textContent).toBe('30');
    renderer.destroy();
  });
});
