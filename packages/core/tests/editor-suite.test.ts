// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ezygrid, Workbook, type EzygridOptions } from '../src/index.js';
import { workbookFromXlsx, workbookToXlsx } from '../src/xlsx/index.js';

const editors: Ezygrid[] = [];
function mount(options: Partial<EzygridOptions> = {}) {
  const target = document.createElement('div'); document.body.append(target);
  const editor = new Ezygrid({ target, worksheets: [{ rows: 20, columns: 8, data: [['Category', 'Value'], ['A', 2], ['B', 4]] }], ...options });
  editors.push(editor); return editor;
}
function click(editor: Ezygrid, label: string) {
  const element = [...editor.target.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label);
  expect(element, label).toBeDefined(); element!.click();
}
function field(editor: Ezygrid, name: string, value: string) {
  const control = editor.target.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  expect(control, name).not.toBeNull(); control.value = value;
}
function submit(editor: Ezygrid) { editor.target.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
afterEach(() => { editors.splice(0).forEach((editor) => editor.destroy()); document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('full editor suite', () => {
  it('defaults to a complete shell and respects compact and visibility options', () => {
    const editor = mount();
    expect(editor.target.querySelectorAll('[role=tablist]')).toHaveLength(2);
    expect(editor.target.querySelector('[aria-label="Workbook filename"]')).not.toBeNull();
    expect(editor.target.querySelector('[aria-label=Zoom]')).not.toBeNull();
    const compact = mount({ renderer: { mode: 'grid', formulaBar: false } });
    expect(compact.target.querySelector('.ezygrid-suite')).toBeNull();
    expect(compact.target.querySelector('.ezygrid-formulabar')).toBeNull();
    const hidden = mount({ renderer: { formulaBar: false, toolbar: false, topbar: false, sheetTabs: false, statusBar: false } });
    expect(hidden.target.querySelector('.ezygrid-formulabar')).toBeNull();
    expect((hidden.target.querySelector('.ezg-ribbon') as HTMLElement).hidden).toBe(true);
    click(hidden, 'View'); click(hidden, 'Formula bar');
    expect(hidden.target.querySelector('.ezygrid-formulabar')).not.toBeNull();
  });

  it('uses the declarative compact marker', () => {
    const target = document.createElement('div'); target.dataset.ezgEditor = ''; target.dataset.ezgMode = 'grid'; document.body.append(target);
    const [editor] = Ezygrid.initAll(target); editors.push(editor!);
    expect(target.querySelector('.ezygrid-suite')).toBeNull();
  });

  it('switches sheets, restores selection, and updates plugin context', () => {
    const disposed = vi.fn(); const setup = vi.fn(() => disposed);
    const editor = mount({ extensions: [{ name: 'observer', setup }] });
    const first = editor.workbook.activeWorksheet;
    editor.renderer.navigateToAddress('B3');
    click(editor, 'Add worksheet');
    const second = editor.workbook.activeWorksheet;
    expect(second.id).not.toBe(first.id);
    expect(setup.mock.calls).toHaveLength(2);
    editor.renderer.navigateToAddress('C4');
    editor.workbook.setActiveWorksheet(first.id);
    expect(editor.renderer.selection.state.active).toEqual({ row: 2, column: 1 });
    editor.workbook.setActiveWorksheet(second.id);
    expect(editor.renderer.selection.state.active).toEqual({ row: 3, column: 2 });
    expect(disposed).toHaveBeenCalledTimes(3);
  });

  it('formats through the ribbon and restores formatting on undo', () => {
    const editor = mount();
    click(editor, 'Bold'); click(editor, 'Wrap');
    const size = editor.target.querySelector<HTMLInputElement>('[aria-label="Font size"]')!;
    size.value = '22'; size.dispatchEvent(new Event('change'));
    expect(editor.workbook.activeWorksheet.getStyle(0, 0)).toMatchObject({ bold: true, wrap: true, fontSize: 22 });
    expect(editor.renderer.getCellElement(0, 0)!.style.fontSize).toBe('22px');
    click(editor, 'Undo');
    expect(editor.workbook.activeWorksheet.getStyle(0, 0)?.fontSize).toBeUndefined();
    click(editor, 'Redo');
    expect(editor.workbook.activeWorksheet.getStyle(0, 0)?.fontSize).toBe(22);
  });

  it('keeps editor inputs separate from spreadsheet shortcuts', () => {
    const editor = mount();
    click(editor, 'Find and replace');
    const query = editor.target.querySelector<HTMLInputElement>('[name=query]')!;
    query.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    expect(editor.workbook.activeWorksheet.getValue(0, 0)).toBe('Category');
    field(editor, 'query', 'A'); field(editor, 'replacement', 'Changed'); field(editor, 'action', 'Replace all'); submit(editor);
    expect(editor.workbook.activeWorksheet.getValue(1, 0)).toBe('Changed');
  });

  it('configures charts and persists their stable ids', () => {
    const editor = mount(); click(editor, 'Insert'); click(editor, 'Charts'); click(editor, 'Insert chart');
    field(editor, 'range', 'A1:B3'); field(editor, 'title', 'Sales'); submit(editor);
    const chart = editor.workbook.activeWorksheet.charts.all()[0]!;
    expect(chart.title).toBe('Sales'); expect(editor.target.querySelector('.ezygrid-chart')).not.toBeNull();
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.charts.all()).toHaveLength(0);
    editor.workbook.redo(); expect(editor.workbook.activeWorksheet.charts.all()[0]!.id).toBe(chart.id);
  });

  it('configures numeric validation and keeps errors from changing cells', () => {
    const editor = mount(); click(editor, 'Data'); click(editor, 'Validation'); click(editor, 'Add validation');
    field(editor, 'range', 'B2:B3'); field(editor, 'min', '0'); field(editor, 'max', '10'); submit(editor);
    const sheet = editor.workbook.activeWorksheet;
    expect(sheet.setValue(1, 1, 20)).toBeNull(); expect(sheet.getValue(1, 1)).toBe(2);
    editor.workbook.undo(); expect(sheet.validations.all()).toHaveLength(0);
  });

  it('applies conditional formatting and serializable filters', () => {
    const editor = mount(); click(editor, 'Data'); click(editor, 'Conditional formatting'); click(editor, 'Add rule');
    field(editor, 'range', 'B2:B3'); field(editor, 'value', '3'); submit(editor);
    expect(editor.workbook.activeWorksheet.conditionalFormats.evaluate(editor.workbook.activeWorksheet, 2, 1).background).toBe('#e6fff4');
    click(editor, 'Filters'); field(editor, 'column', '2'); field(editor, 'operator', 'gt'); field(editor, 'value', '2'); submit(editor);
    const restored = Workbook.fromJSON(editor.workbook.toJSON());
    expect(restored.activeWorksheet.isRowHidden(1)).toBe(true);
    expect(restored.activeWorksheet.isRowHidden(2)).toBe(false);
  });

  it('cleans up shell, dialogs, and listeners while allowing another mount', () => {
    const editor = mount(); const target = editor.target;
    click(editor, 'Export'); expect(target.querySelector('[role="menu"]')).not.toBeNull();
    editor.destroy(); expect(target.children).toHaveLength(0);
    const next = new Ezygrid({ target }); editors.push(next);
    expect(target.querySelectorAll('.ezygrid-suite')).toHaveLength(1);
  });
});

describe('document and format compatibility', () => {
  it('loads transactionally without replacing the workbook and rejects invalid files', () => {
    const workbook = new Workbook({ worksheets: [{ data: [[2]] }] }); const listener = vi.fn(); workbook.onOperation(listener);
    expect(() => workbook.loadJSON({ version: 100 })).toThrow(); expect(workbook.activeWorksheet.getValue(0, 0)).toBe(2);
    const next = new Workbook({ filename: 'Budget', worksheets: [{ data: [[7, '=A1*2']] }] });
    workbook.loadJSON(next.toJSON());
    expect(workbook.filename).toBe('Budget'); expect(workbook.activeWorksheet.getValue(0, 1)).toBe(14);
    workbook.activeWorksheet.setValue(0, 0, 3); expect(workbook.activeWorksheet.getValue(0, 1)).toBe(6);
    expect(listener).toHaveBeenCalled(); expect(workbook.canUndo).toBe(true);
  });

  it('rolls back failed advanced operations and preserves runtime predicates', () => {
    const workbook = new Workbook({ worksheets: [{ data: [[2]] }] }); const sheet = workbook.activeWorksheet;
    const predicate = (value: unknown) => Number(value) > 0;
    sheet.addValidation({ range: 'A1', type: 'custom', action: 'reject', predicate });
    expect(() => workbook.transaction(() => { sheet.setValue(0, 0, 5); throw new Error('failure'); })).toThrow('failure');
    expect(sheet.getValue(0, 0)).toBe(2); expect(workbook.canUndo).toBe(false);
    workbook.transaction(() => sheet.setStyle('A1', { bold: true })); workbook.undo();
    expect(sheet.validations.all()[0]!.predicate).toBe(predicate);
    expect(sheet.setValue(0, 0, -1)).toBeNull();
  });

  it('round-trips basic formatting and styled empty cells in Excel files', async () => {
    const workbook = new Workbook({ worksheets: [{ rows: 20, columns: 8, data: [[42]] }] }); const sheet = workbook.activeWorksheet;
    const style: import('../src/workbook.js').CellStyle = { fontFamily: 'Georgia', fontSize: 22, bold: true, italic: true, underline: true, color: '#123456', background: '#abcdef', wrap: true, align: 'center', verticalAlign: 'middle', borders: { bottom: { color: '#ff0000', width: 2, style: 'solid' } } };
    sheet.setStyle('A1:C3', style); sheet.setNumberFormat('A1', '0.00'); sheet.rowSizes.setSize(0, 48); sheet.columnSizes.setSize(0, 140);
    const restored = await workbookFromXlsx(workbookToXlsx(workbook));
    expect(restored.activeWorksheet.getStyle(0, 0)).toMatchObject(style);
    expect(restored.activeWorksheet.getStyle(2, 2)).toMatchObject(style);
    expect(restored.activeWorksheet.getNumberFormat(0, 0)).toBe('0.00');
    expect(restored.activeWorksheet.rowSizes.sizeOf(0)).toBe(48); expect(restored.activeWorksheet.columnSizes.sizeOf(0)).toBe(140);
    expect(restored.canUndo).toBe(false);
  });
});
