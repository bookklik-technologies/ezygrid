# Installation

Ezygrid is a pnpm workspace monorepo. Node **>= 20** and pnpm **11** are recommended.

::: tip Next step
Once installed, follow the [Getting started walkthrough](/getting-started) for the fastest path to a working grid.
:::

## From the repository

```bash
git clone https://github.com/bookklik-technologies/ezygrid.git
cd ezygrid
pnpm install
pnpm build
```

Packages are consumed from `packages/*/dist` (workspace `workspace:*` dependencies). They are ESM-only (`"type": "module"`), with full `.d.ts` declarations.

## Installing packages into your project

Once packages are published or wired via a package manager file dependency:

```bash
pnpm add @ezygrid/core @ezygrid/theme-default
```

::: warning
Packages are at version 0.1.0 and not yet published to npm. Until then, depend on the workspace directly.
:::

## Core packages

| Import | Purpose |
| --- | --- |
| `@ezygrid/core` | Main library: `Ezygrid`, `createGrid`, `Workbook`, renderer, services |
| `@ezygrid/core/auto` | Declarative startup scanning for `[data-ezg-editor]` |
| `@ezygrid/core/browser` | Typings for the standalone script global |
| `@ezygrid/model` | Coordinates, sparse store, operations |
| `@ezygrid/formula` | Formula engine, function registry |
| `@ezygrid/formula/worker-main` | Calc web worker entry |
| `@ezygrid/csv` | CSV parse/stringify |
| `@ezygrid/xlsx` | XLSX import/export |

## Themes

```ts
import '@ezygrid/theme-default/index.css'; // or '@ezygrid/theme-dark/index.css'
```

## Development workflow

```bash
pnpm test        # vitest run (unit + DOM tests)
pnpm build       # tsc project references for all packages
pnpm typecheck   # tsc --build
pnpm lint        # eslint
pnpm examples:build  # builds the example gallery + browser distribution
```

TypeScript configuration is strict (`ES2022` target, `noUncheckedIndexedAccess`).
