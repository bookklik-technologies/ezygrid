---
name: ezygrid-import-export
description: "Implement Ezygrid CSV, XLSX, JSON persistence and printable output with appropriate fidelity and input-safety handling. Use for file interchange, not ordinary workbook editing."
---

# Ezygrid Import and Export

## Inputs and approach

Identify the format, direction, required workbook features, trust boundary and whether the operation targets one sheet or the entire workbook. Prefer native JSON for full Ezygrid persistence, XLSX for Office interchange and CSV for tabular text.

Read [import and export](../../../docs/guide/import-export.md), [persistence](../../../docs/guide/persistence.md), [printing](../../../docs/guide/printing.md), [CSV implementation](../../../packages/csv/src/csv.ts), [XLSX implementation](../../../packages/xlsx/src/index.ts) and [print implementation](../../../packages/core/src/print.ts).

## Workflow and contracts

- `sheet.toCsv`/`fromCsv` affect one worksheet. Use `escapeFormulas: true` for untrusted spreadsheet downloads so leading `=`, `+`, `-` and `@` cannot become injected formulas.
- CSV cannot retain formulas, styles, merges, charts or multiple sheets as workbook features. State this fidelity loss rather than implying a full round-trip.
- Use `workbookToXlsx` and `workbookFromXlsx` for Office files. XLSX supports documented core features but is not complete Excel fidelity.
- Use `workbook.toJSON` and `Workbook.fromJSON` or `loadJSON` for versioned native persistence. Validate `format` and `version`; loading resets history.
- Reattach callback predicates after JSON load because functions are intentionally omitted. Never serialize executable code into workbook data.
- When creating browser downloads, choose an accurate MIME type, sanitize the filename and revoke owned object URLs after the click.
- Treat imported files as untrusted, report parse/version failures clearly and do not silently fall back to a different format.

## Example

```ts
import { workbookFromXlsx, workbookToXlsx } from '@ezygrid/xlsx';

const bytes = workbookToXlsx(editor.workbook);
const restored = await workbookFromXlsx(bytes);

const csv = editor.workbook.activeWorksheet.toCsv({ escapeFormulas: true });
const snapshot = editor.workbook.toJSON();
```

Choose one artifact for the user's requested workflow; the example shows the distinct entry points rather than three equivalent formats.

## Deliverables and verification

Deliver parsing/serialization and browser file wiring plus a concise fidelity statement. Review malformed and oversized inputs, delimiter/BOM handling, formula injection, multiple sheets, shared formulas, merges and formats, callback reattachment, version rejection and object URL cleanup. Ask before running unit tests; do not run `pnpm test` or individual Vitest files without permission.
