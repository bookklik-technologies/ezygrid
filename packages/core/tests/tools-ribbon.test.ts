// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Ezygrid } from '../src/index.js';

const editors: Ezygrid[] = [];
function mount(renderer = {}) {
  const target = document.createElement('div'); document.body.append(target);
  const editor = new Ezygrid({ target, renderer, worksheets: [{ rows: 30, columns: 12, data: [['Item', 'Count'], ['B', 2], ['A', 4]] }] });
  editors.push(editor); return editor;
}
function control<T extends HTMLElement = HTMLButtonElement>(editor: Ezygrid, label: string): T {
  const item = editor.target.querySelector<T>(`[aria-label="${label}"]`);
  expect(item, label).not.toBeNull(); return item!;
}
function click(editor: Ezygrid, label: string) {
  const button = editor.target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button, label).not.toBeNull(); button!.click();
}
function change(editor: Ezygrid, label: string, value: string | boolean) {
  const input = control<HTMLInputElement>(editor, label);
  if (typeof value === 'boolean') input.checked = value; else input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
function run(editor: Ezygrid, id: string) {
  editor.renderer.commands.execute(id, { workbook: editor.workbook, worksheet: editor.workbook.activeWorksheet, selection: editor.renderer.selection });
}
function activeTab(editor: Ezygrid) { return editor.target.querySelector('.ezg-tabs [aria-selected=true]')?.textContent; }
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); document.body.replaceChildren(); });

describe('ribbon tools', () => {
  it('keeps legacy commands and Find shortcuts routed to direct controls', () => {
    const editor = mount();
    for (const [id, tab, label] of [['notes', 'Review', 'Note'], ['freeze', 'View', 'Leading rows'], ['pagination', 'View', 'Enable pagination'], ['filters', 'Data', 'Filter condition'], ['groups', 'Data', 'Group rows'], ['functions', 'Formulas', 'Search functions'], ['find', 'Home', 'Find']]) {
      if (id === 'groups') editor.renderer.navigateToAddress('A1:A2');
      run(editor, `panel.${id}`);
      expect(activeTab(editor)).toBe(tab);
      expect(document.activeElement).toBe(control(editor, label!));
      expect(editor.target.querySelector('aside,dialog')).toBeNull();
    }
    click(editor, 'Collapse ribbon');
    editor.target.querySelector('[role=grid]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(control<HTMLElement>(editor, 'Spreadsheet tools').hidden).toBe(false);
    expect(document.activeElement).toBe(control(editor, 'Find'));
    run(editor, 'panel.validation');
    expect(editor.target.querySelector('dialog[open]')?.getAttribute('aria-label')).toBe('Validation');
    expect(editor.target.querySelector('aside')).toBeNull();
  });

  it('focuses the ribbon group when a legacy command targets a disabled action', () => {
    const editor = mount();
    run(editor, 'panel.filters'); expect(document.activeElement).toBe(control(editor, 'Filter condition'));
    run(editor, 'panel.groups');
    expect(control<HTMLButtonElement>(editor, 'Group rows').disabled).toBe(true);
    expect(document.activeElement).toBe(editor.target.querySelector('[role=group][aria-label="Row groups"]'));
    expect(activeTab(editor)).toBe('Data');
    expect(editor.target.querySelector('dialog,aside')).toBeNull();
  });

  it('applies number formatting to the selected range as one reversible action', () => {
    const editor = mount(); editor.renderer.selection.setActive(1, 1); editor.renderer.selection.extendTo(2, 1);
    change(editor, 'Number format', '0.00');
    expect(editor.workbook.activeWorksheet.getNumberFormat(1, 1)).toBe('0.00');
    expect(editor.workbook.activeWorksheet.getNumberFormat(2, 1)).toBe('0.00');
    editor.workbook.undo();
    expect(editor.workbook.activeWorksheet.getNumberFormat(1, 1)).toBeUndefined();
    expect(editor.workbook.canUndo).toBe(false);
  });

  it('reveals object tools without taking focus and returns to the last standard tab on deletion', () => {
    const editor = mount({ toolbar: false }); click(editor, 'Insert'); click(editor, 'Rectangle');
    const ref = editor.renderer.objects.selected!;
    expect(activeTab(editor)).toBe('Shape');
    expect(document.activeElement?.getAttribute('data-object-id')).toBe(ref.id);
    expect(editor.target.querySelector('dialog,aside')).toBeNull();
    change(editor, 'Text', 'Updated');
    expect(editor.renderer.objects.get(ref)).toMatchObject({ text: 'Updated' });
    editor.workbook.undo();
    expect(editor.renderer.objects.get(ref)).toMatchObject({ text: '' });
    expect(control<HTMLInputElement>(editor, 'Text').value).toBe('');
    click(editor, 'Delete shape');
    expect(activeTab(editor)).toBe('Insert');
    expect(control(editor, 'Shape').hidden).toBe(true);
  });

  it('only commits a Properties draft on Apply and restores a cancelled preview', () => {
    const editor = mount(); click(editor, 'Insert'); click(editor, 'Rectangle');
    const ref = editor.renderer.objects.selected!;
    click(editor, 'Properties');
    const input = editor.target.querySelector<HTMLInputElement>('dialog [name=text]')!;
    input.value = 'Draft'; input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.renderer.objects.get(ref)).toMatchObject({ text: '' });
    click(editor, 'Cancel');
    expect(editor.target.querySelector('.ezygrid-object-content')?.textContent).toBe('');
    click(editor, 'Properties');
    const draft = editor.target.querySelector<HTMLInputElement>('dialog [name=text]')!;
    draft.value = 'Saved'; draft.dispatchEvent(new Event('change', { bubbles: true }));
    click(editor, 'Apply changes');
    expect(editor.renderer.objects.get(ref)).toMatchObject({ text: 'Saved' });
    expect(editor.target.querySelector('dialog')).toBeNull();
    editor.workbook.undo(); expect(editor.renderer.objects.get(ref)).toMatchObject({ text: '' });
  });

  it('makes Table available without activation and preserves its identity through changes', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    sheet.addTable({ name: 'Items', range: 'A1:B3' }); editor.renderer.render();
    const id = sheet.tables.all()[0]!.id;
    expect(activeTab(editor)).toBe('Home'); expect(control(editor, 'Table').hidden).toBe(false);
    click(editor, 'Table'); change(editor, 'Table name', 'Renamed');
    expect(sheet.getTable('Renamed')?.id).toBe(id);
    editor.workbook.undo(); expect(sheet.getTable('Items')?.id).toBe(id);
    editor.renderer.selection.extendTo(4, 3);
    expect(control(editor, 'Table').hidden).toBe(true); expect(activeTab(editor)).toBe('Home');
  });

  it('sorts a selected data range below its header and restores it on undo', () => {
    const editor = mount();
    editor.renderer.selection.setActive(2, 1); editor.renderer.selection.extendTo(0, 0);
    click(editor, 'Data'); click(editor, 'Sort ascending');
    const sheet = editor.workbook.activeWorksheet;
    expect(sheet.getValue(0, 0)).toBe('Item');
    expect(sheet.getValue(1, 0)).toBe('A'); expect(sheet.getValue(1, 1)).toBe(4);
    editor.workbook.undo(); expect(sheet.getValue(1, 0)).toBe('B');
    expect(sheet.getValue(2, 1)).toBe(4);
  });

  it('keeps table tools hidden when another selected range is outside the table', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    sheet.addTable({ name: 'Items', range: 'A1:B3' });
    editor.renderer.selection.addRange(5, 4);
    expect(control(editor, 'Table').hidden).toBe(true);
  });

  it('resets invalid drafts on sheet changes and isolates editor instances', () => {
    const first = mount(); const second = mount();
    run(first, 'panel.charts'); expect(first.target.querySelector('dialog[open]')).not.toBeNull();
    run(second, 'panel.validation');
    const sheet = first.workbook.addWorksheet(); first.workbook.setActiveWorksheet(sheet.id);
    expect(first.target.querySelector('dialog')).toBeNull();
    expect(second.target.querySelector('dialog[open]')).not.toBeNull();
    first.destroy(); editors.splice(editors.indexOf(first), 1);
    expect(second.target.querySelector('dialog[open]')).not.toBeNull();
  });

  it('does not overwrite a focused input during repaint and refreshes after undo', () => {
    const editor = mount(); click(editor, 'Insert'); click(editor, 'Rectangle');
    const ref = editor.renderer.objects.selected!;
    const text = control<HTMLInputElement>(editor, 'Text'); text.focus(); text.value = 'Typing';
    editor.renderer.render(); expect(text.value).toBe('Typing');
    text.dispatchEvent(new Event('change', { bubbles: true })); text.blur();
    editor.workbook.undo(); expect(control<HTMLInputElement>(editor, 'Text').value).toBe('');
    expect(editor.renderer.objects.get(ref)).toMatchObject({ text: '' });
  });

  it('applies freeze counts together and reports pagination even when only one page exists', () => {
    const editor = mount(); click(editor, 'View');
    control<HTMLInputElement>(editor, 'Leading rows').value = '2';
    control<HTMLInputElement>(editor, 'Leading columns').value = '1';
    click(editor, 'Apply freeze panes');
    expect(editor.workbook.activeWorksheet.freezeRows).toBe(2);
    expect(editor.workbook.activeWorksheet.freezeColumns).toBe(1);
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.freezeRows).toBe(0);
    expect(editor.workbook.activeWorksheet.freezeColumns).toBe(0);
    editor.renderer.enablePagination(30);
    expect(control<HTMLInputElement>(editor, 'Enable pagination').checked).toBe(true);
    expect(control<HTMLInputElement>(editor, 'Rows per page').value).toBe('30');
    change(editor, 'Rows per page', '10'); click(editor, 'Next page');
    expect(editor.renderer.getPage()).toBe(1);
  });

  it('keeps grid mode free of editor chrome', () => {
    const editor = mount({ mode: 'grid' });
    expect(editor.target.querySelector('.ezg-ribbon,.ezg-tabs,dialog,aside')).toBeNull();
  });

  it('preserves multiline notes and applies them to the selected range in one action', () => {
    const editor = mount(); editor.renderer.navigateToAddress('A1:B2'); click(editor, 'Review');
    control<HTMLTextAreaElement>(editor, 'Note').value = 'First line\nSecond line';
    click(editor, 'Save note');
    expect(editor.workbook.activeWorksheet.getNote(0, 0)).toBe('First line\nSecond line');
    expect(editor.workbook.activeWorksheet.getNote(1, 1)).toBe('First line\nSecond line');
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.getNote(0, 0)).toBeUndefined();
    expect(editor.workbook.canUndo).toBe(false);
  });
});
