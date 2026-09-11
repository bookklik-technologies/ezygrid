# ezygrid

Framework-agnostic JavaScript/TypeScript spreadsheet and data-grid library.

Clean-room project. See `ezygrid-devplan.md` for the full product and engineering specification.

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
