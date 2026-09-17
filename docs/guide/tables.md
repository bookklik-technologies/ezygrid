# Tables & defined names

## Structured tables

```ts
const table = sheet.addTable({
  name: 'Sales',
  range: 'A1:D50',
  headerRow: true,
  totalRow: true,
});

sheet.getTable('Sales');
sheet.tables.all();
sheet.tables.at(3, 1);   // table containing a cell
sheet.tables.remove('Sales');
```

Tables get alternating row banding and a bold total row in the renderer, and their ranges participate in history transformation when rows/columns shift.

## Structured references

Formulas can address table data directly:

```
=Sales                       ← the table's data range
=Sales[Revenue]              ← one column
=Sales[@Price]               ← same row as the formula cell
```

## Defined names

Workbook-level names resolve in any sheet's formulas:

```ts
workbook.setDefinedName('TaxRate', { type: 'value', value: 0.19 });
workbook.setDefinedName('SalesData', { type: 'range', ref: 'Sales!A2:D12' });
workbook.removeDefinedName('SalesData');
```

Then in formulas: `=B2 * TaxRate` or `=SUM(SalesData)`.

## Validation + tables

Combine with [validation lists](/guide/validation) for dropdown columns backed by a table range.
