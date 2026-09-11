# Plugin authoring guide (§44)

Plugins are the extension surface for Ezygrid. They receive **public contexts only** — the workbook, active worksheet, command registry and renderer handle.

```ts
import { definePlugin } from '@ezygrid/core';

export const ratingPlugin = definePlugin({
  name: 'rating',
  version: '1.0.0',
  setup(ctx) {
    // 1. Register a command (toolbar + keyboard consumers share the registry)
    ctx.commands?.register({
      id: 'rating.increment',
      title: 'Increment rating',
      shortcut: 'Mod+R',
      execute(commandCtx) {
        const { row, column } = commandCtx.selection.state.active;
        const current = Number(commandCtx.worksheet.getValue(row, column)) || 0;
        commandCtx.worksheet.setValue(row, column, Math.min(5, current + 1));
      },
    });

    // 2. Assign editors to ranges
    ctx.worksheet.setCellEditor('B2:B10', 'dropdown', { values: [1, 2, 3, 4, 5] });

    // 3. Return a disposer for cleanup
    return () => console.log('rating plugin disposed');
  },
});
```

## Registering

Pass plugins through the `extensions` option — they run once a renderer exists:

```ts
createGrid(el, { worksheets: [...], extensions: [ratingPlugin] });
```

## Extension points

| Point | How |
|---|---|
| Commands | `ctx.commands.register({ id, title, shortcut?, execute(ctx) })` |
| Cell editors | `ctx.worksheet.setCellEditor(range, type, options)` |
| Formulas | `formulaRegistry.register({ name, evaluate, category })` (`@ezygrid/formula`) |
| Custom formulas | async supported via the registry; never use `eval` |
| Validation | `ctx.worksheet.addValidation({ range, type, action, ... })` |
| Conditional formats | `ctx.worksheet.conditionalFormats.add({ range, type, style, priority })` |
| Charts/media | `ctx.worksheet.addChart(...)` / `addImage(...)` / `addShape(...)` |

## Rules

- Plugins must not reach into internals; use the context they receive.
- Return a disposer from `setup()` to clean listeners.
- All public APIs are semver-guarded; breaking changes ship with migration notes.
