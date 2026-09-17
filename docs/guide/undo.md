# Undo & redo

Every reversible operation records its forward and inverse operations in `HistoryService` (default limit 500 entries). Undo/redo is built in:

```ts
const workbook = editor.workbook;

workbook.undo();
workbook.redo();
workbook.canUndo;
workbook.canRedo;
```

## How it works

- **One logical action = one undo entry.** Composite mutations are batched.
- **`beginUpdate()` / `endUpdate()`** on the workbook collapse a group of mutations into a single aggregated `workbook.update` operation and one history entry.
- **Replay never re-records.** Undo/redo apply the stored inverse/forward operations directly.
- **History is transformed.** When rows/columns are inserted or deleted, stored entries are shifted so a later undo doesn't clobber the wrong coordinates. Exclusion markers keep structural ops from double-transforming themselves.
- **Formula-aware.** Undoing a paste or fill restores translated formulas; structural undo replays reference translation.

## Observing history

Undo and redo emit marker operations through the [operation event stream](/guide/events), so UI can update:

```ts
workbook.onOperation((op) => {
  if (op.type === 'undo') console.log('undid', op);
  if (op.type === 'redo') console.log('redid', op);
});
```

## What is undoable

Cell edits, style/format/note/editor changes, merges, structural inserts/deletes/moves, sorting, clipboard paste, fill, conditional formats and validations, chart/pivot/media changes — anything emitted as a reversible operation.

## Serialization note

`Workbook.fromJSON` starts with a clean history — snapshots do not carry undo state.
