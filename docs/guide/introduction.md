# Introduction

Ezygrid is a **framework-agnostic JavaScript/TypeScript spreadsheet and data-grid library**. It combines an interactive spreadsheet UI (selection, editing, clipboard, fill handle, formula bar) with a headless, serializable workbook model — so you can embed a full editor or drive a workbook entirely from code.

## Design principles

- **TypeScript-first, ESM-first.** All packages ship ES modules with full type declarations. Strict types throughout.
- **No UI framework in the core.** The renderer speaks plain DOM with ARIA roles; framework wrappers are thin and uncontrolled.
- **Sparse by design.** Cells live in a paged sparse store; a 1,048,576-row empty sheet costs almost nothing.
- **No `eval()`.** Formulas are tokenized, parsed to an AST, and evaluated through a dependency graph with budgeted resource limits.
- **Operations are serializable commands.** Every mutation produces an `Operation` with an inverse, which makes undo/redo, history transformation, and collaboration possible.
- **Undoable by default.** Mutating public APIs record history automatically; batches collapse into one undo entry.
- **Collaboration-ready identity.** Cells, rows and columns carry stable IDs; operations carry `actorId` and timestamps.
- **Deterministic calculation.** Formula evaluation is incremental and replay-safe.
- **Accessibility as structure.** The ARIA grid model is part of the DOM contract, not an add-on.

## Package architecture

| Package | Role |
| --- | --- |
| `@ezygrid/core` | Workbook/worksheet facade, rendering, selection, editing, history, plugins |
| `@ezygrid/model` | Coordinates, A1 utilities, sparse store, size index, operations, history primitives |
| `@ezygrid/formula` | Formula lexer/parser, dependency graph, function library, calc worker |
| `@ezygrid/csv` | RFC 4180 CSV parse/stringify with formula-injection escaping |
| `@ezygrid/xlsx` | XLSX import/export |
| `@ezygrid/react` | React `<Spreadsheet>` component |
| `@ezygrid/vue` | Vue 3 `<Spreadsheet>` component |
| `@ezygrid/angular` | Angular `<ezy-grid>` component |
| `@ezygrid/web-component` | `<ezy-grid>` custom element |
| `@ezygrid/theme-default` / `@ezygrid/theme-dark` | CSS-variable themes |

Dependency graph: `core` → `model`, `formula`, `csv`; adapters → `core`; `xlsx` → `core`, `model`; `formula` → `model`.

## What's in the box

- Two-axis virtualized rendering with DOM cell recycling, frozen panes, merges, nested headers, zoom and pagination
- Excel-style keyboard navigation, range selection, multi-select, named command registry with shortcuts
- Editing lifecycle with typed cell editors (dropdown, checkbox, number, date), IME-safe composition handling, formula autocomplete and F4 reference cycling
- Clipboard (TSV + internal fidelity), paste with formula translation, fill/series inference
- Sorting, predicate filters, search and replace, validation, conditional formatting
- Structured tables, defined names, notes, number formats
- SVG charts, pivot aggregation, images and shapes, print/PDF HTML builder
- `toJSON()`/`fromJSON()` persistence with a versioned format
- Plugin system with disposers and command registration

## Next steps

- [Installation](/guide/installation) to set up a project
- [Getting started](/getting-started) for the fastest path to a working grid
- [Workbook & worksheets](/guide/workbook) to understand the model
