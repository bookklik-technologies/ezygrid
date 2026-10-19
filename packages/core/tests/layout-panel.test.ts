// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ezygrid, Workbook } from '../src/index.js';
import { fittedSizes, readHeaderGroups, shiftHeaderGroups, writeHeaderGroups } from '../src/ui/layout-actions.js';

const editors: Ezygrid[] = [];
function mount() {
  const target = document.createElement('div'); document.body.append(target);
  const editor = new Ezygrid({ target, worksheets: [{ rows: 12, columns: 12, data: [['Item', 'Amount'], ['Apple', 2], ['Pear', 5]] }] });
  editors.push(editor); return editor;
}
function click(editor: Ezygrid, label: string) {
  const control = editor.target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? Array.from(editor.target.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent === label)!;
  expect(control, label).not.toBeNull(); control.click(); return control;
}
function open(editor: Ezygrid, _label = 'Rows and columns') { click(editor, 'Layout'); }
function select(editor: Ezygrid, label: string, value: string) {
  const control = editor.target.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
}
function field(editor: Ezygrid, label: string, value: string, index = 0) {
  const control = editor.target.querySelectorAll<HTMLInputElement>(`input[aria-label="${label}"]`)[index]!;
  expect(control, label).toBeDefined(); control.value = value; control.dispatchEvent(new Event('input', { bubbles: true })); return control;
}
function header(editor: Ezygrid, axis: 'row' | 'column', index: number, shiftKey = false) {
  editor.target.querySelector(`[data-${axis}-header="${index}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey, button: 0 }));
}
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('selection-aware worksheet layout', () => {
  it('keeps legacy command IDs and icon-only layout actions available without a sidebar', () => {
    const editor = mount(); const context = { workbook: editor.workbook, worksheet: editor.workbook.activeWorksheet, selection: editor.renderer.selection };
    editor.renderer.commands.execute('panel.layout', context);
    expect(editor.target.querySelector('aside')).toBeNull();
    for (const control of editor.target.querySelectorAll('.ezg-ribbon button')) {
      expect(control.textContent).toBe(''); expect(control.querySelector('svg')).not.toBeNull();
    }
    editor.renderer.commands.execute('panel.headers', context);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Add header level');
    expect(editor.target.querySelector<HTMLSelectElement>('[aria-label="Header level"]')?.selectedOptions[0]?.textContent).toBe('No levels');
  });
  it('selects whole headers and extends from their anchor without affecting resize-handle clicks', () => {
    const editor = mount();
    header(editor, 'row', 1); header(editor, 'row', 3, true);
    expect(editor.renderer.selection.primary).toEqual({ top: 1, bottom: 3, left: 0, right: 11 });
    header(editor, 'column', 2); header(editor, 'column', 4, true);
    expect(editor.renderer.selection.primary).toEqual({ top: 0, bottom: 11, left: 2, right: 4 });
    const before = structuredClone(editor.renderer.selection.state);
    editor.target.querySelector('[data-resize-axis="column"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(editor.renderer.selection.state).toEqual(before);
  });

  it('exposes both axes directly in the ribbon and follows selection without opening a sidebar', () => {
    const editor = mount(); header(editor, 'column', 1); header(editor, 'column', 3, true); open(editor);
    expect(editor.target.querySelector('[aria-label="Columns"] .ezg-layout-target')?.textContent).toBe('Columns B–D · 3 columns');
    expect(editor.target.querySelector('aside')).toBeNull();
    expect(editor.target.querySelector('[aria-label="Rows"] [aria-label="Insert above"]')).not.toBeNull();
    expect(editor.target.querySelector<HTMLButtonElement>('[aria-label="Delete rows"]')?.disabled).toBe(true);
    editor.renderer.selection.setActive(2, 1); editor.renderer.selection.extendTo(4, 2);
    expect(editor.target.querySelector('.ezg-layout-target')?.textContent).toBe('Rows 3–5 · 3 rows');
    editor.renderer.selection.addRange(8, 8);
    expect(editor.target.querySelector<HTMLButtonElement>('[aria-label="Insert above"]')?.disabled).toBe(true);
    expect(editor.target.querySelector('.ezg-ribbon-error')?.textContent).toContain('one continuous range');
  });

  it('inserts the selected number below directly from the ribbon and undoes in one step', () => {
    const editor = mount(); editor.renderer.selection.setActive(1, 0); editor.renderer.selection.extendTo(2, 1); open(editor);
    click(editor, 'Insert below');
    expect(editor.workbook.activeWorksheet.rowCount).toBe(14);
    expect(editor.workbook.activeWorksheet.getValue(1, 0)).toBe('Apple');
    expect(editor.target.querySelector('aside')).toBeNull();
    expect(editor.target.querySelector('[aria-label="Insert below"]')).not.toBeNull();
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.rowCount).toBe(12);
    expect(editor.workbook.canUndo).toBe(false); expect(editor.target.querySelector('aside')).toBeNull();
    editor.workbook.redo(); expect(editor.workbook.activeWorksheet.rowCount).toBe(14);
  });

  it('shows mixed sizes, rejects invalid sizes, and avoids no-op history', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet; open(editor);
    click(editor, 'Apply row height'); expect(editor.workbook.canUndo).toBe(false);
    field(editor, 'Row height (px)', '0'); click(editor, 'Apply row height');
    expect(editor.target.querySelector('[aria-label="Rows"] [role=status]')?.textContent).toContain('16 to 2000');
    expect(sheet.rowSizes.sizeOf(0)).toBe(24);
    sheet.setRowHeight(1, 48); editor.workbook.history.clear();
    editor.renderer.selection.setActive(0, 0); editor.renderer.selection.extendTo(1, 1);
    expect(editor.target.querySelector<HTMLInputElement>('[aria-label="Row height (px)"]')?.placeholder).toBe('Mixed');
    field(editor, 'Row height (px)', '40'); click(editor, 'Apply row height');
    expect(sheet.rowSizes.sizeOf(0)).toBe(40); expect(sheet.rowSizes.sizeOf(1)).toBe(40);
    editor.workbook.undo(); expect(sheet.rowSizes.sizeOf(0)).toBe(24); expect(sheet.rowSizes.sizeOf(1)).toBe(48);
    expect(editor.workbook.canUndo).toBe(false);
  });

  it('hides and restores contiguous hidden ranges, preserving a visible band', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    editor.renderer.selection.setActive(1, 0); editor.renderer.selection.extendTo(2, 1); open(editor); click(editor, 'Hide rows');
    expect([...sheet.hiddenRows]).toEqual([1, 2]);
    click(editor, 'Show hidden rows'); click(editor, 'Show rows 2–3'); expect(sheet.hiddenRows.size).toBe(0);
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.hiddenRows.size).toBe(2);
    open(editor); click(editor, 'Show hidden rows'); click(editor, 'Show all hidden rows');
    expect(editor.workbook.activeWorksheet.hiddenRows.size).toBe(0);
    editor.renderer.selection.selectAll();
    expect(editor.target.querySelector<HTMLButtonElement>('[aria-label="Hide rows"]')?.disabled).toBe(true);
    expect(editor.target.querySelector<HTMLButtonElement>('[aria-label="Delete rows"]')?.disabled).toBe(true);
  });

  it('preserves unchanged fractional sizes without rounding or adding history', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    sheet.setRowHeight(0, 31.1); editor.workbook.history.clear(); open(editor);
    expect(editor.target.querySelector<HTMLInputElement>('[aria-label="Row height (px)"]')?.value).toBe('31.1');
    click(editor, 'Apply row height'); expect(editor.workbook.canUndo).toBe(false);
    expect(sheet.rowSizes.getCustomSizes().get(0)).toBe(31.1);
  });

  it('fits formatted content with effective fonts, wrapping, empty bands, and zoom-independent geometry', () => {
    const measured: string[] = []; const fonts: string[] = [];
    const context = { font: '', measureText(text: string) { measured.push(text); fonts.push(this.font); return { width: text.length * 10 }; } };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    sheet.setValue(0, 1, 12.5); sheet.setNumberFormat('B1', '0.00'); sheet.setStyle('B1', { italic: true, bold: true, fontSize: 20 });
    sheet.setValue(1, 1, 'ignore this merged text'); sheet.merge('B2:C2');
    sheet.setValue(2, 0, 'a\nbbbbbbbbbbbbbbbbbbbb'); sheet.setStyle('A3', { wrap: true }); sheet.setColumnWidth(0, 60);
    const sizes = fittedSizes(sheet, 'column', 1, 1, document, 'Arial');
    expect(sizes.get(1)).toBe(66); expect(measured).toContain('12.50'); expect(measured).not.toContain('ignore this merged text');
    expect(fonts).toContain('italic bold 20px Arial');
    editor.renderer.setZoom(2);
    expect(fittedSizes(sheet, 'column', 1, 1, document, 'Arial')).toEqual(sizes);
    expect(fittedSizes(sheet, 'row', 2, 2, document, 'Arial').get(2)).toBeGreaterThan(80);
    sheet.setColumnWidth(8, 180);
    expect(fittedSizes(sheet, 'column', 8, 8, document, 'Arial').get(8)).toBe(100);
  });

  it('updates on sheet changes and isolates multiple editors without sidebar subscriptions', () => {
    const first = mount(); const second = mount(); open(first); open(second);
    first.workbook.setActiveWorksheet(first.workbook.addWorksheet().id);
    expect(first.target.querySelector('aside')).toBeNull();
    expect(second.target.querySelector('[aria-label="Insert above"]')).not.toBeNull();
    first.destroy(); second.renderer.selection.setActive(4, 2);
    expect(second.target.querySelector('.ezg-layout-target')?.textContent).toBe('Rows 5 · 1 row');
  });
});

describe('grouped header drafts', () => {
  it('preserves drafts when reselecting Layout and cleans popovers when leaving it or destroying', () => {
    const editor = mount(); open(editor); click(editor, 'Add header level'); field(editor, 'Header label', 'Draft');
    click(editor, 'Preview grouped headers'); field(editor, 'Header label', 'Live draft');
    expect(editor.target.querySelector('.ezg-headers-preview')?.textContent).toContain('Live draft');
    click(editor, 'Layout'); expect(editor.target.querySelector<HTMLInputElement>('[aria-label="Header label"]')?.value).toBe('Live draft');
    click(editor, 'Home'); expect(editor.target.querySelector('[role=dialog]')).toBeNull();
    open(editor); expect(editor.target.querySelector<HTMLInputElement>('[aria-label="Header label"]')?.disabled).toBe(true);
    click(editor, 'Preview grouped headers'); editor.destroy(); expect(document.querySelector('.ezg-ribbon-preview-popup')).toBeNull();
  });
  it('previews ribbon edits without changing cells or headers and cancels cleanly', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    sheet.setNestedHeaders([['Original', { title: 'Later', span: 2 }]]); editor.workbook.history.clear();
    const before = editor.workbook.toJSON(); open(editor, 'Grouped headers');
    field(editor, 'Header label', 'Draft'); click(editor, 'Preview grouped headers');
    expect(editor.target.querySelector('.ezg-headers-preview')?.textContent).toContain('Draft');
    expect(editor.workbook.toJSON()).toEqual(before); click(editor, 'Cancel header changes');
    expect(editor.workbook.toJSON()).toEqual(before); expect(editor.workbook.canUndo).toBe(false);
  });

  it('saves gaps and multiple levels as one persistent action and rejects overlap', () => {
    const editor = mount(); open(editor, 'Grouped headers'); click(editor, 'Add header level');
    field(editor, 'To column', 'D'); field(editor, 'From column', 'B'); field(editor, 'Header label', 'Revenue');
    click(editor, 'Add header group');
    field(editor, 'From column', 'C'); field(editor, 'To column', 'E');
    expect(editor.target.querySelector<HTMLButtonElement>('[aria-label="Save headers"]')?.disabled).toBe(true);
    expect(editor.target.querySelector('[aria-label="Grouped headers"] [role=status]')?.textContent).toContain('overlap');
    click(editor, 'Remove header group'); click(editor, 'Add header level');
    field(editor, 'Header label', 'Quarter'); click(editor, 'Save headers');
    const headers = editor.workbook.activeWorksheet.nestedHeaders;
    expect(headers[0]).toEqual([{ title: '', span: 1 }, { title: 'Revenue', span: 3 }]);
    expect(headers).toHaveLength(2); expect(editor.workbook.activeWorksheet.getValue(0, 0)).toBe('Item');
    expect(Workbook.fromJSON(editor.workbook.toJSON()).activeWorksheet.nestedHeaders).toEqual(headers);
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.nestedHeaders).toHaveLength(0); expect(editor.workbook.canUndo).toBe(false);
    editor.workbook.redo(); expect(editor.workbook.activeWorksheet.nestedHeaders).toEqual(headers);
  });

  it('preserves unchanged schema, navigates the preview, reorders levels, and clears all levels', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    sheet.setNestedHeaders([['A'], [{ title: 'B', span: 2 }]]); editor.workbook.history.clear();
    open(editor, 'Grouped headers'); click(editor, 'Save headers');
    expect(sheet.nestedHeaders[0]).toEqual(['A']); expect(editor.workbook.canUndo).toBe(false);
    open(editor, 'Grouped headers'); click(editor, 'Preview grouped headers'); click(editor, 'Next columns');
    expect(editor.target.querySelector('.ezg-headers-paging')?.textContent).toContain('I–L');
    select(editor, 'Header level', '1'); click(editor, 'Move header level up'); click(editor, 'Save headers');
    expect(sheet.nestedHeaders[0]).toEqual([{ title: 'B', span: 2 }]);
    open(editor, 'Grouped headers'); click(editor, 'Remove header level'); click(editor, 'Remove header level'); click(editor, 'Save headers');
    expect(sheet.nestedHeaders).toHaveLength(0);
  });

  it('keeps loaded invalid spans uncommitted until corrected', () => {
    const editor = mount(); editor.workbook.activeWorksheet.setNestedHeaders([[{ title: 'Too far', span: 20 }]]);
    open(editor, 'Grouped headers'); expect(editor.target.querySelector<HTMLButtonElement>('[aria-label="Save headers"]')?.disabled).toBe(true);
    field(editor, 'To column', 'B'); expect(editor.target.querySelector<HTMLButtonElement>('[aria-label="Save headers"]')?.disabled).toBe(false);
    click(editor, 'Cancel header changes'); expect(editor.workbook.activeWorksheet.nestedHeaders[0]?.[0]).toEqual({ title: 'Too far', span: 20 });
  });

  it('updates headers together with column edits and restores both with one undo', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    sheet.setNestedHeaders([[{ title: 'Revenue', span: 3 }, { title: 'Costs', span: 2 }]]); editor.workbook.history.clear();
    header(editor, 'column', 1); open(editor); click(editor, 'Insert left');
    expect(sheet.nestedHeaders[0]).toEqual([{ title: 'Revenue', span: 4 }, { title: 'Costs', span: 2 }]);
    expect(sheet.columnCount).toBe(13);
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.columnCount).toBe(12);
    expect(editor.workbook.activeWorksheet.nestedHeaders[0]?.[0]).toEqual({ title: 'Revenue', span: 3 });
    expect(editor.workbook.canUndo).toBe(false);
    editor.workbook.redo(); expect(editor.workbook.activeWorksheet.nestedHeaders[0]?.[0]).toEqual({ title: 'Revenue', span: 4 });
  });

  it('restores a fully deleted header group and its cell data in one undo', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    sheet.setNestedHeaders([[{ title: 'Inventory', span: 2 }]]); editor.workbook.history.clear();
    header(editor, 'column', 0); header(editor, 'column', 1, true); open(editor); click(editor, 'Delete columns');
    expect(sheet.nestedHeaders[0]).toEqual([]); expect(sheet.columnCount).toBe(10);
    editor.workbook.undo();
    expect(editor.workbook.activeWorksheet.nestedHeaders[0]).toEqual([{ title: 'Inventory', span: 2 }]);
    expect(editor.workbook.activeWorksheet.getValue(1, 0)).toBe('Apple'); expect(editor.workbook.canUndo).toBe(false);
  });

  it('discards header drafts on sheet changes and document replacement', () => {
    const editor = mount(); open(editor, 'Grouped headers'); click(editor, 'Add header level');
    const snapshot = editor.workbook.toJSON(); editor.workbook.loadJSON(snapshot);
    expect(editor.target.querySelector('aside')).toBeNull(); expect(editor.workbook.activeWorksheet.nestedHeaders).toHaveLength(0);
    open(editor, 'Grouped headers'); click(editor, 'Add header level');
    editor.workbook.setActiveWorksheet(editor.workbook.addWorksheet().id);
    expect(editor.target.querySelector('aside')).toBeNull();
  });
});

describe('header range conversion and structural transforms', () => {
  it('encodes gaps and validates addresses and level-local overlap', () => {
    const cards = [[{ label: 'X', from: 'C', to: 'D' }], [{ label: 'Y', from: 'A', to: 'D' }]];
    expect(writeHeaderGroups(cards, 5)[0]).toEqual([{ title: '', span: 2 }, { title: 'X', span: 2 }]);
    expect(readHeaderGroups([['Q1', { title: 'Q2', span: 2 }]])[0]?.[1]).toEqual({ label: 'Q2', from: 'B', to: 'C' });
    expect(() => writeHeaderGroups([[{ label: '', from: 'C', to: 'B' }]], 5)).toThrow('valid');
    expect(() => writeHeaderGroups([[{ label: '', from: 'A1', to: 'B' }]], 5)).toThrow('valid');
  });
  it.each([
    [0, 1, true, [{ title: '', span: 1 }, { title: 'A', span: 3 }, { title: 'B', span: 2 }]],
    [1, 2, true, [{ title: 'A', span: 5 }, { title: 'B', span: 2 }]],
    [3, 1, true, [{ title: 'A', span: 3 }, { title: '', span: 1 }, { title: 'B', span: 2 }]],
    [1, 1, false, [{ title: 'A', span: 2 }, { title: 'B', span: 2 }]],
    [0, 3, false, [{ title: 'B', span: 2 }]],
    [0, 5, false, []],
  ] as const)('transforms header ranges at %s, count %s, insertion %s', (at, count, insert, expected) => {
    expect(shiftHeaderGroups([[{ title: 'A', span: 3 }, { title: 'B', span: 2 }]], at, count, insert)[0]).toEqual(expected);
  });
});
