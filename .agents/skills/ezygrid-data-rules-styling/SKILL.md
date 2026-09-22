---
name: ezygrid-data-rules-styling
description: "Configure Ezygrid cell styles, number formats, editors, validation, conditional formatting, tables and defined names. Use for spreadsheet presentation and data rules, not global UI themes."
---

# Ezygrid Data Rules and Styling

## Inputs and approach

Identify target ranges, raw value types, display requirements, invalid-data behavior and persistence needs. Keep raw values separate from display formatting and prefer declarative rule types over callbacks.

Read [styling](../../../docs/guide/styling.md), [validation](../../../docs/guide/validation.md), [tables](../../../docs/guide/tables.md), [format implementation](../../../packages/core/src/format.ts), [validation implementation](../../../packages/core/src/validation.ts) and [conditional formatting](../../../packages/core/src/conditional-format.ts).

## Workflow and contracts

- Apply cell styles and number formats to A1 ranges. Number formats change display, CSV output and printing without replacing raw values.
- Use `setCellEditor` for typed inputs such as dropdown, checkbox, number or date, and keep its options compatible with the validation rule on the same range.
- Validation runs for API writes, editing, paste and fill. Blank values are always allowed. `reject` blocks the write; `warning` and `mark` allow it and emit/report state.
- Conditional-format rules are evaluated by priority. Use `stopIfTrue` only when lower-priority rules must not contribute.
- Prefer built-in rule types for serializable workbooks. Custom validation and conditional-format predicates are omitted from JSON and must be reattached after load.
- Tables and defined names participate in formula resolution and structural transforms. Keep names stable and table ranges aligned with their header/total configuration.
- Use workbook batching when applying coordinated styles, formats and rules so the change forms a sensible undo step.

## Example

```ts
const sheet = editor.workbook.activeWorksheet;

editor.workbook.transaction(() => {
  sheet.setStyle('A1:C1', { bold: true, background: '#e6fff4' });
  sheet.setNumberFormat('B2:B100', '#,##0.00');
  sheet.setCellEditor('C2:C100', 'dropdown', { values: ['Open', 'Done'] });
  sheet.addValidation({
    range: 'B2:B100', type: 'number', action: 'reject', min: 0,
    message: 'Amount must be zero or greater',
  });
  sheet.conditionalFormats.add({
    range: 'C2:C100', type: 'containsText', text: 'Done',
    style: { color: '#00875a' }, priority: 1,
  });
});
```

## Deliverables and verification

Deliver styles, formats, editors and rule definitions with any reload reattachment. Review blank and invalid writes, paste/fill, rule priority, raw versus displayed values, table growth, structural edits, undo/redo and JSON round-trip. Ask before running unit tests; do not run `pnpm test` or individual Vitest files without permission.
