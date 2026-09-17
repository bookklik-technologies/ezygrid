import { createGrid, GridRenderer, type Workbook, type CreateGridOptions, type GridRendererOptions } from '@ezygrid/core';

/**
 * <ezy-grid> custom element (§46.4): framework-neutral declarative host.
 * Set the `config` property (CreateGridOptions) before/after insertion;
 * the element owns the renderer lifecycle. Presentation changes (renderer
 * options) replace only the renderer; the workbook and its edits persist.
 *
 * SSR safety (F27): HTMLElement is only referenced inside the element
 * factory, so importing this module under Node/SSR never crashes. Call
 * `defineEzyGridElement()` in the browser to register the tag.
 */
export interface EzyGridElementLike {
  workbook: Workbook | undefined;
  renderer: GridRenderer | undefined;
  setConfig(config: CreateGridOptions): void;
  setRendererOptions(options: GridRendererOptions): void;
  connectedCallback(): void;
  disconnectedCallback(): void;
}

/**
 * Concrete element class. Created lazily by `defineEzyGridElement()` /
 * `createEzyGridElement()` so `HTMLElement` is only referenced in a
 * browser runtime; SSR consumers can import the module without globals.
 */
export type EzyGridElement = EzyGridElementLike & HTMLElement;

export function createEzyGridElementClass(): new () => EzyGridElement {
  // HTMLElement is referenced only inside this factory, which runs in a
  // browser runtime; SSR consumers never invoke it.
  const Base = HTMLElement;
  return class EzyGridElement extends Base implements EzyGridElementLike {
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
      this.workbookInstance = createGrid(this as unknown as HTMLElement, this.config);
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
  };
}

/**
 * SSR-safe entry point: registers `<ezy-grid>` and returns the element
 * class. Throws when a custom-element registry is unavailable, so callers
 * in Node/SSR can guard with `typeof customElements !== 'undefined'`.
 */
export function defineEzyGridElement(
  tag = 'ezy-grid',
): new () => EzyGridElementLike {
  if (typeof HTMLElement === 'undefined' || typeof customElements === 'undefined') {
    throw new Error(
      'defineEzyGridElement() requires a browser (custom elements) environment.',
    );
  }
  const existing = customElements.get(tag) as unknown as (new () => EzyGridElementLike) | undefined;
  if (existing) return existing;
  const elementClass = createEzyGridElementClass();
  customElements.define(tag, elementClass as unknown as CustomElementConstructor);
  return elementClass;
}

/**
 * The registered element class (F27). In a browser runtime the module
 * self-registers `<ezy-grid>` on import, so this is the concrete class and
 * `customElements.get('ezy-grid')` is identical to it. In Node/SSR it is
 * undefined: the module imports without touching HTMLElement, and callers
 * register explicitly via `defineEzyGridElement()` in the browser.
 */
export let EzyGridElement: (new () => EzyGridElementLike) | undefined;

const isBrowser =
  typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined';

if (isBrowser) {
  EzyGridElement = defineEzyGridElement();
}
