// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ezygrid, Workbook } from '../src/index.js';

const editors: Ezygrid[] = [];
function mount() {
  const target = document.createElement('div'); document.body.append(target);
  const editor = new Ezygrid({ target, worksheets: [{ rows: 40, columns: 20, data: [['Category', 'Value'], ['A', 2], ['B', 5]] }] });
  editors.push(editor); return editor;
}
function click(editor: Ezygrid, label: string) {
  const scope = editor.target.querySelector('dialog[open]') ?? editor.target;
  const control = scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  expect(control, label).not.toBeNull(); control.click();
}
function field(editor: Ezygrid, name: string, value: string, event = 'input') {
  const input = editor.target.querySelector<HTMLInputElement>(`.ezg-object-body [name="${name}"]`)!;
  expect(input, name).not.toBeNull(); input.value = value; input.dispatchEvent(new Event(event, { bubbles: true })); return input;
}
function pointer(target: EventTarget, type: string, x: number, y: number, pointerId = 1) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId, clientX: x, clientY: y }));
}
function shape(editor: Ezygrid) {
  const sheet = editor.workbook.activeWorksheet;
  const id = sheet.addShape({ shape: 'rect', text: 'Object', anchor: { row: 3, column: 2 }, width: 160, height: 100 });
  const ref = { worksheetId: sheet.id, kind: 'shape' as const, id };
  return { ref, element: () => editor.target.querySelector<HTMLElement>(`[data-object-id="${id}"]`)! };
}
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('object insertion dialogs', () => {
  it('opens chart setup directly, validates its data and inserts a persistent, undoable chart', () => {
    const editor = mount(); click(editor, 'Insert'); click(editor, 'Charts');
    expect(editor.target.querySelector('dialog[open]')?.getAttribute('aria-label')).toBe('Insert chart');
    const insert = editor.target.querySelector<HTMLButtonElement>('button[aria-label="Insert chart"]')!;
    expect(insert.disabled).toBe(true);
    expect(editor.target.querySelector('dialog[open] [role=status]')?.textContent).toContain('category column');
    field(editor, 'range', 'A1:B3'); field(editor, 'title', 'Sales');
    expect(insert.disabled).toBe(false);
    expect(editor.target.querySelector('.ezg-object-preview svg')).not.toBeNull();
    insert.click();
    const chart = editor.workbook.activeWorksheet.charts.all()[0]!;
    expect(chart.title).toBe('Sales'); expect(chart.anchor.column).toBe(2);
    expect(editor.renderer.objects.selected?.id).toBe(chart.id);
    expect(Workbook.fromJSON(editor.workbook.toJSON()).activeWorksheet.charts.all()[0]?.id).toBe(chart.id);
    editor.workbook.undo(); expect(editor.workbook.activeWorksheet.charts.all()).toHaveLength(0);
    editor.workbook.redo(); expect(editor.workbook.activeWorksheet.charts.all()[0]?.id).toBe(chart.id);
  });

  it('rejects nonnumeric chart ranges and cancels shape drafts without mutations', () => {
    const editor = mount(); click(editor, 'Insert'); click(editor, 'Charts');
    field(editor, 'range', 'C1:D3');
    expect(editor.target.querySelector<HTMLButtonElement>('button[aria-label="Insert chart"]')!.disabled).toBe(true);
    click(editor, 'Close dialog'); click(editor, 'Shapes');
    const before = editor.workbook.toJSON();
    click(editor, 'Text box'); field(editor, 'text', 'Draft');
    expect(editor.target.querySelector<HTMLInputElement>('[name=width]')?.value).toBe('240');
    click(editor, 'Cancel');
    expect(editor.workbook.toJSON()).toEqual(before);
    expect(editor.workbook.canUndo).toBe(false);
  });

  it('previews existing properties without writing, then commits one completed change', () => {
    const editor = mount(); const { ref } = shape(editor);
    editor.renderer.objects.select(ref); click(editor, 'Properties');
    const before = editor.workbook.toJSON();
    field(editor, 'text', 'Preview');
    expect(editor.workbook.toJSON()).toEqual(before);
    expect(editor.target.querySelector('.ezygrid-object-content')?.textContent).toBe('Preview');
    field(editor, 'text', 'Committed', 'change');
    expect(editor.workbook.toJSON()).toEqual(before);
    click(editor, 'Apply changes');
    expect(editor.workbook.activeWorksheet.media.all()[0]).toMatchObject({ text: 'Committed' });
    editor.workbook.undo();
    expect(editor.workbook.activeWorksheet.media.all()[0]).toMatchObject({ text: 'Object', id: ref.id });
  });

  it('keeps invalid geometry out of the model and restores a cancelled preview', () => {
    const editor = mount(); const { ref } = shape(editor);
    editor.renderer.objects.select(ref); click(editor, 'Properties');
    field(editor, 'width', '0', 'change');
    expect(editor.workbook.activeWorksheet.media.all()[0]?.width).toBe(160);
    expect(editor.target.querySelector('dialog[open] [role=status]')?.textContent).toContain('Width');
    field(editor, 'text', 'Not saved'); click(editor, 'Cancel');
    expect(editor.target.querySelector('.ezygrid-object-content')?.textContent).toBe('Object');
  });

  it('does not add history or rewrite defaults when unchanged properties lose focus', () => {
    const editor = mount(); const { ref } = shape(editor);
    const before = editor.workbook.toJSON();
    editor.renderer.objects.select(ref); click(editor, 'Properties');
    field(editor, 'text', 'Object', 'change');
    expect(editor.workbook.toJSON()).toEqual(before);
    expect(editor.workbook.canUndo).toBe(false);
  });

  it('rejects unsupported image sources and keeps decode errors uncommitted', () => {
    const pending: HTMLImageElement[] = [];
    vi.spyOn(window, 'Image').mockImplementation(function () {
      const img = document.createElement('img'); pending.push(img); return img;
    } as unknown as typeof Image);
    const editor = mount(); click(editor, 'Insert'); click(editor, 'Images'); click(editor, 'From URL');
    field(editor, 'src', 'http://example.com/image.png');
    expect(pending).toHaveLength(0);
    expect(editor.target.querySelector('dialog[open] [role=status]')?.textContent).toContain('HTTPS');
    field(editor, 'src', 'https://example.com/image.png');
    pending[0]!.dispatchEvent(new Event('error'));
    expect(editor.target.querySelector('dialog[open] [role=status]')?.textContent).toContain('could not be loaded');
    expect(editor.target.querySelector<HTMLButtonElement>('button[aria-label="Insert image"]')!.disabled).toBe(true);
    expect(editor.workbook.activeWorksheet.media.all()).toHaveLength(0);
  });

  it('waits for image decoding, preserves dimensions, and ignores decoding after cancellation', () => {
    const images: HTMLImageElement[] = [];
    vi.spyOn(window, 'Image').mockImplementation(function () {
      const image = document.createElement('img');
      Object.defineProperties(image, { naturalWidth: { value: 800 }, naturalHeight: { value: 400 } });
      images.push(image); return image;
    } as unknown as typeof Image);
    const editor = mount(); click(editor, 'Insert'); click(editor, 'Images'); click(editor, 'From URL');
    field(editor, 'src', 'https://example.com/image.png');
    const insert = editor.target.querySelector<HTMLButtonElement>('button[aria-label="Insert image"]')!;
    expect(insert.disabled).toBe(true);
    images[0]!.dispatchEvent(new Event('load'));
    expect(insert.disabled).toBe(false);
    expect(editor.target.querySelector<HTMLInputElement>('[name=width]')?.value).toBe('400');
    expect(editor.target.querySelector<HTMLInputElement>('[name=height]')?.value).toBe('200');
    field(editor, 'src', 'https://example.com/other.png');
    const pending = images[1]!;
    click(editor, 'Cancel'); pending.dispatchEvent(new Event('load'));
    expect(editor.workbook.activeWorksheet.media.all()).toHaveLength(0);
    expect(editor.target.querySelector('aside')).toBeNull();
  });
});

describe('floating object gestures', () => {
  it('previews movement without mutations and commits one undoable action', () => {
    const editor = mount(); const { ref, element } = shape(editor);
    const before = editor.workbook.toJSON();
    const initial = element();
    pointer(initial, 'pointerdown', 250, 120);
    pointer(document, 'pointermove', 280, 140);
    expect(editor.workbook.toJSON()).toEqual(before);
    expect(element()).toBe(initial);
    expect(element().style.left).toBe('230px');
    pointer(document, 'pointerup', 280, 140);
    expect(editor.workbook.activeWorksheet.media.all()[0]).toMatchObject({ id: ref.id, offsetX: 30, offsetY: 20 });
    editor.workbook.undo();
    expect(editor.workbook.activeWorksheet.media.all()[0]?.offsetX).toBeUndefined();
    expect(editor.workbook.activeWorksheet.media.all()[0]?.offsetY).toBeUndefined();
    editor.workbook.redo();
    expect(editor.workbook.activeWorksheet.media.all()[0]).toMatchObject({ offsetX: 30, offsetY: 20 });
  });

  it.each(['Escape', 'pointercancel', 'lostpointercapture'])('cancels a resize on %s', cancel => {
    const editor = mount(); const { ref, element } = shape(editor);
    editor.renderer.objects.select(ref); click(editor, 'Properties');
    const before = editor.workbook.toJSON();
    pointer(element().querySelector('[data-resize=se]')!, 'pointerdown', 400, 200);
    pointer(document, 'pointermove', 450, 250);
    if (cancel === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else pointer(cancel === 'lostpointercapture' ? element() : document, cancel, 450, 250);
    expect(editor.workbook.toJSON()).toEqual(before);
    expect(element().style.width).toBe('160px');
  });

  it('handles custom dimensions, zoom, and scroll deltas in worksheet pixels', () => {
    const editor = mount(); const { ref, element } = shape(editor);
    const sheet = editor.workbook.activeWorksheet;
    sheet.setColumnWidth(0, 180); sheet.setRowHeight(0, 40); editor.renderer.setZoom(2);
    const scroll = editor.target.querySelector<HTMLElement>('.ezygrid-scroll')!;
    pointer(element(), 'pointerdown', 100, 100);
    scroll.scrollLeft = 20;
    pointer(document, 'pointermove', 120, 120);
    pointer(document, 'pointerup', 120, 120);
    expect(editor.renderer.objects.get(ref)).toMatchObject({ offsetX: 20, offsetY: 10 });
    expect(element().style.width).toBe('320px');
  });

  it('locks image aspect ratio and supports keyboard movement and deletion without touching cells', () => {
    const editor = mount(); const sheet = editor.workbook.activeWorksheet;
    const id = sheet.addImage({ src: 'data:image/png;base64,AAAA', anchor: { row: 3, column: 2 }, width: 200, height: 100 });
    const ref = { worksheetId: sheet.id, kind: 'image' as const, id };
    editor.renderer.objects.select(ref);
    const element = editor.target.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!;
    pointer(element.querySelector('[data-resize=se]')!, 'pointerdown', 400, 200);
    pointer(document, 'pointerup', 500, 250);
    expect(editor.renderer.objects.get(ref)).toMatchObject({ width: 300, height: 150 });
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    expect(editor.renderer.objects.get(ref)).toMatchObject({ offsetX: 10 });
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(sheet.media.all()).toHaveLength(0);
    expect(sheet.getValue(0, 0)).toBe('Category');
  });

  it('cancels on sheet changes and keeps multiple editor instances isolated', () => {
    const first = mount(); const second = mount(); const { element } = shape(first); shape(second);
    pointer(element(), 'pointerdown', 100, 100); pointer(document, 'pointermove', 150, 150);
    const other = first.workbook.addWorksheet(); first.workbook.setActiveWorksheet(other.id);
    pointer(document, 'pointerup', 150, 150);
    expect(first.renderer.objects.selected).toBeNull();
    expect(second.workbook.activeWorksheet.media.all()[0]?.offsetX).toBeUndefined();
    first.destroy();
    expect(second.target.querySelector('.ezygrid-media-object')).not.toBeNull();
  });
});
