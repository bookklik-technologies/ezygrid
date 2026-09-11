// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createGrid, GridRenderer } from '../src/index.js';

const renderers: GridRenderer[] = [];

afterEach(() => {
  renderers.splice(0).forEach((renderer) => renderer.destroy());
  document.body.replaceChildren();
});

function setup(data: unknown[][] = [[10, '=A1*2'], ['other']]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const workbook = createGrid(host, { worksheets: [{ rows: 100, columns: 10, data }] });
  const renderer = new GridRenderer(host, workbook);
  renderers.push(renderer);
  const input = host.querySelector<HTMLInputElement>('.ezygrid-formulainput')!;
  return { workbook, sheet: workbook.activeWorksheet, renderer, input };
}

function type(input: HTMLInputElement, text: string) {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function key(input: HTMLInputElement, value: string, extra: KeyboardEventInit = {}) {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra }));
}

describe('formula bar editing', () => {
  it('commits numeric text on Enter and repaints the cell and its dependents', () => {
    const { renderer, sheet, input } = setup();
    type(input, '25');
    key(input, 'Enter');
    expect(sheet.getValue(0, 0)).toBe(25);
    expect(sheet.getValue(0, 1)).toBe(50);
    expect(renderer.getCellElement(0, 0)?.textContent).toBe('25');
    expect(renderer.getCellElement(0, 1)?.textContent).toBe('50');
    expect(input.value).toBe('25');
  });

  it('commits a formula on blur and keeps its expression in the formula bar', () => {
    const { renderer, sheet, input } = setup();
    type(input, '=SUM(2,3)');
    input.blur();
    expect(sheet.cells.getCell(0, 0)?.formula).toBe('=SUM(2,3)');
    expect(sheet.getValue(0, 0)).toBe(5);
    expect(renderer.getCellElement(0, 1)?.textContent).toBe('10');
    expect(input.value).toBe('=SUM(2,3)');
  });

  it('commits to the original cell when mousedown changes selection before blur', () => {
    const { renderer, sheet, input } = setup();
    type(input, 'updated');
    renderer.getCellElement(1, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(sheet.getValue(0, 0)).toBe('updated');
    expect(sheet.getValue(1, 0)).toBe('other');
    expect(renderer.selection.describe()).toBe('A2');
    expect(input.value).toBe('other');
    expect(renderer.getCellElement(0, 0)?.textContent).toBe('updated');
  });

  it('commits when focus moves outside the grid', () => {
    const { sheet, input } = setup();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    type(input, 'edited outside');
    outside.focus();
    expect(sheet.getValue(0, 0)).toBe('edited outside');
  });

  it('preserves the draft and caret during rerenders, scrolling, and unrelated edits', () => {
    const { renderer, sheet, input } = setup();
    type(input, '=A2+');
    input.setSelectionRange(2, 2);
    renderer.render();
    sheet.setValue(3, 3, 42);
    renderer.scrollTo(30, 0);
    expect(input.value).toBe('=A2+');
    expect(input.selectionStart).toBe(2);
    expect(sheet.getValue(0, 0)).toBe(10);
    input.value = '=2+3';
    key(input, 'Enter');
    expect(sheet.getValue(0, 0)).toBe(5);
  });

  it('commits to the original cell on a programmatic selection change', () => {
    const { renderer, sheet, input } = setup();
    type(input, '21');
    renderer.selection.setActive(1, 0);
    expect(sheet.getValue(0, 0)).toBe(21);
    expect(sheet.getValue(1, 0)).toBe('other');
    expect(input.value).toBe('other');
    input.blur();
    expect(sheet.getValue(1, 0)).toBe('other');
  });

  it('cancels with Escape without committing again on blur', () => {
    const { workbook, sheet, input } = setup();
    type(input, 'discard');
    key(input, 'Escape');
    input.blur();
    expect(sheet.getValue(0, 0)).toBe(10);
    expect(input.value).toBe('10');
    expect(workbook.canUndo).toBe(false);
  });

  it.each([false, true])('commits with Tab and moves in the requested direction (shift=%s)', (shiftKey) => {
    const { renderer, sheet, input } = setup();
    renderer.selection.setActive(1, 1);
    type(input, '42');
    key(input, 'Tab', { shiftKey });
    expect(sheet.getValue(1, 1)).toBe(42);
    expect(renderer.selection.describe()).toBe(shiftKey ? 'A2' : 'C2');
  });

  it.each([['', null], ['true', true], ['false', false], ['text', 'text']])('parses editor text %s consistently', (text, expected) => {
    const { sheet, input } = setup();
    type(input, String(text));
    key(input, 'Enter');
    expect(sheet.getValue(0, 0)).toBe(expected);
  });

  it('does not create history for focus and blur without an edit', () => {
    const { workbook, input } = setup();
    input.focus();
    input.blur();
    expect(workbook.canUndo).toBe(false);
  });

  it('does not commit Enter while an IME composition is in progress', () => {
    const { sheet, input } = setup();
    type(input, 'composing');
    key(input, 'Enter', { isComposing: true });
    expect(sheet.getValue(0, 0)).toBe(10);
    key(input, 'Enter');
    expect(sheet.getValue(0, 0)).toBe('composing');
  });

  it('preserves the old value for rejected validation and malformed formulas', () => {
    const { sheet, input } = setup();
    type(input, '=1+');
    key(input, 'Enter');
    expect(sheet.getValue(0, 0)).toBe(10);
    expect(input.value).toBe('10');
    sheet.addValidation({ range: 'A1', type: 'number', action: 'reject', min: 0, max: 100 });
    type(input, '-1');
    input.blur();
    expect(sheet.getValue(0, 0)).toBe(10);
  });

  it('discards pending text when the renderer is destroyed', () => {
    const { renderer, sheet, input } = setup();
    type(input, 'discard on destroy');
    renderer.destroy();
    input.dispatchEvent(new FocusEvent('blur'));
    expect(sheet.getValue(0, 0)).toBe(10);
  });
});
