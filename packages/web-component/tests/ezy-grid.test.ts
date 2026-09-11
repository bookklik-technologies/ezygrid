// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { EzyGridElement } from '../src/index.js';

describe('<ezy-grid> web component (§46.4)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('registers the custom element', () => {
    expect(customElements.get('ezy-grid')).toBe(EzyGridElement);
  });

  it('renders a grid when connected with config', () => {
    const element = document.createElement('ezy-grid') as EzyGridElement;
    element.setConfig({
      worksheets: [{ name: 'Sheet1', data: [['hello web']] }],
    });
    host.appendChild(element);
    expect(element.workbook).toBeDefined();
    expect(element.renderer).toBeDefined();
    const cell = element.querySelector('.ezygrid-cell');
    expect(cell?.textContent).toBe('hello web');
  });

  it('destroys the renderer on disconnect', () => {
    const element = document.createElement('ezy-grid') as EzyGridElement;
    element.setConfig({ worksheets: [{ data: [['x']] }] });
    host.appendChild(element);
    element.remove();
    expect(element.renderer).toBeUndefined();
    expect(element.querySelector('.ezygrid')).toBeNull();
  });

  it('setConfig rebuilds the grid', () => {
    const element = document.createElement('ezy-grid') as EzyGridElement;
    element.setConfig({ worksheets: [{ data: [['one']] }] });
    host.appendChild(element);
    element.setConfig({ worksheets: [{ data: [['two']] }] });
    const cell = element.querySelector('.ezygrid-cell');
    expect(cell?.textContent).toBe('two');
  });
});
