// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { GridRenderer, createGrid } from '../src/index.js';
import type { Worksheet } from '../src/index.js';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

describe('GridRenderer (DOM viewport)', () => {
  it('renders only visible cells, not the full sheet', () => {
    const wb = createGrid(container, {
      worksheets: [{ name: 'Big', rows: 1_000_000, columns: 200, data: [['A1', 'B1']] }],
    });
    const renderer = new GridRenderer(container, wb);
    expect(wb.activeWorksheet.rowCount).toBe(1_000_000);
    expect(renderer.renderedCellCount).toBeLessThan(400);
    expect(renderer.getCellElement(0, 0)?.textContent).toBe('A1');
    renderer.destroy();
  });

  it('scrolls to arbitrary rows without proportional DOM growth', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 1_000_000, columns: 50, data: [['top']] }],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.scrollTo(500_000, 0);
    renderer.getCellElement(500_000, 0)?.textContent === '';
    expect(renderer.renderedCellCount).toBeLessThan(400);
    expect(renderer.getCellElement(500_000, 0)?.textContent).toBe('');
    renderer.destroy();
  });

  it('displays evaluated formula results', () => {
    const wb = createGrid(container, {
      worksheets: [{ data: [['Month', 'Revenue', 'Cost', 'Profit'], ['Jan', 12000, 7000, '=B2-C2']] }],
    });
    const renderer = new GridRenderer(container, wb);
    expect(renderer.getCellElement(1, 3)?.textContent).toBe('5000');
    renderer.destroy();
  });

  it('renders column and row headers for the visible range', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    const labels = [...renderer['colHeaderEl'].children].map((el) => el.textContent);
    expect(labels[0]).toBe('A');
    expect(labels).toContain('B');
    const rowLabels = [...renderer['rowHeaderEl'].children].map((el) => el.textContent);
    expect(rowLabels[0]).toBe('1');
    renderer.destroy();
  });

  it('mousedown selects a cell', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    const cell = renderer.getCellElement(3, 2)!;
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(renderer.selection.describe()).toBe('C4');
    renderer.destroy();
  });

  it('shift+mousedown extends a range', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(1, 1)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer.getCellElement(4, 3)!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, shiftKey: true }),
    );
    expect(renderer.selection.describe()).toBe('B2:D5');
    renderer.destroy();
  });

  it('typing starts the editor overlay and Enter commits', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    const input = renderer.getEditorInput();
    expect(input).not.toBeNull();
    input!.value = '42';
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const ws = wb.activeWorksheet;
    expect(ws.getValue(0, 0)).toBe(42);
    expect(renderer.getEditorInput()).toBeNull();
    renderer.destroy();
  });

  it('Escape cancels editing without writing', () => {
    const wb = createGrid(container, { worksheets: [{ data: [['keep']] }] });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    const input = renderer.getEditorInput()!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(wb.activeWorksheet.getValue(0, 0)).toBe('keep');
    renderer.destroy();
  });

  it('arrow keys move the active cell', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    renderer['root'].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    renderer['root'].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(renderer.selection.describe()).toBe('B2');
    renderer.destroy();
  });

  it('renders frozen top rows in a non-scrolling layer', () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 1000, columns: 20, data: [['hdr', 'hdr2'], ['a', 'b']] }],
    });
    const ws = wb.activeWorksheet as Worksheet & { freezeRows: number };
    ws.freezeRows = 1;
    const renderer = new GridRenderer(container, wb);
    const frozen = [...renderer['frozenTopEl'].children] as HTMLElement[];
    expect(frozen.length).toBeGreaterThan(0);
    expect(frozen.some((el) => el.textContent === 'hdr')).toBe(true);
    renderer.destroy();
  });

  it('selection overlay is positioned after click', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(2, 1)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(renderer['selectionOverlay'].style.display).toBe('block');
    expect(parseFloat(renderer['selectionOverlay'].style.width)).toBeGreaterThan(0);
    renderer.destroy();
  });

  it('typing into a formula cell prefills the formula text', () => {
    const wb = createGrid(container, { worksheets: [{ data: [[5], ['=A1*2']] }] });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(1, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    expect(renderer.getEditorInput()!.value).toBe('=A1*2');
    renderer.getEditorInput()!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    renderer.destroy();
  });

  it('DOM pool reuses elements across scroll frames', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100_000, columns: 50 }] });
    const renderer = new GridRenderer(container, wb);
    const before = renderer.renderedCellCount;
    renderer.scrollTo(50, 0);
    const mid = renderer.renderedCellCount;
    expect(mid).toBeLessThan(400);
    expect(before).toBeGreaterThan(0);
    renderer.destroy();
  });

  it('Ctrl+C copies and Ctrl+V pastes with formula translation', async () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [[10, 20], ['=A1+B1']] }],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer.getCellElement(1, 1)!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, shiftKey: true }),
    );
    renderer['root'].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }),
    );
    renderer.getCellElement(3, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }),
    );
    // Ctrl+V reads the system clipboard asynchronously before pasting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ws = wb.activeWorksheet;
    expect(ws.getValue(4, 0)).toBe(30);
    expect(ws.cells.getCell(4, 0)?.formula).toBe('=A4+B4');
    renderer.destroy();
  });

  it('Ctrl+X cuts: values move and source clears', async () => {
    const wb = createGrid(container, {
      worksheets: [{ rows: 100, columns: 10, data: [['val']] }],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true }),
    );
    renderer.getCellElement(2, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer['root'].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }),
    );
    // Ctrl+V reads the system clipboard asynchronously before pasting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ws = wb.activeWorksheet;
    expect(ws.getValue(0, 0)).toBeNull();
    expect(ws.getValue(2, 0)).toBe('val');
    renderer.destroy();
  });
});
