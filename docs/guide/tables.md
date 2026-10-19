# Tables & defined names

Named tables and defined names give cell ranges meaningful names for formulas. Creating a table is optional; charts can read ordinary cell ranges directly.

## Format selected data as a table {#create-a-named-table-in-the-editor}

Select your data and open **Data → Format as table**. If only one populated cell is active, the editor detects its surrounding data block. Review the selected row and column counts and the dialog preview, confirm whether the first row contains column titles, then choose **Create table**. **Use selected cells** restores the current selection; **Advanced → Cell addresses** accepts a different range. Cancelling leaves the workbook unchanged.

The editor assigns a unique formula name automatically. **Advanced** contains the name, precise cell addresses and **Make the last row bold**. This last option formats existing values; it does not calculate totals.

Select cells entirely inside one table to reveal the **Table** ribbon tab. It provides name, header-row and bold-last-row settings, **Resize table**, and **Remove table**. The tab appears without interrupting your current ribbon tab. **Resize table** or **Data → Format as table** opens a dialog with range editing and a preview; other tables are listed there. Removing a table keeps its cell data. Creating or updating a table is undoable, and editing an existing table preserves its ID.

JSON saves retain table IDs so undo, redo, and reopening a workbook keep table identity. Older JSON files without table IDs remain supported and receive IDs when loaded.

Tables show column titles in bold by default, retain explicitly supplied cell formatting, add alternating row shading and support structured references such as `Sales[Revenue]`.

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

```text
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
