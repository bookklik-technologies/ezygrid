import { parseRange, rectToRange, toA1 } from '@ezygrid/model';
import type { EditorShell } from './editor-shell.js';
import { button, form, node, type Field } from './dom.js';
import { readChartData, sanitizeChartColor, type ChartSpec, type ChartType } from '../charts.js';
import { renderChartSVG } from '../chart-svg.js';
import type { ImageMedia, ShapeMedia } from '../media.js';
import type { FloatingKind, FloatingPatch, FloatingRef } from '../floating-objects.js';
import { validateChart } from './ribbon-actions.js';

const chartTypes: [ChartType, string][] = [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie'], ['doughnut', 'Doughnut']];
const shapeTypes = [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['textbox', 'Text box']] as const;
const imageSource = /^(https:|data:image\/(png|jpeg|gif|webp);base64,|blob:)/i;

/** Creation and property drafts commit only on Apply. */
export function openObjectPanel(host: EditorShell, kind: FloatingKind, ref?: FloatingRef, preset?: string): void {
  const { doc, renderer } = host;
  const controller = renderer.objects;
  const sheet = host.sheet;
  const worksheetId = sheet.id;
  const object = ref ? controller.get(ref) : undefined;
  if (ref && !object) return;
  if (!ref) controller.select(null);
  const noun = kind === 'chart' ? 'chart' : kind === 'image' ? 'image' : 'shape';
  const opener = doc.activeElement as HTMLElement | null;
  const panel = host.toolDialog(`${ref ? 'Edit' : 'Insert'} ${noun}`, () => !ref || !!controller.get(ref));
  panel.classList.add('ezg-object-dialog');
  panel.dataset.objectInspector = ref ? 'true' : 'false';
  const body = node(doc, 'form', 'ezg-object-body');
  body.id = `ezg-object-${Math.random().toString(36).slice(2)}`;
  body.noValidate = true;
  const preview = node(doc, 'div', 'ezg-object-preview');
  preview.setAttribute('role', 'img');
  preview.setAttribute('aria-label', `${noun} preview`);
  const message = node(doc, 'p', 'ezg-object-error');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const fields = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  const content = node(doc, 'div', 'ezg-form');
  const advanced = node(doc, 'details', 'ezg-object-advanced');
  advanced.append(node(doc, 'summary', '', 'Advanced'));
  const advancedFields = node(doc, 'div', 'ezg-form'); advanced.append(advancedFields);
  const footer = node(doc, 'div', 'ezg-object-footer');
  const insert = button(doc, ref ? 'Apply changes' : `Insert ${noun}`, () => {});
  insert.className = 'ezg-primary'; insert.type = 'submit'; insert.setAttribute('form', body.id);
  const close = () => {
    if (ref) controller.showPreview(ref, null);
    host.closeToolDialog();
    if (opener?.isConnected) opener.focus({ preventScroll: true }); else renderer.focus();
  };
  const cancel = button(doc, 'Cancel', close);
  if (ref) footer.append(button(doc, `Delete ${noun}`, () => controller.remove(ref)), cancel, insert);
  else footer.append(cancel, insert);
  body.append(preview, message, content);
  panel.append(body, footer);

  let disposed = false;
  let generation = 0;
  let imageReady = kind !== 'image';
  let imageError = '';
  let imageLoading = false;
  let imageName = '';
  let loadedSource = '';
  let pendingSource = '';
  let naturalRatio = object ? (object.width ?? 400) / (object.height ?? 240) : 1;
  let draftImage: HTMLImageElement | null = null;
  let reader: FileReader | null = null;
  const alive = () => !disposed && panel.isConnected && host.sheet.id === worksheetId;
  host.setToolCleanup(() => {
    disposed = true; generation++;
    if (reader?.readyState === 1) reader.abort();
    if (draftImage) { draftImage.onload = null; draftImage.onerror = null; }
    if (ref) controller.showPreview(ref, null);
  });

  const add = (field: Field, parent: HTMLElement = content) => {
    const built = form(doc, [field], () => {});
    const wrapper = built.firstElementChild!;
    const input = wrapper.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')!;
    fields.set(field.key, input);
    parent.append(wrapper);
    return input;
  };
  const text = (key: string, label: string, value = '', required = false, parent: HTMLElement = content) => add({ key, label, value, required }, parent);
  const number = (key: string, label: string, value: number, min: number, max = 4000) => {
    const input = add({ key, label, value, type: 'number', min, max, required: true }, advancedFields) as HTMLInputElement;
    input.step = 'any'; return input;
  };
  const value = (key: string) => fields.get(key)?.value ?? '';
  const set = (key: string, v: string | number) => { const input = fields.get(key); if (input) input.value = String(v); };
  const check = (key: string) => (fields.get(key) as HTMLInputElement)?.checked;

  const choices = (key: string, label: string, options: readonly (readonly [string, string])[], initial: string) => {
    const input = node(doc, 'input'); input.type = 'hidden'; input.name = key; input.value = initial;
    fields.set(key, input);
    const group = node(doc, 'div', 'ezg-object-choices');
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
    for (const [id, title] of options) {
      const choice = button(doc, title, () => {
        input.value = id;
        for (const item of group.querySelectorAll<HTMLButtonElement>('button')) item.setAttribute('aria-pressed', String(item.dataset.value === id));
        if (!ref && key === 'shape') { set('width', id === 'textbox' ? 240 : 160); set('height', id === 'textbox' ? 80 : 100); }
        refresh();
      });
      choice.dataset.value = id; choice.setAttribute('aria-pressed', String(id === initial));
      if (key === 'type') {
        const sample = node(doc, 'span', 'ezg-chart-sample'); sample.setAttribute('aria-hidden', 'true');
        sample.innerHTML = renderChartSVG({ id: 'sample', type: id as ChartType, source: 'A1:B3', anchor: { row: 0, column: 0 }, width: 160, height: 100 }, { categories: ['A', 'B', 'C'], series: [{ name: 'Example', values: [2, 5, 3] }] });
        choice.prepend(sample);
      } else {
        const sample = node(doc, 'span', `ezg-shape-sample ezg-shape-${id}`, id === 'textbox' ? 'Text' : '');
        sample.setAttribute('aria-hidden', 'true'); choice.prepend(sample);
      }
      group.append(choice);
    }
    content.append(input, group);
  };

  const chart = kind === 'chart' ? object as ChartSpec | undefined : undefined;
  const image = kind === 'image' ? object as ImageMedia | undefined : undefined;
  if (image && !/^https:/i.test(image.src)) imageName = 'Embedded image';
  const shape = kind === 'shape' ? object as ShapeMedia | undefined : undefined;
  let imageTabs: HTMLElement | undefined;
  let uploadSection: HTMLElement | undefined;
  let urlSection: HTMLElement | undefined;
  if (kind === 'chart') {
    text('range', 'Data range', chart?.source ?? host.range, true);
    content.append(button(doc, 'Use selected cells', () => { set('range', rectToRange(renderer.selection.primary)); refresh(); }));
    content.append(node(doc, 'p', 'ezg-hint', 'The first column supplies categories; remaining columns supply numeric series.'));
    choices('type', 'Chart type', chartTypes, chart?.type ?? preset ?? 'column');
    add({ key: 'header', label: 'First row contains headers', type: 'checkbox', value: chart?.firstRowIsHeader !== false });
    text('title', 'Chart title', chart?.title ?? '');
    text('colors', 'Custom colors (comma separated)', chart?.colors?.join(', ') ?? '', false, advancedFields);
  } else if (kind === 'image') {
    imageTabs = node(doc, 'div', 'ezg-actions'); imageTabs.setAttribute('role', 'group'); imageTabs.setAttribute('aria-label', 'Image source');
    uploadSection = node(doc, 'div', 'ezg-image-upload');
    urlSection = node(doc, 'div', 'ezg-form');
    const upload = node(doc, 'input'); upload.type = 'file'; upload.accept = 'image/png,image/jpeg,image/gif,image/webp'; upload.hidden = true; upload.setAttribute('aria-label', 'Choose image file');
    uploadSection.append(button(doc, 'Choose image file', () => upload.click()), node(doc, 'p', 'ezg-hint', 'PNG, JPEG, GIF or WebP. Image proportions are preserved.'), upload);
    const useUpload = button(doc, 'Upload', () => sourceTab(false));
    const useUrl = button(doc, 'From URL', () => sourceTab(true));
    imageTabs.append(useUpload, useUrl);
    content.append(imageTabs, uploadSection, urlSection);
    text('src', 'Image URL', image?.src ?? '', true, urlSection);
    urlSection.append(node(doc, 'p', 'ezg-hint', 'Use an HTTPS image URL.'));
    text('alt', 'Alternative text', image?.alt ?? '');
    function sourceTab(url: boolean) {
      uploadSection!.hidden = url; urlSection!.hidden = !url;
      useUpload.setAttribute('aria-pressed', String(!url)); useUrl.setAttribute('aria-pressed', String(url));
      if (url && value('src') && !/^https:/i.test(value('src'))) {
        set('src', ''); imageReady = false; loadedSource = ''; refresh();
      }
    }
    sourceTab(preset === 'url' || (preset !== 'upload' && !!image && /^https:/i.test(image.src)));
    upload.addEventListener('change', () => {
      const file = upload.files?.[0]; if (!file) return;
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) { imageError = 'Choose a PNG, JPEG, GIF or WebP image.'; imageReady = false; refresh(); return; }
      generation++; if (reader?.readyState === 1) reader.abort();
      imageName = file.name; imageReady = false; imageLoading = true; imageError = ''; refresh();
      const token = generation; reader = new doc.defaultView!.FileReader();
      reader.onload = () => { if (alive() && token === generation) { set('src', String(reader!.result)); loadImage(true); } };
      reader.onerror = () => { if (alive() && token === generation) { imageLoading = false; imageError = 'The image could not be read. Choose another file.'; refresh(); } };
      reader.readAsDataURL(file);
    });
  } else {
    choices('shape', 'Shape type', shapeTypes, shape?.shape ?? preset ?? 'rect');
    text('text', 'Text', shape?.text ?? '');
    const colors = node(doc, 'div', 'ezg-object-colors'); content.append(colors);
    add({ key: 'fill', label: 'Fill', type: 'color', value: shape?.fill ?? '#e6fff4' }, colors);
    add({ key: 'stroke', label: 'Border', type: 'color', value: shape?.stroke ?? '#00c47a' }, colors);
    add({ key: 'textColor', label: 'Text color', type: 'color', value: shape?.textColor ?? '#0f172a' }, colors);
  }

  const active = renderer.selection.state.active;
  text('anchor', 'Anchor cell', object ? toA1(object.anchor.row, object.anchor.column) : toA1(active.row, active.column), true, advancedFields);
  number('width', 'Width (px)', object ? object.width ?? 320 : kind === 'shape' ? 160 : 400, 20);
  number('height', 'Height (px)', object?.height ?? (kind === 'shape' ? 100 : 240), 20);
  number('offsetX', 'Horizontal offset', object?.offsetX ?? 0, 0, 1000000);
  number('offsetY', 'Vertical offset', object?.offsetY ?? 0, 0, 1000000);
  if (kind !== 'chart') number('zIndex', 'Stack order', object && 'zIndex' in object ? object.zIndex ?? 1 : 1, 0, 1000000);
  if (kind === 'image') add({ key: 'ratio', label: 'Lock aspect ratio', type: 'checkbox', value: ref ? controller.ratioLocked(ref) : true });
  content.append(advanced);
  const controlValue = (key: string) => key === 'header' || key === 'ratio' ? String(check(key)) : value(key);
  const committedValues = new Map([...fields.keys()].map(key => [key, controlValue(key)]));
  function changedPatch(patch: FloatingPatch): FloatingPatch {
    const changed = [...fields.keys()].filter(key => controlValue(key) !== committedValues.get(key));
    const result: FloatingPatch = {};
    const keys: Record<string, keyof FloatingPatch> = { range: 'source', header: 'firstRowIsHeader' };
    for (const key of changed) {
      if (key === 'ratio') continue;
      const property = keys[key] ?? key as keyof FloatingPatch;
      Object.assign(result, { [property]: patch[property] });
    }
    return result;
  }

  const objects = node(doc, 'details', 'ezg-object-list'); objects.append(node(doc, 'summary', '', 'Objects on this sheet'));
  const entries = controller.list();
  if (!entries.length) objects.append(node(doc, 'p', 'ezg-hint', 'No objects yet.'));
  for (const entry of entries) {
    const row = node(doc, 'div', 'ezg-object-list-row');
    row.append(node(doc, 'span', '', entry.label), button(doc, `Edit ${entry.label}`, () => { controller.select(entry.ref, true); host.inspectObject(entry.ref); }), button(doc, `Delete ${entry.label}`, () => { controller.remove(entry.ref); openObjectPanel(host, kind); }));
    objects.append(row);
  }
  body.append(objects);

  function rangeBounds(raw: string) {
    const bounds = parseRange(raw);
    if (bounds.top < 0 || bounds.left < 0 || bounds.bottom >= sheet.rowCount || bounds.right >= sheet.columnCount) throw new Error('Choose cells inside this worksheet.');
    return bounds;
  }

  function gather(): FloatingPatch {
    if (kind === 'image' && !(ref && value('src') === image?.src)) {
      if (imageLoading) throw new Error('Loading image…');
      if (!imageReady) throw new Error(imageError || 'Choose an image file or enter an HTTPS image URL.');
    }
    for (const input of fields.values()) {
      if (input.type !== 'hidden' && !input.checkValidity()) throw new Error(`${input.getAttribute('aria-label')} needs a valid value.`);
    }
    const anchor = rangeBounds(value('anchor'));
    const patch: FloatingPatch = {
      anchor: { row: anchor.top, column: anchor.left }, width: Number(value('width')), height: Number(value('height')),
      offsetX: Number(value('offsetX')), offsetY: Number(value('offsetY')),
    };
    if (kind === 'chart') {
      Object.assign(patch, { source: value('range'), type: value('type'), title: value('title'), firstRowIsHeader: check('header') });
      validateChart(sheet, { ...patch, id: 'preview' } as ChartSpec);
      const colors = value('colors').split(',').map(color => color.trim()).filter(Boolean);
      if (colors.some(color => !sanitizeChartColor(color))) throw new Error('Use valid CSS colors, for example #2563eb, #00b374.');
      patch.colors = colors.length ? colors.map(color => sanitizeChartColor(color)!) : undefined;
    } else if (kind === 'image') {
      patch.src = value('src'); patch.alt = value('alt'); patch.zIndex = Number(value('zIndex'));
    } else Object.assign(patch, { shape: value('shape'), text: value('text'), fill: value('fill'), stroke: value('stroke'), textColor: value('textColor'), zIndex: Number(value('zIndex')) });
    return patch;
  }

  function refresh(): FloatingPatch | null {
    if (!alive()) return null;
    try {
      const patch = gather();
      message.textContent = kind === 'image' ? imageError || (imageLoading ? 'Loading image…' : imageName) : '';
      insert.disabled = false;
      preview.replaceChildren();
      if (kind === 'chart') {
        const spec = { ...patch, id: 'preview', width: 400, height: 240 } as ChartSpec;
        preview.innerHTML = renderChartSVG(spec, readChartData(sheet, spec));
      } else if (kind === 'image') {
        const img = node(doc, 'img'); img.src = patch.src!; img.alt = patch.alt || imageName || 'Image preview'; preview.append(img);
      } else {
        const sample = node(doc, 'div', 'ezg-shape-preview', patch.text ?? '');
        const scale = Math.min(220 / patch.width!, 100 / patch.height!);
        Object.assign(sample.style, { background: patch.fill, color: patch.textColor, border: `1px solid ${patch.stroke}`, borderRadius: patch.shape === 'ellipse' ? '50%' : '0', aspectRatio: `${patch.width} / ${patch.height}`, width: `min(100%, ${patch.width! * scale}px)` });
        preview.append(sample);
      }
      if (ref) controller.showPreview(ref, changedPatch(patch));
      return patch;
    } catch (error) {
      insert.disabled = true; message.textContent = error instanceof Error ? error.message : String(error);
      if (!ref) preview.replaceChildren(node(doc, 'p', 'ezg-hint', `Your ${noun} preview will appear here.`));
      if (ref) controller.showPreview(ref, null);
      return null;
    }
  }

  function loadImage(resize: boolean) {
    const source = value('src').trim(); set('src', source);
    if (imageLoading && source === pendingSource) return;
    pendingSource = source;
    generation++; const token = generation;
    if (draftImage) { draftImage.onload = null; draftImage.onerror = null; }
    imageReady = false; imageError = ''; imageLoading = false;
    if (!source) { refresh(); return; }
    if (!imageSource.test(source)) { imageError = 'Use an HTTPS URL or upload a PNG, JPEG, GIF or WebP image.'; refresh(); return; }
    imageLoading = true; refresh();
    const img = new doc.defaultView!.Image(); draftImage = img;
    img.onload = () => {
      if (!alive() || token !== generation) return;
      imageLoading = false;
      if (!img.naturalWidth || !img.naturalHeight) { imageError = 'This image has no usable dimensions.'; refresh(); return; }
      imageReady = true; loadedSource = source;
      naturalRatio = ref && source === image?.src ? (image.width ?? img.naturalWidth) / (image.height ?? img.naturalHeight) : img.naturalWidth / img.naturalHeight;
      if (resize) {
        const scale = Math.min(1, 400 / img.naturalWidth, 300 / img.naturalHeight);
        set('width', Math.max(20, img.naturalWidth * scale)); set('height', Math.max(20, img.naturalHeight * scale));
      }
      refresh();
    };
    img.onerror = () => { if (alive() && token === generation) { imageLoading = false; imageError = 'The image could not be loaded. Check the URL or choose another file.'; refresh(); } };
    img.src = source;
  }

  function edited(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!fields.has(input.name)) return;
    if (kind === 'image' && input.name === 'src' && value('src').trim() !== loadedSource) { loadImage(!ref); return; }
    if (kind === 'image' && input.name === 'ratio') {
      refresh(); return;
    }
    if (kind === 'image' && check('ratio') && (input.name === 'width' || input.name === 'height') && input.checkValidity()) {
      if (input.name === 'width') set('height', Number(value('width')) / naturalRatio);
      else set('width', Number(value('height')) * naturalRatio);
    }
    refresh();
  }
  body.addEventListener('input', edited);
  body.addEventListener('change', edited);
  body.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  });
  body.addEventListener('submit', event => {
    event.preventDefault();
    const patch = refresh(); if (!patch) return;
    if (ref) {
      try {
        controller.update(ref, changedPatch(patch));
        if (kind === 'image') controller.lockRatio(ref, check('ratio'));
        host.closeToolDialog();
      } catch (error) { host.message(error); }
      return;
    }
    if (kind === 'chart' && value('anchor') === toA1(active.row, active.column) && !Number(value('offsetX')) && !Number(value('offsetY'))) {
      const range = rangeBounds(value('range'));
      const right = sheet.columnSizes.prefixSum(range.right + 1);
      const room = sheet.columnSizes.prefixSum(sheet.columnCount) - right;
      if (room >= patch.width! + 16) { patch.anchor = { row: range.top, column: range.right + 1 }; patch.offsetX = 16; }
      else { patch.anchor = { row: Math.min(sheet.rowCount - 1, range.bottom + 1), column: range.left }; patch.offsetY = 16; }
    }
    let id = '';
    host.mutate(() => {
      if (kind === 'chart') id = sheet.addChart(patch as Omit<ChartSpec, 'id'>);
      else if (kind === 'image') id = sheet.addImage(patch as Omit<ImageMedia, 'id' | 'kind'>);
      else id = sheet.addShape(patch as Omit<ShapeMedia, 'id' | 'kind'>);
    });
    if (id) {
      const inserted = { worksheetId, kind, id };
      host.closeToolDialog(); controller.select(inserted, true);
    }
  });
  if (kind === 'image' && image) loadImage(false); else refresh();
  if (!ref) (content.querySelector('button,input:not([type=hidden])') as HTMLElement | null)?.focus({ preventScroll: true });
  if (preset === 'upload') uploadSection?.querySelector<HTMLInputElement>('input[type=file]')?.click();
}
