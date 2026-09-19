import type { AstNode } from './parser.js';
import { FormulaError, ERR } from './errors.js';
import type { MatrixValue } from './matrix.js';
import { flatten, matrix } from './matrix.js';

export type RuntimeValue = number | string | boolean | FormulaError | null | MatrixValue;

export interface EvalContext {
  /** Get a raw cell value by coordinates on the given sheet (default = current). */
  getCellValue(sheet: string | undefined, row: number, column: number): RuntimeValue;
  /** Resolve a defined name to a value. */
  resolveName?(name: string): RuntimeValue;
  /** Resolve a structured table reference (§25). */
  resolveTable?(
    table: string,
    column: string | undefined,
    item: boolean | undefined,
    context: { sheet: string; row: number; column: number },
  ): RuntimeValue;
  /** Current sheet for unqualified refs. */
  currentSheet?: string;
  /** Coordinates of the cell being evaluated (for current-row table refs, §25). */
  currentRow?: number;
  currentColumn?: number;
}

function toNumber(v: RuntimeValue): number {
  if (v instanceof FormulaError) throw v;
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw ERR.VALUE();
  return n;
}

function toText(v: RuntimeValue): string {
  if (v instanceof FormulaError) throw v;
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function toBool(v: RuntimeValue): boolean {
  if (v instanceof FormulaError) throw v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null || v === '') return false;
  const s = String(v).toUpperCase();
  if (s === 'TRUE') return true;
  if (s === 'FALSE') return false;
  throw ERR.VALUE();
}

export type FunctionImpl = (args: RuntimeValue[], ctx: EvalContext, nodes: AstNode[]) => RuntimeValue;

/** Aggregate helper: flatten args (including matrices), taking numeric values only, skipping blanks. */
export function numbersOf(args: RuntimeValue[]): number[] {
  const nums: number[] = [];
  for (const a of args) {
    for (const v of flatten(a)) {
      if (v === null) continue;
      if (typeof v === 'number') nums.push(v);
      else if (typeof v === 'boolean') nums.push(v ? 1 : 0);
      else if (typeof v === 'string') {
        const n = Number(v);
        if (!Number.isNaN(n) && v.trim() !== '') nums.push(n);
      }
    }
  }
  return nums;
}

function flatTexts(args: RuntimeValue[]): string[] {
  const texts: string[] = [];
  for (const a of args) {
    for (const v of flatten(a)) {
      if (v !== null) texts.push(toText(v));
    }
  }
  return texts;
}

function ifArgs(args: RuntimeValue[]): RuntimeValue {
  if (args.length < 2) throw ERR.VALUE();
  const cond = toBool(args[0]!);
  if (cond) return args[1] ?? true;
  return args[2] ?? false;
}

function lookupMatch(needle: number | string, haystack: RuntimeValue[], matchType = 1): number {
  // matchType 1 = largest value <= needle (assumes sorted asc), 0 = exact, -1 = smallest >= needle
  if (matchType === 0) {
    for (let i = 0; i < haystack.length; i++) {
      const v = haystack[i]!;
      if (v instanceof FormulaError) continue;
      const nv = typeof needle === 'number' ? (v === null ? null : Number(v)) : v === null ? '' : toText(v);
      if (nv === needle) return i + 1;
    }
    throw ERR.NA();
  }
  let best = -1;
  for (let i = 0; i < haystack.length; i++) {
    const v = haystack[i]!;
    if (v === null || v instanceof FormulaError) continue;
    if (typeof needle === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) continue;
      if (matchType === 1 ? n <= needle : n >= needle) best = i;
    } else {
      const s = toText(v);
      const cmp = matchType === 1 ? (s <= needle ? 0 : 1) : (s >= needle ? 0 : 1);
      if (cmp === 0) best = i;
    }
  }
  if (best === -1) throw ERR.NA();
  return best + 1;
}

function comparison(op: string, left: RuntimeValue, right: RuntimeValue): boolean {
  if (left instanceof FormulaError) throw left;
  if (right instanceof FormulaError) throw right;
  let a = left;
  let b = right;
  // numeric coercion when either side is number
  if (typeof a === 'number' || typeof b === 'number') {
    const na = a === null || a === '' ? 0 : typeof a === 'string' ? (Number.isNaN(Number(a)) ? NaN : Number(a)) : typeof a === 'boolean' ? (a ? 1 : 0) : a;
    const nb = b === null || b === '' ? 0 : typeof b === 'string' ? (Number.isNaN(Number(b)) ? NaN : Number(b)) : typeof b === 'boolean' ? (b ? 1 : 0) : b;
    if (typeof na === 'number' && typeof nb === 'number') {
      a = na;
      b = nb;
    } else {
      a = toText(a);
      b = toText(b);
    }
  }
  if (typeof a === 'string' && typeof b === 'string') {
    const cmp = a.localeCompare(b);
    switch (op) {
      case '=': return cmp === 0;
      case '<>': return cmp !== 0;
      case '<': return cmp < 0;
      case '>': return cmp > 0;
      case '<=': return cmp <= 0;
      case '>=': return cmp >= 0;
      default: throw ERR.VALUE();
    }
  }
  const na = toNumber(a);
  const nb = toNumber(b);
  switch (op) {
    case '=': return na === nb;
    case '<>': return na !== nb;
    case '<': return na < nb;
    case '>': return na > nb;
    case '<=': return na <= nb;
    case '>=': return na >= nb;
    default: throw ERR.VALUE();
  }
}

function parseCriteria(criteria: RuntimeValue): (v: RuntimeValue) => boolean {
  if (criteria instanceof FormulaError) {
    return (v) => v instanceof FormulaError && v.value === criteria.value;
  }
  if (typeof criteria === 'string') {
    const m = /^(<>|<=|>=|=|<|>)(.*)$/.exec(criteria);
    if (m) {
      const [, opStr, rest] = m;
      const target: RuntimeValue =
        rest === undefined || rest === ''
          ? null
          : /^-?[0-9]+(\.[0-9]+)?$/.test(rest)
            ? Number(rest)
            : rest;
      return (v) => {
        try {
          return comparison(opStr === '=' ? '=' : opStr!, v, target);
        } catch {
          return false;
        }
      };
    }
  }
  return (v) => {
    try {
      return comparison('=', v, criteria);
    } catch {
      return false;
    }
  };
}

function sumIfImpl(args: RuntimeValue[], ctx: EvalContext, nodes: AstNode[]): RuntimeValue {
  // SUMIF(range, criteria, [sum_range]) — implemented on AST ranges.
  return conditionalSum(args, ctx, nodes, 1, 2);
}

function conditionalSum(
  args: RuntimeValue[],
  ctx: EvalContext,
  nodes: AstNode[],
  critIndex: number,
  sumIndex: number,
): RuntimeValue {
  if (nodes.length < 2) throw ERR.VALUE();
  const rangeNode = nodes[0]!;
  const sumNode = nodes.length > sumIndex ? nodes[sumIndex]! : rangeNode;
  const criteria = args[critIndex]!;
  const match = parseCriteria(criteria);

  const rangeCells = nodeCells(rangeNode);
  const sumCells = nodeCells(sumNode);
  let total = 0;
  for (let i = 0; i < rangeCells.length; i++) {
    const rv = ctx.getCellValue(rangeCells[i]!.sheet, rangeCells[i]!.row, rangeCells[i]!.column);
    if (match(rv)) {
      const sc = sumCells[i];
      if (sc) {
        const sv = ctx.getCellValue(sc.sheet, sc.row, sc.column);
        if (typeof sv === 'number') total += sv;
      }
    }
  }
  return total;
}

function countIfImpl(args: RuntimeValue[], ctx: EvalContext, nodes: AstNode[]): RuntimeValue {
  if (nodes.length < 2) throw ERR.VALUE();
  const rangeCells = nodeCells(nodes[0]!);
  const match = parseCriteria(args[1]!);
  let count = 0;
  for (const c of rangeCells) {
    const v = ctx.getCellValue(c.sheet, c.row, c.column);
    if (match(v)) count += 1;
  }
  return count;
}

interface CellCoord { sheet?: string; row: number; column: number }

function nodeCells(node: AstNode): CellCoord[] {
  if (node.kind === 'ref') return [{ sheet: node.sheet, row: node.row, column: node.column }];
  if (node.kind === 'range') {
    const cells: CellCoord[] = [];
    for (let r = node.start.row; r <= node.end.row; r++) {
      for (let c = node.start.column; c <= node.end.column; c++) {
        cells.push({ sheet: node.sheet, row: r, column: c });
      }
    }
    return cells;
  }
  throw ERR.VALUE();
}

/** Build a matrix from a range/ref AST node (for dynamic-array functions). */
function matrixFromNode(node: AstNode, ctx: EvalContext): MatrixValue {
  const cells = nodeCells(node);
  if (cells.length === 0) throw ERR.VALUE();
  const cols = node.kind === 'range' ? node.end.column - node.start.column + 1 : 1;
  const values: RuntimeValue[][] = [];
  for (let r = 0; r < cells.length / cols; r++) {
    const row: RuntimeValue[] = [];
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c]!;
      row.push(ctx.getCellValue(cell.sheet, cell.row, cell.column));
    }
    values.push(row);
  }
  return matrix(values);
}

function flattenArgs(args: RuntimeValue[]): RuntimeValue[] {
  const out: RuntimeValue[] = [];
  for (const a of args) {
    if (a && typeof a === 'object' && (a as MatrixValue).kind === 'matrix') {
      for (const row of (a as MatrixValue).values) out.push(...row);
    } else {
      out.push(a as RuntimeValue);
    }
  }
  return out;
}

const asMatrixArg = (args: RuntimeValue[], nodes: AstNode[], ctx: EvalContext, index: number): MatrixValue => {
  const value = args[index];
  if (value && typeof value === 'object' && (value as MatrixValue).kind === 'matrix') {
    return value as MatrixValue;
  }
  const node = nodes[index];
  if (!node) throw ERR.VALUE();
  return matrixFromNode(node, ctx);
};

/** Tier-A function registry. */
export const FUNCTIONS: Record<string, FunctionImpl> = {
  SUM: (args) => numbersOf(args).reduce((a, b) => a + b, 0),
  AVERAGE: (args) => {
    const nums = numbersOf(args);
    if (nums.length === 0) throw ERR.DIV0();
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  },
  MIN: (args) => {
    const nums = numbersOf(args);
    return nums.length ? Math.min(...nums) : 0;
  },
  MAX: (args) => {
    const nums = numbersOf(args);
    return nums.length ? Math.max(...nums) : 0;
  },
  COUNT: (args) => numbersOf(args).length,
  COUNTA: (args) => flattenArgs(args).filter((a) => a !== null && a !== '').length,
  IF: ifArgs,
  IFS: (args) => {
    for (let i = 0; i + 1 < args.length; i += 2) {
      if (toBool(args[i]!)) return args[i + 1]!;
    }
    throw ERR.NA();
  },
  AND: (args) => args.every((a) => toBool(a)),
  OR: (args) => args.some((a) => toBool(a)),
  NOT: (args) => !toBool(args[0]!),
  ROUND: (args) => {
    const n = toNumber(args[0]!);
    const d = args.length > 1 ? Math.trunc(toNumber(args[1]!)) : 0;
    const f = 10 ** d;
    return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
  },
  ROUNDUP: (args) => {
    const n = toNumber(args[0]!);
    const d = args.length > 1 ? Math.trunc(toNumber(args[1]!)) : 0;
    const f = 10 ** d;
    return (n < 0 ? -Math.ceil(Math.abs(n) * f) : Math.ceil(n * f)) / f;
  },
  ROUNDDOWN: (args) => {
    const n = toNumber(args[0]!);
    const d = args.length > 1 ? Math.trunc(toNumber(args[1]!)) : 0;
    const f = 10 ** d;
    return (n < 0 ? -Math.floor(Math.abs(n) * f) : Math.floor(n * f)) / f;
  },
  ABS: (args) => Math.abs(toNumber(args[0]!)),
  MOD: (args) => {
    const a = toNumber(args[0]!);
    const b = toNumber(args[1]!);
    if (b === 0) throw ERR.DIV0();
    return a - b * Math.floor(a / b);
  },
  POWER: (args) => Math.pow(toNumber(args[0]!), toNumber(args[1]!)),
  SQRT: (args) => {
    const n = toNumber(args[0]!);
    if (n < 0) throw ERR.NUM();
    return Math.sqrt(n);
  },
  CONCAT: (args) => flatTexts(args).join(''),
  CONCATENATE: (args) => flatTexts(args).join(''),
  TEXTJOIN: (args) => {
    const sep = toText(args[0]!);
    const skipEmpty = toBool(args[1]!);
    const parts = args.slice(2).filter((a) => a !== null).map(toText);
    return (skipEmpty ? parts.filter((p) => p !== '') : parts).join(sep);
  },
  LEFT: (args) => {
    const s = toText(args[0]!);
    const n = args.length > 1 ? Math.trunc(toNumber(args[1]!)) : 1;
    if (n < 0) throw ERR.VALUE();
    return s.slice(0, n);
  },
  RIGHT: (args) => {
    const s = toText(args[0]!);
    const n = args.length > 1 ? Math.trunc(toNumber(args[1]!)) : 1;
    if (n < 0) throw ERR.VALUE();
    return n === 0 ? '' : s.slice(-n);
  },
  MID: (args) => {
    const s = toText(args[0]!);
    const start = Math.trunc(toNumber(args[1]!));
    const count = Math.trunc(toNumber(args[2]!));
    if (start < 1 || count < 0) throw ERR.VALUE();
    return s.slice(start - 1, start - 1 + count);
  },
  LEN: (args) => toText(args[0]!).length,
  TRIM: (args) => toText(args[0]!).replace(/\s+/g, ' ').trim(),
  UPPER: (args) => toText(args[0]!).toUpperCase(),
  LOWER: (args) => toText(args[0]!).toLowerCase(),
  PROPER: (args) => toText(args[0]!).replace(/\w\S*/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()),
  TODAY: () => {
    const d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 + 25569;
  },
  NOW: () => Date.now() / 86400000 + 25569 - new Date().getTimezoneOffset() / 1440,
  DATE: (args) => {
    const y = toNumber(args[0]!);
    const m = toNumber(args[1]!);
    const d = toNumber(args[2]!);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / 86400000 + 25569;
  },
  YEAR: (args) => {
    const serial = toNumber(args[0]!);
    return new Date(Math.round((serial - 25569) * 86400000)).getUTCFullYear();
  },
  MONTH: (args) => {
    const serial = toNumber(args[0]!);
    return new Date(Math.round((serial - 25569) * 86400000)).getUTCMonth() + 1;
  },
  DAY: (args) => {
    const serial = toNumber(args[0]!);
    return new Date(Math.round((serial - 25569) * 86400000)).getUTCDate();
  },
  VLOOKUP: (args, ctx, nodes) => {
    const needle = args[0]!;
    const tableNode = nodes[1];
    if (!tableNode || (tableNode.kind !== 'range' && tableNode.kind !== 'ref')) throw ERR.VALUE();
    const cells = nodeCells(tableNode);
    const cols = tableNode.kind === 'range' ? tableNode.end.column - tableNode.start.column + 1 : 1;
    const colIndex = Math.trunc(toNumber(args[2]!));
    const match = parseCriteria(typeof needle === 'string' && args.length > 3 && !toBool(args[3]!) ? needle : '=' + String(needle));
    for (let r = 0; r < cells.length / cols; r++) {
      const first = cells[r * cols]!;
      const v = ctx.getCellValue(first.sheet, first.row, first.column);
      if (match(v)) {
        const target = cells[r * cols + (colIndex - 1)];
        if (!target) throw ERR.REF();
        return ctx.getCellValue(target.sheet, target.row, target.column);
      }
    }
    throw ERR.NA();
  },
  HLOOKUP: (args, ctx, nodes) => {
    const needle = args[0]!;
    const tableNode = nodes[1];
    if (!tableNode || tableNode.kind !== 'range') throw ERR.VALUE();
    const cells = nodeCells(tableNode);
    const cols = tableNode.end.column - tableNode.start.column + 1;
    const rowIndex = Math.trunc(toNumber(args[2]!));
    const match = parseCriteria('=' + String(needle));
    for (let c = 0; c < cols; c++) {
      const v = ctx.getCellValue(cells[c]!.sheet, cells[c]!.row, cells[c]!.column);
      if (match(v)) {
        const target = cells[rowIndex * cols - cols + c];
        if (!target) throw ERR.REF();
        return ctx.getCellValue(target.sheet, target.row, target.column);
      }
    }
    throw ERR.NA();
  },
  INDEX: (args, ctx, nodes) => {
    const rangeNode = nodes[0]!;
    const row = Math.trunc(toNumber(args[1]!));
    const col = args.length > 2 ? Math.trunc(toNumber(args[2]!)) : 1;
    if (rangeNode.kind === 'range') {
      const r = rangeNode.start.row + row - 1;
      const c = rangeNode.start.column + col - 1;
      if (r > rangeNode.end.row || c > rangeNode.end.column) throw ERR.REF();
      return ctx.getCellValue(rangeNode.sheet, r, c);
    }
    if (rangeNode.kind === 'ref') {
      if (row !== 1 || col !== 1) throw ERR.REF();
      return ctx.getCellValue(rangeNode.sheet, rangeNode.row, rangeNode.column);
    }
    throw ERR.VALUE();
  },
  MATCH: (args, ctx, nodes) => {
    const needle = args[0]!;
    const cells = nodeCells(nodes[1]!);
    const type = args.length > 2 ? Math.trunc(toNumber(args[2]!)) : 1;
    const values = cells.map((c) => ctx.getCellValue(c.sheet, c.row, c.column));
    return lookupMatch(needle as number | string, values, type);
  },
  COUNTIF: countIfImpl,
  COUNTIFS: (args, ctx, nodes) => {
    let count = 0;
    const pairs: { cells: CellCoord[]; match: (v: RuntimeValue) => boolean }[] = [];
    // args: (range1, crit1, range2, crit2, ...); nodes mirror the same order.
    for (let i = 0; i + 1 < args.length && i + 1 < nodes.length; i += 2) {
      pairs.push({ cells: nodeCells(nodes[i]!), match: parseCriteria(args[i + 1]!) });
    }
    if (pairs.length === 0) throw ERR.VALUE();
    const size = pairs[0]!.cells.length;
    for (const p of pairs) {
      if (p.cells.length !== size) throw ERR.VALUE();
    }
    for (let i = 0; i < size; i++) {
      let ok = true;
      for (const p of pairs) {
        const c = p.cells[i];
        const v = c ? ctx.getCellValue(c.sheet, c.row, c.column) : null;
        if (!p.match(v)) { ok = false; break; }
      }
      if (ok) count += 1;
    }
    return count;
  },
  SUMIF: sumIfImpl,
  SUMIFS: (args, ctx, nodes) => {
    if (nodes.length < 3) throw ERR.VALUE();
    // args: (sum_range, range1, crit1, range2, crit2, ...); nodes in same order.
    const sumCells = nodeCells(nodes[0]!);
    const pairs: { cells: CellCoord[]; match: (v: RuntimeValue) => boolean }[] = [];
    for (let i = 1; i + 1 < args.length && i + 1 < nodes.length; i += 2) {
      pairs.push({ cells: nodeCells(nodes[i]!), match: parseCriteria(args[i + 1]!) });
    }
    if (pairs.length === 0) throw ERR.VALUE();
    for (const p of pairs) {
      if (p.cells.length !== sumCells.length) throw ERR.VALUE();
    }
    let total = 0;
    for (let i = 0; i < sumCells.length; i++) {
      let ok = true;
      for (const p of pairs) {
        const c = p.cells[i];
        const v = c ? ctx.getCellValue(c.sheet, c.row, c.column) : null;
        if (!p.match(v)) { ok = false; break; }
      }
      if (ok) {
        const sc = sumCells[i]!;
        const sv = ctx.getCellValue(sc.sheet, sc.row, sc.column);
        if (typeof sv === 'number') total += sv;
      }
    }
    return total;
  },
  AVERAGEIF: (args, ctx, nodes) => {
    const total = conditionalSum(args, ctx, nodes, 1, 2) as number;
    const count = countMatching(args, ctx, nodes);
    if (count === 0) throw ERR.DIV0();
    return total / count;
  },
  ISBLANK: (args) => {
    const value = flatten(args[0] ?? null)[0] ?? null;
    return value === null || value === '';
  },
  ISNUMBER: (args) => typeof args[0] === 'number',
  ISTEXT: (args) => typeof args[0] === 'string',
  ISERROR: (args) => args[0] instanceof FormulaError,
  ISNA: (args) => args[0] instanceof FormulaError && args[0].value === '#N/A',
  IFERROR: (args) => (args[0] instanceof FormulaError ? args[1] ?? null : args[0]!),
  IFNA: (args) =>
    args[0] instanceof FormulaError && args[0].value === '#N/A' ? args[1] ?? null : args[0]!,

  // ── Dynamic arrays (§14.2) ──────────────────────────────────────────────
  XLOOKUP: (args, ctx, nodes) => {
    const needle = args[0]!;
    const lookupMatrix = asMatrixArg(args, nodes, ctx, 1);
    const returnMatrix = asMatrixArg(args, nodes, ctx, 2);
    const match = parseCriteria('=' + String(needle));
    for (let r = 0; r < lookupMatrix.rows; r++) {
      if (match(lookupMatrix.values[r]![0] ?? null)) {
        const row = returnMatrix.values[r] ?? [];
        if (row.length === 1) return row[0]!;
        return matrix([row]);
      }
    }
    if (args.length > 3) return args[3]!;
    throw ERR.NA();
  },
  XMATCH: (args, ctx, nodes) => {
    const needle = args[0]!;
    const lookupMatrix = asMatrixArg(args, nodes, ctx, 1);
    const match = parseCriteria('=' + String(needle));
    for (let r = 0; r < lookupMatrix.rows; r++) {
      if (match(lookupMatrix.values[r]![0] ?? null)) return r + 1;
    }
    throw ERR.NA();
  },
  FILTER: (args, ctx, nodes) => {
    const source = asMatrixArg(args, nodes, ctx, 0);
    const include = asMatrixArg(args, nodes, ctx, 1);
    const keep: RuntimeValue[][] = [];
    for (let r = 0; r < source.rows; r++) {
      const cond = include.values[r]?.[0] ?? null;
      if (toBool(cond)) keep.push(source.values[r]!);
    }
    if (keep.length === 0) {
      if (args.length > 2) return args[2]!;
      throw ERR.CALC();
    }
    return matrix(keep);
  },
  SORT: (args, ctx, nodes) => {
    const source = asMatrixArg(args, nodes, ctx, 0);
    const index = args.length > 1 ? Math.trunc(toNumber(args[1]!)) : 1;
    const order = args.length > 2 ? Math.trunc(toNumber(args[2]!)) : 1;
    const sorted = [...source.values].sort((a, b) => {
      const av = a[index - 1] ?? null;
      const bv = b[index - 1] ?? null;
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else {
        const at = av === null ? '' : String(av);
        const bt = bv === null ? '' : String(bv);
        cmp = at < bt ? -1 : at > bt ? 1 : 0;
      }
      return order === -1 ? -cmp : cmp;
    });
    return matrix(sorted);
  },
  SORTBY: (args, ctx, nodes) => {
    const source = asMatrixArg(args, nodes, ctx, 0);
    const by = asMatrixArg(args, nodes, ctx, 1);
    const order = args.length > 2 ? Math.trunc(toNumber(args[2]!)) : 1;
    const sorted = source.values
      .map((row, i) => ({ row, key: by.values[i]?.[0] ?? null }))
      .sort((a, b) => (order === -1 ? cmpV(b.key, a.key) : cmpV(a.key, b.key)))
      .map((e) => e.row);
    return matrix(sorted);
  },
  UNIQUE: (args, ctx, nodes) => {
    const source = asMatrixArg(args, nodes, ctx, 0);
    const seen = new Set<string>();
    const out: RuntimeValue[][] = [];
    for (const row of source.values) {
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(row);
      }
    }
    return matrix(out);
  },
  SEQUENCE: (args) => {
    const rows = Math.trunc(toNumber(args[0]!));
    const cols = args.length > 1 ? Math.trunc(toNumber(args[1]!)) : 1;
    const start = args.length > 2 ? toNumber(args[2]!) : 1;
    const step = args.length > 3 ? toNumber(args[3]!) : 1;
    const values: RuntimeValue[][] = [];
    let n = start;
    for (let r = 0; r < rows; r++) {
      const row: RuntimeValue[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(n);
        n += step;
      }
      values.push(row);
    }
    return matrix(values);
  },
  TRANSPOSE: (args, ctx, nodes) => {
    const source = asMatrixArg(args, nodes, ctx, 0);
    const out: RuntimeValue[][] = [];
    for (let c = 0; c < source.columns; c++) {
      const row: RuntimeValue[] = [];
      for (let r = 0; r < source.rows; r++) {
        row.push(source.values[r]![c] ?? null);
      }
      out.push(row);
    }
    return matrix(out);
  },
  ROWS: (args, ctx, nodes) => asMatrixArg(args, nodes, ctx, 0).rows,
  COLUMNS: (args, ctx, nodes) => asMatrixArg(args, nodes, ctx, 0).columns,
  CHOOSE: (args) => {
    const index = Math.trunc(toNumber(args[0]!));
    if (index < 1 || index >= args.length) throw ERR.VALUE();
    return args[index]!;
  },

  // ── Math & trig ──────────────────────────────────────────────────────────
  SUMPRODUCT: (args, ctx, nodes) => {
    if (nodes.length === 0) throw ERR.VALUE();
    const matrices = nodes.map((_node, i) => asMatrixArg(args, nodes, ctx, i));
    const rows = matrices[0]!.rows;
    const cols = matrices[0]!.columns;
    let total = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let product = 1;
        for (const m of matrices) {
          const v = m.values[r]?.[c];
          product *= typeof v === 'number' ? v : 0;
        }
        total += product;
      }
    }
    return total;
  },
  SUMSQ: (args) => numbersOf(args).reduce((a, b) => a + b * b, 0),
  PRODUCT: (args) => numbersOf(args).reduce((a, b) => a * b, 1),
  INT: (args) => Math.floor(toNumber(args[0]!)),
  TRUNC: (args) => {
    const digits = args.length > 1 ? Math.trunc(toNumber(args[1]!)) : 0;
    const f = 10 ** digits;
    return Math.trunc(toNumber(args[0]!) * f) / f;
  },
  SIGN: (args) => Math.sign(toNumber(args[0]!)),
  EXP: (args) => Math.exp(toNumber(args[0]!)),
  LN: (args) => {
    const n = toNumber(args[0]!);
    if (n <= 0) throw ERR.NUM();
    return Math.log(n);
  },
  LOG: (args) => {
    const n = toNumber(args[0]!);
    const base = args.length > 1 ? toNumber(args[1]!) : 10;
    if (n <= 0 || base <= 0) throw ERR.NUM();
    return Math.log(n) / Math.log(base);
  },
  LOG10: (args) => {
    const n = toNumber(args[0]!);
    if (n <= 0) throw ERR.NUM();
    return Math.log10(n);
  },
  CEILING: (args) => {
    const n = toNumber(args[0]!);
    const sig = args.length > 1 ? toNumber(args[1]!) : 1;
    if (sig === 0) return 0;
    return Math.ceil(n / sig) * sig;
  },
  FLOOR: (args) => {
    const n = toNumber(args[0]!);
    const sig = args.length > 1 ? toNumber(args[1]!) : 1;
    if (sig === 0) throw ERR.DIV0();
    return Math.floor(n / sig) * sig;
  },
  PI: () => Math.PI,
  DEGREES: (args) => (toNumber(args[0]!) * 180) / Math.PI,
  RADIANS: (args) => (toNumber(args[0]!) * Math.PI) / 180,
  SIN: (args) => Math.sin(toNumber(args[0]!)),
  COS: (args) => Math.cos(toNumber(args[0]!)),
  TAN: (args) => Math.tan(toNumber(args[0]!)),
  ASIN: (args) => {
    const n = toNumber(args[0]!);
    if (n < -1 || n > 1) throw ERR.NUM();
    return Math.asin(n);
  },
  ACOS: (args) => {
    const n = toNumber(args[0]!);
    if (n < -1 || n > 1) throw ERR.NUM();
    return Math.acos(n);
  },
  ATAN: (args) => Math.atan(toNumber(args[0]!)),
  ATAN2: (args) => Math.atan2(toNumber(args[0]!), toNumber(args[1]!)),
  RAND: () => Math.random(),
  RANDBETWEEN: (args) => {
    const lo = Math.ceil(toNumber(args[0]!));
    const hi = Math.floor(toNumber(args[1]!));
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  },

  // ── Statistical ──────────────────────────────────────────────────────────
  MEDIAN: (args) => {
    const nums = numbersOf(args).sort((a, b) => a - b);
    if (nums.length === 0) throw ERR.NUM();
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 === 0 ? (nums[mid - 1]! + nums[mid]!) / 2 : nums[mid]!;
  },
  MODE: (args) => {
    const counts = new Map<number, number>();
    for (const n of numbersOf(args)) counts.set(n, (counts.get(n) ?? 0) + 1);
    let best: number | undefined;
    let bestCount = 0;
    for (const [value, count] of counts) {
      if (count > bestCount) {
        best = value;
        bestCount = count;
      }
    }
    if (bestCount <= 1) throw ERR.NA();
    return best!;
  },
  STDEV: (args) => varianceImpl(numbersOf(args), false, true),
  STDEVP: (args) => varianceImpl(numbersOf(args), true, true),
  VAR: (args) => varianceImpl(numbersOf(args), false, false),
  VARP: (args) => varianceImpl(numbersOf(args), true, false),
  LARGE: (args) => {
    const nums = numbersOf([args[0]!]).sort((a, b) => b - a);
    const k = Math.trunc(toNumber(args[1]!));
    if (k < 1 || k > nums.length) throw ERR.NUM();
    return nums[k - 1]!;
  },
  SMALL: (args) => {
    const nums = numbersOf([args[0]!]).sort((a, b) => a - b);
    const k = Math.trunc(toNumber(args[1]!));
    if (k < 1 || k > nums.length) throw ERR.NUM();
    return nums[k - 1]!;
  },
  COUNTBLANK: (args, ctx, nodes) => {
    const cells = nodeCells(nodes[0]!);
    let count = 0;
    for (const c of cells) {
      const v = ctx.getCellValue(c.sheet, c.row, c.column);
      if (v === null || v === '') count += 1;
    }
    return count;
  },
  RANK: (args, ctx, nodes) => {
    const value = toNumber(args[0]!);
    const nums = numbersOf([asMatrixArg(args, nodes, ctx, 1)]);
    const order = args.length > 2 ? Math.trunc(toNumber(args[2]!)) : 0;
    const sorted = [...nums].sort((a, b) => (order === 0 ? b - a : a - b));
    const index = sorted.indexOf(value);
    if (index === -1) throw ERR.NA();
    return index + 1;
  },

  // ── Text ────────────────────────────────────────────────────────────────
  FIND: (args) => {
    const needle = toText(args[0]!);
    const haystack = toText(args[1]!);
    const start = args.length > 2 ? Math.trunc(toNumber(args[2]!)) : 1;
    const index = haystack.indexOf(needle, start - 1);
    if (index === -1) throw ERR.VALUE();
    return index + 1;
  },
  SEARCH: (args) => {
    const needle = toText(args[0]!).toLowerCase();
    const haystack = toText(args[1]!).toLowerCase();
    const start = args.length > 2 ? Math.trunc(toNumber(args[2]!)) : 1;
    const index = haystack.indexOf(needle, start - 1);
    if (index === -1) throw ERR.VALUE();
    return index + 1;
  },
  SUBSTITUTE: (args) => {
    const text = toText(args[0]!);
    const oldText = toText(args[1]!);
    const newText = toText(args[2]!);
    if (oldText === '') return text;
    if (args.length > 3) {
      const instance = Math.trunc(toNumber(args[3]!));
      let count = 0;
      return text.replace(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (match) => {
        count += 1;
        return count === instance ? newText : match;
      });
    }
    return text.split(oldText).join(newText);
  },
  REPLACE: (args) => {
    const text = toText(args[0]!);
    const start = Math.trunc(toNumber(args[1]!));
    const length = Math.trunc(toNumber(args[2]!));
    const newText = toText(args[3]!);
    if (start < 1 || length < 0) throw ERR.VALUE();
    return text.slice(0, start - 1) + newText + text.slice(start - 1 + length);
  },
  REPT: (args) => {
    const count = Math.trunc(toNumber(args[1]!));
    if (count < 0) throw ERR.VALUE();
    return toText(args[0]!).repeat(count);
  },
  EXACT: (args) => toText(args[0]!) === toText(args[1]!),
  VALUE: (args) => {
    const v = args[0]!;
    if (typeof v === 'number') return v;
    const n = Number(toText(v));
    if (Number.isNaN(n)) throw ERR.VALUE();
    return n;
  },
  CHAR: (args) => String.fromCharCode(Math.trunc(toNumber(args[0]!))),
  CODE: (args) => toText(args[0]!).charCodeAt(0),

  // ── Information ─────────────────────────────────────────────────────────
  ISERR: (args) => args[0] instanceof FormulaError && args[0].value !== '#N/A',
  NA: () => ERR.NA(),
  N: (args) => {
    const v = args[0]!;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return 0;
  },

  // ── Logical ─────────────────────────────────────────────────────────────
  XOR: (args) => args.filter((a) => toBool(a)).length % 2 === 1,
  SWITCH: (args) => {
    const subject = args[0]!;
    for (let i = 1; i + 1 < args.length; i += 2) {
      if (looseEqual(args[i]!, subject)) return args[i + 1]!;
    }
    if (args.length % 2 === 0) return args[args.length - 1]!;
    throw ERR.NA();
  },
  TRUE: () => true,
  FALSE: () => false,

  // ── Date & time ─────────────────────────────────────────────────────────
  HOUR: (args) => fractionParts(toNumber(args[0]!)).hours,
  MINUTE: (args) => fractionParts(toNumber(args[0]!)).minutes,
  SECOND: (args) => fractionParts(toNumber(args[0]!)).seconds,
  TIME: (args) => {
    const h = toNumber(args[0]!);
    const m = toNumber(args[1]!);
    const s = toNumber(args[2]!);
    return ((h * 3600 + m * 60 + s) % 86400) / 86400;
  },
  WEEKDAY: (args) => {
    const serial = toNumber(args[0]!);
    const type = args.length > 1 ? Math.trunc(toNumber(args[1]!)) : 1;
    const dow = new Date(Math.round((serial - 25569) * 86400000)).getUTCDay(); // 0=Sun
    if (type === 2) return dow === 0 ? 7 : dow;
    if (type === 3) return dow;
    return dow + 1;
  },
  WEEKNUM: (args) => {
    const serial = toNumber(args[0]!);
    const days = Math.floor(serial) - 25569; // days since epoch
    const date = new Date(days * 86400000);
    const start = Date.UTC(date.getUTCFullYear(), 0, 1);
    return Math.floor((date.getTime() - start) / (7 * 86400000)) + 1;
  },
  EDATE: (args) => {
    const serial = toNumber(args[0]!);
    const months = Math.trunc(toNumber(args[1]!));
    const date = new Date(Math.round((serial - 25569) * 86400000));
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()) / 86400000 + 25569;
  },
  EOMONTH: (args) => {
    const serial = toNumber(args[0]!);
    const months = Math.trunc(toNumber(args[1]!));
    const date = new Date(Math.round((serial - 25569) * 86400000));
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0));
    return Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()) / 86400000 + 25569;
  },
  DAYS: (args) => Math.trunc(toNumber(args[0]!)) - Math.trunc(toNumber(args[1]!)),

  // ── Financial ───────────────────────────────────────────────────────────
  PMT: (args) => {
    const rate = toNumber(args[0]!);
    const nper = toNumber(args[1]!);
    const pv = toNumber(args[2]!);
    const fv = args.length > 3 ? toNumber(args[3]!) : 0;
    const type = args.length > 4 ? toNumber(args[4]!) : 0;
    if (nper === 0) throw ERR.DIV0();
    if (rate === 0) return -(pv + fv) / nper;
    const factor = (1 + rate) ** nper;
    return -(pv * factor + fv) * rate / ((factor - 1) * (1 + rate * type));
  },
  FV: (args) => {
    const rate = toNumber(args[0]!);
    const nper = toNumber(args[1]!);
    const pmt = toNumber(args[2]!);
    const pv = args.length > 3 ? toNumber(args[3]!) : 0;
    const type = args.length > 4 ? toNumber(args[4]!) : 0;
    if (rate === 0) return -(pv + pmt * nper);
    const factor = (1 + rate) ** nper;
    return -(pv * factor + pmt * (1 + rate * type) * ((factor - 1) / rate));
  },
  PV: (args) => {
    const rate = toNumber(args[0]!);
    const nper = toNumber(args[1]!);
    const pmt = toNumber(args[2]!);
    const fv = args.length > 3 ? toNumber(args[3]!) : 0;
    const type = args.length > 4 ? toNumber(args[4]!) : 0;
    if (rate === 0) return -(fv + pmt * nper);
    const factor = (1 + rate) ** nper;
    return -(fv + pmt * (1 + rate * type) * ((factor - 1) / rate)) / factor;
  },
  NPV: (args) => {
    const rate = toNumber(args[0]!);
    const cashflows = numbersOf(args.slice(1));
    let total = 0;
    for (let i = 0; i < cashflows.length; i++) {
      total += cashflows[i]! / (1 + rate) ** (i + 1);
    }
    return total;
  },
};

function cmpV(a: RuntimeValue, b: RuntimeValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const at = a === null ? '' : String(a);
  const bt = b === null ? '' : String(b);
  return at < bt ? -1 : at > bt ? 1 : 0;
}

function varianceImpl(nums: number[], population: boolean, sqrt: boolean): number {
  if (nums.length < (population ? 1 : 2)) throw ERR.DIV0();
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const ss = nums.reduce((acc, n) => acc + (n - mean) ** 2, 0);
  const denom = population ? nums.length : nums.length - 1;
  const v = ss / denom;
  return sqrt ? Math.sqrt(v) : v;
}

function fractionParts(serial: number): { hours: number; minutes: number; seconds: number } {
  const dayFraction = serial - Math.floor(serial);
  const totalSeconds = Math.round(dayFraction * 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds };
}

function looseEqual(a: RuntimeValue, b: RuntimeValue): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  try {
    return comparison('=', a, b);
  } catch {
    return false;
  }
}

function countMatching(args: RuntimeValue[], ctx: EvalContext, nodes: AstNode[]): number {
  const rangeCells = nodeCells(nodes[0]!);
  const match = parseCriteria(args[1]!);
  let count = 0;
  for (const c of rangeCells) {
    if (match(ctx.getCellValue(c.sheet, c.row, c.column))) count += 1;
  }
  return count;
}



