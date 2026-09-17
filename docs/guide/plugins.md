# Plugins

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
| --- | --- |
| Commands | `ctx.commands.register({ id, title, shortcut?, execute(ctx) })` |
| Cell editors | `ctx.worksheet.setCellEditor(range, type, options)` |
| Formulas | `formulaRegistry.register({ name, evaluate, category })` (`@ezygrid/formula`) |
| Validation | `ctx.worksheet.addValidation({ range, type, action, ... })` |
| Conditional formats | `ctx.worksheet.conditionalFormats.add({ range, type, style, priority })` |
| Charts/media | `ctx.worksheet.addChart(...)` / `addImage(...)` / `addShape(...)` |
| Events | `ctx.workbook.onOperation(...)` |

## Command registry

Commands are identified by `id`, carry titles and optional `"Mod+X"` shortcuts, and can declare `isEnabled(ctx)`:

```ts
ctx.commands.register({
  id: 'mylib.normalize',
  title: 'Normalize selected cells',
  shortcut: 'Mod+Shift+N',
  isEnabled: (commandCtx) => commandCtx.selection.state.ranges.length > 0,
  execute(commandCtx) { /* ... */ },
});

ctx.commands.all();                 // registered commands
ctx.commands.get('mylib.normalize');
ctx.commands.execute('mylib.normalize', commandCtx);
```

## Lifecycle

- `PluginManager.run(context)` invokes every plugin's `setup` and collects disposers.
- `attach(context)` runs plugins per renderer attachment; disposers are tracked per attach.
- `destroy()` disposes everything.
- Returning a disposer from `setup()` guarantees cleanup of listeners.

## Rules

- Plugins must not reach into internals; use the context they receive.
- Return a disposer from `setup()` to clean listeners.
- All public APIs are semver-guarded; breaking changes ship with migration notes.
