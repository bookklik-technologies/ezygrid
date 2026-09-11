/** Zero-based column index to spreadsheet letters: 0 -> A, 25 -> Z, 26 -> AA. */
export function indexToColumn(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`column index must be a non-negative integer, got ${index}`);
  }
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Spreadsheet letters to zero-based column index: A -> 0, Z -> 25, AA -> 26. */
export function columnToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) {
    const code = ch.charCodeAt(0) | 32; // uppercase-normalize
    if (code < 97 || code > 122) {
      throw new Error(`invalid column letters: "${letters}"`);
    }
    n = n * 26 + (code - 96);
  }
  return n - 1;
}

/** Zero-based (row, column) to A1 address, e.g. (0, 0) -> "A1". */
export function toA1(row: number, column: number): string {
  if (!Number.isInteger(row) || row < 0) {
    throw new RangeError(`row must be a non-negative integer, got ${row}`);
  }
  return `${indexToColumn(column)}${row + 1}`;
}

/** A1 address to zero-based { row, column }, e.g. "A1" -> { row: 0, column: 0 }. Accepts $-prefixed parts. */
export function fromA1(address: string): { row: number; column: number } {
  const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(address);
  if (!m) {
    throw new Error(`invalid A1 address: "${address}"`);
  }
  return { row: Number(m[2]) - 1, column: columnToIndex(m[1]!) };
}

/** Absolute/relative marker bits. */
export const enum RefFlags {
  None = 0,
  AbsoluteColumn = 1,
  AbsoluteRow = 2,
}

export interface ParsedRef {
  sheet?: string;
  row: number;
  column: number;
  flags: RefFlags;
}

/** Parse a possibly sheet-qualified, $-marked cell reference: Sheet1!$A$1, 'My Sheet'!B2, A1. */
export function parseRef(ref: string): ParsedRef {
  const m =
    /^(?:(?:((?:'[^']*')|[A-Za-z_][A-Za-z0-9_.]*)!))?\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(ref);
  if (!m) {
    throw new Error(`invalid cell reference: "${ref}"`);
  }
  let sheet = m[1];
  if (sheet && sheet.startsWith("'") && sheet.endsWith("'")) {
    sheet = sheet.slice(1, -1).replace(/''/g, "'");
  }
  const flags =
    (ref.includes('$') ? RefFlags.AbsoluteColumn | RefFlags.AbsoluteRow : RefFlags.None);
  return { sheet, row: Number(m[3]) - 1, column: columnToIndex(m[2]!), flags };
}

export interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** Parse "A1", "A1:B3" or "Sheet1!A1:B3" into a zero-based rect. */
export function parseRange(range: string): Rect & { sheet?: string } {
  let sheet: string | undefined;
  let body = range;
  const bang = range.lastIndexOf('!');
  if (bang >= 0) {
    sheet = range.slice(0, bang).replace(/^'(.*)'$/, (_, inner) => inner.replace(/''/g, "'"));
    body = range.slice(bang + 1);
  }
  const parts = body.split(':');
  const a = fromA1(parts[0]!);
  const b = parts[1] ? fromA1(parts[1]!) : a;
  return {
    sheet,
    top: Math.min(a.row, b.row),
    left: Math.min(a.column, b.column),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.column, b.column),
  };
}

/** Zero-based rect to canonical "A1:B3" (single cell if degenerate). */
export function rectToRange(rect: Rect): string {
  const a = toA1(rect.top, rect.left);
  if (rect.top === rect.bottom && rect.left === rect.right) return a;
  return `${a}:${toA1(rect.bottom, rect.right)}`;
}

/** Iterate every address in a rect, row-major. */
export function* iterateRect(rect: Rect): Generator<{ row: number; column: number }> {
  for (let row = rect.top; row <= rect.bottom; row++) {
    for (let column = rect.left; column <= rect.right; column++) {
      yield { row, column };
    }
  }
}

export function rectContains(rect: Rect, row: number, column: number): boolean {
  return (
    row >= rect.top && row <= rect.bottom && column >= rect.left && column <= rect.right
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.bottom < b.top ||
    a.top > b.bottom ||
    a.right < b.left ||
    a.left > b.right
  );
}
