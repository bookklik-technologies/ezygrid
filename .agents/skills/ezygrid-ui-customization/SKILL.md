---
name: ezygrid-ui-customization
description: "Customize Ezygrid renderer modes, visible controls, themes, CSS hooks, direction and framework integration options. Use for editor UI presentation, not cell-level styling."
---

# Ezygrid UI Customization

## Inputs and approach

Identify editor versus compact-grid mode, visible controls, direction, theme tokens, accessibility needs and integration layer. Prefer public renderer options and scoped CSS variables over DOM patching.

Read [full editor](../../../docs/guide/editor.md), [renderer API](../../../docs/api/renderer.md), [theming](../../../docs/guide/theming.md), [renderer implementation](../../../packages/core/src/renderer.ts), [theme implementation](../../../packages/core/src/theme.ts) and the relevant [integration guide](../../../docs/integrations/browser.md).

## Workflow and contracts

- `renderer.mode` is `editor` by default; use `grid` for the compact surface. Configure `topbar`, `sheetTabs`, `statusBar`, `toolbar`, `formulaBar` and `contextMenu` through renderer options.
- Framework adapters forward renderer options differently: React uses `renderer`, Vue and Angular use `options`, and the web component exposes `setRendererOptions`. Check the selected integration guide.
- Use packaged theme CSS or `buildThemeCss` for programmatic tokens. Scope overrides beneath `.ezygrid` and `.ezygrid-suite` so grid and editor chrome stay aligned.
- Use stable public class hooks only for presentation. Do not depend on private DOM structure or mutate virtualized cell nodes as persistent state.
- Set `direction: 'rtl'` for right-to-left layout and preserve keyboard, ARIA grid and focus-visible behavior when adding host controls.
- Renderer-owned event listeners and overlays must be released through `destroy`. Host-added listeners require their own cleanup.
- Keep cell styling in worksheet APIs; global theme tokens must not replace workbook data or affect serialization.

## Example

```ts
import { Ezygrid, buildThemeCss, darkThemeTokens } from '@ezygrid/core';

const style = document.createElement('style');
style.textContent = buildThemeCss({ ...darkThemeTokens, selection: '#00ff99' });
document.head.append(style);

const editor = new Ezygrid({
  target: '#app',
  renderer: {
    mode: 'editor', toolbar: true, formulaBar: true,
    sheetTabs: true, statusBar: true, direction: 'rtl',
  },
});
```

## Deliverables and verification

Deliver renderer configuration, scoped theme CSS and integration-specific wiring. Review editor/grid modes, optional controls, light/dark contrast, RTL, keyboard navigation, focus rings, small containers, framework option forwarding and destroy cleanup. Ask before running unit tests; do not run `pnpm test` or individual Vitest files without permission.
