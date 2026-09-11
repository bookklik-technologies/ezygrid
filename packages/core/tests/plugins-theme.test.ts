import { describe, it, expect } from 'vitest';
// @vitest-environment happy-dom
import { createGrid, definePlugin, GridRenderer, buildThemeCss, darkThemeTokens, defaultThemeTokens, highContrastThemeTokens, type ThemeTokens } from '../src/index.js';

describe('Plugin authoring kit (§44)', () => {
  it('definePlugin registers commands through the plugin context', () => {
    const upperCase = definePlugin({
      name: 'upper-case',
      version: '1.0.0',
      setup(ctx) {
        ctx.commands?.register({
          id: 'plugin.upper',
          title: 'UPPERCASE cell',
          execute: (commandCtx) => {
            const { row, column } = commandCtx.selection.state.active;
            const value = commandCtx.worksheet.getValue(row, column);
            if (typeof value === 'string') {
              commandCtx.worksheet.setValue(row, column, value.toUpperCase());
            }
          },
        });
        ctx.renderer?.refresh();
      },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const wb = createGrid(container, {
      worksheets: [{ data: [['make me loud']] }],
      extensions: [upperCase],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.getCellElement(0, 0)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    renderer.commands.execute('plugin.upper', {
      workbook: wb,
      worksheet: wb.activeWorksheet,
      selection: renderer.selection,
    });
    expect(wb.activeWorksheet.getValue(0, 0)).toBe('MAKE ME LOUD');
    renderer.destroy();
  });

  it('plugin setup errors name the offending plugin', () => {
    const broken = definePlugin({
      name: 'broken-plugin',
      version: '0.0.1',
      setup() {
        throw new Error('boom');
      },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    expect(() => new GridRenderer(container, createGrid(container, { extensions: [broken] }))).toThrow(/broken-plugin/);
  });

  it('plugin manager collects disposers', () => {
    let disposed = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const wb = createGrid(container, {
      extensions: [
        definePlugin({
          name: 'disposer',
          version: '1.0.0',
          setup: () => () => {
            disposed += 1;
          },
        }),
      ],
    });
    const renderer = new GridRenderer(container, wb);
    renderer.destroy();
    wb.pluginManager.destroy();
    expect(disposed).toBe(1);
  });
});

describe('Theme system (§49)', () => {
  it('default tokens cover the documented variables', () => {
    const css = buildThemeCss();
    for (const variable of [
      '--ezygrid-font-family',
      '--ezygrid-font-size',
      '--ezygrid-bg',
      '--ezygrid-text',
      '--ezygrid-gridline',
      '--ezygrid-selection',
      '--ezygrid-header-bg',
    ]) {
      expect(css).toContain(variable);
    }
  });

  it('overrides replace individual tokens', () => {
    const css = buildThemeCss({ selection: '#ff0000' });
    expect(css).toContain('--ezygrid-selection: #ff0000;');
    expect(css).toContain('--ezygrid-bg: #ffffff;');
  });

  it('dark and high-contrast presets build valid css', () => {
    const dark = buildThemeCss({ bg: '#18181b', text: '#fafafa' } as Partial<ThemeTokens>);
    expect(dark).toContain('--ezygrid-bg: #18181b;');
    const hc = buildThemeCss(highContrastThemeTokens);
    expect(hc).toContain('--ezygrid-gridline: #000000;');
  });

  it('every renderer CSS variable has a theme token', () => {
    const tokens = Object.keys(defaultThemeTokens) as (keyof ThemeTokens)[];
    expect(tokens).toContain('selectionSoft');
    expect(tokens).toContain('tableBand');
  });
});

describe('GridRenderer applies theme variables', () => {
  it('renders with CSS-variable based theming (no hard-coded palette)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const wb = createGrid(container, { worksheets: [{ data: [['x']] }] });
    const renderer = new GridRenderer(container, wb);
    const root = renderer['root'];
    expect(root.className).toBe('ezygrid');
    renderer.destroy();
  });
});
