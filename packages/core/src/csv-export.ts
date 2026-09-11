import { parseRange } from '@ezygrid/model';
import { stringifyCsv, parseCsv, type ParseCsvOptions, type StringifyCsvOptions } from '@ezygrid/csv';
import type { Worksheet } from './workbook.js';
import { formatValue } from './format.js';

export interface ToCsvOptions extends StringifyCsvOptions {
  range?: string;
}

/** Export the used range (or a given range) as CSV, using display formatting. */
export function worksheetToCsv(worksheet: Worksheet, options: ToCsvOptions = {}): string {
  const rect = options.range ? parseRange(options.range) : worksheet.cells.usedRange;
  if (!rect) return '';
  const rows: unknown[][] = [];
  for (let r = rect.top; r <= rect.bottom; r++) {
    const row: unknown[] = [];
    for (let c = rect.left; c <= rect.right; c++) {
      const value = worksheet.getValue(r, c);
      const mask = worksheet.getNumberFormat(r, c);
      row.push(formatValue(value, mask));
    }
    rows.push(row);
  }
  return stringifyCsv(rows, {
    delimiter: options.delimiter,
    escapeFormulas: options.escapeFormulas,
  });
}

export interface FromCsvOptions extends ParseCsvOptions {
  /** Start cell for the imported block (default A1). */
  anchor?: string;
  /** Treat values starting with "=" as formulas (default: false). */
  formulas?: boolean;
}

/** Import CSV text into the worksheet. */
export function worksheetFromCsv(worksheet: Worksheet, text: string, options: FromCsvOptions = {}): void {
  const parsed = parseCsv(text, options);
  const anchorRect = options.anchor ? parseRange(options.anchor) : { top: 0, left: 0, bottom: 0, right: 0 };
  for (let r = 0; r < parsed.rows.length; r++) {
    const row = parsed.rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const value = row[c]!;
      // Only honor the formula interpretation when the import opts in;
      // otherwise write literally so "=1+1" stays text.
      const asFormula = options.formulas === true && typeof value === 'string' && value.startsWith('=');
      worksheet.setValue(anchorRect.top + r, anchorRect.left + c, value, { literal: !asFormula });
    }
  }
}
