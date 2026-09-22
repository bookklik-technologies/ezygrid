---
name: ezygrid-formula-development
description: "Create, debug or extend Ezygrid formulas, custom functions, dynamic arrays and calculation flows. Use for the formula engine, not general workbook layout or cell styling."
---

# Ezygrid Formula Development

## Inputs and approach

Identify the intended calculation, source cells or names, missing/error behavior and whether a built-in function is sufficient. Prefer worksheet formulas before registering a custom global function.

Read [formulas](../../../docs/guide/formulas.md), [formula API](../../../docs/api/formula.md), [function registry](../../../packages/formula/src/registry.ts), [function evaluation](../../../packages/formula/src/functions.ts) and [dependency graph](../../../packages/formula/src/dependency-graph.ts).

## Workflow and contracts

- Write formulas as strings beginning with `=`. Use supported A1, cross-sheet, defined-name and structured-table references.
- Preserve relative and absolute reference semantics. Structural changes and fill use token-aware translation; do not transform raw formula text with regular expressions.
- Dynamic-array functions return matrices and spill only into empty, unmerged, in-bounds destinations. Treat `#SPILL!`, `#CIRCULAR!` and other formula errors as values to surface, not exceptions to discard.
- Register custom functions through the global `formulaRegistry`. Names are case-insensitive and a custom registration can override a built-in; call `unregister` when temporary ownership ends.
- Validate arguments and return supported runtime values: primitives, null, `FormulaError` or matrix values. Mark time/random functions `volatile` when applicable.
- `evaluateStandalone` has no workbook context beyond the values map. The worker protocol must use serializable expressions, values and results.
- Refresh the graph only when a full rebuild is required; normal worksheet writes invalidate and recalculate dependencies incrementally.

## Example

```ts
import { formulaRegistry } from '@ezygrid/formula';

formulaRegistry.register({
  name: 'CELSIUS',
  category: 'engineering',
  description: 'Convert Fahrenheit to Celsius',
  signature: 'CELSIUS(fahrenheit)',
  evaluate(args) {
    const fahrenheit = Number(args[0]);
    return Number.isFinite(fahrenheit) ? (fahrenheit - 32) * 5 / 9 : null;
  },
});

sheet.setValue(0, 0, 68);
sheet.setValue(0, 1, '=CELSIUS(A1)');
```

## Deliverables and verification

Deliver formulas or registry definitions with registration/cleanup instructions. Review blank and error inputs, relative/absolute references, cross-sheet names, spill blocking, circular references, recalculation and serialization. Ask before running unit tests; do not run `pnpm test` or individual Vitest files without permission.
