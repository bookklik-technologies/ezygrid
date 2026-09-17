export interface ParseCsvOptions {
  /** Explicit delimiter; omit for auto-detection. */
  delimiter?: string;
  /** First row becomes headers; data rows exclude it. */
  headers?: boolean;
  /** Trim BOM (default: true). */
  bom?: boolean;
  /** Parse numeric-looking fields into numbers (default: true). */
  numbers?: boolean;
}

export interface CsvParseResult {
  headers?: string[];
  rows: unknown[][];
}

const CANDIDATES = [',', ';', '\t', '|'];

/**
 * Detect the most likely delimiter (F23): a quote-aware scan counts
 * separators only OUTSIDE quoted fields and correctly traverses quoted
 * multiline fields instead of assuming a single physical line.
 */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(CANDIDATES.map((candidate) => [candidate, 0]));
  let inQuotes = false;
  let i = 0;
  // Scan enough content to see real separators but stay bounded.
  const maxScan = Math.min(text.length, 64 * 1024);
  while (i < maxScan) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
    i += 1;
  }
  let best = ',';
  let bestCount = 0;
  for (const candidate of CANDIDATES) {
    const count = counts.get(candidate) ?? 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function looksNumeric(text: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(text);
}

/**
 * RFC 4180 CSV parser (§35.1): quoted fields, escaped quotes, embedded
 * newlines, BOM stripping, delimiter detection and numeric coercion.
 */
export function parseCsv(input: string, options: ParseCsvOptions = {}): CsvParseResult {
  const stripBom = options.bom !== false;
  let text = input;
  if (stripBom && text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const rows: unknown[][] = [];
  let row: unknown[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushField(row, field, options.numbers !== false);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushField(row, field, options.numbers !== false);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // final field / row (unless the text ended exactly on a newline)
  if (field !== '' || row.length > 0) {
    pushField(row, field, options.numbers !== false);
    rows.push(row);
  }

  let headers: string[] | undefined;
  let data = rows;
  if (options.headers && rows.length > 0) {
    headers = (rows[0] ?? []).map(String);
    data = rows.slice(1);
  }
  return { headers, rows: data };
}

function pushField(row: unknown[], field: string, numbers: boolean): void {
  if (numbers && looksNumeric(field)) {
    row.push(Number(field));
  } else {
    row.push(field);
  }
}

export interface StringifyCsvOptions {
  delimiter?: string;
  /** Prefix =, +, -, @ with an apostrophe so spreadsheet apps treat data as text (§50.3). */
  escapeFormulas?: boolean;
}

/** Serialize rows to CSV with RFC 4180 quoting. */
export function stringifyCsv(rows: unknown[][], options: StringifyCsvOptions = {}): string {
  const delimiter = options.delimiter ?? ',';
  const lines: string[] = [];
  for (const row of rows) {
    const fields = row.map((value) => {
      let text = value === null || value === undefined ? '' : String(value);
      if (options.escapeFormulas && /^[=+@-]/.test(text)) {
        text = `'${text}`;
      }
      if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    });
    lines.push(fields.join(delimiter));
  }
  return `${lines.join('\r\n')}\r\n`;
}
