// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { GridRenderer, createGrid } from '../src/index.js';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

describe('GridRenderer Phase 2 remainder', () => {
  it('skips hidden rows and columns when rendering', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['a', 'b'], ['c', 'd']] }],
    });
    const ws = wb.activeWorksheet;
    ws.hideRows(1);
    ws.hideColumns(1);
    const renderer = new GridRenderer(container, wb);
    expect(renderer.getCellElement(0, 0)?.textContent).toBe('a');
    expect(renderer.getCellElement(1, 0)).toBeUndefined();
    expect(renderer.getCellElement(0, 1)).toBeUndefined();
    ws.showRows(1);
    ws.showColumns(1);
    renderer.refresh();
    expect(renderer.getCellElement(1, 1)?.textContent).toBe('d');
    renderer.destroy();
  });

  it('renders only filtered rows after setFilter', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [[1], [50], [2]] }],
    });
    const ws = wb.activeWorksheet;
    ws.setFilter(0, (v) => typeof v === 'number' && v < 10);
    const renderer = new GridRenderer(container, wb);
    expect(renderer.getCellElement(0, 0)).toBeDefined();
    expect(renderer.getCellElement(1, 0)).toBeUndefined();
    renderer.destroy();
  });

  it('formula bar shows active address and cell content', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [[42], ['=A1*2']] }],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(1, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(renderer['nameBox']!.value).toBe('A2');
    expect(renderer['formulaInput']!.value).toBe('=A1*2');
    renderer.destroy();
  });

  it('name box navigates to a typed address', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    renderer.navigateToAddress('C4');
    expect(renderer.selection.describe()).toBe('C4');
    renderer.destroy();
  });

  it('formula input commits a value to the active cell', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const input = renderer['formulaInput']!;
    input.value = '=1+2';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(wb.activeWorksheet.getValue(0, 0)).toBe(3);
    renderer.destroy();
  });

  it('zoom scales rendered geometry', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10, data: [['x']] }] });
    const renderer = new GridRenderer(container, wb);
    renderer.setZoom(0.5);
    const cell = renderer.getCellElement(0, 0)!;
    expect(parseFloat(cell.style.width)).toBe(50);
    expect(parseFloat(cell.style.height)).toBe(12);
    expect(renderer.getZoom()).toBe(0.5);
    renderer.destroy();
  });

  it('dropdown editor commits the selected option', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.setCellEditor('A1', 'dropdown', { values: ['low', 'medium', 'high'] });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    const select = renderer.getEditorInput() as unknown as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    select.value = 'medium';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(ws.getValue(0, 0)).toBe('medium');
    renderer.destroy();
  });

  it('number editor restricts input and commits typed numbers', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.setCellEditor('A1:A2', 'number');
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    const input = renderer.getEditorInput()!;
    expect(input.getAttribute('type')).toBe('number');
    input.value = '7.5';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ws.getValue(0, 0)).toBe(7.5);
    renderer.destroy();
  });

  it('checkbox editor toggles immediately on activation', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.setCellEditor('A1', 'checkbox');
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(ws.getValue(0, 0)).toBe(true);
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(ws.getValue(0, 0)).toBe(false);
    renderer.destroy();
  });

  it('date editor uses a date input', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.setCellEditor('A1', 'date');
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    const input = renderer.getEditorInput()!;
    expect(input.getAttribute('type')).toBe('date');
    input.value = '2026-09-11';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ws.getValue(0, 0)).toBe('2026-09-11');
    renderer.destroy();
  });
});
