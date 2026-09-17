# Events

Ezygrid uses a serializable-operation event model. All model mutations flow through one channel.

## Operation stream

```ts
const unsubscribe = workbook.onOperation((op) => {
  console.log(op.type, op.payload);
});
// later
unsubscribe();
```

```ts
interface Operation<T = unknown> {
  id: string;          // stable, collaboration-ready
  actorId?: string;
  workbookId: string;
  worksheetId?: string;
  type: OperationType;
  payload: T;
  timestamp: number;
}
```

## Operation types

| Type | Emitted by |
| --- | --- |
| `cell.set` | `setValue`, editor commits, paste, fill |
| `cells.set` / `cells.replace` | bulk writes, sorting permutations |
| `meta.set` | styles, number formats, notes, cell editors, hidden rows/columns, sizes |
| `merges.set` | merge/unmerge (payload carries `added`/`removed` rects) |
| `rows.insert` / `rows.delete` / `rows.move` | structural row edits |
| `columns.insert` / `columns.delete` / `columns.move` | structural column edits |
| `worksheet.add` / `worksheet.remove` / `worksheet.rename` | sheet management |
| `validation.reject` | a `reject`-action validation blocked a write |
| `workbook.update` | aggregated `beginUpdate()`/`endUpdate()` batch |
| `undo` / `redo` | history replay markers |

## Selection changes

```ts
const off = renderer.selection.onChange((state) => {
  console.log(renderer.selection.describe()); // "A1" or "A1:C4"
});
```

## Edit lifecycle

```ts
import { EditService } from '@ezygrid/core';

const editing = new EditService({
  onEditStart(session) { /* session: { row, column, initial, mode } */ },
  onEditCancel() {},
  onCommit(session, value) {},
});
editing.editing; // boolean
```

The renderer drives its own `EditService`; hooks like `onReady` (React) give you access via `renderer.editing`.

## Extending the channel

Plugins can emit operations through workbook APIs and observe everything with a single listener — this makes operation streams the natural bridge for persistence, syncing, and analytics.
