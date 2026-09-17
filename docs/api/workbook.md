# Workbook

`Workbook` owns sheets, the formula graph, history, defined names and plugins.

```ts
import { Workbook, createGrid } from '@ezygrid/core';
```

## Constants

- `MAX_WORKSHEET_ROWS = 1_048_576`
- `MAX_WORKSHEET_COLUMNS = 16_384`
- `DEFAULT_ROW_HEIGHT = 24`, `DEFAULT_COLUMN_WIDTH = 100`

## Members

| Member | Description |
| --- | --- |
| `id: string` | Stable workbook id |
| `worksheets: Worksheet[]` | All sheets |
| `formulaGraph: DependencyGraph` | Formula dependency graph |
| `history: HistoryService` | Undo/redo service |
| `definedNames: Map<string, DefinedNameDefinition>` | Named ranges/values |
| `pluginManager: PluginManager` | Plugin lifecycle |
| `activeWorksheet: Worksheet` | Currently `worksheets[0]` |

## Methods

```ts
getWorksheet(idOrName: string): Worksheet | undefined;
uniqueSheetName(desired: string, exclude?: string): string;

addWorksheet(config?: WorksheetConfig): Worksheet;
removeWorksheet(id: string): void;      // cannot remove the last sheet

onOperation(listener: (op: Operation) => void): () => void;

beginUpdate(): void;   // batch mutations into one undo entry + workbook.update op
endUpdate(): void;

emitOperation(op: Operation, inverse?: Operation): void;

setDefinedName(name: string, definition: DefinedNameDefinition): void;
removeDefinedName(name: string): void;

undo(): void;  redo(): void;
get canUndo(): boolean;  get canRedo(): boolean;

refreshFormulaGraph(): void;

transformFormulasForStructuralChange(sheetName: string, shift: unknown): void;
transformHistory(sheetId: string, kind: 'row' | 'column', at: number, delta: number): void;

toJSON(): EzygridWorkbookSnapshot;
static fromJSON(data: unknown): Workbook;
```

```ts
type DefinedNameDefinition =
  | { type: 'range'; ref: string }
  | { type: 'value'; value: unknown };
```

## History semantics

- Every reversible mutation records forward + inverse operations.
- `beginUpdate()`/`endUpdate()` collapses a group into one entry.
- Replay never re-records; history is transformed on row/column shifts.
- `fromJSON` starts with a clean history.
