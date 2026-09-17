# Validation

Validation rules run on **every** `setValue`, including editor commits, paste and fill.

## Rule shape

```ts
type ValidationType = 'number' | 'list' | 'textLength' | 'custom';
type ValidationAction = 'reject' | 'warning' | 'mark';

interface ValidationRule {
  id: string;
  range: string;          // A1 range
  type: ValidationType;
  action: ValidationAction;
  min?: number;           // number criteria
  max?: number;
  values?: unknown[];     // list criteria
  length?: number;        // textLength criteria
  predicate?: (value) => boolean; // custom criteria
  message?: string;
}
```

## Usage

```ts
const sheet = editor.workbook.activeWorksheet;

// Numeric bounds, hard reject
sheet.addValidation({
  range: 'B2:B100',
  type: 'number',
  action: 'reject',
  min: 0,
  max: 1000,
  message: 'Quantity must be between 0 and 1000',
});

// Dropdown-backed list
sheet.addValidation({
  range: 'C2:C100',
  type: 'list',
  action: 'warning',
  values: ['Low', 'Medium', 'High'],
});

// Custom predicate
sheet.addValidation({
  range: 'D2:D100',
  type: 'custom',
  action: 'mark',
  predicate: (value) => /^[A-Z]{3}-\d+$/.test(String(value)),
});
```

## Managing rules

```ts
const rule = sheet.addValidation({ ... });
sheet.validations.all();               // readonly ValidationRule[]
sheet.validations.forCell(sheet, 1, 1); // rules covering a cell
sheet.validations.check(sheet, 1, 1, value); // { allowed, action, message? }
sheet.validations.remove(rule.id);
sheet.removeValidation(rule.id);
```

## Actions

| Action | Behavior |
| --- | --- |
| `reject` | Write is **not applied**; a `validation.reject` operation is emitted |
| `warning` | Write proceeds; consumers can warn from the event stream |
| `mark` | Write proceeds; UI marks the cell |

Blank values are always allowed.
