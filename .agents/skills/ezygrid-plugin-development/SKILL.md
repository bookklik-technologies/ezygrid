---
name: ezygrid-plugin-development
description: "Create or update Ezygrid plugins using public workbook, worksheet, command and renderer contexts with correct attachment cleanup. Use for Ezygrid runtime extensions, not Codex plugin packaging."
---

# Ezygrid Plugin Development

## Inputs and approach

Determine the capability, stable plugin name and version, whether it needs a renderer, and every owned listener or registration. Use `definePlugin` and public context surfaces; do not reach into renderer or workbook internals.

Read [plugins](../../../docs/guide/plugins.md), [plugin implementation](../../../packages/core/src/plugins.ts), [commands](../../../packages/core/src/commands.ts), [workbooks](../../../packages/core/src/workbook.ts) and [renderer API](../../../docs/api/renderer.md).

## Workflow and contracts

- Export `{ name, version, setup(ctx) }`, preferably through `definePlugin`. Pass plugins in the workbook `extensions` option.
- Plugins run when a renderer attaches. The same plugin can set up more than once over a workbook's lifetime if renderers are replaced; keep setup attachment-local.
- `ctx.commands` and `ctx.renderer` are optional because headless contexts may not provide them. Guard renderer-dependent behavior.
- Return a disposer that releases listeners and other resources created by that setup call. Setup failure disposes earlier plugins for that attachment; disposal runs in reverse order and ignores disposer errors.
- Commands need stable, namespaced ids and must use the provided `CommandContext`. Keep `isEnabled` side-effect free.
- Formula registration uses the separate global formula registry and is not automatically owned by the plugin manager. If a plugin registers a function, unregister it in the disposer.
- Persist only JSON-compatible workbook state. A plugin may need to reattach callback rules after a workbook is reopened.

## Example

```ts
import { definePlugin } from '@ezygrid/core';

export const ratingPlugin = definePlugin({
  name: 'rating',
  version: '1.0.0',
  setup(ctx) {
    ctx.worksheet.setCellEditor('B2:B10', 'dropdown', { values: [1, 2, 3, 4, 5] });
    if (!ctx.commands) return;
    ctx.commands.register({
      id: 'rating.increment', title: 'Increment rating',
      execute(commandCtx) {
        const { row, column } = commandCtx.selection.state.active;
        const value = Number(commandCtx.worksheet.getValue(row, column)) || 0;
        commandCtx.worksheet.setValue(row, column, Math.min(5, value + 1));
      },
    });
  },
});
```

## Deliverables and verification

Deliver the plugin and host registration with lifecycle/ownership notes. Review headless use, renderer replacement, duplicate command ids, setup failure, repeated attach/dispose, workbook destruction and persistence of contributed state. Ask before running unit tests; do not run `pnpm test` or individual Vitest files without permission.
