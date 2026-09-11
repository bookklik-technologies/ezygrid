import { createGrid, type Workbook, type WorkbookOptions } from './workbook.js';
import { GridRenderer, type GridRendererOptions } from './renderer.js';

export interface EzygridOptions extends WorkbookOptions {
  /** An existing HTML element, or a selector resolved in the current document. */
  target: string | HTMLElement;
  renderer?: GridRendererOptions;
}

const instances = new WeakMap<HTMLElement, Ezygrid>();
const initializing = new WeakSet<HTMLElement>();
const marker = '[data-ezg-editor]';

function currentDocument(): Document {
  if (typeof document === 'undefined') {
    throw new Error('Ezygrid: a document is required for selectors and automatic scanning.');
  }
  return document;
}

function resolveTarget(target: string | HTMLElement): HTMLElement {
  let element: Element | null;
  if (typeof target === 'string') {
    const doc = currentDocument();
    try {
      element = doc.querySelector(target);
    } catch {
      throw new Error(`Ezygrid: invalid target selector "${target}".`);
    }
    if (!element) throw new Error(`Ezygrid: no element matches target "${target}".`);
  } else {
    element = target;
  }
  const HTMLElementClass = element?.ownerDocument?.defaultView?.HTMLElement;
  if (!HTMLElementClass || !(element instanceof HTMLElementClass)) {
    throw new TypeError('Ezygrid: target must be an HTML element or a selector matching one.');
  }
  return element as HTMLElement;
}

/** A mounted spreadsheet, owning one workbook and its renderer. */
export class Ezygrid {
  readonly target: HTMLElement;
  readonly workbook: Workbook;
  readonly renderer: GridRenderer;
  private destroyed = false;

  constructor(options: EzygridOptions) {
    this.target = resolveTarget(options?.target);
    if (instances.has(this.target) || initializing.has(this.target)) {
      throw new Error('Ezygrid: target is already initialized; use Ezygrid.getInstance(target).');
    }
    const { target: _target, renderer, ...workbookOptions } = options;
    initializing.add(this.target);
    try {
      this.workbook = createGrid(this.target, workbookOptions);
      try {
        this.renderer = new GridRenderer(this.target, this.workbook, renderer);
      } catch (error) {
        this.workbook.pluginManager.destroy();
        throw error;
      }
      instances.set(this.target, this);
    } finally {
      initializing.delete(this.target);
    }
  }

  /** Returns undefined for an existing host that has no live Ezygrid instance. */
  static getInstance(target: string | HTMLElement): Ezygrid | undefined {
    return instances.get(resolveTarget(target));
  }

  /** Mount marked hosts, including root itself. Existing instances retain their data. */
  static initAll(root: Document | Element | DocumentFragment = currentDocument()): Ezygrid[] {
    const hosts: Element[] = [];
    if ('matches' in root && root.matches(marker)) hosts.push(root);
    hosts.push(...root.querySelectorAll(marker));
    return hosts.map((host) => {
      const target = resolveTarget(host as HTMLElement);
      return instances.get(target) ?? new Ezygrid({ target });
    });
  }

  /** Dispose before removing an ordinary div from the page. Safe to call twice. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.renderer.destroy();
    } finally {
      this.workbook.pluginManager.destroy();
      instances.delete(this.target);
    }
  }
}
