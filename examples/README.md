# Ezygrid examples

Build the distribution first, then open any example directly or serve the
repository (with WAMP: `http://localhost/ezygrid/examples/`).

```sh
pnpm build   # generates packages/core/dist/browser/
```

Each example is a single self-contained HTML file loading the local browser
loader from `packages/core/dist/browser/`. The library CSS/theme is applied by
the editor itself; the only inline styles are host sizing.

Every example opens the full editor with its ribbon and file controls. For a compact embed use `renderer: { mode: 'grid' }`, or `data-ezg-mode="grid"` on a declarative host.

| Example | File | Shows |
| --- | --- | --- |
| Declarative embed | [declarative.html](declarative.html) | Zero-JS startup via `data-ezg-editor` |
| Programmatic embed | [programmatic.html](programmatic.html) | `new Ezygrid({ target, worksheets })` after `Ezygrid.ready` |
| Events | [events.html](events.html) | `workbook.onOperation` live recalculation |
| Advanced sheet | [advanced.html](advanced.html) | Toolbar, validation, conditional formats, tables, CSV export |

Copy the complete `packages/core/dist/browser/` directory to your static assets
when deploying; the loader fetches its dependency files relative to itself.
