# GridRenderer

`GridRenderer` draws a workbook into a container and owns selection, editing, commands and view options.

```ts
import { GridRenderer } from '@ezygrid/core';

const renderer = new GridRenderer(container, workbook, {
  formulaBar: true,
  toolbar: true,
});
```

## Options

```ts
interface GridRendererOptions {
  mode?: 'editor' | 'grid';   // default editor
  topbar?: boolean;          // default true in editor mode
  sheetTabs?: boolean;       // default true in editor mode
  statusBar?: boolean;       // default true in editor mode
  overscanRows?: number;      // default 5
  overscanColumns?: number;   // default 2
  headerHeight?: number;      // default 24
  headerWidth?: number;       // default 48
  formulaBar?: boolean;       // default true (name box + formula input)
  toolbar?: boolean;          // editor: ribbon, default true; grid: basic toolbar, default false
  contextMenu?: boolean;      // default true
  direction?: 'ltr' | 'rtl';
}
```

## Members

```ts
readonly selection: SelectionService;
readonly editing: EditService;
readonly commands: CommandRegistry;

render(): void;    // full pass
refresh(): void;   // repaint without clearing caches
destroy(): void;
```

## Navigation and view

```ts
scrollTo(row: number, column: number): void;
navigateToAddress(address: string): void;   // name-box style navigation
setFormulaBarVisible(visible: boolean): void;
commitEdits(): void;
focus(): void;
insertFormula(formula: string): void;
setZoom(zoom: number): void;
getZoom(): number;

enablePagination(pageSize: number): void;
disablePagination(): void;
setPage(page: number): void;
getPage(): number;
getPageCount(): number;
```

## Introspection

```ts
renderedCellCount: number;               // cells currently in the DOM
getCellElement(row, column): HTMLElement | undefined;
getEditorInput(): HTMLInputElement | null;
```

## Built-in commands

| Id | Shortcut | Action |
| --- | --- | --- |
| `edit.undo` / `edit.redo` | Mod+Z / Mod+Y | History |
| `clipboard.copy` / `.cut` / `.paste` | Mod+C/X/V | Clipboard |
| `cells.fillDown` | Mod+D | Fill down |
| `format.bold` / `.italic` / `.underline` | Mod+B/I/U | Styles |
| `format.clear` | — | Clear formatting |
| `format.align.left` / `.center` / `.right` | — | Alignment |

Register your own via the [command registry](/guide/plugins) or `renderer.commands`.

## Rendering pipeline

- Two-axis virtualization with a DOM cell pool and spacer scroller
- Frozen rows/columns in dedicated overlay layers
- Merges render from the anchor; covered cells are recycled
- Nested header levels render as spanning header rows
- Charts, images and shapes render on a floating media layer
- ARIA grid semantics are emitted during rendering
