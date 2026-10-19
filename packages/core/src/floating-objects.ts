import type { Workbook, Worksheet } from './workbook.js';
import type { ChartSpec, FloatingPosition } from './charts.js';
import { readChartData } from './charts.js';
import { renderChartSVG } from './chart-svg.js';
import type { MediaObject } from './media.js';

export type FloatingKind = 'chart' | 'image' | 'shape';
export interface FloatingRef { worksheetId: string; kind: FloatingKind; id: string }
export type FloatingItem = ChartSpec | MediaObject;
export type FloatingPatch = Partial<ChartSpec> & Partial<Omit<MediaObject, 'kind'>> & {
  src?: string; alt?: string; shape?: 'rect' | 'ellipse' | 'textbox'; text?: string;
  fill?: string; stroke?: string; textColor?: string; zIndex?: number;
};

interface Context {
  workbook: Workbook;
  sheet: () => Worksheet;
  layer: HTMLElement;
  scroll: HTMLElement;
  zoom: () => number;
  offset: (axis: 'row' | 'column', index: number) => number;
  index: (axis: 'row' | 'column', pixel: number) => number;
  changed: (ref: FloatingRef | null) => void;
  commitEdits: () => void;
  focusGrid: () => void;
}

interface Gesture {
  ref: FloatingRef; pointerId: number; element: HTMLElement; handle: string;
  x: number; y: number; scrollX: number; scrollY: number;
  left: number; top: number; width: number; height: number;
  patch: FloatingPatch; moved: boolean;
}

/** Renderer-owned interaction state; never serialized into the workbook. */
export class FloatingObjects {
  selected: FloatingRef | null = null;
  private elements = new Map<string, HTMLElement>();
  private preview: { ref: FloatingRef; patch: FloatingPatch } | null = null;
  private gesture: Gesture | null = null;
  private ratios = new Map<string, boolean>();
  private sheetId: string;
  private unlisten: () => void;
  private disposed = false;

  constructor(private context: Context) {
    this.sheetId = context.sheet().id;
    context.layer.addEventListener('pointerdown', this.onPointerDown);
    context.layer.addEventListener('keydown', this.onKeyDown);
    context.layer.addEventListener('focusin', this.onFocus);
    context.layer.addEventListener('dragstart', this.preventDrag);
    this.unlisten = context.workbook.onOperation(operation => {
      if (['document.load', 'worksheet.activate', 'worksheet.remove'].includes(operation.type)) {
        this.cancel();
        this.select(null);
      } else if (operation.type === 'undo' || operation.type === 'redo') {
        this.finishGesture();
        this.preview = null;
      }
    });
  }

  get(ref: FloatingRef): FloatingItem | undefined {
    const sheet = this.context.sheet();
    if (ref.worksheetId !== sheet.id) return undefined;
    return ref.kind === 'chart' ? sheet.charts.all().find(item => item.id === ref.id)
      : sheet.media.all().find(item => item.id === ref.id && item.kind === ref.kind);
  }

  list(): { ref: FloatingRef; label: string }[] {
    const sheet = this.context.sheet();
    return [
      ...sheet.charts.all().map(item => ({ ref: { worksheetId: sheet.id, kind: 'chart' as const, id: item.id }, label: item.title || `${item.type[0]!.toUpperCase()}${item.type.slice(1)} chart — ${item.source}` })),
      ...sheet.media.all().map((item, index) => ({ ref: { worksheetId: sheet.id, kind: item.kind, id: item.id }, label: item.kind === 'image' ? item.alt || `Image ${index + 1}` : item.text || `${item.shape === 'rect' ? 'Rectangle' : item.shape === 'ellipse' ? 'Ellipse' : 'Text box'} ${index + 1}` })),
    ];
  }

  private same(a: FloatingRef | null, b: FloatingRef | null): boolean {
    return a?.id === b?.id && a?.kind === b?.kind && a?.worksheetId === b?.worksheetId;
  }

  select(ref: FloatingRef | null, reveal = false): void {
    if (ref && !this.get(ref)) return;
    if (!this.same(this.selected, ref)) {
      this.cancel();
      this.preview = null;
      this.selected = ref;
      this.render();
      this.context.changed(ref);
    }
    if (ref && reveal) {
      this.elements.get(this.key(ref))?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      this.elements.get(this.key(ref))?.focus({ preventScroll: true });
    }
  }

  ratioLocked(ref: FloatingRef): boolean { return this.ratios.get(this.key(ref)) ?? ref.kind === 'image'; }
  lockRatio(ref: FloatingRef, locked: boolean): void { this.ratios.set(this.key(ref), locked); }

  showPreview(ref: FloatingRef, patch: FloatingPatch | null): void {
    if (this.gesture) return;
    this.preview = patch ? { ref, patch } : null;
    this.render();
  }

  update(ref: FloatingRef, patch: FloatingPatch): void {
    const item = this.get(ref);
    if (item && ['anchor', 'width', 'height', 'offsetX', 'offsetY'].some(key => key in patch)) {
      const g = this.geometry({ ...item, ...patch });
      patch = { ...patch, ...this.placement(g.left, g.top, g.width, g.height) };
    }
    this.preview = null;
    if (!item || Object.entries(patch).every(([key, value]) => JSON.stringify((item as unknown as Record<string, unknown>)[key]) === JSON.stringify(value))) {
      this.render();
      return;
    }
    this.context.workbook.transaction(() => {
      const current = this.get(ref);
      if (current) Object.assign(current, patch);
    });
    this.render();
  }

  remove(ref: FloatingRef): void {
    if (!this.get(ref)) return;
    this.context.workbook.transaction(() => {
      const sheet = this.context.sheet();
      if (ref.kind === 'chart') sheet.charts.remove(ref.id); else sheet.media.remove(ref.id);
    });
    this.select(null);
    this.render();
    this.context.focusGrid();
  }

  private key(ref: FloatingRef): string { return `${ref.worksheetId}/${ref.kind}/${ref.id}`; }

  private geometry(item: FloatingPosition): { left: number; top: number; width: number; height: number } {
    return {
      left: this.context.offset('column', item.anchor.column) + (item.offsetX ?? 0),
      top: this.context.offset('row', item.anchor.row) + (item.offsetY ?? 0),
      width: item.width ?? 320, height: item.height ?? 240,
    };
  }

  private placement(left: number, top: number, width: number, height: number): FloatingPosition {
    const sheet = this.context.sheet();
    left = Math.max(0, Math.min(left, Math.max(0, this.context.offset('column', sheet.columnCount) - width)));
    top = Math.max(0, Math.min(top, Math.max(0, this.context.offset('row', sheet.rowCount) - height)));
    const column = Math.min(sheet.columnCount - 1, this.context.index('column', left));
    const row = Math.min(sheet.rowCount - 1, this.context.index('row', top));
    return { anchor: { row, column }, offsetX: left - this.context.offset('column', column), offsetY: top - this.context.offset('row', row), width, height };
  }

  render(): void {
    if (this.disposed) return;
    const { layer } = this.context;
    const sheet = this.context.sheet();
    if (this.sheetId !== sheet.id) {
      this.finishGesture();
      this.selected = null;
      this.preview = null;
      this.sheetId = sheet.id;
      this.context.changed(null);
    }
    const entries = this.list();
    const keys = new Set(entries.map(({ ref }) => this.key(ref)));
    for (const [key, element] of this.elements) {
      if (!keys.has(key)) { element.remove(); this.elements.delete(key); this.ratios.delete(key); }
    }
    if (this.selected && !this.get(this.selected)) {
      this.selected = null; this.preview = null; this.context.changed(null);
    }
    for (const { ref, label } of entries) {
      const stored = this.get(ref)!;
      const patch = this.same(this.preview?.ref ?? null, ref) ? this.preview!.patch : {};
      const item = { ...stored, ...patch } as FloatingItem;
      const key = this.key(ref);
      let element = this.elements.get(key);
      if (!element) {
        element = layer.ownerDocument.createElement('div');
        element.className = ref.kind === 'chart' ? 'ezygrid-chart' : 'ezygrid-media-object';
        element.dataset.objectId = ref.id;
        element.dataset.objectKind = ref.kind;
        element.tabIndex = 0;
        element.setAttribute('role', 'group');
        const content = layer.ownerDocument.createElement('div');
        content.className = 'ezygrid-object-content';
        Object.assign(content.style, { width: '100%', height: '100%', overflow: 'hidden', boxSizing: 'border-box' });
        element.append(content);
        for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
          const grip = layer.ownerDocument.createElement('span');
          grip.className = 'ezygrid-object-handle';
          grip.dataset.resize = handle;
          grip.setAttribute('aria-hidden', 'true');
          Object.assign(grip.style, {
            position: 'absolute', width: '10px', height: '10px', boxSizing: 'border-box',
            background: 'var(--ezygrid-bg, #fff)', border: '2px solid var(--ezygrid-selection, #00c47a)',
            left: handle.includes('w') ? '-5px' : handle.includes('e') ? 'calc(100% - 5px)' : 'calc(50% - 5px)',
            top: handle.includes('n') ? '-5px' : handle.includes('s') ? 'calc(100% - 5px)' : 'calc(50% - 5px)',
            cursor: `${handle}-resize`, touchAction: 'none',
          });
          element.append(grip);
        }
        this.elements.set(key, element);
        layer.append(element);
      }
      const selected = this.same(this.selected, ref);
      const g = this.geometry(item);
      const zoom = this.context.zoom();
      element.setAttribute('aria-label', `${label}. Use arrow keys to move, Shift for larger steps. Resize using the ribbon or resize handles.`);
      element.dataset.selected = String(selected);
      Object.assign(element.style, {
        position: 'absolute', pointerEvents: 'auto', boxSizing: 'border-box', touchAction: 'none',
        left: `${g.left * zoom}px`, top: `${g.top * zoom}px`, width: `${g.width * zoom}px`, height: `${g.height * zoom}px`,
        zIndex: String(selected ? 1000 : ('zIndex' in item ? item.zIndex : undefined) ?? 1),
        cursor: 'move', outline: selected ? '2px solid var(--ezygrid-selection, #00c47a)' : '',
      });
      for (const handle of element.querySelectorAll<HTMLElement>('[data-resize]')) handle.style.display = selected ? 'block' : 'none';
      const content = element.firstElementChild as HTMLElement;
      if (ref.kind === 'chart') {
        const chart = item as ChartSpec;
        const svg = renderChartSVG(chart, readChartData(sheet, chart));
        if (content.dataset.svg !== svg) { content.innerHTML = svg; content.dataset.svg = svg; }
        Object.assign(content.style, { background: 'var(--ezygrid-bg, #fff)', border: '1px solid var(--ezygrid-gridline, #e2e8f0)' });
        const graphic = content.querySelector('svg');
        if (graphic) { graphic.style.width = '100%'; graphic.style.height = '100%'; }
      } else if ('kind' in item && item.kind === 'image') {
        let img = content.querySelector('img');
        if (!img) { img = layer.ownerDocument.createElement('img'); img.draggable = false; Object.assign(img.style, { width: '100%', height: '100%', display: 'block' }); content.replaceChildren(img); }
        if (img.getAttribute('src') !== item.src) img.src = item.src;
        img.alt = item.alt ?? '';
      } else if ('kind' in item && item.kind === 'shape') {
        content.textContent = item.text ?? '';
        Object.assign(content.style, {
          border: `1px solid ${item.stroke ?? 'var(--ezygrid-gridline, #e2e8f0)'}`,
          background: item.fill ?? 'transparent', color: item.textColor ?? 'inherit',
          borderRadius: item.shape === 'ellipse' ? '50%' : '0', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '4px', fontSize: `${13 * zoom}px`,
        });
      }
    }
  }

  private refAt(target: EventTarget | null): FloatingRef | null {
    const element = (target as HTMLElement)?.closest<HTMLElement>('[data-object-id]');
    if (!element || !this.context.layer.contains(element)) return null;
    return { worksheetId: this.context.sheet().id, kind: element.dataset.objectKind as FloatingKind, id: element.dataset.objectId! };
  }

  private preventDrag = (event: Event): void => event.preventDefault();
  private onFocus = (event: FocusEvent): void => { const ref = this.refAt(event.target); if (ref) this.select(ref); };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.gesture) return;
    const ref = this.refAt(event.target);
    if (!ref) return;
    event.preventDefault(); event.stopPropagation();
    this.context.commitEdits();
    const alreadySelected = this.same(this.selected, ref);
    this.select(ref);
    this.preview = null;
    const item = this.get(ref)!;
    const element = this.elements.get(this.key(ref))!;
    element.focus({ preventScroll: true });
    if (alreadySelected) this.context.changed(ref);
    this.gesture = { ref, pointerId: event.pointerId, element,
      handle: (event.target as HTMLElement).closest<HTMLElement>('[data-resize]')?.dataset.resize ?? '',
      x: event.clientX, y: event.clientY, scrollX: this.context.scroll.scrollLeft, scrollY: this.context.scroll.scrollTop,
      ...this.geometry(item), patch: {}, moved: false };
    element.addEventListener('lostpointercapture', this.onCancel);
    try { element.setPointerCapture?.(event.pointerId); } catch { /* Document listeners also handle embedded hosts. */ }
    const doc = element.ownerDocument;
    doc.addEventListener('pointermove', this.onMove);
    doc.addEventListener('pointerup', this.onUp);
    doc.addEventListener('pointercancel', this.onCancel);
    doc.addEventListener('keydown', this.onGestureKey, true);
    doc.defaultView?.addEventListener('blur', this.onCancel);
  };

  private onMove = (event: PointerEvent): void => {
    const g = this.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    event.preventDefault();
    const zoom = this.context.zoom();
    const dx = (event.clientX - g.x + this.context.scroll.scrollLeft - g.scrollX) / zoom;
    const dy = (event.clientY - g.y + this.context.scroll.scrollTop - g.scrollY) / zoom;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) < 2 / zoom) return;
    g.moved = true;
    let { left, top, width, height } = g;
    if (!g.handle) { left += dx; top += dy; }
    else {
      if (g.handle.includes('e')) width += dx;
      if (g.handle.includes('w')) width -= dx;
      if (g.handle.includes('s')) height += dy;
      if (g.handle.includes('n')) height -= dy;
      if (this.ratioLocked(g.ref)) {
        const ratio = g.width / g.height;
        if (g.handle === 'n' || g.handle === 's' || (g.handle.length === 2 && Math.abs(dy / g.height) > Math.abs(dx / g.width))) width = height * ratio;
        else height = width / ratio;
        const scale = Math.max(20 / g.width, 20 / g.height, Math.min(4000 / g.width, 4000 / g.height, width / g.width));
        width = g.width * scale; height = g.height * scale;
      } else { width = Math.max(20, Math.min(4000, width)); height = Math.max(20, Math.min(4000, height)); }
      if (g.handle.includes('w')) left = g.left + g.width - width;
      if (g.handle.includes('n')) top = g.top + g.height - height;
    }
    g.patch = this.placement(left, top, width, height);
    this.preview = { ref: g.ref, patch: g.patch };
    this.render();
  };

  private onUp = (event: PointerEvent): void => {
    const g = this.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    this.onMove(event);
    this.finishGesture();
    if (g.moved) {
      this.update(g.ref, g.patch);
      this.context.changed(g.ref);
    } else this.render();
  };

  private finishGesture(): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    const doc = g.element.ownerDocument;
    doc.removeEventListener('pointermove', this.onMove);
    doc.removeEventListener('pointerup', this.onUp);
    doc.removeEventListener('pointercancel', this.onCancel);
    doc.removeEventListener('keydown', this.onGestureKey, true);
    doc.defaultView?.removeEventListener('blur', this.onCancel);
    g.element.removeEventListener('lostpointercapture', this.onCancel);
    try { if (g.element.hasPointerCapture?.(g.pointerId)) g.element.releasePointerCapture(g.pointerId); } catch { /* Host may already have released capture. */ }
    this.preview = null;
  }

  cancel(): void { this.finishGesture(); this.preview = null; this.renderAfterCancel(); }
  private renderAfterCancel(): void { if (!this.disposed && this.elements.size) this.render(); }
  private onCancel = (): void => this.cancel();
  private onGestureKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.cancel(); }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const ref = this.refAt(event.target);
    if (!ref || (event.target as HTMLElement).closest('input,select,textarea,[contenteditable=true]')) return;
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault(); event.stopPropagation();
      if (event.key.toLowerCase() === 'y' || event.shiftKey) this.context.workbook.redo(); else this.context.workbook.undo();
      this.context.focusGrid();
    }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.select(null); this.context.focusGrid(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); this.remove(ref); }
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault(); event.stopPropagation();
      const item = this.get(ref);
      if (!item) return;
      const g = this.geometry(item); const step = event.shiftKey ? 10 : 1;
      this.update(ref, this.placement(g.left + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), g.top + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0), g.width, g.height));
      this.context.changed(ref);
    }
  };

  destroy(): void {
    this.disposed = true;
    this.finishGesture(); this.unlisten();
    const layer = this.context.layer;
    layer.removeEventListener('pointerdown', this.onPointerDown);
    layer.removeEventListener('keydown', this.onKeyDown);
    layer.removeEventListener('focusin', this.onFocus);
    layer.removeEventListener('dragstart', this.preventDrag);
    this.elements.clear(); this.ratios.clear(); this.preview = null; this.selected = null;
  }
}
