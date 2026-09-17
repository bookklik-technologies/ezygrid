# Editing cells

The editing lifecycle is: `idle → activate → beginEdit → validate → commit | cancel → recalculate → render`.

## Starting and finishing

- **Double-click** or **F2** — edit the current value
- **Typing** — replaces the value
- **Enter / Tab** — commit and move
- **Escape** — cancel

IME composition is guarded (`isComposing` / key code 229), so CJK input works correctly.

## Commit behavior

`parseEditorValue` coerces editor text: empty string → `null`, numeric text → `number`, `true`/`false` → `boolean`, anything else stays a string. Text starting with `=` commits as a formula. Writes pass through [validation](/guide/validation) before mutating.

## Cell editor types

Assign editors to ranges with `setCellEditor(range, type, options)`:

| Type | Behavior | Options |
| --- | --- | --- |
| text (default) | Inline input | — |
| `number` | Numeric input | — |
| `date` | Date input | — |
| `checkbox` | Click toggles a boolean | — |
| `dropdown` | Select from a list | `{ values: unknown[] }` |

```ts
sheet.setCellEditor('B2:B10', 'dropdown', { values: ['Low', 'Medium', 'High'] });
sheet.setCellEditor('C2:C10', 'checkbox');
sheet.getEditorFor(1, 1);
```

## Formula editing affordances

- **Autocomplete**: typing a formula opens suggestions from `formulaRegistry.suggest`; **Tab** accepts the top match.
- **Reference insertion**: clicking cells while editing a formula inserts their A1 references.
- **F4**: cycles the just-inserted reference through `A1 → $A$1 → A$1 → $A1`.
- **Draft preservation**: the formula bar keeps its draft while you scroll.

## Formula bar

The renderer's optional formula bar has a name box (type an address and press Enter to navigate) and a formula input that commits on Enter/Tab/blur and cancels on Escape:

```ts
renderer.getEditorInput(); // the active editor input, if editing
```

Enable it with `renderer: { formulaBar: true }` (default).
