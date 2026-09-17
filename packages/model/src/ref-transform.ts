import { columnToIndex, indexToColumn } from './coordinates.js';

/**
 * Reference Transform Engine (Phase 0 prototype).
 *
 * Transforms A1 references inside formula text after structural edits.
 * Operates on parsed reference tokens via a formula scanner, never regex
 * replacement over raw text.
 */

export interface RowShift {
  kind: 'row';
  /** Insert/delete position. */
  at: number;
  /** Positive = insert, negative = delete magnitude. */
  delta: number;
}

export interface ColumnShift {
  kind: 'column';
  at: number;
  delta: number;
}

export type RefTransform = RowShift | ColumnShift;

/** Tokenizer over formula bodies: picks out cell refs, strings, and everything else. */
const REF_TOKEN = /(?:'[^']*'|[A-Za-z_][A-Za-z0-9_.]*)?!?\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(?::\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?/y;

interface Token {
  start: number;
  end: number;
  isRef: boolean;
  text: string;
}

/**
 * Tokenizer over formula bodies: picks out cell refs, strings, and everything
 * else. Exported so copy/fill translation can share the same ref-safe
 * scanning (never regex replacement over raw text).
 */
export function tokenizeFormula(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i]!;
    if (ch === '"') {
      // string literal: skip to closing quote honoring doubled quotes
      let j = i + 1;
      while (j < formula.length) {
        if (formula[j] === '"' && formula[j + 1] === '"') j += 2;
        else if (formula[j] === '"') { j += 1; break; }
        else j += 1;
      }
      tokens.push({ start: i, end: j, isRef: false, text: formula.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z0-9_$'!]/.test(ch)) {
      REF_TOKEN.lastIndex = i;
      const m = REF_TOKEN.exec(formula);
      if (m && m.index === i) {
        const text = m[0];
        // Heuristic: an identifier followed by "(" is a function name, not a ref.
        const after = formula.slice(i + text.length).match(/^\s*\(/);
        tokens.push({ start: i, end: i + text.length, isRef: !after, text });
        i += text.length;
        continue;
      }
    }
    // consume one non-token char
    let j = i + 1;
    while (j < formula.length && !/[A-Za-z0-9_$'!"]/.test(formula[j]!)) j += 1;
    tokens.push({ start: i, end: j, isRef: false, text: formula.slice(i, j) });
    i = j;
  }
  return tokens;
}

function shiftIndex(pos: number, shift: RowShift | ColumnShift): number | undefined {
  const { at, delta } = shift;
  if (delta > 0) {
    return pos >= at ? pos + delta : pos;
  }
  const count = -delta;
  if (pos < at) return pos;
  if (pos < at + count) return undefined; // deleted
  return pos - count;
}

function shiftRefPart(
  part: string,
  shift: RowShift | ColumnShift,
): string | undefined {
  // part may carry a sheet qualifier: 'My Sheet'!$B$3 or Sheet1!B3.
  const bang = part.lastIndexOf('!');
  const prefix = bang >= 0 ? part.slice(0, bang + 1) : '';
  const body = bang >= 0 ? part.slice(bang + 1) : part;
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/.exec(body);
  if (!m) return part;
  const dollarCol = m[1] ?? '';
  const letters = m[2] ?? '';
  const dollarRow = m[3] ?? '';
  const digits = m[4] ?? '';
  const column = columnToIndex(letters);
  const row = Number(digits) - 1;
  // Structural edits move absolute references too (unlike copy offsets);
  // references deleted along with their row/column become #REF!.
  if (shift.kind === 'row') {
    const mapped = shiftIndex(row, shift);
    if (mapped === undefined) return undefined;
    return `${prefix}${dollarCol}${letters}${dollarRow}${mapped + 1}`;
  }
  const mapped = shiftIndex(column, shift);
  if (mapped === undefined) return undefined;
  return `${prefix}${dollarCol}${indexToColumn(mapped)}${dollarRow}${digits}`;
}

/** Transform a single reference token (cell or range); returns undefined when it should become #REF!. */
export function transformRefToken(token: string, shift: RefTransform): string | undefined {
  const colon = token.indexOf(':');
  if (colon < 0) {
    return shiftRefPart(token, shift);
  }
  const a = shiftRefPart(token.slice(0, colon), shift);
  const b = shiftRefPart(token.slice(colon + 1), shift);
  if (a === undefined && b === undefined) return undefined;
  if (a === undefined) return b; // range collapses to remaining endpoint
  if (b === undefined) return a;
  return `${a}:${b}`;
}

/**
 * Rewrite all references in a formula body (without leading "=") after a
 * structural shift. Deleted references become #REF!.
 */
export function transformFormula(formula: string, shift: RefTransform): string {
  const tokens = tokenizeFormula(formula);
  let out = '';
  for (const t of tokens) {
    if (t.isRef) {
      const mapped = transformRefToken(t.text, shift);
      out += mapped ?? '#REF!';
    } else {
      out += t.text;
    }
  }
  return out;
}

export interface FormulaRefTransformOptions {
  /** Sheet whose rows/columns moved. */
  targetSheet: string;
  /** Sheet the formula lives on; unqualified refs resolve here. */
  ownerSheet: string;
}

function unquoteSheet(text: string): string {
  if (text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

/**
 * Structural rewrite with cross-sheet awareness: only references that point
 * AT the shifted sheet move (unqualified refs count when the formula's own
 * sheet is the shifted one). Qualified refs to other sheets are untouched.
 */
export function transformFormulaRefs(
  formula: string,
  shift: RefTransform,
  options: FormulaRefTransformOptions,
): string {
  const tokens = tokenizeFormula(formula);
  let out = '';
  for (const t of tokens) {
    if (!t.isRef) {
      out += t.text;
      continue;
    }
    const bang = t.text.lastIndexOf('!');
    const applies = bang >= 0
      ? unquoteSheet(t.text.slice(0, bang)) === options.targetSheet
      : options.ownerSheet === options.targetSheet;
    out += applies ? transformRefToken(t.text, shift) ?? '#REF!' : t.text;
  }
  return out;
}

/** Convenience: A1 string -> transformed A1 string (or #REF! sentinel). */
export function transformAddress(address: string, shift: RefTransform): string {
  const bang = address.lastIndexOf('!');
  const prefix = bang >= 0 ? address.slice(0, bang + 1) : '';
  const body = bang >= 0 ? address.slice(bang + 1) : address;
  const mapped = transformRefToken(body, shift);
  if (mapped === undefined) return '#REF!';
  return prefix + mapped;
}

/**
 * Rewrite sheet qualifiers in a formula body after a worksheet rename
 * (F11): qualified references pointing at the old name follow the rename.
 */
export function renameSheetRefs(formula: string, from: string, to: string): string {
  if (!from || from === to) return formula;
  const tokens = tokenizeFormula(formula);
  let out = '';
  for (const token of tokens) {
    if (!token.isRef) {
      out += token.text;
      continue;
    }
    const bang = token.text.lastIndexOf('!');
    if (bang < 0) {
      out += token.text;
      continue;
    }
    const qualifier = unquoteSheet(token.text.slice(0, bang));
    if (qualifier === from) {
      const quoted = /[\s'!]/.test(to) ? `'${to.replace(/'/g, "''")}'` : to;
      out += `${quoted}!${token.text.slice(bang + 1)}`;
    } else {
      out += token.text;
    }
  }
  return out;
}
