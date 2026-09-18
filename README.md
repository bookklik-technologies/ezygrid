# ezygrid

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-bookklik--technologies%2Fezygrid-blue.svg)](https://github.com/bookklik-technologies/ezygrid)

Framework-agnostic JavaScript/TypeScript spreadsheet and data-grid library by [Bookklik Technologies](https://github.com/bookklik-technologies).

Clean-room project. See `ezygrid-devplan.md` for the full product and engineering specification.

## Initialize a spreadsheet

Give the host a height, then initialize it with JavaScript:

```html
<div id="editor" style="height: 460px"></div>
```

```js
import { Ezygrid } from '@ezygrid/core';

const editor = new Ezygrid({ target: '#editor' });
```

Or use declarative markup with the automatic startup entry point:

```html
<div data-ezg-editor style="height: 460px"></div>
```

```js
import '@ezygrid/core/auto';
```

For an ordinary script tag, copy the complete `packages/core/dist/browser/`
directory to your static assets and include its loader:

```html
<script src="/ezygrid/ezygrid.js"></script>
<script>
  Ezygrid.ready.then(() => {
    const editor = new Ezygrid({ target: '#editor' });
  }).catch(console.error);
</script>
```

The loader fetches separate dependency files and enables declarative startup
automatically. No consumer bundling step is required. Build the distribution
from this repository with `pnpm build`.
See [Getting started](docs/getting-started.md) for configuration, lifecycle, and dynamic hosts,
and the [examples folder](examples/README.md) for runnable demos.

## Status

Phase 0 — architecture prototypes (monorepo, sparse store, viewport index, formula parser, reference transforms).

## Development

```sh
pnpm install
pnpm test        # vitest across all packages
pnpm build       # tsc project references build
pnpm typecheck
```

## Packages

- `@ezygrid/model` — coordinates, ranges, A1 utilities, stable IDs, operation format, sparse store, viewport size index, reference transforms.
- `@ezygrid/formula` — Excel-compatible formula lexer/parser/AST, dependency graph, function library.
- `@ezygrid/core` — workbook/worksheet facade, rendering, selection, editing, history (in progress).

## Clean-room policy

Only publicly documented behavior of comparable products may be referenced. Do not copy proprietary source, assets, docs text or package structures.
