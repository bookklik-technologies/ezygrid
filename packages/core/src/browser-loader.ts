import type { BrowserEzygrid } from './browser.js';

export interface BrowserManifest {
  entries: { constructor: string; auto: string };
  modules: Record<string, { file: string; dependencies: Record<string, string> }>;
}

type ModuleExports = Record<string, unknown>;
type ModuleFactory = (
  require: (request: string) => ModuleExports,
  module: { exports: ModuleExports },
  exports: ModuleExports,
) => void;

interface DependencyScript extends HTMLScriptElement {
  __ezygridRegister?: (id: string, factory: ModuleFactory) => void;
}

/** Compiled alone into the small classic loader, with a generated manifest. */
export function startBrowserLoader(manifest: BrowserManifest): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof window.Ezygrid?.ready?.then === 'function') return;

  const loaderScript = document.currentScript as HTMLScriptElement | null;
  const notReady = (): never => {
    throw new Error('Ezygrid: wait for Ezygrid.ready before initializing or accessing editors.');
  };
  const pending = function Ezygrid() { notReady(); } as unknown as BrowserEzygrid;
  pending.getInstance = notReady;
  pending.initAll = notReady;
  let resolveReady!: (constructor: BrowserEzygrid) => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<BrowserEzygrid>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  Object.defineProperty(pending, 'ready', { value: ready });
  window.Ezygrid = pending;

  if (!loaderScript?.src) {
    rejectReady(new Error('Ezygrid: load ezygrid.js with an external script tag.'));
    return;
  }
  const base = new URL('.', loaderScript.src);
  const factories = new Map<string, ModuleFactory>();
  const cache = new Map<string, { exports: ModuleExports }>();

  function requireModule(id: string): ModuleExports {
    const existing = cache.get(id);
    if (existing) return existing.exports;
    const factory = factories.get(id);
    const definition = manifest.modules[id];
    if (!factory || !definition) throw new Error(`Ezygrid: missing module "${id}".`);
    const module = { exports: {} };
    cache.set(id, module); // Cache first so circular imports share exports.
    try {
      factory((request) => {
        const dependency = definition.dependencies[request];
        if (!dependency) throw new Error(`Unknown dependency "${request}" in "${id}".`);
        return requireModule(dependency);
      }, module, module.exports);
    } catch (error) {
      cache.delete(id);
      throw new Error(`Ezygrid: module "${id}" failed to initialize.`, { cause: error });
    }
    return module.exports;
  }

  function loadModule(id: string, file: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script: DependencyScript = document.createElement('script');
      script.src = new URL(file, base).href;
      script.async = true;
      if (loaderScript?.nonce) script.nonce = loaderScript.nonce;
      let registrationError: Error | undefined;
      script.__ezygridRegister = (registeredId, factory) => {
        if (registeredId !== id || typeof factory !== 'function' || factories.has(id)) {
          registrationError = new Error(`Ezygrid: invalid module registration for "${id}".`);
        } else {
          factories.set(id, factory);
        }
      };
      const cleanup = () => {
        script.onload = script.onerror = null;
        delete script.__ezygridRegister;
        script.remove();
      };
      script.onload = () => {
        cleanup();
        if (registrationError) reject(registrationError);
        else if (!factories.has(id)) reject(new Error(`Ezygrid: "${script.src}" did not register module "${id}".`));
        else resolve();
      };
      script.onerror = () => {
        cleanup();
        reject(new Error(`Ezygrid: failed to load module "${id}" from ${script.src}.`));
      };
      document.head.appendChild(script);
    });
  }

  const domReady = document.readyState === 'loading'
    ? new Promise<void>((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }))
    : Promise.resolve();

  Promise.all(Object.entries(manifest.modules).map(([id, entry]) => loadModule(id, entry.file)))
    .then(async () => {
      await domReady;
      const constructor = requireModule(manifest.entries.constructor).Ezygrid as BrowserEzygrid;
      if (typeof constructor !== 'function') throw new Error('Ezygrid: constructor module did not export Ezygrid.');
      Object.defineProperty(constructor, 'ready', { value: ready });
      window.Ezygrid = constructor;
      // Waiting for the DOM makes auto startup and its errors synchronous.
      requireModule(manifest.entries.auto);
      resolveReady(constructor);
    })
    .catch((error: unknown) => {
      window.Ezygrid = pending;
      rejectReady(error instanceof Error ? error : new Error(`Ezygrid: initialization failed: ${String(error)}`));
    });
}
