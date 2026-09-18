// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { GridRenderer, createGrid } from '../src/index.js';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

describe('GridRenderer Phase 2 completion', () => {
  it('applies cell styles to rendered elements', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['styled']] }],
    });
    const ws = wb.activeWorksheet;
    ws.setStyle('A1', { bold: true, italic: true, color: 'red', align: 'center' });
    const renderer = new GridRenderer(container, wb);
    const cell = renderer.getCellElement(0, 0)!;
    expect(cell.style.fontWeight).toBe('bold');
    expect(cell.style.fontStyle).toBe('italic');
    expect(cell.style.color).toBe('red');
    expect(cell.style.textAlign).toBe('center');
    renderer.destroy();
  });

  it('Mod+B toggles bold through the command registry', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['x']] }],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }),
    );
    expect(wb.activeWorksheet.getStyle(0, 0)?.bold).toBe(true);
    renderer['root'].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }),
    );
    expect(wb.activeWorksheet.getStyle(0, 0)?.bold).toBe(false);
    renderer.destroy();
  });

  it('shows note tooltips via title attribute', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['x']] }],
    });
    const ws = wb.activeWorksheet;
    ws.setNote('A1', 'verified');
    const renderer = new GridRenderer(container, wb);
    expect(renderer.getCellElement(0, 0)!.title).toBe('verified');
    renderer.destroy();
  });

  it('renders nested header groups with spans', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 6, data: [[1, 2, 3, 4]] }],
    });
    const ws = wb.activeWorksheet;
    ws.setNestedHeaders([[{ title: 'Financials', span: 2 }, { title: 'Ops', span: 2 }]]);
    const renderer = new GridRenderer(container, wb);
    const labels = [...renderer['colHeaderEl'].children].map((el) => el.textContent);
    expect(labels).toContain('Financials');
    expect(labels).toContain('Ops');
    const financials = [...renderer['colHeaderEl'].children].find(
      (el) => el.textContent === 'Financials',
    ) as HTMLElement;
    expect(parseFloat(financials.style.width)).toBe(200);
    renderer.destroy();
  });

  it('pagination limits rendered rows and pages', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 1000, columns: 10, data: [['p1a'], ['p1b']] }],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.enablePagination(2);
    expect(renderer.getPageCount()).toBe(500);
    expect(renderer.getCellElement(0, 0)?.textContent).toBe('p1a');
    expect(renderer.getCellElement(1, 0)?.textContent).toBe('p1b');
    expect(renderer.getCellElement(2, 0)).toBeUndefined();
    renderer.setPage(1);
    expect(renderer.getPage()).toBe(1);
    renderer.disablePagination();
    expect(renderer.getCellElement(2, 0)).toBeDefined();
    renderer.destroy();
  });

  it('context menu opens on right-click and executes items', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['kill me']] }],
    });
    const renderer = new GridRenderer(container, wb);
    const cell = renderer.getCellElement(0, 0)!;
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = renderer['contextMenuEl']!;
    expect(menu.style.display).toBe('block');
    const clearItem = [...menu.children].find((el) => el.textContent === 'Clear contents') as HTMLElement;
    clearItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(wb.activeWorksheet.getValue(0, 0)).toBeNull();
    expect(menu.style.display).toBe('none');
    renderer.destroy();
  });

  it('toolbar shell renders buttons that execute commands', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['x']] }],
      toolbar: true,
    });
    const renderer = new GridRenderer(container, wb, { mode: 'grid', toolbar: true });
    const boldButton = [...renderer['root'].querySelectorAll('.ezygrid-toolbar-button')].find(
      (b) => b.textContent === 'Bold',
    ) as HTMLButtonElement;
    expect(boldButton).toBeDefined();
    boldButton.click();
    expect(wb.activeWorksheet.getStyle(0, 0)?.bold).toBe(true);
    renderer.destroy();
  });

  it('exposes ARIA grid semantics', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 500, columns: 20, data: [['x']] }],
    });
    const renderer = new GridRenderer(container, wb);
    expect(renderer['root'].getAttribute('role')).toBe('grid');
    expect(renderer['root'].getAttribute('aria-rowcount')).toBe('500');
    expect(renderer['root'].getAttribute('aria-colcount')).toBe('20');
    const cell = renderer.getCellElement(0, 0)!;
    expect(cell.getAttribute('role')).toBe('gridcell');
    renderer.destroy();
  });

  it('supports RTL direction baseline', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 10, columns: 5 }] });
    const renderer = new GridRenderer(container, wb, { direction: 'rtl' });
    expect(renderer['root'].style.direction).toBe('rtl');
    renderer.destroy();
  });

  it('row group collapse hides rows from the DOM projection', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['a'], ['b'], ['c']] }],
    });
    const ws = wb.activeWorksheet;
    ws.groupRows(1, 2);
    ws.collapseGroup(1);
    const renderer = new GridRenderer(container, wb);
    expect(renderer.getCellElement(0, 0)).toBeDefined();
    expect(renderer.getCellElement(1, 0)).toBeUndefined();
    renderer.destroy();
  });
});
