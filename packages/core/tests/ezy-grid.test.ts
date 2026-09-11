// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ezygrid, type EzygridOptions } from '../src/index.js';

const editors: Ezygrid[] = [];

function host(id = 'editor', marked = false): HTMLDivElement {
  const element = document.createElement('div');
  element.id = id;
  if (marked) element.setAttribute('data-ezg-editor', '');
  document.body.appendChild(element);
  return element;
}

function mount(options: EzygridOptions): Ezygrid {
  const editor = new Ezygrid(options);
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('Ezygrid initialization', () => {
  it('resolves the first selector match and forwards workbook and renderer options', () => {
    const first = host();
    const second = host('second');
    const editor = mount({
      target: 'div',
      id: 'sales',
      worksheets: [{ name: 'Sales', data: [[2, 12, '=A1*B1']] }],
      renderer: { direction: 'rtl', formulaBar: false },
    });
    expect(editor.target).toBe(first);
    expect(editor.workbook.id).toBe('sales');
    expect(editor.workbook.activeWorksheet.name).toBe('Sales');
    expect(editor.renderer.getCellElement(0, 2)?.textContent).toBe('24');
    expect(first.querySelector<HTMLElement>('[role="grid"]')?.style.direction).toBe('rtl');
    expect(second.childElementCount).toBe(0);
    expect(Ezygrid.getInstance(first)).toBe(editor);
    expect(Ezygrid.getInstance('#editor')).toBe(editor);
    editor.workbook.activeWorksheet.setValue(0, 0, 3);
    expect(editor.renderer.getCellElement(0, 2)?.textContent).toBe('36');
  });

  it('accepts an element and does not require a declarative marker', () => {
    const target = host();
    expect(Ezygrid.getInstance(target)).toBeUndefined();
    const editor = mount({ target });
    expect(editor.target).toBe(target);
    expect(editor.workbook.activeWorksheet.name).toBe('Sheet1');
    expect(target.querySelectorAll('[role="grid"]')).toHaveLength(1);
  });

  it('rejects invalid selectors, missing hosts, and non-HTML targets', () => {
    expect(() => new Ezygrid({ target: '[' })).toThrow(/invalid target selector/);
    expect(() => new Ezygrid({ target: '#missing' })).toThrow(/no element matches/);
    expect(() => Ezygrid.getInstance('#missing')).toThrow(/no element matches/);
    expect(() => new Ezygrid({ target: null as unknown as HTMLElement })).toThrow(/HTML element/);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    expect(() => new Ezygrid({ target: 'svg' })).toThrow(/HTML element/);
  });

  it('rejects duplicate and reentrant construction without disturbing the live grid', () => {
    const target = host();
    const editor = mount({
      target,
      extensions: [{
        name: 'duplicate-check', version: '1',
        setup() {
          expect(() => new Ezygrid({ target })).toThrow(/already initialized/);
        },
      }],
    });
    expect(() => new Ezygrid({ target })).toThrow(/already initialized/);
    expect(Ezygrid.getInstance(target)).toBe(editor);
    expect(target.querySelectorAll('[role="grid"]')).toHaveLength(1);
  });

  it('scans multiple hosts once and preserves programmatic instances and edits', () => {
    const first = host('first', true);
    const second = host('second', true);
    const unmarked = host('unmarked');
    const editor = mount({ target: first, worksheets: [{ data: [['original']] }] });
    editor.workbook.activeWorksheet.setValue(0, 0, 'edited');
    const scanned = Ezygrid.initAll();
    editors.push(...scanned);
    expect(scanned.map((instance) => instance.target)).toEqual([first, second]);
    expect(scanned[0]).toBe(editor);
    expect(Ezygrid.initAll()).toEqual(scanned);
    expect(editor.renderer.getCellElement(0, 0)?.textContent).toBe('edited');
    expect(document.querySelectorAll('[role="grid"]')).toHaveLength(2);
    expect(unmarked.childElementCount).toBe(0);
  });

  it('includes the root host and supports fragments and explicit scans of later hosts', () => {
    const root = host('root', true);
    const initial = Ezygrid.initAll(root);
    editors.push(...initial);
    expect(initial).toHaveLength(1);
    expect(initial[0]?.target).toBe(root);
    const fragment = document.createDocumentFragment();
    const later = document.createElement('div');
    later.setAttribute('data-ezg-editor', '');
    fragment.appendChild(later);
    expect(Ezygrid.getInstance(later)).toBeUndefined();
    const added = Ezygrid.initAll(fragment);
    editors.push(...added);
    expect(added[0]?.target).toBe(later);
    expect(Ezygrid.initAll(fragment)).toEqual(added);
  });

  it('disposes plugins once, preserves unrelated content, and permits reinitialization', () => {
    const target = host();
    const content = document.createElement('span');
    content.textContent = 'Existing content';
    target.appendChild(content);
    const dispose = vi.fn();
    const editor = mount({ target, extensions: [{ name: 'cleanup', version: '1', setup: () => dispose }] });
    editor.destroy();
    editor.destroy();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(target.childNodes).toHaveLength(1);
    expect(target.firstChild).toBe(content);
    expect(Ezygrid.getInstance(target)).toBeUndefined();
    const replacement = mount({ target });
    editor.destroy();
    expect(Ezygrid.getInstance(target)).toBe(replacement);
    expect(target.querySelectorAll('[role="grid"]')).toHaveLength(1);
  });

  it('cleans renderer listeners, DOM, and earlier plugins when plugin setup fails', () => {
    const target = host();
    const dispose = vi.fn();
    const removeListener = vi.spyOn(document, 'removeEventListener');
    let failedWorkbook: Ezygrid['workbook'] | undefined;
    expect(() => new Ezygrid({
      target,
      extensions: [
        { name: 'first', version: '1', setup: () => dispose },
        { name: 'broken', version: '1', setup({ workbook }) { failedWorkbook = workbook; throw new Error('boom'); } },
      ],
    })).toThrow(/broken.*boom/);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(target.childElementCount).toBe(0);
    expect(Ezygrid.getInstance(target)).toBeUndefined();
    expect(removeListener.mock.calls.some(([event]) => event === 'mousedown')).toBe(true);
    expect(() => failedWorkbook!.activeWorksheet.setValue(0, 0, 1)).not.toThrow();
    expect(mount({ target }).target).toBe(target);
  });

  it('cleans up and releases the host when DOM mounting fails', () => {
    const target = host();
    const append = vi.spyOn(target, 'appendChild');
    const original = target.appendChild.bind(target);
    let calls = 0;
    append.mockImplementation((node) => {
      if (++calls === 2) throw new Error('mount failed');
      return original(node);
    });
    expect(() => new Ezygrid({ target })).toThrow('mount failed');
    expect(target.childElementCount).toBe(0);
    expect(Ezygrid.getInstance(target)).toBeUndefined();
    append.mockRestore();
    expect(mount({ target }).target).toBe(target);
  });
});
