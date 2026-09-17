// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { GridRenderer, createGrid } from '../src/index.js';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

function beginFormulaEdit(renderer: GridRenderer, formula: string, row = 0, _col = 0): HTMLInputElement {
  renderer.getCellElement(row, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  renderer['root'].dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
  const input = renderer.getEditorInput()!;
  input.value = formula;
  input.setSelectionRange(formula.length, formula.length);
  return input;
}

describe('Formula editor UX (§11.4, §14.7)', () => {
  it('F4 cycles the last reference through absolute states', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    const input = beginFormulaEdit(renderer, '=A1*B2');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true, cancelable: true }));
    expect(input.value).toBe('=A1*$B$2');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true, cancelable: true }));
    expect(input.value).toBe('=A1*B$2');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true, cancelable: true }));
    expect(input.value).toBe('=A1*$B2');
    renderer.getEditorInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    renderer.destroy();
  });

  it('clicking a cell while editing a formula inserts its reference', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    const input = beginFormulaEdit(renderer, '=1+');
    renderer.getCellElement(2, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(input.value).toBe('=1+A3');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    renderer.destroy();
  });

  it('shows function suggestions while typing', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    const input = beginFormulaEdit(renderer, '=SU');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(renderer['suggestionEl']).not.toBeNull();
    const items = [...renderer['suggestionEl']!.children].map((el) => el.textContent);
    expect(items.some((t) => t!.startsWith('SUM'))).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    renderer.destroy();
  });

  it('Tab completes the top suggestion', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    const input = beginFormulaEdit(renderer, '=ROU');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(input.value.startsWith('=ROUND(')).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    renderer.destroy();
  });

  it('committed formulas with LET evaluate through the model', () => {
    const wb = createGrid(container, { worksheets: [{ rows: 100, columns: 10 }] });
    const renderer = new GridRenderer(container, wb);
    const input = beginFormulaEdit(renderer, '=LET(x, 6, x*7)');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(wb.activeWorksheet.getValue(0, 0)).toBe(42);
    renderer.destroy();
  });
});
