# Ezygrid

The top-level entry: `new Ezygrid(options)` wires a workbook model to a rendered grid inside a host element.

## Constructor

```ts
import { Ezygrid } from '@ezygrid/core';

interface EzygridOptions extends WorkbookOptions {
  target: string | HTMLElement;   // selector or element; host must have CSS height
  renderer?: GridRendererOptions;
}

const editor = new Ezygrid({
  target: '#editor',
  worksheets: [{ name: 'Sheet1', rows: 500 }],
  renderer: { toolbar: true },
});
```

## Members

| Member | Type | Description |
| --- | --- | --- |
| `target` | `HTMLElement` (readonly) | Host element |
| `workbook` | `Workbook` (readonly) | The model — see [Workbook](/api/workbook) |
| `renderer` | `GridRenderer` (readonly) | The UI — see [GridRenderer](/api/renderer) |
| `destroy()` | `void` | Remove the grid UI and dispose plugins. Idempotent. |

## Static members

```ts
Ezygrid.getInstance(target: string | HTMLElement): Ezygrid | undefined;

Ezygrid.initAll(
  root?: Document | Element | DocumentFragment,
): Ezygrid[];
```

- `getInstance` returns `undefined` for a host without an instance.
- `initAll` scans for `[data-ezg-editor]` markers (and reuses existing instances, preserving edits). Returns instances in DOM order; pass a narrower root to scope the scan. There is no DOM observer — rescan explicitly after adding hosts dynamically.
- Constructing twice on the same host throws; destroy or reuse first.

## Declarative entry

```ts
import '@ezygrid/core/auto';
```

Scans once at `DOMContentLoaded` (or immediately if ready). Safe for SSR.

## Lower-level alternative

```ts
import { createGrid } from '@ezygrid/core';

function createGrid(
  element?: HTMLElement,
  options?: CreateGridOptions,
): Workbook;
```

`createGrid` builds a workbook without UI; pass an element plus renderer options (via `Ezygrid`) to get a full editor.
