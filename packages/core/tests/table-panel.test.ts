// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Ezygrid, Workbook } from '../src/index.js';

const editors: Ezygrid[] = [];
function mount() {
  const target = document.createElement('div'); document.body.append(target);
  const editor = new Ezygrid({ target, worksheets: [{ rows: 30, columns: 12, data: [['Item', 'Quantity'], ['Apples', 2], ['Pears', 5]] }] });
  editors.push(editor); return editor;
}
function click(editor: Ezygrid, label: string) {
  const control = editor.target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  expect(control, label).not.toBeNull(); control.click();
}
function open(editor: Ezygrid) { click(editor, 'Data'); click(editor, 'Format as table'); }
function field(editor: Ezygrid, name: string, value: string | boolean) {
  const control = editor.target.querySelector<HTMLInputElement>(`.ezg-table-body [name="${name}"]`)!;
  if (typeof value === 'boolean') control.checked = value; else control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true })); return control;
}
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); document.body.replaceChildren(); });

describe('table formatting dialog', () => {
  it('detects connected data, previews its values, and cancels without changing selection or history', () => {
    const editor = mount(); editor.renderer.selection.setActive(1, 1);
    const before = editor.workbook.toJSON(); const selection = structuredClone(editor.renderer.selection.state);
    open(editor);
    expect(editor.target.querySelector('.ezg-table-selection')?.textContent).toContain('3 rows × 2 columns');
    expect(editor.target.querySelector('.ezg-table-preview th')?.textContent).toBe('Item');
    expect(editor.target.querySelector('.ezg-table-preview')?.textContent).toContain('Apples');
    expect(editor.target.querySelector<HTMLDetailsElement>('.ezg-object-advanced')?.open).toBe(false);
    field(editor, 'header', false);
    expect(editor.target.querySelectorAll('.ezg-table-preview th')).toHaveLength(0);
    click(editor, 'Cancel');
    expect(editor.workbook.toJSON()).toEqual(before);
    expect(editor.renderer.selection.state).toEqual(selection);
    expect(editor.workbook.canUndo).toBe(false);
  });

  it('uses an explicit selection and creates a persistent table in one undo step without rewriting values', () => {
    const editor = mount(); editor.renderer.selection.setActive(0, 0); editor.renderer.selection.extendTo(2, 0);
    open(editor); click(editor, 'Create table');
    const sheet = editor.workbook.activeWorksheet;
    const table = sheet.tables.all()[0]!;
    expect(table.range).toEqual({ top: 0, left: 0, bottom: 2, right: 0 });
    expect(sheet.getValue(1, 0)).toBe('Apples'); expect(sheet.getValue(1, 1)).toBe(2);
    expect(editor.target.querySelector('aside')).toBeNull();
    expect(Workbook.fromJSON(editor.workbook.toJSON()).activeWorksheet.tables.all()[0]?.id).toBe(table.id);
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.tables.all()).toHaveLength(0);
    expect(editor.workbook.canUndo).toBe(false);
    editor.workbook.redo(); expect(editor.workbook.activeWorksheet.tables.all()[0]?.id).toBe(table.id);
  });

  it('skips occupied formula names and rejects a custom name collision', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    editor.workbook.setDefinedName('Table1', { type: 'value', value: 7 });
    sheet.addTable({ name: 'table2', range: 'D1:E3' });
    open(editor);
    expect(editor.target.querySelector<HTMLInputElement>('[name=name]')?.value).toBe('Table3');
    field(editor, 'name', 'TABLE1');
    expect(editor.target.querySelector<HTMLButtonElement>('[aria-label="Create table"]')?.disabled).toBe(true);
    expect(editor.target.querySelector('.ezg-object-error')?.textContent).toContain('already used');
    field(editor, 'name', ''); click(editor, 'Create table');
    expect(sheet.getTable('Table3')).toBeDefined();
    sheet.setValue(0, 5, '=SUM(Table3[Quantity])'); expect(sheet.getValue(0, 5)).toBe(7);
  });

  it('opens the containing table, preserves its ID on edits, and removes formatting without clearing data', () => {
    const editor = mount(); open(editor); click(editor, 'Create table');
    const id = editor.workbook.activeWorksheet.tables.all()[0]!.id;
    editor.renderer.selection.setActive(1, 1); open(editor);
    expect(editor.target.querySelector('dialog[open]')?.getAttribute('aria-label')).toBe('Table options');
    field(editor, 'total', true); click(editor, 'Save changes');
    expect(editor.workbook.activeWorksheet.tables.all()[0]).toMatchObject({ id, totalRow: true });
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.tables.all()[0]).toMatchObject({ id, totalRow: false });
    editor.workbook.redo(); expect(editor.workbook.activeWorksheet.tables.all()[0]).toMatchObject({ id, totalRow: true });
    open(editor); click(editor, 'Remove table');
    expect(editor.workbook.activeWorksheet.tables.all()).toHaveLength(0);
    expect(editor.workbook.activeWorksheet.getValue(1, 0)).toBe('Apples');
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.tables.all()[0]?.id).toBe(id);
  });

  it('does not create history for unchanged options and respects explicit header formatting', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    sheet.setStyle('B1', { bold: false });
    sheet.addTable({ name: 'Stock', range: 'A1:B3' }); editor.renderer.render();
    editor.workbook.history.clear();
    expect(editor.renderer.getCellElement(0, 0)?.style.fontWeight).toBe('bold');
    expect(editor.renderer.getCellElement(0, 1)?.style.fontWeight).not.toBe('bold');
    open(editor);
    expect(editor.target.querySelectorAll<HTMLElement>('.ezg-table-preview th')[1]?.style.fontWeight).toBe('normal');
    const before = editor.workbook.toJSON(); click(editor, 'Save changes');
    expect(editor.workbook.toJSON()).toEqual(before); expect(editor.workbook.canUndo).toBe(false);
  });

  it('reports empty, overlapping, and header-only ranges before allowing creation', () => {
    const editor = mount(); editor.workbook.activeWorksheet.addTable({ name: 'Existing', range: 'D1:E3' });
    open(editor); field(editor, 'range', 'A1:E3');
    expect(editor.target.querySelector('.ezg-object-error')?.textContent).toContain('already belong');
    field(editor, 'range', 'H1:I3');
    expect(editor.target.querySelector('.ezg-object-error')?.textContent).toContain('containing data');
    field(editor, 'range', 'A1:B1');
    expect(editor.target.querySelector('.ezg-object-error')?.textContent).toContain('below the column titles');
    field(editor, 'header', false);
    expect(editor.target.querySelector<HTMLButtonElement>('[aria-label="Create table"]')?.disabled).toBe(false);
    editor.renderer.selection.setActive(1, 0); editor.renderer.selection.extendTo(2, 1); click(editor, 'Use selected cells');
    expect(editor.target.querySelector<HTMLInputElement>('[name=range]')?.value).toBe('A2:B3');
    editor.workbook.addWorksheet(); editor.workbook.setActiveWorksheet(editor.workbook.worksheets[1]!.id);
    expect(editor.target.querySelector('aside')).toBeNull();
  });
});
