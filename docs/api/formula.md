# @ezygrid/formula

Excel-compatible formula engine: lexer → parser → AST → dependency graph → evaluator, plus a function library and registry. No `eval()` anywhere.

## Errors

```ts
type FormulaErrorValue =
  | '#NULL!' | '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?'
  | '#NUM!' | '#N/A' | '#SPILL!' | '#CALC!' | '#CIRCULAR!';

class FormulaError extends Error { value: FormulaErrorValue }
const ERR = { NULL, DIV0, VALUE, REF, NAME, NUM, NA, SPILL, CALC, CIRCULAR };
```

## Lexer & parser

```ts
tokenize(input: string): Token[];
```

```ts
type AstNode =
  | { kind: 'number' | 'string' | 'boolean' | 'error' | 'name'; ... }
  | { kind: 'ref'; sheet?: string; row: number; column: number; ... }
  | { kind: 'range'; ... }
  | { kind: 'structured'; table: string; column?: string; item?: string }
  | { kind: 'call'; name: string; args: AstNode[] }
  | { kind: 'unary' | 'binary' | 'percent'; ... };

collectDependencies(node: AstNode): FormulaDependencies;
collectRefs(node: AstNode): ...;
```

Parser is recursive-descent; precedence: comparison → `&` → `+ -` → `* /` → `^` → unary → `%`.

## Runtime

```ts
type RuntimeValue = number | string | boolean | FormulaError | null | MatrixValue;

interface EvalContext {
  getCellValue(sheet: string | undefined, row: number, column: number): RuntimeValue;
  resolveName?(name: string): RuntimeValue | undefined;
  resolveTable?(table: string, column?: string, item?: string): RuntimeValue;
  currentSheet?: string;
  currentRow?: number;
  currentColumn?: number;
}

type FunctionImpl = (args: RuntimeValue[], ctx: EvalContext, nodes: AstNode[]) => RuntimeValue;
const FUNCTIONS: Record<string, FunctionImpl>;  // 99 built-ins
```

## Dependency graph

```ts
class DependencyGraph {
  constructor(budgets?: { maxRangeCells?: number; maxDepth?: number }); // 2,000,000 / 1000
  setCurrentSheet(sheet: string): void;
  setNamesResolver(resolver: ...): void;
  setTableResolver(resolver: ...): void;
  createContext(sheet: string, getRaw: ...): void;
  setFormula(sheet: string, row: number, column: number, formula: string, ast: AstNode): void;
  removeFormula(sheet: string, row: number, column: number): void;
  removeSheet(sheet: string): void;
  invalidateOpaqueFormulas(): void;
  notifyCellChange(sheet: string, row: number, column: number): void;
  recalculate(sheet: string, row: number, column: number, getRaw: ...): RuntimeValue;
  evaluateNode(node: AstNode, ctx: EvalContext): RuntimeValue;
  clear(): void;
  cachedValue(...): ...;
  get formulaCount(): number;
}
```

- Range dependencies stored as rectangles, never per-cell
- Incremental dirty-set recalculation with per-pass memoization
- Cycle detection during evaluation → `#CIRCULAR!`
- Budgets bound range expansion and dependency depth

## Function registry

```ts
interface FunctionMeta {
  name: string; category: string;
  description?: string; signature?: string; volatile?: boolean;
}

formulaRegistry.register({ name, evaluate, category?, description?, signature?, volatile? }): void;
formulaRegistry.unregister(name: string): void;
formulaRegistry.get(name: string): FunctionMeta | undefined;
formulaRegistry.all(): FunctionMeta[];
formulaRegistry.suggest(prefix: string, limit?: number): FunctionMeta[]; // default 10
```

Registry functions override built-ins of the same name and power editor autocomplete.

## Matrices

```ts
interface MatrixValue { kind: 'matrix'; rows: number; columns: number; values: RuntimeValue[][] }
matrix(values: RuntimeValue[][]): MatrixValue;
isMatrix(value: unknown): value is MatrixValue;
flatten(matrix: MatrixValue): RuntimeValue[];
scalarOf(matrix: MatrixValue): RuntimeValue;
matrixFromCells(...): MatrixValue;
```

## Worker

`@ezygrid/formula/worker-main` is a ready-made Web Worker entry:

```ts
// request
{ id: string; expression: string; values: Record<string, RuntimeValue> } // keys "row,column"
// response
{ id: string; result: RuntimeValue; matrix?: unknown }
```

`evaluateStandalone(expression, values)` evaluates an expression against a plain values map on the main thread.
