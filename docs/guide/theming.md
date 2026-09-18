# Theming

All visual tokens are CSS custom properties scoped under `.ezygrid`, so themes are pure CSS and composable.

Theme packages and `buildThemeCss` also target `.ezygrid-suite` so the ribbon, panels, dialogs, and grid share the same tokens. Default editor styles are included automatically. The View ribbon switches between light and dark appearance.

## Theme packages

```ts
import '@ezygrid/theme-default/index.css'; // light
// or
import '@ezygrid/theme-dark/index.css';    // dark (pair with color-scheme: dark)
```

## Tokens

| Variable | Meaning |
| --- | --- |
| `--ezygrid-font-family` | Cell and UI font |
| `--ezygrid-font-size` | Base size (13px) |
| `--ezygrid-bg` | Cell background |
| `--ezygrid-text` | Cell text color |
| `--ezygrid-gridline` | Gridline color |
| `--ezygrid-selection` | Selection border color |
| `--ezygrid-selection-soft` | Selection fill |
| `--ezygrid-header-bg` | Header background |
| `--ezygrid-header-text` | Header text color |
| `--ezygrid-table-band` | Structured table banding |

## Programmatic themes

```ts
import { buildThemeCss, darkThemeTokens, highContrastThemeTokens, defaultThemeTokens } from '@ezygrid/core';

const css = buildThemeCss({ ...darkThemeTokens, selection: '#00ff99' });
// ".ezygrid { --ezygrid-bg: ...; ... }" — inject into a <style> tag or design tokens layer
```

## Overriding variables

```css
.ezygrid {
  --ezygrid-header-bg: #0f172a;
  --ezygrid-header-text: #f8fafc;
}
```

## Suite UI standard

The editor chrome shares the same visual standard as the other Ezy libraries:

- Font: Outfit, weights 400–800, fallback stack `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", sans-serif`
- Icons: Lucide, 1.8 stroke with round caps/joins; 18px in icon buttons, 14px in menus
- Radius scale: 6px controls, 10px menus, 14px dialogs
- Icon buttons 32px, topbar 52px, focus ring 2px accent with 1px offset

Brand accent colors (mint selection) remain Ezygrid-specific.

## Styling hooks

The renderer emits stable class names for custom CSS:

```text
ezygrid, ezygrid-scroll, ezygrid-spacer, ezygrid-cells, ezygrid-row,
ezygrid-cell, ezygrid-selection, ezygrid-fillhandle, ezygrid-colheader,
ezygrid-rowheader, ezygrid-corner, ezygrid-frozen-top, ezygrid-frozen-left,
ezygrid-nestedheader, ezygrid-formulabar, ezygrid-namebox, ezygrid-formulainput,
ezygrid-toolbar, ezygrid-contextmenu, ezygrid-editor, ezygrid-formula-suggestions,
ezygrid-media, ezygrid-chart, ezygrid-clipboard-status
```

## RTL

Set `renderer: { direction: 'rtl' }` for right-to-left layout.
