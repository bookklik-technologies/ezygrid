import { createGrid, GridRenderer, type Workbook, type CreateGridOptions, type GridRendererOptions } from '@ezygrid/core';

/**
 * <ezy-grid> custom element (§46.4): framework-neutral declarative host.
 * Set the `config` property (CreateGridOptions) before/after insertion;
 * the element owns the renderer lifecycle. Presentation changes (renderer
 * options) replace only the renderer; the workbook and its edits persist.
 */
export class EzyGridElement extends HTMLElement {
  private workbookInstance?: Workbook;
  private rendererInstance?: GridRenderer;
  private config: CreateGridOptions = {};
  private rendererOptions: GridRendererOptions = {};

  get workbook(): Workbook | undefined {
    return this.workbookInstance;
  }

  get renderer(): GridRenderer | undefined {
    return this.rendererInstance;
  }

  /** Explicit data replacement: builds a fresh workbook from `config`. */
  setConfig(config: CreateGridOptions): void {
    this.config = config;
    this.rebuild();
  }

  /** Presentation change only: the live workbook is preserved. */
  setRendererOptions(options: GridRendererOptions): void {
    this.rendererOptions = options;
    this.replaceRenderer();
  }

  connectedCallback(): void {
    if (this.rendererInstance) return;
    // Reconnect after disconnect keeps the existing workbook (with edits).
    if (this.workbookInstance) {
      this.attachRenderer();
    } else {
      this.rebuild();
    }
  }

  disconnectedCallback(): void {
    this.rendererInstance?.destroy();
    this.rendererInstance = undefined;
  }

  private rebuild(): void {
    this.rendererInstance?.destroy();
    this.rendererInstance = undefined;
    this.textContent = '';
    this.workbookInstance = createGrid(this, this.config);
    this.attachRenderer();
  }

  private replaceRenderer(): void {
    this.rendererInstance?.destroy();
    this.rendererInstance = undefined;
    this.textContent = '';
    if (this.workbookInstance) {
      this.attachRenderer();
    } else {
      this.rebuild();
    }
  }

  private attachRenderer(): void {
    this.textContent = '';
    this.rendererInstance = new GridRenderer(this, this.workbookInstance!, this.rendererOptions);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ezy-grid')) {
  customElements.define('ezy-grid', EzyGridElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'ezy-grid': EzyGridElement;
  }
}
