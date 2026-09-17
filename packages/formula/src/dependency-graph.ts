import type { AstNode } from './parser.js';
import { collectDependencies } from './parser.js';
import type { EvalContext, RuntimeValue } from './functions.js';
import { FUNCTIONS } from './functions.js';
import { FormulaError, ERR } from './errors.js';
import { isMatrix, type MatrixValue } from './matrix.js';

export interface CellAddress {
  sheet?: string;
  row: number;
  column: number;
}

/** Resolves defined names (ranges/constants) for the workbook (§26). */
export type NamesResolver = (name: string) => RuntimeValue;

/** Resolves structured table references: TableName, TableName[Column], Table[@Column] (§25). */
export interface TableResolutionContext {
  /** Sheet key the formula lives on (workbook-unique). */
  sheet: string;
  /** Row/column of the formula cell (for current-row item references). */
  row: number;
  column: number;
}

export type TableResolver = (
  table: string,
  column: string | undefined,
  item: boolean | undefined,
  context: TableResolutionContext,
) => RuntimeValue;

/** A rectangular dependency stored as a range (never expanded per cell). */
interface RangeDep {
  sheet: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
}

interface FormulaEntry {
  /** Owning sheet; refs inside the formula resolve against this sheet. */
  sheet: string;
  ast: AstNode;
  formula: string;
  value: RuntimeValue;
  dependents: Set<string>; // keys of formulas that depend on this formula
  precedents: Set<string>;
  ranges: RangeDep[];
  evaluating: boolean;
  /** Reads through a defined name / structured table (conservative invalidation). */
  opaqueDeps?: boolean;
}

function key(sheet: string | undefined, row: number, column: number, currentSheet: string): string {
  return `${sheet ?? currentSheet}!${row},${column}`;
}

/** Splits an internal "sheet!row,column" key back into its parts. */
function splitKey(k: string): [string, number, number] {
  const bang = k.lastIndexOf('!');
  const sheet = bang >= 0 ? k.slice(0, bang) : '';
  const [row, column] = k.slice(bang + 1).split(',');
  return [sheet, Number(row), Number(column)];
}

export type RawValueResolver = (
  sheet: string | undefined,
  row: number,
  column: number,
) => RuntimeValue;

/** Resource budgets so hostile or accidental inputs fail predictably (F02). */
export interface GraphBudgets {
  /** Maximum cells materialized from a single range argument. */
  maxRangeCells?: number;
  /** Maximum expression evaluation depth. */
  maxDepth?: number;
}

const DEFAULT_MAX_RANGE_CELLS = 2_000_000;
const DEFAULT_MAX_DEPTH = 1000;

/**
 * Dependency graph + incremental evaluator.
 * Recalculation propagates only through affected dependents; cycles are
 * detected via an evaluating flag and produce #CIRCULAR!. Values are
 * memoized per calculation pass: shared dependency branches evaluate once.
 */
export class DependencyGraph {
  private formulas = new Map<string, FormulaEntry>();
  /** sheet -> formulaKey -> range dependencies registered by that formula. */
  private rangesBySheet = new Map<string, Map<string, RangeDep[]>>();
  private currentSheet = '';
  private namesResolver: NamesResolver | undefined;
  private tableResolver: TableResolver | undefined;
  private letScopes: Map<string, RuntimeValue>[] = [];
  private depth = 0;
  private maxRangeCells: number;
  private maxDepth: number;
  /**
   * Cells whose cached value is stale (F02): the entry itself or one of its
   * transitive precedents changed. Evaluation recomputes exactly these.
   */
  private dirty = new Set<string>();
  /** Formulas with opaque (name/table) dependencies, workbook-wide. */
  private opaqueFormulas = new Set<string>();

  constructor(budgets: GraphBudgets = {}) {
    this.maxRangeCells = budgets.maxRangeCells ?? DEFAULT_MAX_RANGE_CELLS;
    this.maxDepth = budgets.maxDepth ?? DEFAULT_MAX_DEPTH;
  }

  setCurrentSheet(sheet: string): void {
    this.currentSheet = sheet;
  }

  setNamesResolver(resolver: NamesResolver | undefined): void {
    this.namesResolver = resolver;
  }

  setTableResolver(resolver: TableResolver | undefined): void {
    this.tableResolver = resolver;
  }

  /** Public evaluation context for ad-hoc evaluation (named formulas, worker). */
  createContext(sheet: string, getRaw: RawValueResolver): EvalContext {
    this.currentSheet = sheet;
    return this.buildContext(getRaw, new Set());
  }

  /** Register or update a formula at the given cell. */
  setFormula(sheet: string, row: number, column: number, formula: string, ast: AstNode): void {
    const k = key(sheet, row, column, sheet);
    const deps = collectDependencies(ast);
    const refs = deps.refs.map((r) => ({
      sheet: r.sheet ?? sheet,
      row: r.row,
      column: r.column,
    }));
    const refKeys = refs.map((r) => key(r.sheet, r.row, r.column, sheet));
    const rangeDeps: RangeDep[] = deps.ranges.map((r) => ({
      sheet: r.sheet ?? sheet,
      top: Math.min(r.start.row, r.end.row),
      left: Math.min(r.start.column, r.end.column),
      bottom: Math.max(r.start.row, r.end.row),
      right: Math.max(r.start.column, r.end.column),
    }));
    const existing = this.formulas.get(k);
    if (existing) {
      for (const p of existing.precedents) {
        this.formulas.get(p)?.dependents.delete(k);
      }
      this.unregisterRanges(k, existing.sheet);
    }
    const entry: FormulaEntry = {
      sheet,
      ast,
      formula,
      value: null,
      dependents: existing?.dependents ?? new Set(),
      precedents: new Set(refKeys),
      ranges: rangeDeps,
      evaluating: false,
      opaqueDeps: deps.opaque === true,
    };
    this.formulas.set(k, entry);
    if (deps.opaque === true) this.opaqueFormulas.add(k);
    else this.opaqueFormulas.delete(k);
    for (const p of refKeys) {
      // Precedents that are themselves formulas get this as dependent.
      this.formulas.get(p)?.dependents.add(k);
      // Precedents that don't exist yet: create a placeholder so later edits link.
      if (!this.formulas.has(p)) {
        const [pSheet] = splitKey(p);
        this.formulas.set(p, {
          sheet: pSheet,
          ast: { kind: 'number', value: 0 },
          formula: '',
          value: null,
          dependents: new Set([k]),
          precedents: new Set(),
          ranges: [],
          evaluating: false,
        });
      }
    }
    // Link formulas whose registered ranges contain this cell: they read it.
    const sheetRanges = this.rangesBySheet.get(sheet);
    if (sheetRanges) {
      for (const [ownerKey, ownerRanges] of sheetRanges) {
        if (ownerKey === k) continue;
        if (ownerRanges.some((range) => withinRange(range, row, column))) {
          this.formulas.get(ownerKey)?.dependents.add(k);
          entry.precedents.add(ownerKey);
        }
      }
    }
    if (rangeDeps.length > 0) {
      let bucket = this.rangesBySheet.get(sheet);
      if (!bucket) {
        bucket = new Map();
        this.rangesBySheet.set(sheet, bucket);
      }
      bucket.set(k, rangeDeps);
    }
    this.markDirty(k);
  }

  removeFormula(sheet: string, row: number, column: number): void {
    const k = key(sheet, row, column, sheet);
    const entry = this.formulas.get(k);
    if (!entry) return;
    for (const p of entry.precedents) {
      this.formulas.get(p)?.dependents.delete(k);
    }
    this.unregisterRanges(k, sheet);
    this.opaqueFormulas.delete(k);
    // Keep placeholder dependents chain: dependents of this cell keep pointing at placeholder.
    if (entry.formula) {
      // real formula removed: convert to placeholder if it has dependents
      if (entry.dependents.size > 0) {
        entry.formula = '';
        entry.ast = { kind: 'number', value: 0 };
        entry.value = null;
        entry.evaluating = false;
        entry.ranges = [];
        entry.opaqueDeps = false;
        this.markDirty(k);
        return;
      }
      this.formulas.delete(k);
    }
    this.dirty.delete(k);
  }

  /** Remove every registration of a removed worksheet so its formulas can never evaluate again (F11). */
  removeSheet(sheet: string): void {
    const doomed: string[] = [];
    for (const [k, entry] of this.formulas) {
      if (entry.sheet === sheet) doomed.push(k);
    }
    for (const k of doomed) {
      const entry = this.formulas.get(k);
      if (!entry) continue;
      for (const p of entry.precedents) {
        this.formulas.get(p)?.dependents.delete(k);
      }
      for (const d of entry.dependents) {
        this.formulas.get(d)?.precedents.delete(k);
      }
      this.unregisterRanges(k, entry.sheet);
      this.opaqueFormulas.delete(k);
      this.dirty.delete(k);
      this.formulas.delete(k);
    }
    this.rangesBySheet.delete(sheet);
  }

  private unregisterRanges(k: string, sheet: string): void {
    const bucket = this.rangesBySheet.get(sheet);
    if (!bucket) return;
    bucket.delete(k);
    if (bucket.size === 0) this.rangesBySheet.delete(sheet);
  }

  /**
   * Recalculate the formula at k and all transitive dependents. The `done`
   * set memoizes every formula computed during this pass so shared
   * dependency branches evaluate exactly once (F02).
   */
  private evaluate(k: string, getRaw: RawValueResolver, done: Set<string>): RuntimeValue {
    const entry = this.formulas.get(k);
    if (!entry) return null;
    if (done.has(k)) return entry.value;
    if (entry.evaluating) throw ERR.CIRCULAR();
    if (!entry.formula) return entry.value;
    // Incremental cache (F02): a clean entry's cached value is current
    // because every mutation path marks it (or a transitive precedent) dirty.
    // The cached hit still joins the pass's `done` set so the dependent
    // walk in evaluateWithDependents cannot loop through it forever.
    if (!this.dirty.has(k)) {
      done.add(k);
      return entry.value;
    }
    entry.evaluating = true;
    try {
      // Refs inside a formula resolve against the formula's OWN sheet, not
      // the sheet of the caller that triggered recalculation.
      const [, entryRow, entryColumn] = splitKey(k);
      const value = this.evaluateNode(
        entry.ast,
        this.buildContext(getRaw, done, entry.sheet, entryRow, entryColumn),
      );
      entry.value = value;
    } catch (e) {
      entry.value = e instanceof FormulaError ? e : ERR.VALUE();
    } finally {
      entry.evaluating = false;
      done.add(k);
      // The value is now current; invalidation restarts via markDirty.
      this.dirty.delete(k);
    }
    return entry.value;
  }

  /**
   * Mark the entry at `k` and its whole transitive dependent subgraph dirty
   * (F02): any of them may read the changed value on their next evaluation.
   * The visited set is separate from `dirty`: placeholder entries never
   * evaluate (so never clear their dirty flag) and must not stop the walk.
   */
  private markDirty(k: string): void {
    const visited = new Set<string>();
    const stack: string[] = [k];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      this.dirty.add(current);
      const entry = this.formulas.get(current);
      if (entry) for (const dependent of entry.dependents) stack.push(dependent);
    }
  }

  /**
   * Invalidate every formula with opaque (name/table) dependencies (F02):
   * defined names and table definitions are resolved dynamically, so their
   * add/remove/redefinition can change any of these formulas' results.
   */
  invalidateOpaqueFormulas(): void {
    for (const k of this.opaqueFormulas) this.markDirty(k);
  }

  /**
   * Notify the graph that a raw (non-formula) value changed at the cell, so
   * dependents and range/structured readers recompute (F02). Formulas whose
   * dependencies are opaque (names/tables) are invalidated workbook-wide.
   */
  notifyCellChange(sheet: string, row: number, column: number): void {
    const k = key(sheet, row, column, sheet);
    if (this.formulas.has(k)) this.markDirty(k);
    const bucket = this.rangesBySheet.get(sheet);
    if (bucket) {
      for (const [ownerKey, ranges] of bucket) {
        if (ownerKey === k) continue;
        if (ranges.some((range) => withinRange(range, row, column))) {
          this.markDirty(ownerKey);
        }
      }
    }
    for (const opaqueKey of this.opaqueFormulas) {
      if (opaqueKey !== k) this.markDirty(opaqueKey);
    }
  }

  /** Recalculate the formula at the cell, resolving refs through `getRaw` and registered formulas. */
  recalculate(sheet: string, row: number, column: number, getRaw: RawValueResolver): RuntimeValue {
    this.currentSheet = sheet;
    const k = key(sheet, row, column, sheet);
    return this.evaluateWithDependents(k, getRaw, new Set());
  }

  private buildContext(
    getRaw: RawValueResolver,
    done: Set<string>,
    sheet?: string,
    currentRow = 0,
    currentColumn = 0,
  ): EvalContext {
    const ownerSheet = sheet ?? this.currentSheet;
    return {
      currentSheet: ownerSheet,
      currentRow,
      currentColumn,
      getCellValue: (s, r, c) => {
        const k = key(s, r, c, ownerSheet);
        const entry = this.formulas.get(k);
        if (entry?.formula) return this.evaluate(k, getRaw, done);
        return getRaw(s ?? ownerSheet, r, c);
      },
      resolveName: (name) => {
        for (let i = this.letScopes.length - 1; i >= 0; i--) {
          const scope = this.letScopes[i]!;
          if (scope.has(name)) return scope.get(name)!;
        }
        if (this.namesResolver) return this.namesResolver(name);
        return ERR.NAME();
      },
      resolveTable: (table, column, item) => {
        if (this.tableResolver) {
          return this.tableResolver(table, column, item, {
            sheet: ownerSheet,
            row: currentRow,
            column: currentColumn,
          });
        }
        return ERR.NAME();
      },
    };
  }

  private evaluateWithDependents(k: string, getRaw: RawValueResolver, done: Set<string>): RuntimeValue {
    const value = this.evaluate(k, getRaw, done);
    const entry = this.formulas.get(k);
    if (entry) {
      for (const d of entry.dependents) {
        if (!done.has(d)) {
          this.evaluateWithDependents(d, getRaw, done);
        }
      }
    }
    return value;
  }

  /** Evaluate an AST node in a context. */
  evaluateNode(node: AstNode, ctx: EvalContext): RuntimeValue {
    if (this.depth >= this.maxDepth) throw ERR.CALC();
    this.depth += 1;
    try {
      return this.evaluateNodeInner(node, ctx);
    } finally {
      this.depth -= 1;
    }
  }

  private evaluateNodeInner(node: AstNode, ctx: EvalContext): RuntimeValue {
    switch (node.kind) {
      case 'number':
        return node.value;
      case 'string':
        return node.value;
      case 'boolean':
        return node.value;
      case 'error':
        return new FormulaError(node.value as FormulaError['value']);
      case 'ref':
        return ctx.getCellValue(node.sheet ?? ctx.currentSheet, node.row, node.column);
      case 'range': {
        // A range as a scalar uses the top-left cell (common in simple formulas).
        return ctx.getCellValue(node.sheet ?? ctx.currentSheet, node.start.row, node.start.column);
      }
      case 'name':
        return ctx.resolveName ? ctx.resolveName(node.name) : ERR.NAME();
      case 'structured':
        return ctx.resolveTable
          ? ctx.resolveTable(node.table, node.column, node.item, {
              sheet: ctx.currentSheet ?? '',
              row: ctx.currentRow ?? 0,
              column: ctx.currentColumn ?? 0,
            })
          : ERR.NAME();
      case 'unary': {
        const v = this.evaluateNode(node.operand, ctx);
        const n = typeof v === 'number' ? v : Number(v ?? 0);
        if (Number.isNaN(n)) throw ERR.VALUE();
        return node.op === '-' ? -n : n;
      }
      case 'percent': {
        const v = this.evaluateNode(node.operand, ctx);
        return (typeof v === 'number' ? v : Number(v ?? 0)) / 100;
      }
      case 'binary':
        return this.evaluateBinary(node, ctx);
      case 'call': {
        if (node.name === 'LET') {
          return this.evaluateLet(node, ctx);
        }
        if (node.name === 'IF' || node.name === 'IFS' || node.name === 'SWITCH' || node.name === 'CHOOSE') {
          return this.evaluateLazyCall(node, ctx);
        }
        const fn = FUNCTIONS[node.name];
        if (!fn) throw ERR.NAME();
        const args: RuntimeValue[] = [];
        let firstError: FormulaError | undefined;
        for (const argNode of node.args) {
          let value: RuntimeValue;
          try {
            value = this.evaluateNode(argNode, ctx);
          } catch (e) {
            if (e instanceof FormulaError) value = e;
            else throw e;
          }
          // Range arguments expand to matrices so aggregates and array
          // functions see every cell (SUM(A1:A3), FILTER(A1:B3), ...).
          // Scalar refs stay scalar so scalar functions like ABS(A1) and
          // ISNUMBER(A1) receive the cell's value, not a wrapper object.
          if (argNode.kind === 'range' && !isMatrix(value)) {
            value = this.matrixFromRangeNode(argNode, ctx);
          }
          if (value instanceof FormulaError && !firstError) firstError = value;
          // Errors inside matrix arguments must propagate to the caller too.
          if (isMatrix(value) && !firstError) {
            outer: for (const row of value.values) {
              for (const v of row) {
                if (v instanceof FormulaError) {
                  firstError = v;
                  break outer;
                }
              }
            }
          }
          args.push(value);
        }
        // Errors propagate to the cell unless the function is error-tolerant.
        const tolerant = DependencyGraph.ERROR_TOLERANT.has(node.name);
        if (firstError && !tolerant) return firstError;
        return fn(args, ctx, node.args);
      }
      default:
        throw ERR.VALUE();
    }
  }

  /** Error-tolerant functions receive FormulaError args instead of propagating. */
  private static ERROR_TOLERANT = new Set([
    'IFERROR', 'IFNA', 'ISERROR', 'ISERR', 'ISNA', 'ISNUMBER', 'ISTEXT', 'ISBLANK', 'COUNTA',
  ]);

  /** Short-circuit evaluation for branch functions (IF, IFS, SWITCH, CHOOSE). */
  private evaluateLazyCall(
    node: Extract<AstNode, { kind: 'call' }>,
    ctx: EvalContext,
  ): RuntimeValue {
    const evalNode = (arg: AstNode): RuntimeValue => {
      try {
        return this.evaluateNode(arg, ctx);
      } catch (e) {
        if (e instanceof FormulaError) return e;
        throw e;
      }
    };
    switch (node.name) {
      case 'IF': {
        const condition = evalNode(node.args[0] ?? { kind: 'boolean', value: false });
        if (condition instanceof FormulaError) return condition;
        if (condition === true || (typeof condition === 'number' && condition !== 0)) {
          return node.args[1] ? evalNode(node.args[1]) : true;
        }
        return node.args[2] ? evalNode(node.args[2]) : false;
      }
      case 'IFS': {
        for (let i = 0; i + 1 < node.args.length; i += 2) {
          const condition = evalNode(node.args[i]!);
          if (condition instanceof FormulaError) return condition;
          if (condition === true || (typeof condition === 'number' && condition !== 0)) {
            return evalNode(node.args[i + 1]!);
          }
        }
        throw ERR.NA();
      }
      case 'SWITCH': {
        const subject = evalNode(node.args[0] ?? { kind: 'string', value: '' });
        if (subject instanceof FormulaError) return subject;
        for (let i = 1; i + 1 < node.args.length; i += 2) {
          const candidate = evalNode(node.args[i]!);
          if (candidate instanceof FormulaError) return candidate;
          if (looseEqualValues(candidate, subject)) return evalNode(node.args[i + 1]!);
        }
        if (node.args.length % 2 === 0) return evalNode(node.args[node.args.length - 1]!);
        throw ERR.NA();
      }
      case 'CHOOSE': {
        const indexValue = evalNode(node.args[0] ?? { kind: 'number', value: 0 });
        if (indexValue instanceof FormulaError) return indexValue;
        const index = Math.trunc(typeof indexValue === 'number' ? indexValue : 0);
        if (index < 1 || index >= node.args.length) throw ERR.VALUE();
        return evalNode(node.args[index]!);
      }
      default:
        throw ERR.VALUE();
    }
  }

  private matrixFromRangeNode(node: Extract<AstNode, { kind: 'range' } | { kind: 'ref' }>, ctx: EvalContext): MatrixValue {
    if (node.kind === 'ref') {
      return { kind: 'matrix', rows: 1, columns: 1, values: [[ctx.getCellValue(node.sheet ?? ctx.currentSheet, node.row, node.column)]] };
    }
    const rows = node.end.row - node.start.row + 1;
    const columns = node.end.column - node.start.column + 1;
    if (rows > 0 && columns > 0 && rows * columns > this.maxRangeCells) {
      throw ERR.CALC();
    }
    const values: RuntimeValue[][] = [];
    for (let r = node.start.row; r <= node.end.row; r++) {
      const row: RuntimeValue[] = [];
      for (let c = node.start.column; c <= node.end.column; c++) {
        row.push(ctx.getCellValue(node.sheet ?? ctx.currentSheet, r, c));
      }
      values.push(row);
    }
    return { kind: 'matrix', rows: values.length, columns: values[0]?.length ?? 0, values };
  }

  /** LET(name1, value1, ..., calculation) with scoped name bindings (§26). */
  private evaluateLet(
    node: Extract<AstNode, { kind: 'call' }>,
    ctx: EvalContext,
  ): RuntimeValue {
    const scope = new Map<string, RuntimeValue>();
    this.letScopes.push(scope);
    try {
      for (let i = 0; i + 1 < node.args.length - 1; i += 2) {
        const nameNode = node.args[i]!;
        if (nameNode.kind !== 'name') throw ERR.VALUE();
        scope.set(nameNode.name, this.evaluateNode(node.args[i + 1]!, ctx));
      }
      const last = node.args[node.args.length - 1]!;
      return this.evaluateNode(last, ctx);
    } finally {
      this.letScopes.pop();
    }
  }

  private evaluateBinary(node: Extract<AstNode, { kind: 'binary' }>, ctx: EvalContext): RuntimeValue {
    const { op } = node;
    if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
      const a = this.evaluateNode(node.left, ctx);
      const b = this.evaluateNode(node.right, ctx);
      return compareValues(op, a, b);
    }
    if (op === '&') {
      const a = this.evaluateNode(node.left, ctx);
      const b = this.evaluateNode(node.right, ctx);
      if (a instanceof FormulaError) throw a;
      if (b instanceof FormulaError) throw b;
      return stringify(a) + stringify(b);
    }
    const a = this.evaluateNode(node.left, ctx);
    const b = this.evaluateNode(node.right, ctx);
    if (a instanceof FormulaError) throw a;
    if (b instanceof FormulaError) throw b;
    const na = toNumeric(a);
    const nb = toNumeric(b);
    switch (op) {
      case '+': return na + nb;
      case '-': return na - nb;
      case '*': return na * nb;
      case '/':
        if (nb === 0) throw ERR.DIV0();
        return na / nb;
      case '^': return na ** nb;
      default: throw ERR.VALUE();
    }
  }

  /** Cached value of a formula cell (without recalculation). */
  /** Remove all formula registrations (used before bulk re-registration). */
  clear(): void {
    this.formulas.clear();
    this.rangesBySheet.clear();
    this.dirty.clear();
    this.opaqueFormulas.clear();
    this.depth = 0;
  }

  cachedValue(sheet: string, row: number, column: number): RuntimeValue {
    return this.formulas.get(key(sheet, row, column, sheet))?.value ?? null;
  }

  get formulaCount(): number {
    let count = 0;
    for (const e of this.formulas.values()) if (e.formula) count += 1;
    return count;
  }
}

function withinRange(range: RangeDep, row: number, column: number): boolean {
  return (
    row >= range.top && row <= range.bottom &&
    column >= range.left && column <= range.right
  );
}

function stringify(v: RuntimeValue): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isMatrix(v)) return '';
  return String(v);
}

function looseEqualValues(a: RuntimeValue, b: RuntimeValue): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  const na = typeof a === 'number' ? a : undefined;
  const nb = typeof b === 'number' ? b : undefined;
  if (na !== undefined && nb !== undefined) return na === nb;
  return String(a) === String(b);
}

function toNumeric(v: RuntimeValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === '') return 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw ERR.VALUE();
  return n;
}

function compareValues(op: string, a: RuntimeValue, b: RuntimeValue): boolean {
  if (a instanceof FormulaError) throw a;
  if (b instanceof FormulaError) throw b;
  let left: RuntimeValue = a;
  let right: RuntimeValue = b;
  if (typeof left === 'number' || typeof right === 'number') {
    try {
      left = toNumeric(left);
      right = toNumeric(right);
    } catch {
      left = stringify(a);
      right = stringify(b);
    }
  }
  if (typeof left === 'string' && typeof right === 'string') {
    const c = left.localeCompare(right);
    switch (op) {
      case '=': return c === 0;
      case '<>': return c !== 0;
      case '<': return c < 0;
      case '>': return c > 0;
      case '<=': return c <= 0;
      case '>=': return c >= 0;
      default: return false;
    }
  }
  const ln = toNumeric(left);
  const rn = toNumeric(right);
  switch (op) {
    case '=': return ln === rn;
    case '<>': return ln !== rn;
    case '<': return ln < rn;
    case '>': return ln > rn;
    case '<=': return ln <= rn;
    case '>=': return ln >= rn;
    default: return false;
  }
}
