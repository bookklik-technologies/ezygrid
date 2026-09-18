// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { Ezygrid } from '../src/ezy-grid.js';
import { startBrowserLoader, type BrowserManifest } from '../src/browser-loader.js';

type Exports = Record<string, unknown>;
type Factory = (require: (id: string) => Exports, module: { exports: Exports }, exports: Exports) => void;
type RegisteredScript = HTMLScriptElement & { __ezygridRegister: (id: string, factory: Factory) => void };
const editors: Ezygrid[] = [];

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'Ezygrid');
  document.body.replaceChildren();
});

function harness(state: DocumentReadyState = 'complete') {
  const loader = document.createElement('script');
  loader.src = 'https://static.example/assets/ezygrid/ezygrid.js?version=1';
  const currentScript = vi.spyOn(document, 'currentScript', 'get').mockReturnValue(loader);
  const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue(state);
  const requests: RegisteredScript[] = [];
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
    requests.push(node as unknown as RegisteredScript);
    return node;
  });
  const manifest: BrowserManifest = {
    entries: { constructor: 'core/ezy-grid', auto: 'core/auto' },
    modules: {
      'core/ezy-grid': { file: 'modules/core/ezy-grid.js', dependencies: {} },
      'core/auto': { file: 'modules/core/auto.js', dependencies: { './ezy-grid.js': 'core/ezy-grid' } },
    },
  };
  class Constructor extends Ezygrid {}
  const factories: Record<string, Factory> = {
    'core/ezy-grid': (_require, _module, exports) => { exports.Ezygrid = Constructor; },
    'core/auto': (require) => { (require('./ezy-grid.js').Ezygrid as typeof Ezygrid).initAll(); },
  };
  function complete(id: string, factory = factories[id]!) {
    const request = requests.find((script) => new URL(script.src).pathname.endsWith(manifest.modules[id]!.file))!;
    request.__ezygridRegister(id, factory);
    request.dispatchEvent(new Event('load'));
  }
  return { loader, requests, currentScript, readyState, manifest, complete, Constructor };
}

describe('classic script loader', () => {
  it('waits for delayed dependencies, supports out-of-order loading, and keeps the readiness promise', async () => {
    const h = harness();
    startBrowserLoader(h.manifest);
    const pending = window.Ezygrid;
    const ready = pending.ready;
    const resolved = vi.fn();
    void ready.then(resolved);
    expect(() => new pending({ target: '#editor' })).toThrow(/Ezygrid.ready/);
    expect(() => pending.initAll()).toThrow(/Ezygrid.ready/);
    expect(h.requests.map((script) => script.src)).toEqual([
      'https://static.example/assets/ezygrid/modules/core/ezy-grid.js',
      'https://static.example/assets/ezygrid/modules/core/auto.js',
    ]);
    h.complete('core/auto');
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    h.complete('core/ezy-grid');
    expect(await ready).toBe(h.Constructor);
    expect(window.Ezygrid).toBe(h.Constructor);
    expect(window.Ezygrid.ready).toBe(ready);
    expect(h.requests.every((script) => !script.__ezygridRegister)).toBe(true);
  });

  it('waits for DOM readiness, initializes marked hosts, and then accepts programmatic construction', async () => {
    const h = harness('loading');
    document.body.innerHTML = '<div id="auto" data-ezg-editor></div><div id="manual"></div>';
    startBrowserLoader(h.manifest);
    const pending = window.Ezygrid;
    h.complete('core/ezy-grid');
    h.complete('core/auto');
    await Promise.resolve();
    expect(window.Ezygrid).toBe(pending);
    expect(document.querySelector('[role="grid"]')).toBeNull();
    h.readyState.mockReturnValue('interactive');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const Constructor = await pending.ready;
    const automatic = Constructor.getInstance('#auto')!;
    editors.push(automatic);
    const manual = new Constructor({ target: '#manual', worksheets: [{ data: [[2, 12, '=A1*B1']] }] });
    editors.push(manual);
    expect(document.querySelectorAll('[role="grid"]')).toHaveLength(2);
    expect(manual.renderer.getCellElement(0, 2)?.textContent).toBe('24');
    expect(Constructor.initAll()).toEqual([automatic]);
  });

  it('reuses loading and completed initialization on repeated script inclusion', async () => {
    const h = harness();
    startBrowserLoader(h.manifest);
    const pending = window.Ezygrid;
    startBrowserLoader(h.manifest);
    expect(window.Ezygrid).toBe(pending);
    expect(h.requests).toHaveLength(2);
    h.complete('core/ezy-grid');
    h.complete('core/auto');
    const Constructor = await pending.ready;
    startBrowserLoader(h.manifest);
    expect(window.Ezygrid).toBe(Constructor);
    expect(window.Ezygrid.ready).toBe(pending.ready);
    expect(h.requests).toHaveLength(2);
  });

  it('rejects readiness with the failing asset URL', async () => {
    const h = harness();
    startBrowserLoader(h.manifest);
    const failure = expect(window.Ezygrid.ready).rejects.toThrow(/failed to load.*modules\/core\/ezy-grid.js/);
    h.requests[0]!.dispatchEvent(new Event('error'));
    h.complete('core/auto');
    await failure;
  });

  it('rejects scripts that load without registering their module', async () => {
    const h = harness();
    startBrowserLoader(h.manifest);
    const failure = expect(window.Ezygrid.ready).rejects.toThrow(/did not register module/);
    h.requests[0]!.dispatchEvent(new Event('load'));
    h.complete('core/auto');
    await failure;
  });

  it.each(['core/ezy-grid', 'core/auto'])('rejects initialization errors in %s', async (id) => {
    const h = harness();
    startBrowserLoader(h.manifest);
    const pending = window.Ezygrid;
    const failure = expect(pending.ready).rejects.toThrow(`module "${id}" failed to initialize`);
    for (const entry of Object.keys(h.manifest.modules)) {
      if (entry === id) h.complete(entry, () => { throw new Error('broken module'); });
      else h.complete(entry);
    }
    await failure;
    expect(window.Ezygrid).toBe(pending);
  });

  it('caches factories before evaluation to support circular imports', async () => {
    const h = harness();
    h.manifest.modules['core/ezy-grid']!.dependencies = { './peer.js': 'core/peer' };
    h.manifest.modules['core/peer'] = {
      file: 'modules/core/peer.js', dependencies: { './ezy-grid.js': 'core/ezy-grid' },
    };
    const evaluated = vi.fn();
    startBrowserLoader(h.manifest);
    h.complete('core/peer', (require, _module, exports) => {
      evaluated();
      exports.Constructor = require('./ezy-grid.js').Ezygrid;
    });
    h.complete('core/ezy-grid', (require, _module, exports) => {
      exports.Ezygrid = h.Constructor;
      expect(require('./peer.js').Constructor).toBe(h.Constructor);
      expect(require('./peer.js').Constructor).toBe(h.Constructor);
    });
    h.complete('core/auto');
    await window.Ezygrid.ready;
    expect(evaluated).toHaveBeenCalledTimes(1);
  });
});

describe('generated browser distribution', () => {
  // import.meta.url is not a file URL under the Vite transform, so derive
  // locations from the vitest root (the repository root).
  const root = process.cwd();
  const output = path.join(root, 'packages', 'core', 'dist', 'browser');
  beforeAll(() => {
    execFileSync(process.execPath, ['scripts/build-browser.mjs'], { cwd: root, stdio: 'pipe' });
  });

  it('loads the real separate files and renders both initialization styles', async () => {
    const h = harness();
    document.body.innerHTML = '<div id="auto" data-ezg-editor></div><div id="manual"></div>';
    const globals = {
      window,
      document,
      URL,
      HTMLElement,
      navigator: window.navigator,
      crypto: window.crypto,
      TextEncoder: window.TextEncoder ?? globalThis.TextEncoder,
      TextDecoder: window.TextDecoder ?? globalThis.TextDecoder,
    };
    const loader = readFileSync(path.join(output, 'ezygrid.js'), 'utf8');
    const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8')) as BrowserManifest;
    runInNewContext(loader, globals);
    const ready = window.Ezygrid.ready;
    expect(h.requests).toHaveLength(Object.keys(manifest.modules).length);
    expect(h.requests.length).toBeGreaterThan(2);
    for (const request of [...h.requests].reverse()) {
      const file = new URL(request.src).pathname.split('/assets/ezygrid/')[1]!;
      const source = readFileSync(path.join(output, file), 'utf8');
      h.currentScript.mockReturnValue(request);
      runInNewContext(source, globals);
      request.dispatchEvent(new Event('load'));
    }
    const Constructor = await ready;
    editors.push(Constructor.getInstance('#auto')!);
    const manual = new Constructor({ target: '#manual', worksheets: [{ data: [[2, 12, '=A1*B1']] }] });
    editors.push(manual);
    expect(document.querySelectorAll('[role="grid"]')).toHaveLength(2);
    expect(manual.renderer.getCellElement(0, 2)?.textContent).toBe('24');
    manual.workbook.activeWorksheet.setValue(0, 0, 3);
    expect(manual.renderer.getCellElement(0, 2)?.textContent).toBe('36');
  });
});
