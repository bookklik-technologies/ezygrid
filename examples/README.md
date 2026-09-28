# Ezygrid examples

The distribution is committed to the repository, so examples work from a
fresh clone. Rebuild it any time, then open any example directly or serve
the repository (with WAMP: `http://localhost/ezygrid/examples/`).

```sh
pnpm build   # regenerates dist/ and packages/core/dist/browser/
```

Each example is a single self-contained HTML file loading the local browser
loader from `dist/browser/`. The library CSS/theme is applied by
the editor itself; the only inline styles are host sizing.

| Example | File | Shows |
| --- | --- | --- |
| Declarative embed | [declarative.html](declarative.html) | Zero-JS startup via `data-ezg-editor` |
| Programmatic embed | [programmatic.html](programmatic.html) | `new Ezygrid({ target, worksheets })` after `Ezygrid.ready` |
| Events | [events.html](events.html) | `workbook.onOperation` live recalculation |
| Advanced | [advanced.html](advanced.html) | Toolbar, validation, conditional formats, tables, CSV export |

Every example opens the full editor with its ribbon and file controls. For a
compact embed use `renderer: { mode: 'grid' }`, or `data-ezg-mode="grid"` on a
declarative host.

When deploying, you can either host the complete `dist/browser/` directory
(the loader fetches its dependency files relative to itself) or use the
single-file bundle from `dist/ezygrid.umd.js`.
