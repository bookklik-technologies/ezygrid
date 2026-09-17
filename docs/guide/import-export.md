# Import & export

## CSV

### Per-sheet convenience

```ts
const csv = sheet.toCsv({ escapeFormulas: true });       // export
await sheet.fromCsv(text, { delimiter: ',' });            // import
```

### The `@ezygrid/csv` package

```ts
import { parseCsv, stringifyCsv, detectDelimiter } from '@ezygrid/csv';

const text = await file.text();
const { headers, rows } = parseCsv(text, {
  delimiter: undefined,  // auto-detect (",", ";", tab, "|")
  headers: true,         // first row is headers
  bom: true,             // strip UTF-8 BOM
  numbers: true,         // coerce numeric fields
});

const out = stringifyCsv(rows, { escapeFormulas: true });
```

Parsing follows RFC 4180: quoted fields, escaped quotes (`""`), embedded newlines, BOM handling and numeric coercion.

### Formula-injection protection

`escapeFormulas: true` prefixes cells starting with `=`, `+`, `-` or `@` with a single quote when stringifying — the standard mitigation against CSV formula injection in spreadsheet apps.

### Downloading a file

```ts
const blob = new Blob([sheet.toCsv({ escapeFormulas: true })], { type: 'text/csv;charset=utf-8' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'sheet.csv';
a.click();
URL.revokeObjectURL(url);
```

## XLSX

`@ezygrid/xlsx` reads and writes OOXML workbooks with zero external dependencies (zip via `createZip`/`readZip`, inflate via `DecompressionStream`):

```ts
import { workbookToXlsx, workbookFromXlsx } from '@ezygrid/xlsx';

const bytes: Uint8Array = workbookToXlsx(editor.workbook); // synchronous export
await workbookFromXlsx(bytes);                             // async import → Workbook
```

Supported:

- Multiple sheets, sheet names and ordering
- Shared strings and inline values
- Formulas, including shared formulas (`t="shared"`) masters and followers
- Custom number formats
- Merged cells
- Spreadsheet limits enforced: 1,048,576 rows × 16,384 columns
