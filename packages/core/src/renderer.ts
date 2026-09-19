import type { Workbook, Worksheet } from './workbook.js';
import { SelectionService } from './selection.js';
import { EditService, parseEditorValue } from './editing.js';
import { ClipboardService } from './clipboard.js';
import { CommandRegistry, createDefaultCommands, type CommandContext } from './commands.js';
import { FillService } from './fill.js';
import { translateFormula } from './clipboard.js';
import { formatValue } from './format.js';
import { renderChartSVG } from './chart-svg.js';
import { readChartData } from './charts.js';
import { formulaRegistry, type FunctionMeta } from '@ezygrid/formula';
import { parseRange, rectContains, toA1, type Rect } from '@ezygrid/model';
import type { CellStyle } from './workbook.js';
import { DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT } from './workbook.js';
import { EditorShell } from './ui/editor-shell.js';
import { applyStyle } from './ui/cell-style.js';
import type { SelectionState } from './selection.js';

export interface GridRendererOptions {
  mode?: 'editor' | 'grid';
  topbar?: boolean;
  sheetTabs?: boolean;
  statusBar?: boolean;
  /** Extra rows/columns rendered beyond the viewport edges. */
  overscanRows?: number;
  overscanColumns?: number;
  headerHeight?: number;
  headerWidth?: number;
  /** Show the formula bar (name box + input) above the grid. */
  formulaBar?: boolean;
  /** Show the default toolbar shell above the formula bar. */
  toolbar?: boolean;
  /** Right-click context menu. */
  contextMenu?: boolean;
  /** UI direction (RTL baseline). */
  direction?: 'ltr' | 'rtl';
}

const HANDLED_NAV_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'Enter',
  'Escape',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'F2',
  'Delete',
  'Backspace',
]);

type ResizeAxis = 'row' | 'column';

interface HeaderResize {
  worksheet: Worksheet;
  axis: ResizeAxis;
  index: number;
  originalSize: number;
  size: number;
  start: number;
  zoom: number;
  pointerId: number;
  capture: HTMLElement;
  cursor: string;
  userSelect: string;
}

/**
 * DOM viewport renderer (Phase 0 prototype).
 *
 * Renders only visible cells in real DOM elements with a recycled pool,
 * projects selection state as an overlay, mounts the text editor over the
 * active cell, and supports frozen rows/columns via dedicated layers.
 */
export class GridRenderer {
  readonly selection: SelectionService;
  readonly editing: EditService;
  private container: HTMLElement;
  private worksheet: Worksheet;
  private workbook: Workbook;
  private options: Required<GridRendererOptions>;
  private root!: HTMLElement;
  private scrollEl!: HTMLElement;
  private spacerEl!: HTMLElement;
  private cellLayer!: HTMLElement;
  private selectionOverlay!: HTMLElement;
  private colHeaderEl!: HTMLElement;
  private rowHeaderEl!: HTMLElement;
  private cornerEl!: HTMLElement;
  private frozenTopEl!: HTMLElement;
  private frozenLeftEl!: HTMLElement;
  private editorInput: HTMLInputElement | null = null;
  private fillHandle: HTMLElement | null = null;
  private fillPreview!: HTMLElement;
  private fillRangeLabel!: HTMLElement;
  private mediaLayer: HTMLElement | null = null;
  private cellPool: HTMLElement[] = [];
  private activeCells = new Map<string, HTMLElement>();
  private activeRows = new Map<number, HTMLElement>();
  private domId: string;
  private disposePlugins: (() => void) | null = null;
  private unlistenOperations: (() => void) | null = null;
  private unlistenSelection: (() => void) | null = null;
  private selectionVisible = true;
  private scrollRow = 0;
  private scrollCol = 0;
  private destroyed = false;
  private shell?: EditorShell;
  private resizeObserver?: ResizeObserver;
  private headerResize: HeaderResize | null = null;
  private sheetViews = new Map<string, { selection: SelectionState; left: number; top: number }>();

  constructor(container: HTMLElement, workbook: Workbook, options: GridRendererOptions = {}) {
    this.container = container;
    this.workbook = workbook;
    this.worksheet = workbook.activeWorksheet;
    this.domId = `ezygrid-${Math.random().toString(36).slice(2, 10)}`;
    this.options = {
      mode: options.mode ?? 'editor',
      topbar: options.topbar ?? true,
      sheetTabs: options.sheetTabs ?? true,
      statusBar: options.statusBar ?? true,
      overscanRows: options.overscanRows ?? 5,
      overscanColumns: options.overscanColumns ?? 2,
      headerHeight: options.headerHeight ?? 24,
      headerWidth: options.headerWidth ?? 48,
      formulaBar: options.formulaBar ?? true,
      toolbar: options.toolbar ?? options.mode !== 'grid',
      contextMenu: options.contextMenu ?? true,
      direction: options.direction ?? 'ltr',
    };
    this.selection = new SelectionService(this.worksheet.rowCount, this.worksheet.columnCount);
    this.editing = new EditService();
    try {
      this.registerDefaultCommands();
      this.build();
      this.bind();
      if (this.options.mode === 'editor') this.shell = new EditorShell(this.container, this.root, workbook, this, this.options);
      const Observer = this.container.ownerDocument.defaultView?.ResizeObserver;
      if (Observer) {
        this.resizeObserver = new Observer(() => this.render());
        this.resizeObserver.observe(this.root);
      }
      this.render();
      // Model changes drive rendering: edits, structural operations and
      // undo/redo replay refresh the visible projection automatically.
      // Cross-sheet operations also repaint because visible formulas may
      // depend on the edited sheet (F20).
      this.unlistenOperations = workbook.onOperation((operation) => {
        if (this.destroyed) return;
        const resizing = this.headerResize !== null;
        this.clearHeaderResize();
        this.syncWorksheet();
        if (operation.type.startsWith('worksheet.') || operation.type === 'document.load') {
          this.render();
          return;
        }
        switch (operation.type) {
          case 'cell.set':
          case 'meta.set':
          case 'merges.set':
          case 'rows.resize':
          case 'columns.resize':
            break;
          case 'workbook.update': {
            const operations = (operation.payload as { operations?: import('@ezygrid/model').Operation[] }).operations ?? [];
            for (const change of operations) {
              if (change.worksheetId !== this.worksheet.id || !/^(rows|columns)\.(insert|delete)$/.test(change.type)) continue;
              const { index, count } = change.payload as { index: number; count: number };
              this.selection.transformAxis(change.type.startsWith('rows') ? 'row' : 'column', index, change.type.endsWith('insert') ? count : -count);
            }
            this.selection.resize(this.worksheet.rowCount, this.worksheet.columnCount);
            break;
          }
          case 'rows.insert':
          case 'rows.delete':
          case 'columns.insert':
          case 'columns.delete': {
            if (operation.worksheetId === this.worksheet.id) {
              const payload = operation.payload as { index: number; count: number };
              const axis = operation.type.startsWith('rows') ? 'row' : 'column';
              const delta = operation.type.endsWith('insert') ? payload.count : -payload.count;
              // Selection bounds, anchors and ranges follow structural
              // changes (F15).
              this.selection.transformAxis(axis, payload.index, delta);
              this.selection.resize(this.worksheet.rowCount, this.worksheet.columnCount);
            }
            break;
          }
          case 'undo':
          case 'redo':
            // Replay can apply structural operations; resync bounds (F15).
            this.selection.resize(this.worksheet.rowCount, this.worksheet.columnCount);
            break;
          default:
            if (resizing) this.render();
            return;
        }
        this.render();
      });
      // Plugins run once the public surfaces (commands, renderer) exist (§44).
      // The attachment is tracked so renderer disposal releases exactly its
      // own plugin resources (F17).
      this.disposePlugins = workbook.pluginManager.attach({
        workbook: this.workbook,
        worksheet: this.worksheet,
        commands: this.commands,
        renderer: this,
      });
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  private get topInset(): number {
    return (
      (this.options.formulaBar ? 24 : 0) +
      (this.options.toolbar && this.options.mode === 'grid' ? 32 : 0)
    );
  }

  private formulaBarEl: HTMLElement | null = null;
  private nameBox: HTMLInputElement | null = null;
  private formulaInput: HTMLInputElement | null = null;
  private formulaBarEdit: { row: number; column: number; initial: string } | null = null;
  private contextMenuEl: HTMLElement | null = null;
  private zoom = 1;
  /** Pagination view state (§22). */
  private pagination: { pageSize: number; page: number } | null = null;

  /** Enable a paginated view (database-grid mode). */
  enablePagination(pageSize: number): void {
    this.pagination = { pageSize: Math.max(1, pageSize), page: 0 };
    this.render();
  }

  disablePagination(): void {
    this.pagination = null;
    this.render();
  }

  setPage(page: number): void {
    if (!this.pagination) return;
    const pageCount = Math.ceil(this.worksheet.rowCount / this.pagination.pageSize);
    this.pagination.page = Math.max(0, Math.min(pageCount - 1, page));
    this.render();
  }

  getPage(): number {
    return this.pagination?.page ?? 0;
  }

  getPageCount(): number {
    if (!this.pagination) return 1;
    return Math.max(1, Math.ceil(this.worksheet.rowCount / this.pagination.pageSize));
  }

  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) return;
    this.clearHeaderResize();
    this.zoom = zoom;
    for (const [, el] of this.activeCells) {
      el.remove();
      this.cellPool.push(el);
    }
    this.activeCells.clear();
    this.render();
  }

  getZoom(): number {
    return this.zoom;
  }

  // Preview geometry is local to this renderer; worksheet sizes stay committed.
  private axisOffset(axis: ResizeAxis, index: number): number {
    const sizes = axis === 'row' ? this.worksheet.rowSizes : this.worksheet.columnSizes;
    const drag = this.headerResize;
    const delta = drag?.axis === axis && index > drag.index ? drag.size - drag.originalSize : 0;
    return sizes.prefixSum(index) + delta;
  }

  private axisSize(axis: ResizeAxis, index: number): number {
    const drag = this.headerResize;
    if (drag?.axis === axis && drag.index === index) return drag.size;
    return (axis === 'row' ? this.worksheet.rowSizes : this.worksheet.columnSizes).sizeOf(index);
  }

  private axisIndex(axis: ResizeAxis, pixel: number): number {
    const sizes = axis === 'row' ? this.worksheet.rowSizes : this.worksheet.columnSizes;
    if (this.headerResize?.axis !== axis) return sizes.indexAt(pixel);
    const count = axis === 'row' ? this.worksheet.rowCount : this.worksheet.columnCount;
    let low = 0;
    let high = count;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (this.axisOffset(axis, mid) <= pixel) low = mid;
      else high = mid - 1;
    }
    return Math.max(0, Math.min(count - 1, low));
  }

  // Zoom-aware coordinate helpers, including the end boundary of an axis.
  private zOffsetX(column: number): number {
    return this.axisOffset('column', column) * this.zoom;
  }

  private zOffsetY(row: number): number {
    return this.axisOffset('row', row) * this.zoom;
  }

  private zSizeX(column: number): number {
    return this.axisSize('column', column) * this.zoom;
  }

  private zSizeY(row: number): number {
    return this.axisSize('row', row) * this.zoom;
  }

  private zIndexRow(pixel: number): number {
    return this.axisIndex('row', pixel / this.zoom);
  }

  private zIndexColumn(pixel: number): number {
    return this.axisIndex('column', pixel / this.zoom);
  }

  private build(): void {
    const doc = this.container.ownerDocument;
    this.root = doc.createElement('div');
    this.root.className = 'ezygrid';
    this.root.tabIndex = 0;
    this.root.style.position = 'relative';
    this.root.style.width = '100%';
    this.root.style.height = '100%';
    this.root.style.overflow = 'hidden';
    this.root.style.userSelect = 'none';
    this.root.style.boxSizing = 'border-box';
    this.root.style.fontFamily = 'var(--ezygrid-font-family, Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", sans-serif)';
    this.root.style.fontSize = 'var(--ezygrid-font-size, 13px)';
    this.root.style.background = 'var(--ezygrid-bg, #ffffff)';
    this.root.style.color = 'var(--ezygrid-text, #0f172a)';
    this.root.setAttribute('role', 'grid');
    this.root.setAttribute('aria-rowcount', String(this.worksheet.rowCount));
    this.root.setAttribute('aria-colcount', String(this.worksheet.columnCount));
    if (this.options.direction === 'rtl') {
      this.root.style.direction = 'rtl';
    }

    this.scrollEl = doc.createElement('div');
    this.scrollEl.className = 'ezygrid-scroll';
    Object.assign(this.scrollEl.style, {
      position: 'absolute',
      left: `${this.options.headerWidth}px`,
      top: `${this.options.headerHeight + this.topInset}px`,
      right: '0',
      bottom: '0',
      overflow: 'auto',
    } as CSSStyleDeclaration);

    this.spacerEl = doc.createElement('div');
    this.spacerEl.className = 'ezygrid-spacer';
    this.scrollEl.appendChild(this.spacerEl);

    this.cellLayer = doc.createElement('div');
    this.cellLayer.className = 'ezygrid-cells';
    // Children use content coordinates; the native scroller moves them once.
    Object.assign(this.cellLayer.style, { position: 'absolute', left: '0', top: '0' });
    this.scrollEl.appendChild(this.cellLayer);

    this.mediaLayer = doc.createElement('div');
    this.mediaLayer.className = 'ezygrid-media';
    Object.assign(this.mediaLayer.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);
    this.scrollEl.appendChild(this.mediaLayer);

    this.selectionOverlay = doc.createElement('div');
    this.selectionOverlay.className = 'ezygrid-selection';
    Object.assign(this.selectionOverlay.style, {
      position: 'absolute',
      boxSizing: 'border-box',
      border: '2px solid var(--ezygrid-selection, #00c47a)',
      pointerEvents: 'none',
      display: 'none',
    } as CSSStyleDeclaration);
    this.scrollEl.appendChild(this.selectionOverlay);

    this.fillPreview = doc.createElement('div');
    this.fillPreview.className = 'ezygrid-fill-preview';
    Object.assign(this.fillPreview.style, {
      position: 'absolute',
      boxSizing: 'border-box',
      border: '2px dashed var(--ezygrid-selection, #00c47a)',
      background: 'var(--ezygrid-selection-soft, rgba(0,196,122,0.12))',
      pointerEvents: 'none',
      zIndex: '4',
      display: 'none',
    });
    this.scrollEl.appendChild(this.fillPreview);

    this.fillRangeLabel = doc.createElement('div');
    this.fillRangeLabel.className = 'ezygrid-fill-range';
    this.fillRangeLabel.setAttribute('role', 'status');
    Object.assign(this.fillRangeLabel.style, {
      position: 'absolute',
      padding: '4px 8px',
      border: '1px solid var(--ezygrid-selection, #00c47a)',
      borderRadius: '4px',
      background: 'var(--ezygrid-bg, #fff)',
      color: 'var(--ezygrid-text, #0f172a)',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      fontSize: '12px',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: '20',
      display: 'none',
    });
    this.root.appendChild(this.fillRangeLabel);

    this.fillHandle = doc.createElement('div');
    this.fillHandle.className = 'ezygrid-fillhandle';
    this.fillHandle.title = 'Drag to select cells. Alt+drag to autofill. Press Escape to cancel.';
    Object.assign(this.fillHandle.style, {
      position: 'absolute',
      width: '8px',
      height: '8px',
      background: 'var(--ezygrid-selection, #00c47a)',
      boxShadow: '0 0 0 1px var(--ezygrid-bg, #fff)',
      zIndex: '5',
      cursor: 'crosshair',
      display: 'none',
    } as CSSStyleDeclaration);
    this.scrollEl.appendChild(this.fillHandle);

    this.colHeaderEl = doc.createElement('div');
    this.colHeaderEl.className = 'ezygrid-colheader';
    Object.assign(this.colHeaderEl.style, {
      position: 'absolute',
      top: `${this.topInset}px`,
      left: `${this.options.headerWidth}px`,
      right: '0',
      height: `${this.options.headerHeight}px`,
      overflow: 'hidden',
    } as CSSStyleDeclaration);

    this.rowHeaderEl = doc.createElement('div');
    this.rowHeaderEl.className = 'ezygrid-rowheader';
    Object.assign(this.rowHeaderEl.style, {
      position: 'absolute',
      top: `${this.options.headerHeight + this.topInset}px`,
      left: '0',
      width: `${this.options.headerWidth}px`,
      bottom: '0',
      overflow: 'hidden',
    } as CSSStyleDeclaration);

    this.cornerEl = doc.createElement('div');
    this.cornerEl.className = 'ezygrid-corner';
    Object.assign(this.cornerEl.style, {
      position: 'absolute',
      top: `${this.topInset}px`,
      left: '0',
      width: `${this.options.headerWidth}px`,
      height: `${this.options.headerHeight}px`,
      background: 'var(--ezygrid-header-bg, #e6fff4)',
      borderRight: '1px solid var(--ezygrid-gridline, #e2e8f0)',
      borderBottom: '1px solid var(--ezygrid-gridline, #e2e8f0)',
    } as CSSStyleDeclaration);

    this.frozenTopEl = doc.createElement('div');
    this.frozenTopEl.className = 'ezygrid-frozen-top';
    Object.assign(this.frozenTopEl.style, {
      position: 'absolute',
      left: `${this.options.headerWidth}px`,
      top: `${this.options.headerHeight + this.topInset}px`,
      right: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);

    this.frozenLeftEl = doc.createElement('div');
    this.frozenLeftEl.className = 'ezygrid-frozen-left';
    Object.assign(this.frozenLeftEl.style, {
      position: 'absolute',
      left: `${this.options.headerWidth}px`,
      top: `${this.options.headerHeight + this.topInset}px`,
      bottom: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);

    if (this.options.formulaBar || this.options.mode === 'editor') {
      const bar = doc.createElement('div');
      bar.className = 'ezygrid-formulabar';
      Object.assign(bar.style, {
        position: 'absolute',
        top: `${this.options.toolbar && this.options.mode === 'grid' ? 32 : 0}px`,
        left: '0',
        right: '0',
        height: '24px',
        display: this.options.formulaBar ? 'flex' : 'none',
        alignItems: 'stretch',
        boxSizing: 'border-box',
      } as CSSStyleDeclaration);
      this.nameBox = doc.createElement('input') as HTMLInputElement;
      this.nameBox.className = 'ezygrid-namebox';
      Object.assign(this.nameBox.style, {
        width: '90px',
        boxSizing: 'border-box',
      } as CSSStyleDeclaration);
      this.nameBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.navigateToAddress(this.nameBox!.value);
          this.nameBox!.blur();
        }
        e.stopPropagation();
      });
      this.formulaInput = doc.createElement('input') as HTMLInputElement;
      this.formulaInput.className = 'ezygrid-formulainput';
      Object.assign(this.formulaInput.style, {
        flex: '1',
        boxSizing: 'border-box',
        font: 'inherit',
      } as CSSStyleDeclaration);
      this.formulaInput.addEventListener('focus', () => {
        this.commitEditor();
        this.updateFormulaBar();
        this.beginFormulaBarEdit();
      });
      this.formulaInput.addEventListener('input', () => this.beginFormulaBarEdit());
      this.formulaInput.addEventListener('blur', () => this.commitFormulaBarEdit());
      this.formulaInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          this.commitFormulaBarEdit(true);
          if (e.key === 'Tab') {
            this.selection.move(e.shiftKey ? 'left' : 'right', false, false, this.isFilled);
            this.ensureActiveVisible();
          }
          this.root.focus({ preventScroll: true });
          this.render();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.formulaBarEdit = null;
          this.updateFormulaBar();
          this.root.focus({ preventScroll: true });
        }
      });
      bar.append(this.nameBox, this.formulaInput);
      this.formulaBarEl = bar;
      if (this.options.formulaBar) this.root.appendChild(bar);
    }

    if (this.options.toolbar && this.options.mode === 'grid') {
      const toolbar = doc.createElement('div');
      toolbar.className = 'ezygrid-toolbar';
      Object.assign(toolbar.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0 4px',
        boxSizing: 'border-box',
      } as CSSStyleDeclaration);
      const buttonIds = [
        'edit.undo',
        'edit.redo',
        'format.bold',
        'format.italic',
        'format.underline',
        'clipboard.copy',
        'clipboard.cut',
        'clipboard.paste',
        'cells.fillDown',
      ];
      for (const id of buttonIds) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'ezygrid-toolbar-button';
        button.textContent = this.commands.get(id)?.title ?? id;
        button.title = `${id}${this.commands.get(id)?.shortcut ? ` (${this.commands.get(id)!.shortcut})` : ''}`;
        button.addEventListener('click', () => {
          this.commands.execute(id, this.commandContext());
          this.render();
          this.root.focus({ preventScroll: true });
        });
        toolbar.appendChild(button);
      }
      this.root.appendChild(toolbar);
    }

    if (this.options.contextMenu) {
      this.contextMenuEl = doc.createElement('div');
      this.contextMenuEl.className = 'ezygrid-contextmenu';
      Object.assign(this.contextMenuEl.style, {
        position: 'fixed',
        display: 'none',
        minWidth: '160px',
        zIndex: '1000',
      } as CSSStyleDeclaration);
      this.root.appendChild(this.contextMenuEl);
      this.cellLayer.addEventListener('contextmenu', this.onContextMenu);
      doc.addEventListener('mousedown', this.onGlobalMouseDown);
    }

    this.root.append(
      this.scrollEl,
      this.frozenTopEl,
      this.frozenLeftEl,
      this.colHeaderEl,
      this.rowHeaderEl,
      this.cornerEl,
    );
    this.container.appendChild(this.root);
  }

  private bind(): void {
    this.unlistenSelection = this.selection.onChange(() => {
      const active = this.selection.state.active;
      if (this.formulaBarEdit && (this.formulaBarEdit.row !== active.row || this.formulaBarEdit.column !== active.column)) {
        this.commitFormulaBarEdit();
      }
      if (this.fillDragging) this.cancelFillDrag();
      this.renderSelection();
      this.shell?.update();
    });
    this.container.addEventListener('focusin', this.onFocusIn);
    this.container.addEventListener('focusout', this.onFocusOut);
    this.scrollEl.addEventListener('scroll', this.onScroll);
    this.colHeaderEl.addEventListener('pointerdown', this.onHeaderResizeStart);
    this.rowHeaderEl.addEventListener('pointerdown', this.onHeaderResizeStart);
    this.cellLayer.addEventListener('mousedown', this.onMouseDown);
    this.cellLayer.addEventListener('dblclick', this.onDoubleClick);
    this.root.addEventListener('keydown', this.onKeyDown);
    this.root.addEventListener('copy', this.onCopy);
    this.root.addEventListener('cut', this.onCut);
    this.root.addEventListener('paste', this.onPaste);
    if (this.fillHandle) {
      this.fillHandle.addEventListener('mousedown', this.onFillHandleDown);
    }
  }

  private onHeaderResizeStart = (event: PointerEvent): void => {
    if (event.button !== 0 || this.headerResize) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-resize-axis]');
    if (!handle) return;
    const axis = handle.dataset.resizeAxis as ResizeAxis;
    const index = Number(handle.dataset.resizeIndex);
    event.preventDefault();
    event.stopPropagation();
    this.commitEdits();
    this.cancelFillDrag();
    this.root.focus({ preventScroll: true });
    const capture = axis === 'row' ? this.rowHeaderEl : this.colHeaderEl;
    const size = this.axisSize(axis, index);
    this.headerResize = {
      worksheet: this.worksheet, axis, index, originalSize: size, size,
      start: axis === 'row' ? event.clientY : event.clientX,
      zoom: this.zoom, pointerId: event.pointerId, capture,
      cursor: this.root.style.cursor, userSelect: this.root.style.userSelect,
    };
    this.root.style.cursor = axis === 'row' ? 'row-resize' : 'col-resize';
    this.root.style.userSelect = 'none';
    const doc = this.container.ownerDocument;
    doc.addEventListener('pointermove', this.onHeaderResizeMove);
    doc.addEventListener('pointerup', this.onHeaderResizeEnd);
    doc.addEventListener('pointercancel', this.onHeaderResizeCancel);
    doc.addEventListener('keydown', this.onHeaderResizeKeyDown, true);
    capture.addEventListener('lostpointercapture', this.onHeaderResizeCancel);
    doc.defaultView?.addEventListener('blur', this.cancelHeaderResize);
    capture.setPointerCapture?.(event.pointerId);
  };

  private updateHeaderResize(event: PointerEvent): void {
    const drag = this.headerResize;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const position = drag.axis === 'row' ? event.clientY : event.clientX;
    // Preserve an existing size below the interactive minimum on a click alone.
    drag.size = position === drag.start ? drag.originalSize : Math.max(
      drag.axis === 'row' ? 16 : 24,
      drag.originalSize + (position - drag.start) / drag.zoom,
    );
  }

  private onHeaderResizeMove = (event: PointerEvent): void => {
    if (this.headerResize?.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.updateHeaderResize(event);
    this.render();
  };

  private onHeaderResizeEnd = (event: PointerEvent): void => {
    const drag = this.headerResize;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.updateHeaderResize(event);
    this.clearHeaderResize();
    if (drag.size !== drag.originalSize) {
      if (drag.axis === 'row') drag.worksheet.setRowHeight(drag.index, drag.size);
      else drag.worksheet.setColumnWidth(drag.index, drag.size);
    }
    this.render();
  };

  private onHeaderResizeCancel = (event: PointerEvent): void => {
    if (this.headerResize?.pointerId === event.pointerId) this.cancelHeaderResize();
  };

  private onHeaderResizeKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelHeaderResize();
  };

  private cancelHeaderResize = (): void => {
    if (!this.headerResize) return;
    this.clearHeaderResize();
    this.render();
  };

  private clearHeaderResize(): void {
    const drag = this.headerResize;
    if (!drag) return;
    this.headerResize = null;
    const doc = this.container.ownerDocument;
    doc.removeEventListener('pointermove', this.onHeaderResizeMove);
    doc.removeEventListener('pointerup', this.onHeaderResizeEnd);
    doc.removeEventListener('pointercancel', this.onHeaderResizeCancel);
    doc.removeEventListener('keydown', this.onHeaderResizeKeyDown, true);
    drag.capture.removeEventListener('lostpointercapture', this.onHeaderResizeCancel);
    doc.defaultView?.removeEventListener('blur', this.cancelHeaderResize);
    if (drag.capture.hasPointerCapture?.(drag.pointerId)) drag.capture.releasePointerCapture(drag.pointerId);
    this.root.style.cursor = drag.cursor;
    this.root.style.userSelect = drag.userSelect;
  }

  private onFocusIn = (): void => {
    this.selectionVisible = true;
    this.renderSelection();
  };

  private onFocusOut = (event: FocusEvent): void => {
    if (event.relatedTarget instanceof Node && this.container.contains(event.relatedTarget)) return;
    this.selectionVisible = false;
    this.cancelFillDrag();
    this.renderSelection();
  };

  private onFillHandleDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.commitEditor();
    this.root.focus({ preventScroll: true });
    this.fillDragging = true;
    this.autofillDragging = event.altKey;
    this.fillSource = { ...this.selection.primary };
    this.fillTarget = null;
    this.fillPointer = { x: event.clientX, y: event.clientY };
    this.root.style.cursor = 'crosshair';
    const doc = this.container.ownerDocument;
    doc.addEventListener('mousemove', this.onFillDragMove);
    doc.addEventListener('mouseup', this.onFillDragEnd);
    doc.addEventListener('keydown', this.onFillDragKeyDown, true);
    doc.defaultView?.addEventListener('blur', this.cancelFillDrag);
    this.renderFillPreview();
  };

  private onFillDragMove = (event: MouseEvent): void => {
    if (!this.fillDragging) return;
    const cell = (event.target as HTMLElement).closest?.('.ezygrid-cell');
    this.fillPointer = { x: event.clientX, y: event.clientY };
    this.fillTarget = null;
    if (cell instanceof HTMLElement && this.root.contains(cell)) {
      const { row, col } = cell.dataset;
      if (row !== undefined && col !== undefined) {
        this.fillTarget = { row: Number(row), column: Number(col) };
      }
    }
    this.renderFillPreview();
  };

  private onFillDragKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelFillDrag();
    }
  };

  private cancelFillDrag = (): void => {
    this.fillDragging = false;
    this.autofillDragging = false;
    this.fillSource = null;
    this.fillTarget = null;
    this.fillPointer = null;
    if (this.fillPreview) this.fillPreview.style.display = 'none';
    if (this.fillRangeLabel) this.fillRangeLabel.style.display = 'none';
    if (this.root) this.root.style.cursor = '';
    const doc = this.container.ownerDocument;
    doc.removeEventListener('mousemove', this.onFillDragMove);
    doc.removeEventListener('mouseup', this.onFillDragEnd);
    doc.removeEventListener('keydown', this.onFillDragKeyDown, true);
    doc.defaultView?.removeEventListener('blur', this.cancelFillDrag);
    this.updateFormulaBar();
  };

  private onContextMenu = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const row = target.dataset?.row;
    const column = target.dataset?.col;
    if (row === undefined || column === undefined) return;
    event.preventDefault();
    this.commitEditor();
    const r = Number(row);
    const c = Number(column);
    if (!this.selection.isWithin(r, c)) {
      this.selection.setActive(r, c);
      this.render();
    }
    this.root.focus({ preventScroll: true });
    this.showContextMenu(event.clientX, event.clientY);
  };

  private onGlobalMouseDown = (event: MouseEvent): void => {
    if (!this.contextMenuEl) return;
    if (!this.contextMenuEl.contains(event.target as Node)) {
      this.contextMenuEl.style.display = 'none';
    }
  };

  private showContextMenu(clientX: number, clientY: number): void {
    const menu = this.contextMenuEl;
    if (!menu) return;
    const doc = this.container.ownerDocument;
    menu.textContent = '';
    const items: { label: string; run: () => void }[] = [
      { label: 'Cut', run: () => this.commands.execute('clipboard.cut', this.commandContext()) },
      { label: 'Copy', run: () => this.commands.execute('clipboard.copy', this.commandContext()) },
      { label: 'Paste', run: () => this.commands.execute('clipboard.paste', this.commandContext()) },
      { label: 'Edit cell', run: () => this.beginEditAt() },
      { label: 'Fill down', run: () => this.commands.execute('cells.fillDown', this.commandContext()) },
      {
        label: 'Clear contents',
        run: () => {
          this.clearSelectedContents();
        },
      },
      {
        label: 'Clear formatting',
        run: () => this.commands.execute('format.clear', this.commandContext()),
      },
    ];
    menu.setAttribute('role', 'menu');
    for (const item of items) {
      const el = doc.createElement('div');
      el.className = 'ezygrid-contextmenu-item';
      el.textContent = item.label;
      el.setAttribute('role', 'menuitem');
      el.tabIndex = 0;
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); el.click(); }
        else if (event.key === 'Escape') { event.preventDefault(); menu.style.display = 'none'; this.focus(); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const next = event.key === 'ArrowDown' ? el.nextElementSibling ?? menu.firstElementChild : el.previousElementSibling ?? menu.lastElementChild;
          (next as HTMLElement)?.focus();
        }
        event.stopPropagation();
      });
      Object.assign(el.style, {
        padding: '6px 12px',
        cursor: 'pointer',
      } as CSSStyleDeclaration);
      el.addEventListener('click', () => {
        this.root.focus({ preventScroll: true });
        try { item.run(); } catch (error) { this.shell?.message(error); }
        menu.style.display = 'none';
        this.render();
      });
      menu.appendChild(el);
    }
    Object.assign(menu.style, {
      display: 'block',
      left: `${clientX}px`,
      top: `${clientY}px`,
      background: 'var(--ezygrid-bg, #fff)',
      border: '1px solid var(--ezygrid-gridline, #e2e8f0)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    } as CSSStyleDeclaration);
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(clientX, (doc.defaultView?.innerWidth ?? clientX + bounds.width) - bounds.width))}px`;
    menu.style.top = `${Math.max(0, Math.min(clientY, (doc.defaultView?.innerHeight ?? clientY + bounds.height) - bounds.height))}px`;
  }

  private onFillDragEnd = (event: MouseEvent): void => {
    if (!this.fillDragging || event.button !== 0) return;
    // A release on the host can follow the last valid cell move. Preserve that
    // endpoint, but cancel when the release occurs outside this editor.
    const cell = (event.target as HTMLElement).closest?.('.ezygrid-cell');
    if (cell) this.onFillDragMove(event);
    else if (!(event.target instanceof Node) || !this.container.contains(event.target)) this.fillTarget = null;
    const source = this.fillSource;
    const plan = this.getFillPlan();
    const autofill = this.autofillDragging;
    this.cancelFillDrag();
    if (!source || !plan) return;
    // Expanding a selection must never write cell data. Only an explicit
    // Alt+drag requests autofill (which may overwrite destination values).
    if (autofill) this.batchHistory(() => this.fill.fillRange(this.worksheet, source, plan));
    this.selection.setActive(plan.top, plan.left);
    this.selection.extendTo(plan.bottom, plan.right);
    this.render();
  };

  private onScroll = (): void => {
    this.scrollRow = this.zIndexRow(this.scrollTop());
    this.scrollCol = this.zIndexColumn(this.scrollLeft());
    this.render();
  };

  private onMouseDown = (event: MouseEvent): void => {
    // Right-click selection is handled by the context menu so ranges survive.
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const row = target.dataset?.row;
    const column = target.dataset?.col;
    if (row === undefined || column === undefined) return;
    let r = Number(row);
    let c = Number(column);
    const merge = this.worksheet.merges.findAt(r, c);
    if (merge) {
      r = merge.top;
      c = merge.left;
    }
    // While editing a formula, clicking a cell inserts its reference (§11.4).
    if (this.editorInput && this.editorInput.value.startsWith('=')) {
      event.preventDefault();
      event.stopPropagation();
      const editor = this.editorInput;
      const insert = editor.selectionStart ?? editor.value.length;
      const reference = this.worksheet === this.workbook.getWorksheet(this.worksheet.name)
        ? toA1(r, c)
        : `${this.worksheet.name}!${toA1(r, c)}`;
      editor.value =
        editor.value.slice(0, insert) + reference + editor.value.slice(editor.selectionEnd ?? insert);
      const caret = insert + reference.length;
      editor.setSelectionRange(caret, caret);
      editor.focus();
      this.updateSuggestions(editor);
      return;
    }
    event.preventDefault();
    this.commitEditor();
    if (event.shiftKey) {
      this.selection.extendTo(r, c);
    } else if (event.ctrlKey || event.metaKey) {
      this.selection.addRange(r, c);
    } else {
      this.selection.setActive(r, c);
    }
    this.root.focus({ preventScroll: true });
  };

  private onDoubleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.dataset.row === undefined || target.dataset.col === undefined) return;
    if (this.editing.editing) return;
    event.preventDefault();
    this.beginEditAt();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]')) return;
    if (this.fillDragging) {
      event.preventDefault();
      return;
    }
    if (this.editing.editing) return;
    if (this.editorInput) return;
    const ctrl = event.ctrlKey || event.metaKey;

    if (ctrl && (event.key === 'b' || event.key === 'B')) {
      event.preventDefault();
      this.commands.execute('format.bold', this.commandContext());
      this.render();
      return;
    }
    if (ctrl && (event.key === 'i' || event.key === 'I')) {
      event.preventDefault();
      this.commands.execute('format.italic', this.commandContext());
      this.render();
      return;
    }
    if (ctrl && (event.key === 'u' || event.key === 'U')) {
      event.preventDefault();
      this.commands.execute('format.underline', this.commandContext());
      this.render();
      return;
    }
    if (ctrl && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      this.workbook.undo();
      this.render();
      return;
    }
    if (ctrl && (event.key === 'y' || event.key === 'Y')) {
      event.preventDefault();
      this.workbook.redo();
      this.render();
      return;
    }
    if (ctrl && (event.key === 'd' || event.key === 'D')) {
      event.preventDefault();
      this.commands.execute('cells.fillDown', this.commandContext());
      this.render();
      return;
    }
    // Handle clipboard keys directly: environments without native clipboard
    // event synthesis (happy-dom, some embedded webviews) never dispatch
    // copy/cut/paste from a synthetic keydown, so the grid would drop the
    // gesture. copySelection/pasteSelection write through navigator.clipboard
    // when available and fall back to the internal buffer (§12).
    if (ctrl && ['c', 'x', 'v'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const key = event.key.toLowerCase();
      if (key === 'v') {
        void this.pasteSelection();
      } else {
        this.copySelection(key === 'x');
        this.render();
      }
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      this.beginEditAt();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.selection.move('down', event.shiftKey, false, this.isFilled);
      this.render();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.selection.move(event.shiftKey ? 'left' : 'right', false, false, this.isFilled);
      this.render();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.clearSelectedContents();
      this.render();
      return;
    }
    if (HANDLED_NAV_KEYS.has(event.key)) {
      const direction =
        event.key === 'ArrowUp' ? 'up'
        : event.key === 'ArrowDown' ? 'down'
        : event.key === 'ArrowLeft' ? 'left'
        : event.key === 'ArrowRight' ? 'right'
        : event.key === 'PageDown' ? 'down'
        : event.key === 'PageUp' ? 'up'
        : event.key === 'Home' ? 'left'
        : 'right';
      event.preventDefault();
      this.selection.move(direction, event.shiftKey, ctrl, this.isFilled);
      this.ensureActiveVisible();
      this.render();
      return;
    }
    if (event.key.length === 1 && !ctrl && !event.altKey) {
      event.preventDefault();
      this.beginEditAt(event.key);
    }
  };

  private clipboard = new ClipboardService();
  readonly commands = new CommandRegistry();
  private fill = new FillService();
  private fillDragging = false;
  private autofillDragging = false;
  private fillSource: Rect | null = null;
  private fillTarget: { row: number; column: number } | null = null;
  private fillPointer: { x: number; y: number } | null = null;

  /** Share one destination calculation between the preview and the actual fill. */
  private getFillPlan(): Rect | null {
    const source = this.fillSource;
    const target = this.fillTarget;
    if (!source || !target) return null;
    if (target.row >= source.top && target.row <= source.bottom &&
        target.column >= source.left && target.column <= source.right) return null;
    return {
      top: Math.min(source.top, target.row),
      bottom: Math.max(source.bottom, target.row),
      left: Math.min(source.left, target.column),
      right: Math.max(source.right, target.column),
    };
  }

  private renderFillPreview(): void {
    if (!this.fillDragging || !this.fillSource || !this.fillPointer) return;
    const range = this.getFillPlan() ?? this.fillSource;
    Object.assign(this.fillPreview.style, {
      display: 'block',
      left: `${this.zOffsetX(range.left)}px`,
      top: `${this.zOffsetY(range.top)}px`,
      width: `${this.zOffsetX(range.right + 1) - this.zOffsetX(range.left)}px`,
      height: `${this.zOffsetY(range.bottom + 1) - this.zOffsetY(range.top)}px`,
    });
    const address = `${toA1(range.top, range.left)}:${toA1(range.bottom, range.right)}`;
    if (this.fillRangeLabel.textContent !== address) this.fillRangeLabel.textContent = address;
    if (this.nameBox) this.nameBox.value = address;
    this.fillRangeLabel.style.display = 'block';
    const bounds = this.root.getBoundingClientRect();
    const left = Math.max(0, Math.min(
      this.fillPointer.x - bounds.left + 14,
      this.root.clientWidth - this.fillRangeLabel.offsetWidth - 8,
    ));
    const top = Math.max(0, Math.min(
      this.fillPointer.y - bounds.top + 18,
      this.root.clientHeight - this.fillRangeLabel.offsetHeight - 8,
    ));
    this.fillRangeLabel.style.left = `${left}px`;
    this.fillRangeLabel.style.top = `${top}px`;
  }

  /** Group a multi-cell user action into one history entry (F09). */
  private batchHistory(run: () => void): void {
    const history = this.workbook.history;
    history.beginBatch();
    try {
      run();
    } finally {
      history.endBatch();
    }
  }

  private clearSelectedContents(): void {
    const ranges = this.selection.state.ranges.map((range) => ({ ...range }));
    const cells: { row: number; column: number }[] = [];
    // Visit stored content only, so whole-row/column selections stay sparse.
    // Snapshot before writes: clearing formulas can update the cell store.
    this.worksheet.cells.forEach((row, column, record) => {
      if ((record.formula !== undefined || record.raw != null) &&
          ranges.some((range) => rectContains(range, row, column))) {
        cells.push({ row, column });
      }
    });
    this.batchHistory(() => {
      for (const { row, column } of cells) {
        this.worksheet.setValue(row, column, null);
      }
    });
  }

  private commandContext(): CommandContext {
    return { workbook: this.workbook, worksheet: this.worksheet, selection: this.selection };
  }

  private registerDefaultCommands(): void {
    for (const command of createDefaultCommands({
      copy: () => this.copySelection(false),
      cut: () => this.copySelection(true),
      paste: () => { void this.pasteSelection(); },
      fillDown: (ctx) => {
        const primary = ctx.selection.primary;
        if (primary.bottom > primary.top) {
          this.fill.fill(ctx.worksheet, 'down', primary, primary.bottom);
        } else {
          // single cell: copy the value from the cell above
          const above = ctx.worksheet.cells.getCell(primary.top - 1, primary.left);
          if (above) {
            ctx.worksheet.setValue(
              primary.top,
              primary.left,
              above.formula !== undefined
                ? translateFormula(above.formula, 1, 0)
                : above.raw ?? null,
            );
          }
        }
      },
    })) {
      this.commands.register(command);
    }
    this.registerStyleCommands();
  }

  private registerStyleCommands(): void {
    const toggle = (id: string, title: string, shortcut: string, prop: 'bold' | 'italic' | 'underline'): void => {
      this.commands.register({
        id,
        title,
        shortcut,
        execute: (ctx) => {
          const primary = ctx.selection.primary;
          const anchor = ctx.worksheet.getStyle(primary.top, primary.left);
          const next = !(anchor?.[prop] ?? false);
          ctx.worksheet.setStyle(
            `${toA1(primary.top, primary.left)}:${toA1(primary.bottom, primary.right)}`,
            { [prop]: next } as CellStyle,
          );
        },
      });
    };
    toggle('format.bold', 'Bold', 'Mod+B', 'bold');
    toggle('format.italic', 'Italic', 'Mod+I', 'italic');
    toggle('format.underline', 'Underline', 'Mod+U', 'underline');
    this.commands.register({
      id: 'format.clear',
      title: 'Clear formatting',
      execute: (ctx) => {
        const primary = ctx.selection.primary;
        ctx.worksheet.clearStyle(
          `${toA1(primary.top, primary.left)}:${toA1(primary.bottom, primary.right)}`,
        );
      },
    });
    for (const align of ['left', 'center', 'right'] as const) {
      this.commands.register({
        id: `format.align.${align}`,
        title: `Align ${align}`,
        execute: (ctx) => {
          const primary = ctx.selection.primary;
          ctx.worksheet.setStyle(
            `${toA1(primary.top, primary.left)}:${toA1(primary.bottom, primary.right)}`,
            { align },
          );
        },
      });
    }
  }

  private isTextControl(target: EventTarget | null): boolean {
    return target instanceof HTMLElement &&
      (target.matches('input, textarea, select') || target.isContentEditable);
  }

  private onCopy = (event: ClipboardEvent): void => {
    if (this.isTextControl(event.target) || !event.clipboardData) return;
    event.preventDefault();
    this.copySelection(false, event.clipboardData);
  };

  private onCut = (event: ClipboardEvent): void => {
    if (this.isTextControl(event.target) || !event.clipboardData) return;
    event.preventDefault();
    this.copySelection(true, event.clipboardData);
  };

  private onPaste = (event: ClipboardEvent): void => {
    if (this.isTextControl(event.target) || !event.clipboardData) return;
    if (!event.clipboardData.types.includes('text/plain')) return;
    event.preventDefault();
    this.pasteText(event.clipboardData.getData('text/plain'));
  };

  private pasteText(text?: string, row = this.selection.state.active.row, column = this.selection.state.active.column): void {
    this.root.querySelector('.ezygrid-clipboard-status')?.remove();
    // Keep styles and relative references for a range copied inside this grid.
    if (text !== undefined && text !== '' && (!this.clipboard.getBuffer() || text !== this.clipboard.toTSV())) {
      this.clipboard.loadTSV(text);
    }
    this.clipboard.pasteTo(this.workbook, this.worksheet, row, column);
    this.render();
  }

  private async pasteSelection(): Promise<void> {
    this.commitEditor();
    const { row, column } = this.selection.state.active;
    const clipboard = this.container.ownerDocument.defaultView?.navigator.clipboard;
    let text: string | undefined;
    if (clipboard?.readText) {
      try {
        text = await clipboard.readText();
      } catch {
        // Internal copy/paste still works when browser clipboard access is denied.
      }
    }
    if (this.destroyed) return;
    if (!text) {
      // No system-clipboard text (denied access, empty clipboard): the
      // internal buffer keeps intra-grid copy/paste working (§12).
      if (!this.clipboard.getBuffer()) {
        this.showClipboardHint();
        return;
      }
      this.pasteText(undefined, row, column);
      return;
    }
    this.pasteText(text, row, column);
  }

  private showClipboardHint(): void {
    let hint = this.root.querySelector<HTMLElement>('.ezygrid-clipboard-status');
    if (!hint) {
      hint = this.container.ownerDocument.createElement('div');
      hint.className = 'ezygrid-clipboard-status';
      hint.setAttribute('role', 'status');
      Object.assign(hint.style, { position: 'absolute', bottom: '0', left: '0', zIndex: '1000', background: 'var(--ezygrid-bg, #fff)', padding: '6px 12px' });
      this.root.appendChild(hint);
    }
    hint.textContent = 'Clipboard access is unavailable. Press Ctrl+V (or Command+V) to paste.';
    this.root.focus({ preventScroll: true });
  }

  private copySelection(cut: boolean, data?: DataTransfer): void {
    this.commitEditor();
    const primary = this.selection.primary;
    this.clipboard.copyFrom(
      this.worksheet,
      primary.top,
      primary.left,
      primary.bottom,
      primary.right,
    );
    const text = this.clipboard.toTSV();
    if (data) {
      data.setData('text/plain', text);
    } else {
      const clipboard = this.container.ownerDocument.defaultView?.navigator.clipboard;
      if (clipboard?.writeText) {
        void clipboard.writeText(text).catch(() => this.copyTextFallback(text));
      } else {
        this.copyTextFallback(text);
      }
    }
    if (cut) {
      this.batchHistory(() => {
        for (let r = primary.top; r <= primary.bottom; r++) {
          for (let c = primary.left; c <= primary.right; c++) {
            this.worksheet.setValue(r, c, null);
          }
        }
      });
    }
  }

  private copyTextFallback(text: string): void {
    if (this.destroyed) return;
    const doc = this.container.ownerDocument;
    const focused = doc.activeElement as HTMLElement | null;
    const input = doc.createElement('textarea');
    input.value = text;
    Object.assign(input.style, { position: 'fixed', left: '-10000px', top: '0' });
    this.root.appendChild(input);
    input.select();
    try {
      doc.execCommand('copy');
    } catch {
      // The internal buffer remains available if native copying is unsupported.
    } finally {
      input.remove();
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    }
  }

  private commitEditor(): void {
    if (!this.editorInput || !this.editing.editing) return;
    const session = this.editing.session!;
    const result = this.worksheet.validations.check(this.worksheet, session.row, session.column, parseEditorValue(this.editorInput.value));
    if (result.message) this.shell?.message(result.message);
    this.editing.commit(this.worksheet, this.editorInput.value);
    this.unmountEditor();
    this.render();
  }

  private isFilled = (row: number, column: number): boolean =>
    this.worksheet.cells.getCell(row, column) !== undefined;

  private beginEditAt(initial?: string): void {
    if (this.editing.editing) return;
    const { row, column } = this.selection.state.active;
    const editorSpec = this.worksheet.getEditorFor(row, column);
    if (editorSpec?.type === 'checkbox') {
      const current = this.worksheet.cells.getCell(row, column);
      const value = current?.raw === true ? false : true;
      this.worksheet.setValue(row, column, value);
      this.render();
      return;
    }
    this.editing.beginEdit(this.worksheet, row, column, initial);
    this.mountEditor();
  }

  private mountEditor(): void {
    if (!this.editing.editing) return;
    const session = this.editing.session;
    if (!session) return;
    const doc = this.container.ownerDocument;
    const { row, column } = session;
    const editorSpec = this.worksheet.getEditorFor(row, column);
    let input: HTMLInputElement | HTMLSelectElement;

    if (editorSpec?.type === 'dropdown') {
      const select = doc.createElement('select') as HTMLSelectElement;
      select.className = 'ezygrid-editor';
      const options = (editorSpec.options as { values?: unknown[] })?.values ?? [];
      select.appendChild(doc.createElement('option'));
      for (const value of options) {
        const option = doc.createElement('option');
        option.value = String(value);
        option.textContent = String(value);
        select.appendChild(option);
      }
      const current = this.worksheet.getValue(row, column);
      if (current !== null) select.value = String(current);
      select.addEventListener('change', () => {
        this.editing.commit(this.worksheet, select.value);
        this.unmountEditor();
        this.render();
        this.root.focus({ preventScroll: true });
      });
      input = select;
    } else {
      const element = doc.createElement('input') as HTMLInputElement;
      element.className = 'ezygrid-editor';
      if (editorSpec?.type === 'number') element.type = 'number';
      else if (editorSpec?.type === 'date') element.type = 'date';
      element.value = session.initial;
      input = element;
    }

    Object.assign(input.style, {
      position: 'absolute',
      boxSizing: 'border-box',
      font: 'inherit',
      zIndex: '10',
      userSelect: 'text',
    } as CSSStyleDeclaration);
    this.positionEditor(input, row, column);
    const cellStyle = this.worksheet.getStyle(row, column);
    input.style.fontFamily = cellStyle?.fontFamily ?? 'inherit';
    input.style.fontSize = cellStyle?.fontSize ? `${cellStyle.fontSize * this.zoom}px` : '';
    input.style.fontWeight = cellStyle?.bold ? 'bold' : '';
    input.style.fontStyle = cellStyle?.italic ? 'italic' : '';
    input.style.textAlign = cellStyle?.align ?? '';
    input.addEventListener('keydown', ((e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        cycleReference(input as HTMLInputElement);
        return;
      }
      // IME candidate confirmation: Enter/Escape during composition must not
      // commit or cancel the edit (F18).
      if (e.isComposing || e.keyCode === 229) {
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        this.editing.commit(this.worksheet, (input as HTMLInputElement).value);
        this.removeSuggestions();
        this.unmountEditor();
        this.render();
        this.root.focus({ preventScroll: true });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.editing.cancel();
        this.removeSuggestions();
        this.unmountEditor();
        this.root.focus({ preventScroll: true });
      } else if (e.key === 'Tab' && this.suggestionEl) {
        e.preventDefault();
        this.applyTopSuggestion(input as HTMLInputElement);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.commitEditor();
        this.selection.move(e.shiftKey ? 'left' : 'right', false, false, this.isFilled);
        this.ensureActiveVisible();
        this.render();
        this.root.focus({ preventScroll: true });
      }
      e.stopPropagation();
    }) as EventListener);
    input.addEventListener('input', () => {
      this.updateSuggestions(input as HTMLInputElement);
    });
    input.addEventListener('blur', () => this.commitEditor());
    if (input instanceof HTMLInputElement && input.value.startsWith('=')) {
      this.updateSuggestions(input);
    }
    this.cellLayer.appendChild(input);
    this.editorInput = input as HTMLInputElement;
    input.focus();
  }

  private suggestionEl: HTMLElement | null = null;

  /** Autocomplete dropdown while editing formulas (§14.7). */
  private updateSuggestions(input: HTMLInputElement): void {
    this.removeSuggestions();
    const value = input.value;
    if (!value.startsWith('=')) return;
    const match = /[A-Za-z0-9.]+$/.exec(value);
    if (!match) return;
    const suggestions = suggest(match[0]);
    if (suggestions.length === 0) return;
    const doc = this.container.ownerDocument;
    const list = doc.createElement('div');
    list.className = 'ezygrid-formula-suggestions';
    Object.assign(list.style, {
      position: 'absolute',
      background: 'var(--ezygrid-bg, #fff)',
      border: '1px solid var(--ezygrid-gridline, #e2e8f0)',
      zIndex: '100',
      fontSize: '12px',
    } as CSSStyleDeclaration);
    list.style.left = input.style.left;
    list.style.top = `${parseFloat(input.style.top) + parseFloat(input.style.height)}px`;
    for (const suggestion of suggestions) {
      const item = doc.createElement('div');
      item.textContent = suggestion.signature ?? suggestion.name;
      Object.assign(item.style, { padding: '2px 8px', cursor: 'pointer' } as CSSStyleDeclaration);
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = replaceFunctionToken(input.value, suggestion.name);
        input.focus();
        this.removeSuggestions();
      });
      list.appendChild(item);
    }
    this.cellLayer.appendChild(list);
    this.suggestionEl = list;
  }

  private applyTopSuggestion(input: HTMLInputElement): void {
    if (!this.suggestionEl) return;
    const first = this.suggestionEl.firstChild as HTMLElement | null;
    if (first?.textContent) {
      const name = first.textContent.split('(')[0]!.trim();
      input.value = replaceFunctionToken(input.value, name);
      input.focus();
    }
    this.removeSuggestions();
  }

  private removeSuggestions(): void {
    this.suggestionEl?.remove();
    this.suggestionEl = null;
  }

  private positionEditor(input: HTMLElement, row: number, column: number): void {
    input.style.left = `${this.zOffsetX(column)}px`;
    input.style.top = `${this.zOffsetY(row)}px`;
    input.style.width = `${this.zSizeX(column)}px`;
    input.style.height = `${this.zSizeY(row)}px`;
  }

  private unmountEditor(): void {
    const input = this.editorInput;
    this.editorInput = null;
    input?.remove();
    this.removeSuggestions();
  }

  private ensureActiveVisible(): void {
    const { row, column } = this.selection.state.active;
    const top = this.scrollTop();
    const left = this.scrollLeft();
    const height = this.viewportHeight();
    const width = this.viewportWidth();
    const cellTop = this.zOffsetY(row);
    const cellBottom = cellTop + this.zSizeY(row);
    const cellLeft = this.zOffsetX(column);
    const cellRight = cellLeft + this.zSizeX(column);
    if (cellTop < top) this.scrollEl.scrollTop = cellTop;
    else if (cellBottom > top + height) this.scrollEl.scrollTop = cellBottom - height;
    if (cellLeft < left) this.scrollEl.scrollLeft = cellLeft;
    else if (cellRight > left + width) this.scrollEl.scrollLeft = cellRight - width;
  }

  private scrollLeft(): number {
    const value = this.scrollEl.scrollLeft;
    return Number.isFinite(value) ? value : 0;
  }

  private scrollTop(): number {
    const value = this.scrollEl.scrollTop;
    return Number.isFinite(value) ? value : 0;
  }

  private viewportHeight(): number {
    return (this.scrollEl.clientHeight ?? 480) || 480;
  }

  private viewportWidth(): number {
    return (this.scrollEl.clientWidth ?? 640) || 640;
  }

  /** Programmatic scroll to make a cell the top-left of the viewport. */
  scrollTo(row: number, column: number): void {
    this.scrollEl.scrollTop = this.zOffsetY(row);
    this.scrollEl.scrollLeft = this.zOffsetX(column);
    this.onScroll();
  }

  navigateToAddress(address: string): void {
    try {
      const definition = this.workbook.definedNames.get(address);
      if (definition?.type === 'range') address = definition.ref;
      const bang = address.lastIndexOf('!');
      if (bang >= 0) {
        const name = address.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'");
        const sheet = this.workbook.getWorksheet(name);
        if (sheet) this.workbook.setActiveWorksheet(sheet.id);
        address = address.slice(bang + 1);
      }
      const rect = parseRange(address);
      this.selection.setActive(rect.top, rect.left);
      this.selection.extendTo(rect.bottom, rect.right);
      this.ensureActiveVisible();
      this.render();
      this.updateFormulaBar();
    } catch {
      // not an address; ignore
    }
  }

  refresh(): void {
    this.render();
  }

  /** Commit drafts before an editor command changes sheet or selection. */
  commitEdits(): void {
    this.commitEditor();
    this.commitFormulaBarEdit();
  }

  focus(): void { this.root.focus({ preventScroll: true }); }

  insertFormula(formula: string): void {
    this.beginEditAt(formula);
  }

  setFormulaBarVisible(visible: boolean): void {
    const previous = this.topInset;
    this.options.formulaBar = visible;
    if (this.formulaBarEl) {
      if (visible) { this.root.append(this.formulaBarEl); this.formulaBarEl.style.display = 'flex'; }
      else this.formulaBarEl.remove();
    }
    const delta = this.topInset - previous;
    for (const element of [this.scrollEl, this.colHeaderEl, this.rowHeaderEl, this.cornerEl, this.frozenTopEl, this.frozenLeftEl]) {
      element.style.top = `${(parseFloat(element.style.top) || 0) + delta}px`;
    }
    this.render();
  }

  private syncWorksheet(): void {
    const next = this.workbook.activeWorksheet;
    if (next === this.worksheet) return;
    this.clearHeaderResize();
    this.formulaBarEdit = null;
    this.editing.cancel();
    this.unmountEditor();
    this.sheetViews.set(this.worksheet.id, {
      selection: structuredClone(this.selection.state), left: this.scrollLeft(), top: this.scrollTop(),
    });
    this.worksheet = next;
    const saved = this.sheetViews.get(next.id);
    this.selection.state = saved?.selection ?? {
      active: { row: 0, column: 0 }, anchor: { row: 0, column: 0 }, ranges: [{ top: 0, left: 0, bottom: 0, right: 0 }],
    };
    this.selection.resize(next.rowCount, next.columnCount);
    this.scrollEl.scrollLeft = saved?.left ?? 0;
    this.scrollEl.scrollTop = saved?.top ?? 0;
    this.contextMenuEl?.style.setProperty('display', 'none');
    if (this.disposePlugins) {
      this.disposePlugins();
      this.disposePlugins = this.workbook.pluginManager.attach({ workbook: this.workbook, worksheet: next, commands: this.commands, renderer: this });
    }
  }

  private acquireCell(): HTMLElement {
    const pooled = this.cellPool.pop();
    if (pooled) return pooled;
    const doc = this.container.ownerDocument;
    const div = doc.createElement('div');
    div.className = 'ezygrid-cell';
    Object.assign(div.style, {
      position: 'absolute',
      boxSizing: 'border-box',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      borderRight: '1px solid var(--ezygrid-gridline, #e2e8f0)',
      borderBottom: '1px solid var(--ezygrid-gridline, #e2e8f0)',
      padding: '0 6px',
      lineHeight: 'calc(var(--ezygrid-font-size, 13px) + 8px)',
      pointerEvents: 'auto',
    } as CSSStyleDeclaration);
    return div;
  }

  private placeCell(
    row: number,
    column: number,
    offsetX: number,
    offsetY: number,
    span?: { width: number; height: number },
  ): void {
    const cell = this.acquireCell();
    // Cells live inside a virtualized row container so assistive technology
    // can derive row ownership and position (F24).
    this.rowElementFor(row).appendChild(cell);
    this.activeCells.set(`${row},${column}`, cell);
    this.paintCell(cell, row, column, offsetX, offsetY, span);
  }

  /** Create or reuse the accessibility row container for a visible row (F24). */
  private rowElementFor(row: number): HTMLElement {
    let rowEl = this.activeRows.get(row);
    if (rowEl) return rowEl;
    const doc = this.container.ownerDocument;
    rowEl = doc.createElement('div');
    rowEl.className = 'ezygrid-row';
    rowEl.setAttribute('role', 'row');
    rowEl.setAttribute('aria-rowindex', String(row + 1));
    Object.assign(rowEl.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${this.zOffsetX(this.worksheet.columnCount)}px`,
      height: '0',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);
    this.activeRows.set(row, rowEl);
    this.cellLayer.appendChild(rowEl);
    return rowEl;
  }

  /** Fill a (new or recycled) cell element with current content and state. */
  private paintCell(
    cell: HTMLElement,
    row: number,
    column: number,
    offsetX: number,
    offsetY: number,
    span?: { width: number; height: number },
  ): void {
    const ws = this.worksheet;
    cell.id = `${this.domId}-cell-${row}-${column}`;
    cell.dataset.row = String(row);
    cell.dataset.col = String(column);
    cell.style.left = `${offsetX}px`;
    cell.style.top = `${offsetY}px`;
    cell.style.width = `${span ? span.width : this.zSizeX(column)}px`;
    cell.style.height = `${span ? span.height : this.zSizeY(row)}px`;
    const value = ws.getValue(row, column);
    const mask = ws.getNumberFormat(row, column);
    cell.textContent = formatValue(value, mask);
    this.applyCellStyle(cell, row, column);
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-colindex', String(column + 1));
    cell.setAttribute('aria-rowindex', String(row + 1));
  }

  private applyCellStyle(cell: HTMLElement, row: number, column: number): void {
    const style = this.worksheet.getStyle(row, column);
    const conditional = this.worksheet.conditionalFormats.evaluate(this.worksheet, row, column);
    const merged: CellStyle = { ...style, ...conditional };
    applyStyle(cell, merged, this.zoom);
    cell.style.fontWeight = merged.bold ? 'bold' : '';
    cell.style.fontStyle = merged.italic ? 'italic' : '';
    cell.style.textDecoration = merged.underline ? 'underline' : '';
    cell.style.color = merged.color ?? '';
    cell.style.textAlign = merged.align ?? '';
    this.setCellBackground(cell, merged.background ?? '');
    // Structured table banding (§25).
    const table = this.worksheet.tables.at(row, column);
    if (table && row > table.range.top) {
      const bandIndex = row - (table.headerRow ? table.range.top + 1 : table.range.top);
      const totalRowCell = table.totalRow && row === table.range.bottom;
      if (totalRowCell) {
        cell.style.fontWeight = 'bold';
      } else if (bandIndex % 2 === 1 && !merged.background) {
        this.setCellBackground(cell, 'var(--ezygrid-table-band, rgba(0,0,0,0.03))');
      }
    }
    // Selection is transient and takes precedence over table banding. Restore
    // the actual cell background on the next selection/focus change.
    if (this.selectionVisible && this.selection.isWithin(row, column)) {
      this.setCellBackground(cell, 'var(--ezygrid-selection-soft, rgba(0,196,122,0.12))');
    }
    cell.setAttribute('aria-selected', this.selection.isWithin(row, column) ? 'true' : 'false');
    const note = this.worksheet.getNote(row, column);
    cell.title = note ?? '';
    cell.dataset.note = note !== undefined ? 'true' : '';
  }

  /**
   * Assign the background through the property API: the shorthand setter
   * cannot reliably replace an existing var() value in some DOM
   * implementations (happy-dom), and a stale selection tint must never
   * survive a restore.
   */
  private setCellBackground(cell: HTMLElement, value: string): void {
    cell.style.removeProperty('background');
    if (value !== '') cell.style.setProperty('background', value);
  }

  private renderFrozen(): void {
    this.frozenTopEl.textContent = '';
    this.frozenLeftEl.textContent = '';
    const freezeRows = (this.worksheet as Worksheet & { freezeRows?: number }).freezeRows ?? 0;
    const freezeCols = (this.worksheet as Worksheet & { freezeColumns?: number }).freezeColumns ?? 0;
    this.frozenTopEl.style.height = `${this.zOffsetY(Math.min(freezeRows, this.worksheet.rowCount))}px`;
    this.frozenLeftEl.style.width = `${this.zOffsetX(Math.min(freezeCols, this.worksheet.columnCount))}px`;
    if (freezeRows === 0 && freezeCols === 0) return;

    const startX = this.scrollLeft();
    const startY = this.scrollTop();

    const frozenCell = (row: number, column: number, left: number, top: number, target: HTMLElement): void => {
      const cell = this.acquireCell();
      cell.dataset.row = String(row);
      cell.dataset.col = String(column);
      cell.style.left = `${left}px`;
      cell.style.top = `${top}px`;
      cell.style.width = `${this.zSizeX(column)}px`;
      cell.style.height = `${this.zSizeY(row)}px`;
      const value = this.worksheet.getValue(row, column);
      const mask = this.worksheet.getNumberFormat(row, column);
      cell.textContent = formatValue(value, mask);
      this.applyCellStyle(cell, row, column);
      target.appendChild(cell);
    };

    // Frozen corner cells stay fixed along both axes.
    for (let r = 0; r < Math.min(freezeRows, this.worksheet.rowCount); r++) {
      if (this.worksheet.isRowHidden(r)) continue;
      for (let c = 0; c < Math.min(freezeCols, this.worksheet.columnCount); c++) {
        if (this.worksheet.isColumnHidden(c)) continue;
        frozenCell(r, c, this.zOffsetX(c), this.zOffsetY(r), this.frozenTopEl);
      }
    }

    // frozen top rows: columns follow the scroll viewport
    for (let r = 0; r < Math.min(freezeRows, this.worksheet.rowCount); r++) {
      if (this.worksheet.isRowHidden(r)) continue;
      for (let c = this.scrollCol; c < this.visibleColumnEnd(); c++) {
        if (c < freezeCols || this.worksheet.isColumnHidden(c)) continue;
        frozenCell(r, c, this.zOffsetX(c) - startX, this.zOffsetY(r), this.frozenTopEl);
      }
    }

    // frozen left columns: rows follow the scroll viewport
    for (let c = 0; c < Math.min(freezeCols, this.worksheet.columnCount); c++) {
      if (this.worksheet.isColumnHidden(c)) continue;
      for (let r = this.scrollRow; r < this.visibleRowEnd(); r++) {
        if (r < freezeRows || this.worksheet.isRowHidden(r)) continue;
        frozenCell(r, c, this.zOffsetX(c), this.zOffsetY(r) - startY, this.frozenLeftEl);
      }
    }
  }

  private visibleRowStart(): number {
    const start = this.zIndexRow(this.scrollTop());
    if (!this.pagination) return start;
    return Math.max(start, this.pagination.page * this.pagination.pageSize);
  }

  private visibleRowEnd(): number {
    const ws = this.worksheet;
    const start = this.visibleRowStart();
    let end = start;
    const bottom = this.scrollTop() + this.viewportHeight();
    while (end < ws.rowCount && this.zOffsetY(end) < bottom) end += 1;
    end = Math.min(ws.rowCount, end + this.options.overscanRows);
    if (this.pagination) {
      const pageStart = this.pagination.page * this.pagination.pageSize;
      const pageEnd = Math.min(ws.rowCount, pageStart + this.pagination.pageSize);
      end = Math.min(Math.max(end, pageStart + 1), pageEnd);
    }
    return end;
  }

  private visibleColumnEnd(): number {
    const ws = this.worksheet;
    const start = this.zIndexColumn(this.scrollLeft());
    let end = start;
    const right = this.scrollLeft() + this.viewportWidth();
    while (end < ws.columnCount && this.zOffsetX(end) < right) end += 1;
    return Math.min(ws.columnCount, end + this.options.overscanColumns);
  }

  private renderHeaders(): void {
    const doc = this.container.ownerDocument;
    const ws = this.worksheet;
    this.colHeaderEl.textContent = '';
    this.rowHeaderEl.textContent = '';
    this.cornerEl.textContent = '';

    const columns = new Set<number>();
    for (let c = 0; c < Math.min(ws.freezeColumns, ws.columnCount); c++) columns.add(c);
    for (let c = this.scrollCol; c < this.visibleColumnEnd(); c++) columns.add(c);
    for (const c of columns) {
      if (ws.isColumnHidden(c)) continue;
      const el = doc.createElement('div');
      el.className = 'ezygrid-colheader-label';
      el.setAttribute('role', 'columnheader');
      el.textContent = columnLabel(c);
      Object.assign(el.style, {
        position: 'absolute',
        left: `${this.zOffsetX(c) - (c < ws.freezeColumns ? 0 : this.scrollLeft())}px`,
        zIndex: c < ws.freezeColumns ? '1' : '0',
        top: `${this.nestedLevelCount() * this.options.headerHeight}px`,
        width: `${this.zSizeX(c)}px`,
        height: `${this.options.headerHeight}px`,
        boxSizing: 'border-box',
        textAlign: 'center',
        lineHeight: `${this.options.headerHeight}px`,
        background: 'var(--ezygrid-header-bg, #e6fff4)',
        color: 'var(--ezygrid-header-text, #00674a)',
        fontWeight: 'bold',
        borderRight: '1px solid var(--ezygrid-gridline, #e2e8f0)',
        borderBottom: '1px solid var(--ezygrid-gridline, #e2e8f0)',
      } as CSSStyleDeclaration);
      el.appendChild(this.createResizeHandle('column', c));
      this.colHeaderEl.appendChild(el);
    }
    this.renderNestedHeaders(doc);
    const rows = new Set<number>();
    for (let r = 0; r < Math.min(ws.freezeRows, ws.rowCount); r++) rows.add(r);
    for (let r = this.scrollRow; r < this.visibleRowEnd(); r++) rows.add(r);
    for (const r of rows) {
      if (ws.isRowHidden(r)) continue;
      const el = doc.createElement('div');
      el.className = 'ezygrid-rowheader-label';
      el.setAttribute('role', 'rowheader');
      el.textContent = String(r + 1);
      Object.assign(el.style, {
        position: 'absolute',
        left: '0',
        top: `${this.zOffsetY(r) - (r < ws.freezeRows ? 0 : this.scrollTop())}px`,
        zIndex: r < ws.freezeRows ? '1' : '0',
        width: `${this.options.headerWidth}px`,
        height: `${this.zSizeY(r)}px`,
        boxSizing: 'border-box',
        textAlign: 'right',
        paddingRight: '6px',
        lineHeight: `${this.zSizeY(r)}px`,
        background: 'var(--ezygrid-header-bg, #e6fff4)',
        color: 'var(--ezygrid-header-text, #00674a)',
        borderRight: '1px solid var(--ezygrid-gridline, #e2e8f0)',
        borderBottom: '1px solid var(--ezygrid-gridline, #e2e8f0)',
      } as CSSStyleDeclaration);
      el.appendChild(this.createResizeHandle('row', r));
      this.rowHeaderEl.appendChild(el);
    }
    const corner = doc.createElement('div');
    corner.textContent = '';
    this.cornerEl.appendChild(corner);
  }

  private createResizeHandle(axis: ResizeAxis, index: number): HTMLElement {
    const handle = this.container.ownerDocument.createElement('div');
    handle.className = 'ezygrid-resize-handle';
    handle.dataset.resizeAxis = axis;
    handle.dataset.resizeIndex = String(index);
    handle.setAttribute('aria-hidden', 'true');
    Object.assign(handle.style, {
      position: 'absolute', right: '0', bottom: '0',
      width: axis === 'column' ? '6px' : '100%',
      height: axis === 'row' ? '6px' : '100%',
      cursor: axis === 'row' ? 'row-resize' : 'col-resize',
      touchAction: 'none', userSelect: 'none',
    });
    return handle;
  }

  private nestedLevelCount(): number {
    return this.worksheet.nestedHeaders.length;
  }

  /** Render each nested header level with colspan-style spans. */
  private renderNestedHeaders(doc: Document): void {
    const levels = this.worksheet.nestedHeaders;
    if (levels.length === 0) return;
    for (let level = 0; level < levels.length; level++) {
      const groups = levels[level]!;
      let column = 0;
      for (const group of groups) {
        const span = typeof group === 'string' ? 1 : group.span;
        const title = typeof group === 'string' ? group : group.title;
        const startColumn = column;
        column += span;
        if (column <= this.scrollCol || startColumn >= this.visibleColumnEnd()) continue;
        const left = Math.max(startColumn, this.scrollCol);
        const right = Math.min(column - 1, this.visibleColumnEnd() - 1);
        if (right < left) continue;
        const el = doc.createElement('div');
        el.className = 'ezygrid-colheader-label ezygrid-nestedheader';
        el.setAttribute('role', 'columnheader');
        el.textContent = title;
        Object.assign(el.style, {
          position: 'absolute',
          left: `${this.zOffsetX(left) - this.scrollLeft()}px`,
          top: `${level * this.options.headerHeight}px`,
          width: `${this.zOffsetX(right + 1) - this.zOffsetX(left)}px`,
          height: `${this.options.headerHeight}px`,
          boxSizing: 'border-box',
          textAlign: 'center',
        } as CSSStyleDeclaration);
        this.colHeaderEl.appendChild(el);
      }
    }
  }

  private renderSelection(refreshStyles = true): void {
    if (this.destroyed) return;
    // Expose the active cell to assistive technology through
    // aria-activedescendant (F24).
    const active = this.selection.state.active;
    const activeId = `${this.domId}-cell-${active.row}-${active.column}`;
    if (this.root.getAttribute('aria-activedescendant') !== activeId) {
      this.root.setAttribute('aria-activedescendant', activeId);
    }
    if (refreshStyles) {
      for (const cell of this.activeCells.values()) {
        this.applyCellStyle(cell, Number(cell.dataset.row), Number(cell.dataset.col));
      }
      for (const layer of [this.frozenTopEl, this.frozenLeftEl]) {
        for (const cell of Array.from(layer.children) as HTMLElement[]) {
          this.applyCellStyle(cell, Number(cell.dataset.row), Number(cell.dataset.col));
        }
      }
    }
    const primary = this.selection.primary;
    const top = this.zOffsetY(primary.top);
    const left = this.zOffsetX(primary.left);
    const height = this.zOffsetY(primary.bottom + 1) - top;
    const width = this.zOffsetX(primary.right + 1) - left;
    Object.assign(this.selectionOverlay.style, {
      display: this.selectionVisible ? 'block' : 'none',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    } as CSSStyleDeclaration);
    if (this.fillHandle) {
      Object.assign(this.fillHandle.style, {
        display: this.selectionVisible ? 'block' : 'none',
        left: `${left + width - 4}px`,
        top: `${top + height - 4}px`,
      } as CSSStyleDeclaration);
    }
    this.updateFormulaBar();
    this.renderFillPreview();
  }

  private formulaBarText(row: number, column: number): string {
    const record = this.worksheet.cells.getCell(row, column);
    return (
      record?.formula !== undefined
        ? record.formula
        : record?.raw === null || record?.raw === undefined
          ? ''
          : String(record.raw)
    );
  }

  private beginFormulaBarEdit(): void {
    if (this.formulaBarEdit || this.destroyed) return;
    const { row, column } = this.selection.state.active;
    this.formulaBarEdit = { row, column, initial: this.formulaBarText(row, column) };
  }

  private commitFormulaBarEdit(force = false): void {
    if (!this.formulaInput || this.destroyed) return;
    if (force) this.beginFormulaBarEdit();
    const draft = this.formulaBarEdit;
    if (!draft) return;
    const text = this.formulaInput.value;
    // Clear before setValue: its operation notification can repaint immediately.
    this.formulaBarEdit = null;
    if (text !== draft.initial) {
      this.worksheet.setValue(draft.row, draft.column, text.startsWith('=') ? text : parseEditorValue(text));
    }
    this.updateFormulaBar();
  }

  private updateFormulaBar(): void {
    if (!this.formulaInput || !this.nameBox) return;
    this.nameBox.value = this.selection.describe();
    // Scrolling, focus changes, and unrelated model updates must not erase a draft.
    if (this.formulaBarEdit) return;
    const { row, column } = this.selection.state.active;
    this.formulaInput.value = this.formulaBarText(row, column);
  }

  /** Re-render the visible projection. Recycles cell elements between frames. */
  render(): void {
    if (this.destroyed) return;
    const ws = this.worksheet;

    // Accessibility counts follow structural changes every frame (F15).
    this.root.setAttribute('aria-rowcount', String(ws.rowCount));
    this.root.setAttribute('aria-colcount', String(ws.columnCount));

    this.spacerEl.style.width = `${this.zOffsetX(ws.columnCount)}px`;
    this.spacerEl.style.height = `${this.zOffsetY(ws.rowCount)}px`;
    const headerHeight = (this.nestedLevelCount() + 1) * this.options.headerHeight;
    this.colHeaderEl.style.height = `${headerHeight}px`;
    this.cornerEl.style.height = `${headerHeight}px`;
    for (const el of [this.scrollEl, this.rowHeaderEl, this.frozenTopEl, this.frozenLeftEl]) {
      el.style.top = `${this.topInset + headerHeight}px`;
    }

    // Zoom and programmatic navigation can render before a native scroll event.
    this.scrollRow = this.visibleRowStart();
    this.scrollCol = this.zIndexColumn(this.scrollLeft());

    // recycle: release cells that scrolled out or became merge-covered
    for (const [key, el] of this.activeCells) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const covered = ws.merges.isCovered(r, c);
      if (
        covered ||
        r < this.visibleRowStart() - this.options.overscanRows ||
        r >= this.visibleRowEnd() ||
        c < this.scrollCol - this.options.overscanColumns ||
        c >= this.visibleColumnEnd() ||
        ws.isRowHidden(r) ||
        ws.isColumnHidden(c)
      ) {
        el.remove();
        this.cellPool.push(el);
        this.activeCells.delete(key);
      }
    }
    // Release accessibility row containers that no longer hold cells (F24).
    for (const [row, rowEl] of this.activeRows) {
      const stillPopulated = [...this.activeCells.values()].some(
        (cell) => Number(cell.dataset.row) === row,
      );
      if (!stillPopulated) {
        rowEl.remove();
        this.activeRows.delete(row);
      } else {
        rowEl.style.width = `${this.zOffsetX(ws.columnCount)}px`;
      }
    }

    const rowEnd = this.visibleRowEnd();
    const colEnd = this.visibleColumnEnd();
    for (let r = this.visibleRowStart(); r < rowEnd; r++) {
      if (ws.isRowHidden(r)) continue;
      for (let c = this.scrollCol; c < colEnd; c++) {
        if (ws.isColumnHidden(c)) continue;
        const key = `${r},${c}`;
        const merge = ws.merges.findAt(r, c);
        if (merge && !(merge.top === r && merge.left === c)) continue;
        const offsetX = this.zOffsetX(c);
        const offsetY = this.zOffsetY(r);
        const span = merge
          ? {
              width: this.zOffsetX(merge.right + 1) - this.zOffsetX(c),
              height: this.zOffsetY(merge.bottom + 1) - this.zOffsetY(r),
            }
          : undefined;
        // Already-visible cells are repainted in place so edits, style
        // changes and selection state show up without a full teardown.
        const existing = this.activeCells.get(key);
        if (existing) {
          this.paintCell(existing, r, c, offsetX, offsetY, span);
          continue;
        }
        this.placeCell(r, c, offsetX, offsetY, span);
      }
    }
    this.renderHeaders();
    this.renderFrozen();
    this.renderSelection(false);
    this.renderMedia();
    this.shell?.update();
  }

  /** Floating charts, images and shapes (§30/§31/§32). */
  private renderMedia(): void {
    if (!this.mediaLayer) return;
    const doc = this.container.ownerDocument;
    this.mediaLayer.textContent = '';
    for (const chart of this.worksheet.charts.all()) {
      const data = readChartData(this.worksheet, chart);
      const wrapper = doc.createElement('div');
      wrapper.className = 'ezygrid-chart';
      wrapper.innerHTML = renderChartSVG(chart, data);
      Object.assign(wrapper.style, {
        position: 'absolute',
        pointerEvents: 'auto',
        background: 'var(--ezygrid-bg, #fff)',
        border: '1px solid var(--ezygrid-gridline, #e2e8f0)',
        overflow: 'hidden',
      } as CSSStyleDeclaration);
      this.positionFloating(wrapper, chart.anchor, chart.offsetX, chart.offsetY);
      wrapper.style.width = `${chart.width ?? 320}px`;
      wrapper.style.height = `${chart.height ?? 240}px`;
      this.mediaLayer.appendChild(wrapper);
    }
    for (const object of this.worksheet.media.all()) {
      const el = doc.createElement('div');
      el.className = 'ezygrid-media-object';
      Object.assign(el.style, {
        position: 'absolute',
        pointerEvents: 'auto',
        overflow: 'hidden',
      } as CSSStyleDeclaration);
      if (object.kind === 'image') {
        const img = doc.createElement('img');
        img.src = object.src;
        img.alt = object.alt ?? '';
        img.style.width = '100%';
        img.style.height = '100%';
        el.appendChild(img);
      } else {
        el.style.border = `1px solid ${object.stroke ?? 'var(--ezygrid-gridline, #e2e8f0)'}`;
        el.style.background = object.fill ?? 'transparent';
        el.style.color = object.textColor ?? 'inherit';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.padding = '4px';
        el.style.boxSizing = 'border-box';
        if (object.shape === 'ellipse') el.style.borderRadius = '50%';
        el.textContent = object.text ?? '';
      }
      this.positionFloating(el, object.anchor, object.offsetX, object.offsetY);
      el.style.width = `${object.width}px`;
      el.style.height = `${object.height}px`;
      el.style.zIndex = String(object.zIndex ?? 1);
      this.mediaLayer.appendChild(el);
    }
  }

  private positionFloating(el: HTMLElement, anchor: { row: number; column: number }, offsetX?: number, offsetY?: number): void {
    const left = this.zOffsetX(anchor.column) + (offsetX ?? 0);
    const top = this.zOffsetY(anchor.row) + (offsetY ?? 0);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  get renderedCellCount(): number {
    return this.activeCells.size;
  }

  getCellElement(row: number, column: number): HTMLElement | undefined {
    return this.activeCells.get(`${row},${column}`);
  }

  getEditorInput(): HTMLInputElement | null {
    return this.editorInput;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearHeaderResize();
    this.resizeObserver?.disconnect();
    this.shell?.destroy();
    this.formulaBarEdit = null;
    this.cancelFillDrag();
    // Plugin attachments (timers, listeners, observers) go first so plugin
    // teardown sees an intact renderer (F17).
    this.disposePlugins?.();
    this.disposePlugins = null;
    this.unlistenOperations?.();
    this.unlistenOperations = null;
    this.unlistenSelection?.();
    this.unlistenSelection = null;
    this.container.removeEventListener('focusin', this.onFocusIn);
    this.container.removeEventListener('focusout', this.onFocusOut);
    this.scrollEl?.removeEventListener('scroll', this.onScroll);
    this.colHeaderEl?.removeEventListener('pointerdown', this.onHeaderResizeStart);
    this.rowHeaderEl?.removeEventListener('pointerdown', this.onHeaderResizeStart);
    this.cellLayer?.removeEventListener('mousedown', this.onMouseDown);
    this.cellLayer?.removeEventListener('dblclick', this.onDoubleClick);
    this.cellLayer?.removeEventListener('contextmenu', this.onContextMenu);
    this.root?.removeEventListener('keydown', this.onKeyDown);
    this.root?.removeEventListener('copy', this.onCopy);
    this.root?.removeEventListener('cut', this.onCut);
    this.root?.removeEventListener('paste', this.onPaste);
    this.container.ownerDocument.removeEventListener('mousedown', this.onGlobalMouseDown);
    this.fillHandle?.removeEventListener('mousedown', this.onFillHandleDown);
    this.editing.cancel();
    this.unmountEditor();
    this.contextMenuEl?.remove();
    this.root?.remove();
  }
}

function columnLabel(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** F4-style reference cycling: A1 → $A$1 → A$1 → $A1 → A1 (§11.4). */
export function cycleReference(input: HTMLInputElement): void {
  const value = input.value;
  const matches = [...value.matchAll(/(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})(?![A-Za-z0-9])/g)];
  const last = matches[matches.length - 1];
  if (!last) return;
  const [, , letters, , digits] = last;
  const states = [
    `${letters}${digits}`,
    `$${letters}$${digits}`,
    `${letters}$${digits}`,
    `$${letters}${digits}`,
  ];
  const currentIndex = states.findIndex((s) => s === last[0]);
  const next = states[(currentIndex + 1) % states.length]!;
  const start = last.index!;
  const newValue = value.slice(0, start) + next + value.slice(start + last[0].length);
  input.value = newValue;
  const caret = start + next.length;
  input.setSelectionRange(caret, caret);
}

/** Replace the trailing partial function token with a completed name. */
export function replaceFunctionToken(value: string, name: string): string {
  return value.replace(/[A-Za-z0-9.]+$/, `${name}(`);
}

function suggest(prefix: string): FunctionMeta[] {
  return formulaRegistry.suggest(prefix, 8);
}

export { DEFAULT_ROW_HEIGHT, DEFAULT_COLUMN_WIDTH };

