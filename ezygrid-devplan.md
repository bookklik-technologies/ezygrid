# Ezygrid Development Plan

> **Project:** Ezygrid  
> **Category:** Framework-agnostic JavaScript/TypeScript spreadsheet and data-grid library  
> **Goal:** Deliver an embeddable spreadsheet component with Excel-like interaction patterns, high-performance virtualized rendering, formulas, file interoperability, extensibility, and optional full-stack collaboration.  
> **Status:** Product and engineering specification  
> **Version:** Draft 0.1  
> **Research baseline:** Jspreadsheet public website/documentation as reviewed on 11 September 2026.

---

## 1. Executive Summary

Ezygrid is a clean-room JavaScript spreadsheet component for web applications. It should feel familiar to users of Excel and Google Sheets while remaining a developer-first library that can be embedded inside SaaS products, CMSs, ERP systems, financial tools, educational products, analytics applications, internal tools, and data-entry workflows.

The project should not be implemented as one monolithic package. The recommended architecture is a small spreadsheet kernel plus optional packages for advanced capabilities:

- `@ezygrid/core` - workbook/worksheet model, rendering, selection, editing, clipboard, history, rows/columns, styling, basic formulas, events, plugins.
- `@ezygrid/formula` - Excel-compatible parser, dependency graph, function library, dynamic arrays and advanced calculations.
- `@ezygrid/xlsx` - XLSX/XLSM-compatible import/export where feasible without executing macros.
- `@ezygrid/csv` - CSV/TSV import/export and mapping wizard.
- `@ezygrid/print` - print layout and PDF generation.
- `@ezygrid/charts` - spreadsheet-native charts.
- `@ezygrid/pivot` - pivot tables.
- `@ezygrid/shapes` - floating drawing objects.
- `@ezygrid/comments` - threaded comments, mentions, resolution state.
- `@ezygrid/search` - workbook search and replace.
- `@ezygrid/forms` - spreadsheet-to-form workflows.
- `@ezygrid/ai` - pluggable AI functions and agent tools.
- `@ezygrid/collab-client` - real-time client synchronization.
- `@ezygrid/server` - self-hosted collaboration, persistence, versioning, REST/WebSocket APIs.
- `@ezygrid/react`, `@ezygrid/vue`, `@ezygrid/angular`, `@ezygrid/web-component` - framework integrations.

Ezygrid should use TypeScript, ESM-first packaging, zero mandatory UI-framework dependencies, CSS variables for theming, a sparse worksheet store, two-axis virtualization, immutable operation objects for history/collaboration, and a stable public API designed around workbook, worksheet, range, and cell abstractions.

The development strategy should prioritize a reliable spreadsheet UX before attempting advanced enterprise features. Formula compatibility, clipboard fidelity, structural edits, range references, file interoperability, keyboard behavior, accessibility, and performance are the hardest parts and should be treated as first-class engineering projects rather than add-ons.

---

## 2. Benchmark Scope and Clean-Room Requirement

Ezygrid is intended to be **similar in capability and user expectations** to modern Jspreadsheet and Excel-like spreadsheet components, but its architecture, APIs, code, naming, internal algorithms, UI assets, and documentation should be independently designed.

Publicly documented Jspreadsheet capabilities used as a benchmark include:

- Spreadsheet grid with cells, rows, columns, worksheets and multiple tabs.
- Excel-like copy/paste, fill handle, keyboard navigation and context menus.
- Sparse/virtualized rendering for large worksheets.
- Formula engine with hundreds of Excel-compatible functions, custom formulas, cross-sheet calculations, names, suggestions and dependency tracking.
- Cell editors including text, numeric, dropdown, checkbox, radio, calendar/date, image, color, email, URL, progress, rating, HTML/rich content, notes and switch-like inputs.
- Filters, sorting, search, pagination, grouping, freeze panes, merged cells, nested headers and footers.
- Formatting, validations and conditional formatting.
- Structured worksheet tables.
- Charts, floating images/media and shapes.
- Pivot tables.
- XLSX import/export, CSV workflows, PDF export and additional data interchange capabilities.
- React, Vue, Angular and vanilla JavaScript integrations.
- Real-time server synchronization, persistence adapters, authentication hooks, snapshots/version history and REST/WebSocket APIs.
- Threaded comments, public forms and AI/LLM integration.

### 2.1 Legal and implementation rule

Do not copy proprietary Jspreadsheet Pro or extension source code, minified bundles, private APIs, stylesheets, icons, documentation text, test fixtures, internal wire formats, or package structure verbatim.

Jspreadsheet CE is publicly distributed under MIT, but Ezygrid should still decide explicitly whether it is:

1. a clean-room implementation using only behavioral/public documentation as reference, or
2. a derivative project that intentionally reuses MIT-licensed CE code with attribution and license compliance.

This development plan assumes **Option 1: clean-room implementation**.

### 2.2 Product positioning

Ezygrid should be positioned as:

> A modular, framework-agnostic JavaScript spreadsheet engine and UI for building Excel-like experiences directly inside web applications.

Primary differentiators should be:

- Open architecture and clear extension contracts.
- Strong TypeScript types.
- Predictable JSON document model.
- Headless-compatible calculation/data engine.
- First-class collaborative operation model.
- Good defaults without requiring a UI framework.
- Performance on sparse, very large worksheets.
- Accessibility as part of the rendering model, not an afterthought.
- Compatibility-focused test corpus for formulas, clipboard and XLSX round-tripping.

---

## 3. Goals

### 3.1 Core product goals

- Provide Excel-like spreadsheet interaction in the browser.
- Support multiple worksheets in one workbook.
- Render very large sparse grids efficiently.
- Provide robust selection, editing, clipboard, fill and keyboard behavior.
- Support formulas and automatic recalculation.
- Preserve formulas and references during row/column insertion, deletion, movement, copy/paste and fill operations.
- Support custom editors, renderers, commands, menu items and plugins.
- Provide a stable API for programmatic manipulation.
- Work in vanilla JavaScript and TypeScript.
- Offer official React, Vue and Angular wrappers.
- Support import/export of common spreadsheet formats.
- Support offline/local use with optional self-hosted collaboration.
- Provide robust accessibility and internationalization.
- Make persistence and collaboration backend-agnostic.

### 3.2 Enterprise/full-stack goals

- Real-time multi-user editing.
- Presence and remote selections.
- Auth hooks and fine-grained permissions.
- Server-authoritative operations and recalculation.
- Snapshot/version history.
- Comments and mentions.
- Public forms that write to spreadsheet ranges.
- REST API for backend jobs.
- AI formula functions and agent-accessible tools.
- Pluggable persistence for PostgreSQL, MongoDB, Redis and custom databases.

---

## 4. Non-Goals for Initial Releases

The following should not block the first stable release:

- VBA or Office macro execution.
- 100% pixel-identical Excel rendering.
- Every Excel function in the first release.
- Full Power Query / Power Pivot parity.
- Excel add-in compatibility.
- Native `.xls` binary format support in core.
- Desktop application features unrelated to spreadsheet embedding.
- General-purpose document editing.
- Arbitrary JavaScript execution inside formulas.

These may be revisited through extensions after the core model is stable.

---

## 5. Product Editions / Package Strategy

Avoid artificially splitting the codebase into incompatible editions. Use packages and optional commercial services/features instead.

### 5.1 Suggested package tiers

#### Ezygrid Core

Required for every project:

- Workbook/worksheet model.
- Sparse cell store.
- Grid renderer.
- Virtual scrolling.
- Selection and navigation.
- Cell editing.
- Clipboard.
- History.
- Rows/columns.
- Basic formatting.
- Basic data types/editors.
- Basic filters and sorting.
- Plugin API.
- TypeScript API.

#### Ezygrid Pro Modules

Optional advanced browser modules:

- Advanced formula library.
- XLSX import/export.
- PDF/print engine.
- Charts.
- Pivot tables.
- Shapes/media editor.
- Advanced validations UI.
- Search/replace UI.
- Comments.
- Form designer.
- Advanced menu/ribbon components.

#### Ezygrid Server

Optional self-hosted backend:

- Collaboration.
- Presence.
- Version history.
- Database persistence.
- REST API.
- Comments persistence.
- File/media storage.
- AI gateway.
- Forms endpoint.

The engineering contracts between these layers must be public and documented so third parties can build replacements.

---

## 6. Technical Principles

1. **TypeScript-first** - all packages authored in strict TypeScript.
2. **ESM-first** - native ES modules with optional CJS compatibility build where justified.
3. **Framework-agnostic core** - no React/Vue/Angular dependency in core.
4. **Sparse storage** - do not allocate a JavaScript object for every theoretical cell.
5. **Virtual DOM is not required** - use a purpose-built DOM renderer for grid performance.
6. **Model before DOM** - the workbook model is authoritative; DOM is a viewport projection.
7. **Operations are explicit** - all mutations flow through serializable operations/commands.
8. **Undoable by default** - user-visible state mutations create history entries unless marked transient.
9. **Collaboration-ready from day one** - row/column/sheet identities and operations must not depend solely on array indexes.
10. **Deterministic calculations** - formula results must be reproducible between browser and server runtimes.
11. **No `eval()`** - formula parsing must use a real lexer/parser/AST.
12. **Accessibility is structural** - ARIA, keyboard interactions and focus semantics should be part of renderer design.
13. **Security by default** - sanitize HTML/rich content and treat imported spreadsheet content as untrusted.
14. **Tree-shakeable modules** - advanced features must not inflate the core bundle when unused.
15. **Stable public API** - internal storage may change without breaking consumers.

---

## 7. Proposed Monorepo

Use `pnpm` workspaces + Turborepo or Nx.

```text
ezygrid/
├─ apps/
│  ├─ docs/
│  ├─ playground/
│  ├─ benchmark/
│  ├─ compatibility-lab/
│  └─ collab-demo/
├─ packages/
│  ├─ core/
│  ├─ model/
│  ├─ renderer/
│  ├─ formula/
│  ├─ formula-functions/
│  ├─ csv/
│  ├─ xlsx/
│  ├─ print/
│  ├─ charts/
│  ├─ pivot/
│  ├─ shapes/
│  ├─ comments/
│  ├─ search/
│  ├─ forms/
│  ├─ ai/
│  ├─ collab-protocol/
│  ├─ collab-client/
│  ├─ server/
│  ├─ react/
│  ├─ vue/
│  ├─ angular/
│  ├─ web-component/
│  ├─ theme-default/
│  ├─ theme-dark/
│  └─ testing/
├─ fixtures/
│  ├─ xlsx/
│  ├─ csv/
│  ├─ formulas/
│  ├─ clipboard/
│  └─ accessibility/
├─ scripts/
└─ docs/
```

### 7.1 Dependency boundaries

```text
model
  ↑
formula ← core → renderer
  ↑       ↑       ↑
 xlsx    plugins  themes
  ↑
server ← collab-protocol ← collab-client

react/vue/angular/web-component → core
charts/pivot/shapes/comments/search/forms → core public extension API
```

`core` should never import React, Vue or Angular.

---

## 8. Public Initialization API

Target a compact API that supports both imperative and declarative use.

```ts
import { createGrid } from '@ezygrid/core';
import { formulas } from '@ezygrid/formula';

const workbook = createGrid(document.querySelector('#grid')!, {
  locale: 'en-MY',
  toolbar: true,
  formulaBar: true,
  tabs: true,
  extensions: [formulas()],
  worksheets: [
    {
      id: 'sheet-sales',
      name: 'Sales',
      minDimensions: { rows: 100, columns: 26 },
      data: [
        ['Month', 'Revenue', 'Cost', 'Profit'],
        ['Jan', 12000, 7000, '=B2-C2'],
      ],
    },
  ],
});
```

### 8.1 High-level object model

```ts
interface Workbook {
  id: string;
  worksheets: Worksheet[];
  activeWorksheetId: string;

  getWorksheet(idOrName: string): Worksheet | undefined;
  addWorksheet(config?: WorksheetConfig): Worksheet;
  removeWorksheet(id: string): void;
  moveWorksheet(id: string, index: number): void;
  renameWorksheet(id: string, name: string): void;

  undo(): void;
  redo(): void;
  batch(fn: () => void): void;
  transact(label: string, fn: () => void): void;

  getConfig(): WorkbookSnapshot;
  destroy(): void;
}
```

```ts
interface Worksheet {
  id: string;
  name: string;

  getCell(address: string): CellHandle;
  getRange(ref: string): RangeHandle;
  getValue(address: string, options?: ValueOptions): unknown;
  setValue(address: string, value: unknown, options?: SetValueOptions): void;
  setValues(changes: CellValueChange[]): void;

  insertRows(index: number, count?: number): void;
  deleteRows(index: number, count?: number): void;
  moveRows(from: number, count: number, to: number): void;
  insertColumns(index: number, count?: number): void;
  deleteColumns(index: number, count?: number): void;
  moveColumns(from: number, count: number, to: number): void;

  sort(spec: SortSpec[]): void;
  setFilter(filter: FilterSpec): void;
  clearFilter(id?: string): void;
}
```

---

## 9. Workbook and Worksheet Data Model

### 9.1 Stable identities

Every structural object needs a stable GUID/UUID independent of visual position:

- Workbook ID.
- Worksheet ID.
- Row ID.
- Column ID.
- Table ID.
- Comment thread ID.
- Media object ID.
- Validation rule ID.
- Named range ID.
- Pivot ID.

This is essential for collaborative editing and reliable undo after structural changes.

### 9.2 Sparse cell representation

Do not allocate a 1,000,000 × 16,384 matrix.

Recommended conceptual structure:

```ts
interface SheetStore {
  rows: SparseIndex<RowRecord>;
  columns: SparseIndex<ColumnRecord>;
  cells: SparseCellStore;
  dimensions: {
    rowCount: number;
    columnCount: number;
    usedRange: Rect;
  };
}
```

Cell keys can be represented internally using packed numeric coordinates, row/column identities, or a page + offset strategy.

Possible design:

```ts
// 256x256-cell pages created only when used
Map<PageKey, CellPage>
```

Each `CellPage` contains compact arrays/bitsets for:

- raw value/formula.
- calculated value reference.
- style index.
- metadata index.
- validation reference.
- custom properties.

### 9.3 String/style interning

Use shared dictionaries for:

- repeated styles.
- number formats.
- fonts.
- borders.
- dropdown options.
- comments/metadata references.

A cell should store integer indexes where possible instead of duplicating objects.

### 9.4 Canonical cell value types

```ts
type CellPrimitive =
  | null
  | string
  | number
  | boolean
  | DateValue
  | ErrorValue;

interface FormulaValue {
  kind: 'formula';
  expression: string;
}
```

Keep **raw input**, **typed value**, **calculated value**, and **formatted display value** separate.

```ts
interface CellRecord {
  raw?: unknown;
  value?: CellPrimitive;
  formula?: string;
  styleId?: number;
  propertiesId?: number;
  metaId?: number;
}
```

This avoids common bugs where formatted strings become calculation inputs.

---

## 10. Rendering Engine

### 10.1 Rendering approach

Use real DOM cells within a virtualized viewport rather than rendering the full sheet.

Recommended hierarchy:

```text
.ezygrid
├─ toolbar / top menu
├─ formula bar
├─ viewport
│  ├─ corner
│  ├─ column header layer
│  ├─ row header layer
│  ├─ frozen top-left layer
│  ├─ frozen top layer
│  ├─ frozen left layer
│  ├─ scrollable cell layer
│  ├─ selection overlay
│  ├─ editor overlay
│  └─ media overlay
├─ sheet tabs
└─ status bar
```

### 10.2 Two-axis virtualization

Support independent row and column virtualization.

Requirements:

- Variable row heights.
- Variable column widths.
- Frozen rows and columns.
- Merged cells crossing viewport boundaries.
- Overscan.
- Scroll anchoring during insert/delete.
- Precise hit-testing.
- Smooth keyboard navigation to off-screen cells.

Use cumulative size indexes, preferably Fenwick trees or segment trees, to resolve:

- pixel offset → row/column index.
- row/column index → pixel offset.
- range pixel bounds.

Operations should be approximately `O(log n)` for variable dimensions.

### 10.3 Rendering budget

Target at 60 FPS on modern desktop browsers.

Initial viewport performance targets:

- < 16 ms average interaction frame.
- < 8 ms cell-range selection overlay update.
- < 50 ms activation of a cell outside the current viewport.
- < 150 ms initial render for a typical 100 × 30 populated sheet after data parsing.
- Large logical grid should not allocate DOM proportional to total rows × columns.

### 10.4 DOM recycling

Reuse cell elements during scrolling when practical. Never expose DOM element identity as a stable public API contract.

### 10.5 Canvas consideration

Do not use Canvas for the primary cell grid unless profiling proves DOM cannot satisfy targets. DOM is preferred for:

- contenteditable/editor integration.
- accessibility.
- browser text selection/IME.
- native focus.
- custom renderers.

Canvas can be used for selection borders, charts or optional extreme-scale rendering later.

---

## 11. Selection and Navigation

Selection behavior is one of the most important compatibility areas.

### 11.1 Selection modes

Support:

- Single cell.
- Rectangular range.
- Multiple ranges with Ctrl/Cmd.
- Whole row.
- Whole column.
- Whole worksheet.
- Named ranges.
- Table column/range selections.
- Selection expansion using Shift.
- Ctrl/Cmd + Shift + Arrow to data-region boundary.

### 11.2 Cursor model

Separate:

- active cell.
- anchor cell.
- selected ranges.
- edit target.
- remote collaborator selections.

### 11.3 Keyboard navigation

Implement familiar spreadsheet behavior for:

- Arrow keys.
- Tab / Shift+Tab.
- Enter / Shift+Enter.
- Page Up / Page Down.
- Home / End.
- Ctrl/Cmd + Arrow.
- Ctrl/Cmd + Home / End.
- Shift range expansion.
- F2/edit shortcut.
- Escape cancellation.
- Delete/Backspace clearing.
- Ctrl/Cmd+A selection semantics.
- Shift+Space row selection.
- Ctrl/Cmd+Space column selection.

Shortcuts must be configurable and platform-aware.

### 11.4 Formula reference selection

While editing a formula:

- Clicking/dragging a range should insert or replace an A1 reference.
- Selected references should use distinct visual outlines.
- F4-style reference cycling should support `A1`, `$A$1`, `A$1`, `$A1`.

---

## 12. Clipboard and Fill Handle

### 12.1 Clipboard MIME formats

Use the Clipboard API where available and support:

- `text/plain` using TSV.
- `text/html` using HTML table representation.
- Ezygrid private MIME payload for full-fidelity internal transfer when browser support permits.

Private payload may include:

```ts
interface EzygridClipboardPayload {
  version: 1;
  sourceWorkbookId?: string;
  sourceWorksheetId?: string;
  sourceRange: string;
  cells: SerializedCell[][];
  merges?: MergeSpec[];
  styles?: StyleRecord[];
}
```

### 12.2 Copy/paste modes

Support:

- Copy.
- Cut.
- Paste all.
- Paste values only.
- Paste formulas only.
- Paste formatting only.
- Paste validation only.
- Paste comments/notes only.
- Transpose paste.
- Skip blanks.

### 12.3 Formula translation

When formulas are copied or filled, relative references must move correctly while absolute components remain fixed.

Example:

```text
B2 = A2*$D$1
copy B2 → B3
B3 = A3*$D$1
```

### 12.4 Fill handle

Support:

- Copy values.
- Copy formulas.
- Increment numeric series.
- Date/time series.
- Day/month labels.
- Custom series via extension.
- Pattern inference over multiple seed cells.
- Double-click fill down to neighboring data boundary.

---

## 13. Cell Editing and Built-In Editors

### 13.1 Edit lifecycle

Lifecycle:

```text
idle → activate → beginEdit → validate → commit | cancel → recalculate → render
```

Provide before/after hooks at each meaningful stage.

### 13.2 Built-in editor types

Ezygrid should ship first-party editors comparable to common spreadsheet/data-grid products:

- `text`
- `number`
- `currency`
- `percent`
- `date`
- `datetime`
- `time`
- `dropdown`
- `autocomplete`
- `multiselect`
- `checkbox`
- `radio`
- `switch`
- `color`
- `email`
- `url`
- `image`
- `progress`
- `rating`
- `autoNumber`
- `richText`
- `html` with sanitization
- `notes`
- `hidden`

### 13.3 Editor contract

```ts
interface CellEditor<T = unknown> {
  mount(ctx: EditorContext<T>): EditorInstance;
}

interface EditorInstance {
  focus(): void;
  getValue(): unknown;
  setValue(value: unknown): void;
  validate?(): ValidationResult;
  destroy(): void;
}
```

Editors must support:

- Keyboard navigation.
- IME composition.
- Mobile touch input.
- ARIA labels.
- Async option sources where appropriate.
- Per-column defaults.
- Per-cell override.

### 13.4 Custom renderer contract

Separate display renderer from editor.

```ts
interface CellRenderer {
  render(ctx: CellRenderContext): Node | string | RenderPatch;
}
```

Renderers must not mutate workbook state during render.

---

## 14. Formula Engine

Formula compatibility is a standalone subsystem and should be developed with its own test corpus.

### 14.1 Architecture

Pipeline:

```text
formula text
  ↓ lexer
  ↓ parser
AST
  ↓ reference resolver
Dependency graph
  ↓ evaluator
Typed result / error
  ↓ formatter
Displayed value
```

### 14.2 Grammar support

Implement:

- Numeric/string/boolean literals.
- Unary/binary operators.
- Comparison operators.
- Percent.
- Concatenation.
- Parentheses.
- Function calls.
- A1 references.
- Absolute/mixed references.
- Ranges.
- Full row/column references.
- Cross-sheet references.
- Quoted sheet names.
- Named ranges and named constants.
- Structured table references.
- Spill operator / dynamic arrays.
- Error literals.
- Array constants.

### 14.3 Dependency graph

Maintain both precedents and dependents.

Requirements:

- Recalculate only affected formulas.
- Topological evaluation.
- Circular-reference detection.
- Dirty flags.
- Batch calculation suspension/resume.
- Cross-sheet graph.
- Dynamic range dependency tracking.
- Volatile function handling.

### 14.4 Calculation worker

For large workbooks, support formula evaluation in a Web Worker.

The model must have a transport-efficient representation so cell changes do not require serializing the entire workbook on every edit.

### 14.5 Formula function roadmap

#### Tier A - MVP

- `SUM`
- `AVERAGE`
- `MIN`
- `MAX`
- `COUNT`
- `COUNTA`
- `IF`
- `IFS`
- `AND`
- `OR`
- `NOT`
- `ROUND`
- `ROUNDUP`
- `ROUNDDOWN`
- `ABS`
- `MOD`
- `POWER`
- `SQRT`
- `CONCAT`
- `TEXTJOIN`
- `LEFT`
- `RIGHT`
- `MID`
- `LEN`
- `TRIM`
- `UPPER`
- `LOWER`
- `TODAY`
- `NOW`
- `DATE`
- `YEAR`
- `MONTH`
- `DAY`
- `VLOOKUP`
- `HLOOKUP`
- `INDEX`
- `MATCH`
- `COUNTIF(S)`
- `SUMIF(S)`
- `AVERAGEIF(S)`

#### Tier B - professional compatibility

- `XLOOKUP`
- `XMATCH`
- `FILTER`
- `SORT`
- `SORTBY`
- `UNIQUE`
- `SEQUENCE`
- `TRANSPOSE`
- `LET`
- date/time families.
- text families.
- math/trig families.
- statistical functions.
- financial functions.
- information functions.
- engineering functions.

#### Tier C - target 500+ compatibility functions

Build toward broad Excel-compatible coverage with a published compatibility matrix indicating:

- implemented.
- partially compatible.
- locale-sensitive difference.
- unsupported.
- intentionally divergent.

### 14.6 Formula errors

Implement:

- `#NULL!`
- `#DIV/0!`
- `#VALUE!`
- `#REF!`
- `#NAME?`
- `#NUM!`
- `#N/A`
- `#SPILL!`
- `#CALC!`
- `#CIRCULAR!` or an Excel-compatible handling mode.

### 14.7 Formula suggestions

When input starts with `=`, provide autocomplete containing:

- Function name.
- Signature.
- Description.
- Category.
- Argument help.

Plugin API:

```ts
formulaRegistry.register({
  name: 'MYFUNC',
  category: 'Custom',
  volatile: false,
  evaluate(args, context) {
    return ...;
  }
});
```

### 14.8 External and asynchronous functions

Support asynchronous formulas only through an explicit extension API.

Examples:

- AI prompt functions.
- API lookup functions.
- server-side custom functions.

Requirements:

- Pending state.
- cancellation.
- cache.
- rate limit hooks.
- deterministic serialization policy.
- no secret API keys in browser bundles.

---

## 15. Structural Spreadsheet Operations

Implement all structural operations as reversible command objects.

### 15.1 Rows

- Insert above/below.
- Delete.
- Move.
- Duplicate.
- Resize.
- Auto-fit.
- Hide/unhide.
- Group/ungroup.
- Collapse/expand groups.
- Read-only row.
- Row-level styles/properties.

### 15.2 Columns

- Insert left/right.
- Delete.
- Move/drag.
- Duplicate.
- Resize.
- Auto-fit.
- Hide/unhide.
- Group/ungroup.
- Collapse/expand groups.
- Column types/editors.
- Column-level validation/default formatting.

### 15.3 Reference rewriting

After insert/delete/move:

- Formula references update.
- Named ranges update.
- table ranges update.
- filters update.
- validations update.
- conditional formats update.
- chart ranges update.
- pivot source ranges update.
- comments stay attached to logical cells.
- collaboration operations target identities rather than stale indexes.

A dedicated **Reference Transform Engine** should be built and tested separately.

---

## 16. Merged Cells

Support:

- Merge selected range.
- Merge horizontally.
- Merge vertically.
- Unmerge.
- Selection around merged ranges.
- Copy/paste of merges.
- Row/column insertion through merge regions.
- Frozen panes + merged cells.
- Virtualization across partially visible merges.

Data rule: only the anchor cell stores value; covered cells contain merge membership metadata.

---

## 17. Headers, Nested Headers and Footers

### 17.1 Column and row headers

- Default A, B, C... labels.
- Custom labels.
- Custom header renderer.
- Resizing.
- dragging/reordering.
- sorting/filter indicators.
- select-all corner.

### 17.2 Nested headers

Support grouped/multi-level column headers with:

- `colspan` semantics.
- resize synchronization.
- moving groups.
- show/hide groups.
- selection of grouped columns.

### 17.3 Footers

Support fixed bottom rows with:

- Static labels.
- formulas.
- summaries.
- custom renderer.
- optional participation in export.

---

## 18. Freeze Panes

Support:

- Freeze first row.
- Freeze first column.
- Freeze N rows.
- Freeze N columns.
- Freeze at active cell.
- Interactive drag/split handles later.

Frozen regions must work with:

- merged cells.
- nested headers.
- filters.
- variable sizes.
- media overlays.
- keyboard navigation.

---

## 19. Sorting

### 19.1 Basic sorting

- Ascending/descending.
- Number/date/text-aware comparison.
- Locale-aware collation.
- Blank/error ordering.
- Stable sort.

### 19.2 Multi-column sorting

```ts
worksheet.sort([
  { column: 'C', direction: 'desc' },
  { column: 'A', direction: 'asc' },
]);
```

### 19.3 Sort scopes

- Entire used range.
- Current region.
- Selected range.
- Structured table.
- Filtered rows only where semantically appropriate.

Structural sort operations must preserve row identity and update formulas correctly.

---

## 20. Filters

### 20.1 Filter types

- Value checklist.
- Text contains / starts with / ends with.
- Number comparison.
- Date comparison/ranges.
- Top/bottom N.
- Above/below average.
- Blank/nonblank.
- Color/style filter later.
- Custom predicate API.

### 20.2 Filter scopes

- Worksheet header filter.
- Arbitrary range filter.
- Table filter.

Range filters must follow structural changes. Inserting/deleting/moving rows or columns should shift/grow/shrink affected filter ranges and be undoable.

### 20.3 Filter UI

Dropdown should include:

- Sort A→Z / Z→A.
- Search values.
- Select all.
- Unique values.
- filter operators.
- clear filter.

---

## 21. Search and Replace

### 21.1 Search scopes

- Active sheet.
- Workbook.
- Selection.
- Formulas.
- Displayed values.
- Comments/notes optionally.

### 21.2 Options

- Match case.
- Match whole cell.
- Regex optional.
- Search by row or column.
- Find next/previous.
- Replace.
- Replace all.

Search should be indexed for large workbooks when practical.

---

## 22. Pagination

Pagination is useful for database-like data grids even though traditional spreadsheets scroll.

Support:

- Page size.
- Page size options.
- page count.
- current page.
- programmatic navigation.
- server-side pagination adapter.

Do not mix pagination semantics into the underlying worksheet model. It should be a view strategy.

---

## 23. Styling and Formatting

### 23.1 Style model

Support range, row, column and cell styles with inheritance.

Priority:

```text
base theme
  < worksheet defaults
  < row/column style
  < cell style
  < conditional format
  < transient selection/error state
```

### 23.2 Style properties

- Font family.
- Font size.
- Bold.
- Italic.
- Underline.
- Strike-through.
- Text color.
- Fill/background.
- Horizontal alignment.
- Vertical alignment.
- Borders per side.
- Border styles.
- Indent.
- Text wrapping.
- Text rotation.
- Overflow.
- Direction.

### 23.3 Number formats

Implement a locale-aware number-format engine supporting:

- General.
- Number.
- Currency.
- Accounting.
- Percent.
- Scientific.
- Fraction.
- Date.
- Time.
- Duration.
- Custom masks.

Store raw numeric/date values independently of display formatting.

### 23.4 Format painter

Add later as a toolbar command using style-only clipboard mode.

---

## 24. Data Validation and Conditional Formatting

### 24.1 Validation types

- Number.
- Text.
- Date.
- Time.
- List.
- Text length.
- Empty.
- Non-empty.
- Formula-driven validation.
- Custom named validator.

### 24.2 Criteria

- equals / not equals.
- greater / greater-or-equal.
- less / less-or-equal.
- between / not-between.
- contains / not contains.
- starts with / ends with.
- valid date.
- valid email.
- valid URL.

### 24.3 Validation actions

- Reject.
- Warning.
- Allow but mark.
- Format only.

### 24.4 List validation

Sources:

- Literal list.
- range.
- named range.
- formula returning an array.
- async source through custom editor only.

### 24.5 Conditional formatting

Support range-based rules:

- Cell comparison.
- Formula.
- Text match.
- Date condition.
- Duplicates/unique.
- Top/bottom.
- Data bars.
- Color scales.
- Icon sets later.

Rules require priorities and stop-if-true behavior.

---

## 25. Structured Tables

Implement named worksheet tables similar to modern spreadsheet applications.

```ts
interface TableDefinition {
  id: string;
  name: string;
  range: string;
  headerRow: boolean;
  totalRow?: boolean;
  filterButtons?: boolean;
  theme?: string;
  columns: TableColumn[];
}
```

Features:

- Create from selected range.
- Unique table name.
- Header row.
- filter controls.
- styled banded rows/columns.
- total row.
- automatic table expansion on adjacent entry.
- calculated columns.
- structured references in formulas.
- resize table.
- convert table to normal range.

---

## 26. Defined Names and Namespaces

### 26.1 Defined names

Support workbook and worksheet scoped:

- Named ranges.
- Named constants.
- Named formulas.

Example:

```text
TaxRate = 0.08
Sales2026 = Sales!B2:B13
```

Formula:

```text
=SUM(Sales2026)*(1+TaxRate)
```

### 26.2 Namespace concept

For server/multi-workbook environments, allow calculation namespaces so workbooks with identical sheet names do not collide.

```ts
createGrid(el, {
  namespace: 'tenant-42:forecast-2026',
  ...
});
```

Cross-workbook references should be extension-driven, not global variables on `window`.

---

## 27. History, Undo and Redo

### 27.1 Command model

Every mutation produces an operation:

```ts
interface Operation<T = unknown> {
  id: string;
  actorId?: string;
  workbookId: string;
  worksheetId?: string;
  type: string;
  payload: T;
  timestamp: number;
  inverse?: Operation;
}
```

### 27.2 Required behavior

- Workbook-wide undo/redo.
- One history entry for a logical operation, such as a multi-cell paste.
- Transactions for grouped programmatic changes.
- Ignore/transient mode.
- configurable history limit.
- history events.
- non-edit view state excluded from history by default.

### 27.3 Collaboration-aware history

Undo must target logical row/column/cell identities rather than blindly replaying stale indexes.

Scenario:

1. User A edits row R.
2. User B inserts rows above R.
3. User A presses Undo.
4. The edit to logical row R must be reverted at its new position.

This requirement should influence data model design before collaboration is implemented.

---

## 28. Worksheet Tabs and Workbook Management

Features:

- Add sheet.
- Delete sheet.
- Rename sheet.
- Duplicate sheet.
- Move/reorder sheet.
- Hide/unhide sheet.
- sheet color.
- protect sheet.
- active sheet.
- overflow tab scrolling.
- context menu.

Cross-sheet formulas must survive sheet rename/move.

---

## 29. Comments and Notes

Separate simple cell notes from collaborative comment threads.

### 29.1 Notes

- Plain or rich text annotation.
- Cell indicator.
- Tooltip/popover.
- local JSON persistence.

### 29.2 Threaded comments

```ts
interface CommentThread {
  id: string;
  worksheetId: string;
  target: CellIdentity;
  messages: CommentMessage[];
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Features:

- Threaded replies.
- `@mentions`.
- resolve/reopen.
- edit/delete own comment.
- author metadata.
- notifications hooks.
- server persistence.
- permission checks.

---

## 30. Floating Media and Images

Media objects live in a worksheet overlay, separate from cell values.

```ts
type MediaObject =
  | ImageMedia
  | ChartMedia
  | ShapeMedia;
```

Features:

- Add image by URL/file/data URI.
- Move.
- resize.
- crop later.
- rotate later.
- z-index.
- lock.
- anchor to cell/range.
- duplicate/delete.
- preserve in XLSX when supported.

Cell image editor is distinct from floating media.

---

## 31. Charts

Charts should be data-bound to ranges and update when dependent values change.

### 31.1 Initial chart types

- Column.
- Bar.
- Line.
- Area.
- Pie.
- Doughnut.
- Scatter.
- Bubble.
- Radar.
- Histogram.
- Stacked column/bar/area.
- 100% stacked variants.
- Pareto later.

### 31.2 Chart model

```ts
interface ChartSpec {
  id: string;
  type: ChartType;
  source: RangeReference;
  series: ChartSeries[];
  title?: string;
  legend?: LegendSpec;
  axes?: AxisSpec[];
  position: FloatingRect;
  theme?: string;
}
```

### 31.3 Chart implementation

Keep a provider abstraction so Ezygrid can use:

- an internal SVG/canvas chart engine, or
- adapters for Chart.js / ECharts / Highcharts.

The serialized chart model must remain provider-neutral where possible.

---

## 32. Shapes and Drawing Layer

Initial shapes:

- Rectangle.
- rounded rectangle.
- ellipse.
- triangle.
- diamond.
- pentagon/hexagon/octagon.
- line.
- arrow.
- text box.

Features:

- Move/resize/rotate.
- fill/stroke.
- text formatting.
- z-order.
- group/ungroup later.
- snap to cells.
- anchor to cells.
- keyboard deletion.
- selection handles.

---

## 33. Pivot Tables

Pivot should be an optional package because it adds substantial aggregation/UI complexity.

### 33.1 Configuration

```ts
interface PivotSpec {
  id: string;
  source: string;
  anchor: string;
  rows: PivotField[];
  columns: PivotField[];
  values: PivotValueField[];
  filters: PivotFilter[];
}
```

### 33.2 Features

- Multiple row groups.
- multiple column groups.
- aggregations: SUM, COUNT, COUNTA, AVG, MIN, MAX, PRODUCT, STDDEV, VAR.
- sort labels/values.
- filter source data.
- expand/collapse groups.
- grand totals.
- subtotals.
- refresh.
- derived/calculated fields later.
- pivot charts later.

### 33.3 Performance

Pivot computation should run in a worker for large sources and use dictionary encoding/group-key hashing.

---

## 34. Toolbar, Formula Bar, Top Menu and Context Menus

### 34.1 Formula bar

- Name box showing active cell/range.
- direct navigation by A1 address/name.
- formula/value input.
- formula reference highlighting.
- cancel/accept buttons.

### 34.2 Toolbar

Configurable commands:

- Undo/redo.
- font.
- font size.
- bold/italic/underline/strike.
- text/fill color.
- borders.
- alignment.
- number format.
- merge.
- wrap.
- sort/filter.
- validation.
- chart.
- insert image.
- zoom.

### 34.3 Top menu

Optional desktop-style menu:

- File.
- Edit.
- View.
- Insert.
- Format.
- Data.
- Tools.
- Help.

Everything must be exposed as commands so users can replace the UI while reusing behavior.

### 34.4 Command registry

```ts
commands.register({
  id: 'cell.bold',
  title: 'Bold',
  shortcut: 'Mod+B',
  isEnabled(ctx) { ... },
  isActive(ctx) { ... },
  execute(ctx) { ... },
});
```

Toolbars/context menus/top menu should consume the same command registry.

---

## 35. Import and Export

File interoperability deserves dedicated compatibility tests.

### 35.1 CSV/TSV

Support:

- Delimiter detection.
- Encoding detection where feasible.
- BOM.
- quote escaping.
- line endings.
- locale number parsing options.
- column mapping UI.
- preview.
- header detection.
- per-column type assignment.
- CSV export.

### 35.2 XLSX import

Target preservation of:

- multiple worksheets.
- raw values.
- formulas.
- formula results where available.
- cell number formats.
- fonts/fills/borders/alignment.
- row heights.
- column widths.
- hidden rows/columns/sheets.
- merged cells.
- freeze panes.
- filters.
- tables.
- validations.
- named ranges.
- comments/notes when supported.
- images/media where feasible.
- charts in later milestones.

Use a dedicated parser package that maps Open XML parts into Ezygrid JSON.

### 35.3 XLSX export

Produce standards-compliant Open XML packages with:

- shared strings.
- styles.
- workbook relationships.
- sheet XML.
- formulas.
- calculation mode metadata.
- merges.
- dimensions.
- validations.
- tables.
- comments/media/charts progressively.

Optionally support password-protected XLSX only after security review and interoperability testing.

### 35.4 Additional formats

Roadmap candidates:

- `.ods` import/export.
- `.xlsb` import later.
- `.xls` through separate converter/service if needed.
- `.json` native snapshot.
- `.html` table.
- `.pdf` export.
- `.spss/.sav` export only if a concrete product requirement exists.

### 35.5 Round-trip testing

For each fixture:

```text
XLSX → Ezygrid JSON → XLSX → reopen in Excel/LibreOffice → compare semantics
```

Define compatibility by semantic equivalence, not byte-for-byte identity.

---

## 36. Print and PDF

### 36.1 Print settings

- Portrait/landscape.
- Paper size.
- Margins.
- scale.
- fit to width/height.
- print area.
- repeated header rows.
- gridlines.
- row/column headers.
- header/footer text.
- page breaks later.

### 36.2 Browser and server generation

Support both:

- Browser PDF/download.
- Node.js/headless backend PDF generation.

Use embedded fonts only when licensing permits. Never package arbitrary font files from the host environment.

---

## 37. Persistence API

Client-only Ezygrid should make persistence simple without coupling it to a backend.

### 37.1 Snapshot persistence

```ts
const snapshot = workbook.toJSON();
const workbook = createGrid(el, snapshot);
```

### 37.2 Change persistence

Provide operation events:

```ts
workbook.on('operation', async (op) => {
  await api.saveOperation(op);
});
```

### 37.3 Adapter interface

```ts
interface PersistenceAdapter {
  load(documentId: string): Promise<WorkbookSnapshot>;
  create(documentId: string, snapshot: WorkbookSnapshot): Promise<void>;
  apply(documentId: string, ops: Operation[]): Promise<void>;
  replace(documentId: string, snapshot: WorkbookSnapshot): Promise<void>;
  destroy(documentId: string): Promise<void>;
}
```

---

## 38. Real-Time Collaboration

### 38.1 Architecture

Recommended topology:

```text
Browser A ─┐
Browser B ─┼─ WebSocket ─ Ezygrid Server ─ Persistence Adapter ─ DB
Browser C ─┘                  │
                              ├─ Formula engine
                              ├─ version/snapshot store
                              └─ REST/agent API
```

### 38.2 Operation protocol

Each operation needs:

- document ID.
- operation ID.
- actor ID.
- base revision.
- server revision.
- worksheet ID.
- target stable identities.
- mutation type.
- payload.

### 38.3 Conflict model

For spreadsheet mutation semantics, prefer a server-sequenced operation log with deterministic transformation/rebasing rather than generic CRDT cells for every property.

Possible approach:

1. Client optimistically applies local operation.
2. Client sends operation with last-known revision.
3. Server authorizes.
4. Server rebases/validates against newer structural operations.
5. Server assigns revision.
6. Server applies once to authoritative workbook.
7. Server recalculates formulas.
8. Server persists operation.
9. Server broadcasts canonical operation/result.
10. Clients converge to server order.

Investigate OT vs identity-aware operation rebasing during prototype phase before locking protocol.

### 38.4 Presence

Broadcast ephemeral, non-history state:

- user join/leave.
- active worksheet.
- cursor.
- selected ranges.
- optional typing/editing indicator.

Presence must be rate-limited/throttled and should not be stored in document history.

### 38.5 Offline behavior

Later milestone:

- local operation queue.
- reconnect/resume from revision.
- conflict resolution for offline structural edits.

---

## 39. Ezygrid Server

Node.js/TypeScript service designed to run on customer infrastructure.

### 39.1 Responsibilities

- Load workbook.
- maintain active workbook instances/cache.
- authorize reads/writes.
- validate operations.
- assign revisions.
- apply operations.
- calculate formulas.
- broadcast changes.
- persist operations/snapshots.
- manage comments.
- manage media references.
- expose REST API.
- expose agent/MCP tools optionally.

### 39.2 Authentication hooks

Ezygrid Server should be identity-provider agnostic.

```ts
interface AuthHooks {
  beforeConnect?(ctx: AuthContext): Promise<boolean>;
  beforeLoad?(ctx: DocumentAuthContext): Promise<boolean>;
  beforeChange?(ctx: ChangeAuthContext): Promise<boolean | Operation>;
}
```

Consumers can use Auth0, Cognito, Keycloak, Clerk, custom JWT, session cookies, etc.

### 39.3 Authorization

Support document/range permissions later:

- Owner.
- editor.
- commenter.
- viewer.
- protected ranges.
- per-sheet read/write.

### 39.4 Persistence adapters

First-party adapters:

- PostgreSQL.
- MongoDB.
- Redis for cache/pub-sub, not necessarily canonical durable storage by default.
- filesystem/local dev.

Custom adapter contract must stay small.

### 39.5 Horizontal scaling

Requirements:

- Redis/NATS adapter for pub/sub between server nodes.
- sticky sessions not required if shared room/event transport is configured.
- document lock/leader or deterministic operation sequencer.
- revision consistency.
- snapshot compaction.

---

## 40. Version History and Snapshots

Provide both operation history and durable version snapshots.

Features:

- Automatic snapshot every N operations/time interval.
- manual named versions.
- restore snapshot.
- compare versions later.
- audit metadata.
- retention policy.
- export historical version.

Restore should create a new current revision rather than deleting audit history.

---

## 41. REST API

Suggested resource-oriented API:

```text
POST   /api/v1/documents
GET    /api/v1/documents/:id
DELETE /api/v1/documents/:id

GET    /api/v1/documents/:id/snapshot
POST   /api/v1/documents/:id/operations
GET    /api/v1/documents/:id/operations?afterRevision=123

GET    /api/v1/documents/:id/worksheets
POST   /api/v1/documents/:id/worksheets
PATCH  /api/v1/documents/:id/worksheets/:sheetId
DELETE /api/v1/documents/:id/worksheets/:sheetId

GET    /api/v1/documents/:id/ranges/:range
PUT    /api/v1/documents/:id/ranges/:range/values
PUT    /api/v1/documents/:id/ranges/:range/styles

GET    /api/v1/documents/:id/comments
POST   /api/v1/documents/:id/comments

GET    /api/v1/documents/:id/versions
POST   /api/v1/documents/:id/versions
POST   /api/v1/documents/:id/versions/:versionId/restore
```

Prefer JSON request bodies for Ezygrid's own API.

### 41.1 Idempotency

Mutation requests should accept idempotency/operation IDs so retries do not duplicate edits.

---

## 42. Spreadsheet-to-Form Module

Allow a developer to expose selected cells/ranges as a user-friendly form.

Features:

- Generate fields from cell editor types and validation rules.
- Map form fields to target cells/table columns.
- public share token.
- optional authentication.
- append-row mode.
- fixed-cell mode.
- validation on server.
- submission webhook.
- confirmation page.
- abuse/rate-limit protection.

Useful for surveys, intake forms, data collection and simple operational workflows.

---

## 43. AI and Agent Integration

AI should be optional and provider-neutral.

### 43.1 AI formula function

Example syntax:

```text
=AI.PROMPT("Summarize this customer feedback", A2)
```

Never expose provider secrets in browser configuration.

Server flow:

```text
formula call → Ezygrid Server → policy/rate limit → model provider → cached result → workbook
```

### 43.2 Provider interface

```ts
interface AIProvider {
  complete(request: AIRequest, context: AIExecutionContext): Promise<AIResult>;
}
```

Adapters could be implemented for OpenAI, Azure OpenAI, Anthropic, Gemini, local OpenAI-compatible endpoints, etc.

### 43.3 AI safeguards

- explicit opt-in.
- server-side API keys.
- configurable allowed ranges.
- max cells/context size.
- token/rate budget.
- audit log.
- result caching.
- cancellation.
- tenant isolation.
- no silent transmission of workbook content.

### 43.4 Agent tools / MCP

Expose typed operations such as:

- list worksheets.
- read range.
- write range.
- insert rows.
- create formulas.
- create chart.
- create table.
- filter/sort.
- describe workbook.

Agents should call the same authorized operation layer as humans, never bypass permissions.

---

## 44. Plugin and Extension System

### 44.1 Extension lifecycle

```ts
interface EzygridPlugin {
  name: string;
  version: string;
  setup(ctx: PluginContext): void | (() => void);
}
```

### 44.2 Extension points

- Commands.
- toolbar items.
- top-menu items.
- context-menu items.
- cell editors.
- cell renderers.
- formula functions.
- serializers/importers/exporters.
- validation handlers.
- conditional-format rules.
- chart providers.
- media types.
- hooks/events.
- status bar items.
- side panels.

### 44.3 Plugin isolation

Plugins should receive public contexts, not direct mutable references to internals.

---

## 45. Events

Use typed cancellable events.

Example groups:

### Workbook

- `beforeWorksheetAdd`
- `worksheetAdd`
- `beforeWorksheetRemove`
- `worksheetRemove`
- `worksheetRename`
- `activeWorksheetChange`
- `operation`
- `undo`
- `redo`

### Selection/editing

- `selectionChange`
- `beforeEdit`
- `editStart`
- `beforeCellCommit`
- `cellCommit`
- `editCancel`

### Data

- `beforeValueChange`
- `valueChange`
- `formulaChange`
- `calculationStart`
- `calculationComplete`

### Structure

- `rowsInsert`
- `rowsDelete`
- `rowsMove`
- `columnsInsert`
- `columnsDelete`
- `columnsMove`
- `mergeChange`

### View

- `scroll`
- `zoomChange`
- `filterChange`
- `sortChange`
- `pageChange`

Events should provide operation IDs so consumers can correlate persistence and UI actions.

---

## 46. Framework Integrations

### 46.1 React

```tsx
<Spreadsheet onReady={setWorkbook} tabs toolbar>
  <Worksheet name="Sales" data={data} />
</Spreadsheet>
```

Support:

- refs.
- controlled/uncontrolled modes where practical.
- SSR-safe import.
- React 19 compatibility.
- avoid rerendering the grid for every React parent render.

### 46.2 Vue

- Vue 3 composition API.
- props/events.
- component refs.

### 46.3 Angular

- standalone components.
- typed inputs/outputs.
- zone-friendly event strategy.

### 46.4 Web Component

Provide `<ezy-grid>` for framework-neutral declarative embedding.

### 46.5 jQuery adapter

Only if meaningful user demand exists. Keep it outside core.

---

## 47. Accessibility

Target WCAG 2.2 AA for the default UI.

### 47.1 ARIA grid model

The virtualized grid should expose:

- `role="grid"`.
- `role="row"`.
- `role="gridcell"`.
- `columnheader` and `rowheader` roles.
- `aria-rowcount` / `aria-colcount` for logical dimensions.
- `aria-rowindex` / `aria-colindex` for rendered items.
- `aria-selected`.
- `aria-sort`.
- accessible names/descriptions for comments/errors/validation.

### 47.2 Focus strategy

Use a predictable roving-tabindex or `aria-activedescendant` model after browser/screen-reader testing.

### 47.3 Keyboard-only operation

All core actions should be possible without mouse:

- Select.
- edit.
- copy/paste.
- fill commands.
- row/column menus.
- context menu (`Shift+F10`).
- sheet tabs.
- dialogs.

### 47.4 Accessibility test matrix

Test at least:

- Chrome + NVDA.
- Edge + Narrator.
- Safari + VoiceOver.
- macOS keyboard navigation.

---

## 48. Internationalization and Localization

### 48.1 UI localization

- Translation dictionaries.
- lazy language bundles.
- pluralization.
- RTL layout.

### 48.2 Locale-sensitive formatting

Use `Intl.NumberFormat` / `Intl.DateTimeFormat` where possible, plus spreadsheet mask parser when required.

Support:

- decimal separator.
- thousands separator.
- currency.
- date order.
- first day of week.
- 12/24-hour time.

### 48.3 Formula locale

Keep canonical stored formulas in invariant English function syntax initially. Optional localized formula input can translate at the parser boundary later.

---

## 49. Themes and Appearance

Use CSS variables:

```css
.ezygrid {
  --ezygrid-font-family: system-ui, sans-serif;
  --ezygrid-font-size: 13px;
  --ezygrid-bg: #fff;
  --ezygrid-text: #111;
  --ezygrid-gridline: #e4e4e7;
  --ezygrid-selection: #2563eb;
  --ezygrid-header-bg: #f4f4f5;
}
```

Features:

- Light theme.
- dark theme.
- high contrast theme.
- theme builder tokens.
- icon adapter.
- compact/comfortable density.
- gridline on/off.
- fullscreen mode.
- zoom.

Avoid coupling core logic to Material Icons or any specific icon font.

---

## 50. Security

Spreadsheet import and rich cell content must be treated as untrusted.

### 50.1 XSS protection

- Escape text cells.
- sanitize HTML/rich-text editor output with an allowlist sanitizer.
- prevent `javascript:` URLs.
- sanitize imported hyperlinks.
- sanitize SVG/media where applicable.
- use Trusted Types compatibility.
- support strict CSP without `unsafe-eval`.

### 50.2 Formula security

- Never use JavaScript `eval`.
- custom formulas execute through registered functions only.
- asynchronous/external functions run through controlled adapters.
- restrict network-capable functions by policy.

### 50.3 Formula injection on CSV export

Provide optional mitigation for dangerous leading characters when exporting data intended for external spreadsheet apps:

```text
= + - @
```

This should be configurable because escaping changes data semantics.

### 50.4 Collaboration server

- JWT verification hooks.
- authorization on every write.
- WebSocket origin checks.
- request/body limits.
- rate limiting.
- schema validation.
- media upload validation.
- audit logs.
- tenant isolation.

---

## 51. Performance Targets

Define benchmark hardware/browser in CI.

### 51.1 Logical sheet size

Target:

- 1,000,000+ logical rows.
- 16,384 logical columns maximum compatibility mode, or configurable larger internal limit.
- sparse allocation proportional to used cells/properties.

### 51.2 Data operations

Indicative targets after warm-up on desktop reference hardware:

- Set 10,000 plain values: < 100 ms model time.
- Read 10,000 values: < 30 ms.
- Sort 100,000 simple rows: < 500 ms target, optimize further based on profiling.
- Filter 100,000 rows: < 250 ms target.
- Paste 50,000 cells: < 500 ms model mutation plus incremental render.
- Undo large paste: similar order of magnitude.

These are engineering targets, not public promises until benchmarked.

### 51.3 Formula targets

- Incremental recalculation must scale with dependency impact, not full workbook size.
- Formula cycles detected without hanging.
- Worker mode for heavy calculation.
- formula caches invalidated deterministically.

### 51.4 Memory

Build a benchmark showing memory use for:

- empty million-row sheet.
- 100k used cells.
- 1m used cells.
- styles across large ranges.

Range styles must not instantiate every covered cell.

---

## 52. Testing Strategy

### 52.1 Unit tests

For:

- coordinate helpers.
- A1 parser.
- range transforms.
- formula parser/evaluator.
- sort/filter predicates.
- validation.
- style inheritance.
- operation inverses.
- serialization.

### 52.2 Property-based tests

Excellent candidates:

- A1 encode/decode round trips.
- insert/delete reference transformations.
- undo(operation) restores prior state.
- parse → serialize → parse AST equivalence.
- copy formula translation.

Use `fast-check` or equivalent.

### 52.3 Browser interaction tests

Use Playwright for:

- mouse selection.
- keyboard navigation.
- fill handle.
- editor lifecycle.
- context menu.
- copy/paste.
- drag row/column.
- freeze panes.
- tabs.

### 52.4 Visual regression

Test:

- default theme.
- dark theme.
- merged cells.
- headers.
- validation marks.
- filters.
- frozen panes.
- charts.

### 52.5 Formula compatibility corpus

Maintain thousands of formula cases categorized by function and edge case.

Where legally and technically possible, compare outputs against:

- Microsoft Excel.
- LibreOffice Calc.
- Google Sheets.

Record expected differences explicitly.

### 52.6 XLSX fixture corpus

Include fixtures for:

- styles.
- merged cells.
- dates.
- formulas.
- named ranges.
- tables.
- validation.
- charts.
- comments.
- hidden rows/columns.
- freeze panes.

### 52.7 Collaboration tests

Simulate multiple clients:

- simultaneous edits.
- insert vs edit conflicts.
- delete vs edit.
- moves.
- reconnect.
- undo after remote structural operation.
- duplicate operation retry.
- out-of-order packets.

---

## 53. Documentation Strategy

Documentation is part of the product.

### 53.1 Docs sections

```text
Getting Started
Core Concepts
Workbook
Worksheets
Cells and Ranges
Rows and Columns
Selection
Editing
Clipboard
Formatting
Formulas
Filtering and Sorting
Tables
Validation
Comments
Charts
Pivot Tables
Import/Export
Events
Commands
Plugins
Persistence
Collaboration
Server
React
Vue
Angular
Web Component
Accessibility
Localization
Security
Performance
Migration Guides
API Reference
```

### 53.2 Examples

Every major API must have runnable examples in:

- vanilla JS/TS.
- React where integration semantics differ.

### 53.3 Interactive playground

Provide a StackBlitz-like embedded playground or local docs playground that lets developers alter config and inspect current workbook JSON/events.

---

## 54. Native JSON Format

Define and version the native Ezygrid document format early.

```ts
interface EzygridDocument {
  format: 'ezygrid';
  version: 1;
  id?: string;
  locale?: string;
  definedNames?: DefinedName[];
  worksheets: EzygridWorksheet[];
  metadata?: Record<string, unknown>;
}
```

Simplified example:

```json
{
  "format": "ezygrid",
  "version": 1,
  "worksheets": [
    {
      "id": "sheet-1",
      "name": "Sheet1",
      "dimensions": { "rows": 100, "columns": 26 },
      "rows": {},
      "columns": {
        "0": { "id": "col-a", "width": 120 },
        "1": { "id": "col-b", "width": 90 }
      },
      "cells": {
        "A1": { "value": "Revenue" },
        "A2": { "value": 100 },
        "B2": { "formula": "=A2*1.08" }
      },
      "merges": [],
      "validations": [],
      "tables": [],
      "media": []
    }
  ]
}
```

For production snapshots, an optimized compact representation may be used internally, but there should be a readable stable interchange form.

---

## 55. Core Internal Services

Recommended internal modules:

```text
WorkbookService
WorksheetService
CellStore
RowStore
ColumnStore
RangeService
SelectionService
EditService
ClipboardService
FillService
FormulaService
DependencyGraph
ReferenceTransformService
FormatService
StyleRegistry
ValidationService
FilterService
SortService
MergeService
HistoryService
CommandService
EventBus
Renderer
ViewportService
HitTestService
PluginManager
Serializer
```

The **ReferenceTransformService**, **HistoryService**, **FormulaService**, and **ViewportService** are high-risk components and should receive architecture prototypes before large-scale implementation.

---

## 56. Development Phases

The complete product is too large for a single milestone. Build it in compatibility layers.

### Phase 0 - Architecture and Compatibility Lab

**Objective:** Lock foundational contracts before building lots of UI.

Deliverables:

- Monorepo/tooling.
- native document format v1 draft.
- coordinate/range utilities.
- stable row/column IDs.
- operation format.
- sparse storage prototype.
- variable-size viewport index prototype.
- formula parser proof of concept.
- reference transformation proof of concept.
- compatibility test harness.
- API naming conventions.
- clean-room contribution policy.

Exit criteria:

- 1M-row empty sheet model without proportional cell allocation.
- viewport can scroll to arbitrary row/column.
- basic A1 references transform correctly through structural edits.

### Phase 1 - Ezygrid Core Alpha

**Objective:** Deliver a useful editable spreadsheet/data grid.

Features:

- Single/multiple worksheets.
- sparse store.
- two-axis virtualization.
- row/column headers.
- selection.
- keyboard navigation.
- text/number editing.
- copy/paste plain values.
- insert/delete/resize rows and columns.
- hide/show rows/columns.
- basic styling.
- read-only states.
- basic context menu.
- basic toolbar.
- undo/redo.
- JSON load/save.
- core events.
- TypeScript declarations.

Exit criteria:

- Typical spreadsheet navigation feels natural.
- core interaction Playwright suite stable.
- no full-sheet DOM allocation.

### Phase 2 - Spreadsheet UX Beta

**Objective:** Reach strong everyday spreadsheet usability.

Features:

- Rich clipboard with formulas/styles.
- fill handle and series.
- merged cells.
- frozen rows/columns.
- nested headers.
- grouping.
- sorting.
- filters.
- search.
- pagination view.
- comments/notes basic.
- advanced editors.
- format/number masks.
- formula bar/name box.
- customizable toolbar/top menu.
- full command registry.
- accessibility baseline.
- i18n/RTL baseline.

Exit criteria:

- Excel/Sheets copy/paste interop passes defined fixture suite.
- keyboard-only usage works for core tasks.

### Phase 3 - Formula Engine v1

**Objective:** Support professional calculation workflows.

Features:

- Full AST parser.
- dependency graph.
- incremental recalculation.
- cross-sheet references.
- absolute/mixed references.
- names.
- custom functions.
- formula suggestions.
- 100+ high-value functions.
- calculation worker.
- circular-reference handling.
- formula reference editor UX.

Exit criteria:

- formula compatibility corpus reaches agreed pass rate.
- structural reference transformations pass property tests.

### Phase 4 - Validation, Tables and Advanced Analytics

Features:

- Data validation.
- conditional formatting.
- structured tables.
- structured references.
- advanced search/replace.
- advanced filters.
- charts v1.
- pivot tables v1.
- floating images/media.
- shapes v1.
- 250+ formula functions.

### Phase 5 - File Interoperability

Features:

- CSV import wizard/export.
- XLSX import v1.
- XLSX export v1.
- print layout.
- PDF export.
- improved chart/table/validation XLSX mapping.
- ODS investigation.

Exit criteria:

- round-trip fixture dashboard published.
- known incompatibilities documented.

### Phase 6 - Framework and Ecosystem GA

Features:

- React wrapper GA.
- Vue wrapper GA.
- Angular wrapper GA.
- Web Component GA.
- plugin authoring kit.
- theme builder.
- migration/cookbook docs.
- npm provenance/signing/SBOM.

### Phase 7 - Collaboration Server

Features:

- WebSocket synchronization.
- server revision sequencing.
- authoritative formula calculation.
- presence.
- reconnect.
- auth hooks.
- PostgreSQL adapter.
- MongoDB adapter.
- Redis scaling adapter.
- snapshots/version history.
- REST API.
- threaded comments.
- form submission backend.

Exit criteria:

- multi-client conflict suite stable.
- collaboration-aware undo verified under structural edits.

### Phase 8 - Advanced Compatibility and AI

Features:

- 500+ formula compatibility target.
- spilled/dynamic arrays expanded coverage.
- charts v2.
- pivot v2.
- protected ranges/sheets.
- advanced file interoperability.
- AI provider module.
- AI spreadsheet functions.
- agent/MCP tools.
- enterprise audit and policy controls.

---

## 57. Priority Matrix

| Capability | Priority | Complexity | Package / Phase |
|---|---:|---:|---|
| Sparse data model | P0 | Very High | Core / 0-1 |
| Virtual scrolling | P0 | Very High | Core / 0-1 |
| Selection/navigation | P0 | High | Core / 1 |
| Cell editing | P0 | Medium | Core / 1 |
| Rows/columns | P0 | High | Core / 1 |
| Undo/redo | P0 | High | Core / 1 |
| Clipboard | P0 | Very High | Core / 1-2 |
| Fill handle | P0 | High | Core / 2 |
| Freeze panes | P0 | High | Core / 2 |
| Merge cells | P0 | High | Core / 2 |
| Formatting | P0 | High | Core / 2 |
| Sort/filter | P0 | Medium-High | Core / 2 |
| Formula engine | P0 | Very High | Formula / 3 |
| Data validations | P1 | High | Core+UI / 4 |
| Structured tables | P1 | High | Core / 4 |
| Conditional formatting | P1 | High | Core / 4 |
| XLSX import/export | P1 | Very High | XLSX / 5 |
| Charts | P1 | High | Charts / 4-5 |
| Pivot tables | P1 | Very High | Pivot / 4-5 |
| PDF/print | P1 | High | Print / 5 |
| Framework wrappers | P1 | Medium | 6 |
| Collaboration | P1 | Very High | Server / 7 |
| Comments | P1 | Medium | Comments/Server / 7 |
| Version history | P1 | High | Server / 7 |
| Forms | P2 | Medium | Forms/Server / 7 |
| Shapes | P2 | High | Shapes / 4-5 |
| AI formulas/agent API | P2 | High | AI/Server / 8 |
| 500+ formulas | P2 | Very High | Formula / 8 |

---

## 58. Definition of MVP

Do not call the first editable grid “Excel-like parity.”

A credible Ezygrid MVP should include:

- Multiple worksheets.
- 100k+ logical rows with smooth virtualization.
- Text/number/date/dropdown/checkbox editors.
- Row/column insert/delete/resize/hide.
- Single and range selection.
- keyboard navigation.
- copy/cut/paste with formula-aware internal format.
- fill handle.
- basic formulas with dependency recalculation.
- sort/filter.
- freeze panes.
- merge cells.
- styles/number formats.
- undo/redo.
- JSON persistence.
- extensible command/plugin API.
- React/Vue wrappers can follow closely after core API stability.

XLSX, pivot, charts and collaboration should not block the first MVP unless a customer specifically requires them.

---

## 59. Definition of Full Feature Target

A “full features clone similar to Jspreadsheet” for Ezygrid should mean behavioral coverage across these categories, not API/source duplication:

- Excel-like grid UX.
- sparse high-performance worksheet engine.
- cells/ranges/rows/columns.
- multi-sheet workbooks.
- clipboard + paste special.
- fill handle.
- rich editors.
- styling + number formats.
- formulas and broad function library.
- names/cross-sheet calculations/dynamic arrays.
- sorting/filtering/search/pagination.
- groups/freeze/merged/nested headers/footers.
- validations/conditional formatting.
- structured tables.
- comments and notes.
- images/media/shapes.
- charts.
- pivot tables.
- CSV/XLSX/PDF workflows.
- framework integrations.
- plugin/command/event ecosystem.
- accessibility/i18n/theming.
- persistence.
- real-time collaboration.
- server REST API.
- version history.
- forms.
- AI/agent integration.

---

## 60. API Design Guidelines

- Prefer `getX` / `setX` pairs with narrow responsibilities.
- Avoid one overloaded `setProperty()` method for unrelated resources.
- Accept batch arrays for large changes.
- Return typed handles/records, not DOM nodes.
- Expose address-based and coordinate-based overloads only when both are genuinely useful.
- Do not use hidden global state.
- Workbook should own cross-sheet state/history.
- Worksheet methods should delegate mutations through command/operation system.
- All extension APIs require semantic versioning.
- Every event and public method needs TypeScript docs.

### 60.1 Example batch API

```ts
worksheet.setCellProperties([
  { address: 'A1', properties: { readOnly: true } },
  { range: 'B2:B100', properties: { numberFormat: '#,##0.00' } },
]);
```

### 60.2 Range API

```ts
const range = worksheet.getRange('B2:D100');
range.setValues(values);
range.setStyle({ fontWeight: 'bold' });
range.clear({ values: true, styles: false });
range.merge();
```

---

## 61. Reference Transformation Engine

This subsystem is critical enough to merit its own spec.

It must transform:

- formula A1 references.
- ranges.
- full-row/full-column ranges.
- names.
- validation ranges.
- conditional formats.
- filters.
- tables.
- chart series.
- pivot sources.
- print areas.

Operations:

- insert row/column.
- delete row/column.
- move row/column.
- move range.
- copy range.
- rename sheet.
- delete sheet.

Design around parsed reference tokens, never regex string replacement.

---

## 62. State vs View Separation

Persisted document state:

- values/formulas.
- row/column properties.
- merges.
- styles.
- tables.
- validation.
- comments.
- media.
- sheet order/name.

User-local view state by default:

- active cell.
- selection.
- scroll position.
- zoom.
- temporary search term.
- currently open context menu.
- transient editor state.
- collaborator cursors.

Some view state can optionally be persisted per user, but must not be mixed with shared workbook history.

---

## 63. Database Strategy for Ezygrid Server

Recommended PostgreSQL schema shape:

```text
documents
- id
- tenant_id
- current_revision
- created_at
- updated_at

snapshots
- id
- document_id
- revision
- payload/blob_url
- created_by
- created_at

operations
- document_id
- revision
- operation_id
- actor_id
- worksheet_id
- type
- payload_json
- created_at

comments
- id
- document_id
- worksheet_id
- target_json
- resolved
- created_at
- updated_at

comment_messages
- id
- thread_id
- author_id
- body
- created_at
- edited_at
```

Snapshot compaction avoids replaying millions of operations on every cold load.

---

## 64. Observability

Core optional diagnostics:

- render duration.
- calculation duration.
- number of rendered cells.
- operation duration.
- worker queue depth.

Server metrics:

- active documents.
- WebSocket clients.
- operation latency.
- broadcast latency.
- auth failures.
- persistence latency/errors.
- snapshot latency.
- formula calculation latency.

Support OpenTelemetry in the server package.

---

## 65. Browser Support

Initial target:

- Current and previous two major Chrome versions.
- Current and previous two major Edge versions.
- Current and previous two major Firefox versions.
- Current and previous two major Safari versions.
- Modern iOS/iPadOS Safari.
- Modern Android Chrome.

Avoid IE compatibility.

Use capability detection for Clipboard API, ResizeObserver, IntersectionObserver and worker features.

---

## 66. Bundle and Distribution Targets

Publish:

```text
@ezygrid/core
@ezygrid/formula
@ezygrid/csv
@ezygrid/xlsx
@ezygrid/charts
@ezygrid/pivot
@ezygrid/print
@ezygrid/react
@ezygrid/vue
@ezygrid/angular
@ezygrid/server
...
```

Package requirements:

- ESM.
- types.
- source maps.
- `exports` map.
- side-effect declaration.
- browser/node condition exports when needed.
- CDN-friendly IIFE bundle for core/playground.
- no mandatory peer dependency on an icon set.

Set bundle-size CI budgets after Phase 1 profiling. A realistic goal is to keep the core substantially smaller than the combination of optional formula/XLSX/chart packages.

---

## 67. Developer Tooling

- TypeScript strict mode.
- ESLint.
- Prettier.
- Vitest.
- Playwright.
- `fast-check` for property tests.
- changesets for package releases.
- API Extractor or TypeDoc.
- size-limit/bundlewatch.
- benchmark suite in CI nightly.
- Storybook optional for editors/dialogs, but not required for the core grid.

---

## 68. CI/CD

On pull request:

1. Lint.
2. typecheck.
3. unit tests.
4. formula subset tests.
5. browser interaction tests.
6. build all packages.
7. bundle-size check.
8. public API diff check.

Nightly:

- full browser matrix.
- large performance benchmarks.
- full formula corpus.
- XLSX corpus.
- collaboration fuzz tests.
- accessibility automation.

Release:

- changelog.
- signed/provenance npm publish.
- docs deploy.
- compatibility dashboard update.

---

## 69. Engineering Risks

### Risk 1 - Formula compatibility explosion

**Problem:** Excel has hundreds of functions and subtle coercion/date/error semantics.

**Mitigation:** Build a dedicated compatibility matrix and prioritize common functions before long-tail parity.

### Risk 2 - Structural edits corrupt formulas

**Problem:** Insert/delete/move can break references, names, charts and validations.

**Mitigation:** Centralized AST/reference transformation engine + property-based tests.

### Risk 3 - Clipboard inconsistencies across browsers

**Problem:** Clipboard APIs and Excel/Sheets HTML payloads vary.

**Mitigation:** Maintain browser/app fixtures and support TSV + HTML + private internal payload.

### Risk 4 - Virtualization + merged/frozen cells complexity

**Mitigation:** Prototype renderer before feature expansion and test all combinations early.

### Risk 5 - Collaboration added too late

**Problem:** index-only data model makes collaborative structural edits unreliable.

**Mitigation:** stable row/column IDs and operation model from Phase 0.

### Risk 6 - XLSX scope becomes endless

**Mitigation:** publish explicit import/export compatibility levels and test semantic round trips.

### Risk 7 - Rich HTML causes security issues

**Mitigation:** sanitization layer, Trusted Types, CSP tests and safe default renderers.

### Risk 8 - Framework wrappers become separate products

**Mitigation:** wrappers stay thin; core owns state and rendering.

---

## 70. Suggested Team Structure

For serious full-feature development, parallel ownership is recommended:

- **Core Model Engineer(s)** - sparse store, operations, rows/columns/ranges.
- **Grid/Rendering Engineer(s)** - viewport, selection, editing, accessibility.
- **Formula Engineer(s)** - parser, dependency graph, functions, compatibility.
- **File Interop Engineer(s)** - XLSX/CSV/PDF.
- **Collaboration/Backend Engineer(s)** - WebSocket, persistence, auth, versions.
- **Extensions Engineer(s)** - charts, pivot, shapes, validations UI.
- **Framework/Developer Experience Engineer** - React/Vue/Angular, docs, examples.
- **QA/Compatibility Engineer** - Excel/browser fixture corpus and automation.

A small team can still build Ezygrid, but the phases should remain sequential rather than attempting all modules at once.

---

## 71. First 12 Implementation Epics

These epics are the recommended engineering backlog order.

### Epic 1 - Coordinates, Ranges and IDs

- A1 conversion.
- range parsing.
- sheet-qualified references.
- stable row/column IDs.
- range iterators.

### Epic 2 - Sparse Worksheet Store

- cell pages/chunks.
- row/column property stores.
- used range.
- serialization.

### Epic 3 - Viewport Engine

- size indexes.
- vertical/horizontal virtualization.
- scrolling.
- headers.
- DOM recycling.

### Epic 4 - Selection and Keyboard

- active cell/range model.
- hit test.
- navigation.
- selection overlay.

### Epic 5 - Editing

- editor overlay.
- text/numeric/date editors.
- commit/cancel events.
- IME.

### Epic 6 - Operations and History

- command bus.
- inverse operations.
- transactions.
- undo/redo.

### Epic 7 - Rows and Columns

- insert/delete/move/resize/hide.
- structural identity mapping.
- reference-transform prototype.

### Epic 8 - Clipboard and Fill

- TSV/HTML/private clipboard.
- paste special architecture.
- formula translation hooks.
- fill-series engine.

### Epic 9 - Styles and Formatting

- style registry.
- range inheritance.
- number/date format engine.
- toolbar commands.

### Epic 10 - Formula Engine

- lexer/parser/AST.
- dependency graph.
- recalculation.
- initial function set.

### Epic 11 - Grid Features

- sort/filter.
- freeze.
- merges.
- groups.
- nested headers.
- validation.

### Epic 12 - Plugin API and Public SDK

- commands.
- events.
- custom editor/renderer.
- extension lifecycle.
- React/Vue integration pilot.

---

## 72. Acceptance Criteria for Core GA

Ezygrid Core 1.0 should not ship until all of the following are true:

- No critical data corruption bug in structural edit test suite.
- Undo/redo round-trip tests pass for all core operations.
- Copy/paste formulas preserve relative/absolute references.
- Virtualized grid supports defined large-sheet benchmark without proportional DOM growth.
- Keyboard interaction passes documented matrix.
- Screen-reader semantics pass baseline accessibility review.
- CSP build works without unsafe `eval`.
- JSON serialization is versioned and migration-tested.
- API reference generated from TypeScript.
- Plugin API can implement at least one third-party custom editor, renderer and command without internal imports.
- Core bundle has no React/Vue/Angular dependencies.

---

## 73. Acceptance Criteria for Formula GA

- Deterministic AST parser.
- No `eval`.
- cross-sheet references.
- mixed/absolute references.
- insert/delete/move reference transformation.
- dependency-based recalculation.
- circular dependency handling.
- custom function registration.
- named ranges.
- dynamic arrays for the documented subset.
- compatibility dashboard with per-function tests.

---

## 74. Acceptance Criteria for Collaboration GA

- Server-sequenced revisions.
- operation idempotency.
- reconnect from revision.
- authorization before changes.
- deterministic structural conflict handling.
- presence separated from document state.
- collaboration-aware undo scenarios pass.
- durable snapshot + operation replay.
- at least PostgreSQL persistence adapter.
- horizontal scale strategy documented/tested.
- REST writes and WebSocket writes converge through the same operation layer.

---

## 75. Recommended Naming Conventions

User-facing names:

- **Ezygrid** - product/library.
- **Ezygrid Core** - browser grid.
- **Ezygrid Formula** - calculation engine.
- **Ezygrid Server** - collaboration backend.
- **Ezygrid Studio** - optional visual demo/builder in future.

Code:

```ts
createGrid()
Workbook
Worksheet
Range
Cell
Operation
Command
Extension
```

Avoid mimicking Jspreadsheet's global names, proprietary extension names or internal object naming.

---

## 76. Example End-State Configuration

```ts
import { createGrid } from '@ezygrid/core';
import { formulaExtension } from '@ezygrid/formula';
import { chartExtension } from '@ezygrid/charts';
import { validationExtension } from '@ezygrid/validations';
import { collabExtension } from '@ezygrid/collab-client';

const workbook = createGrid(document.getElementById('app')!, {
  locale: 'en-MY',
  theme: 'system',
  tabs: true,
  toolbar: true,
  topMenu: true,
  formulaBar: true,
  statusBar: true,
  extensions: [
    formulaExtension(),
    chartExtension(),
    validationExtension(),
    collabExtension({
      url: 'wss://example.com/ezygrid',
      documentId: 'budget-2027',
      getToken: () => auth.getToken(),
    }),
  ],
  worksheets: [
    {
      id: 'sheet-budget',
      name: 'Budget',
      minDimensions: { rows: 1000, columns: 50 },
      freeze: { rows: 1, columns: 1 },
      columns: [
        { title: 'Department', width: 180, editor: 'dropdown' },
        { title: 'Budget', width: 110, editor: 'currency' },
        { title: 'Actual', width: 110, editor: 'currency' },
        { title: 'Variance', width: 110, numberFormat: '#,##0.00;[Red]-#,##0.00' },
      ],
      data: [
        ['Engineering', 100000, 92000, '=C1-B1'],
      ],
    },
  ],
});
```

---

## 77. Source Research Notes

This plan was informed by public product and documentation pages, primarily to identify the expected feature surface of a modern Jspreadsheet-style web spreadsheet. Ezygrid's implementation should remain independent.

Key public references reviewed:

1. Jspreadsheet homepage and current capability overview  
   https://jspreadsheet.com/

2. Current Jspreadsheet documentation index  
   https://jspreadsheet.com/docs/

3. Jspreadsheet v13 changelog, including sparse storage, collaboration-aware history and properties API  
   https://jspreadsheet.com/docs/changelog

4. Jspreadsheet accessibility documentation  
   https://jspreadsheet.com/docs/accessibility

5. Jspreadsheet clipboard documentation  
   https://jspreadsheet.com/docs/clipboard

6. Jspreadsheet filters documentation  
   https://jspreadsheet.com/docs/filters

7. Jspreadsheet validations documentation  
   https://jspreadsheet.com/docs/validations

8. Jspreadsheet worksheet tables documentation  
   https://jspreadsheet.com/docs/tables

9. Jspreadsheet formulas and formula-chain documentation  
   https://jspreadsheet.com/docs/formulas  
   https://jspreadsheet.com/docs/formulas/chain

10. Jspreadsheet editor documentation  
    https://jspreadsheet.com/docs/editors

11. Jspreadsheet charts extension  
    https://jspreadsheet.com/products/charts

12. Jspreadsheet pivot extension  
    https://jspreadsheet.com/products/pivot

13. Jspreadsheet shapes extension  
    https://jspreadsheet.com/products/shapes

14. Jspreadsheet XLSX import/export extensions  
    https://jspreadsheet.com/products/import-from-xlsx  
    https://jspreadsheet.com/products/export-to-xlsx

15. Jspreadsheet PDF export  
    https://jspreadsheet.com/products/export-to-pdf

16. Jspreadsheet Server getting started, persistence, security and protocol documentation  
    https://jspreadsheet.com/docs/server/getting-started  
    https://jspreadsheet.com/docs/server/persistence  
    https://jspreadsheet.com/docs/server/security  
    https://jspreadsheet.com/docs/server/protocol

17. Jspreadsheet AI/OpenAI integration  
    https://jspreadsheet.com/products/openai

18. Jspreadsheet CE GitHub repository and MIT licensing statement  
    https://github.com/jspreadsheet/ce

---

## 78. Recommended Immediate Next Step

Start **Phase 0** with four prototypes before committing to the final public API:

1. Sparse paged worksheet store with one million logical rows.
2. DOM viewport with variable row/column sizes and frozen panes.
3. Formula parser + dependency graph for 20 core functions.
4. Identity-aware operation/reference transform engine for insert/delete/move + undo.

Only after these four prototypes pass benchmark and correctness tests should Ezygrid Core API 0.1 be frozen. These are the architectural decisions that are most expensive to change later.

---

## 79. Final Product Vision

Ezygrid should eventually support two equally important modes:

### Embedded data grid

A developer can add Ezygrid to a form, admin panel or application with only the features needed and a small bundle footprint.

### Full spreadsheet surface

A developer can enable tabs, formula bar, toolbar/top menu, formulas, charts, pivots, file import/export and real-time collaboration to create a complete browser spreadsheet experience.

The same workbook model, command system and operation protocol should power both. That architectural consistency is the key to keeping Ezygrid maintainable as it grows from a small grid library into a full spreadsheet platform.
