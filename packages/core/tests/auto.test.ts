// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';

let Ezygrid: typeof import('../src/ezy-grid.js').Ezygrid | undefined;

afterEach(() => {
  document.dispatchEvent(new Event('DOMContentLoaded'));
  for (const host of document.querySelectorAll<HTMLElement>('[data-ezg-editor]')) {
    Ezygrid?.getInstance(host)?.destroy();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function prepare(state: DocumentReadyState) {
  vi.resetModules();
  ({ Ezygrid } = await import('../src/ezy-grid.js'));
  vi.spyOn(document, 'readyState', 'get').mockReturnValue(state);
  const host = document.createElement('div');
  host.setAttribute('data-ezg-editor', '');
  document.body.appendChild(host);
  return host;
}

it('keeps the main package import free of automatic startup', async () => {
  const host = await prepare('complete');
  await import('../src/index.js');
  expect(host.childElementCount).toBe(0);
  expect(Ezygrid!.getInstance(host)).toBeUndefined();
});

it('waits for DOM readiness, then scans only once', async () => {
  const host = await prepare('loading');
  await import('../src/auto.js');
  expect(Ezygrid!.getInstance(host)).toBeUndefined();
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const editor = Ezygrid!.getInstance(host)!;
  expect(editor).toBeDefined();
  const later = document.createElement('div');
  later.setAttribute('data-ezg-editor', '');
  document.body.appendChild(later);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  expect(Ezygrid!.getInstance(later)).toBeUndefined();
  Ezygrid!.initAll();
  expect(Ezygrid!.getInstance(later)).toBeDefined();
  expect(Ezygrid!.getInstance(host)).toBe(editor);
});

it.each(['interactive', 'complete'] as const)('scans immediately when readyState is %s', async (state) => {
  const host = await prepare(state);
  await import('../src/auto.js');
  expect(Ezygrid!.getInstance(host)).toBeDefined();
  expect(host.querySelectorAll('[role="grid"]')).toHaveLength(1);
});

it('shares the constructor registry between the main and auto entry points', async () => {
  const host = await prepare('loading');
  const core = await import('../src/index.js');
  const editor = new core.Ezygrid({ target: host });
  editor.workbook.activeWorksheet.setValue(0, 0, 'keep me');
  const auto = await import('../src/auto.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  expect(auto.Ezygrid).toBe(core.Ezygrid);
  expect(auto.Ezygrid.getInstance(host)).toBe(editor);
  expect(editor.renderer.getCellElement(0, 0)?.textContent).toBe('keep me');
});
