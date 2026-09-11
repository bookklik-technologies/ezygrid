import { Parser } from './parser.js';
import type { RuntimeValue } from './functions.js';
import { DependencyGraph } from './dependency-graph.js';
import type { MatrixValue } from './matrix.js';
import { isMatrix } from './matrix.js';

export interface CalcRequest {
  id: number;
  /** Formula body without the leading "=". */
  expression: string;
  /** Cell values keyed "row,column" (raw values of the source sheet). */
  values: Record<string, RuntimeValue>;
}

export interface CalcResponse {
  id: number;
  /** Scalar result or spilled matrix values. */
  result: RuntimeValue;
  matrix?: { rows: number; columns: number; values: RuntimeValue[][] };
}

/**
 * Standalone formula evaluation used by the calculation worker (§14.4).
 * Transport-efficient: only the values a formula needs are shipped.
 */
export function evaluateStandalone(expression: string, values: Record<string, RuntimeValue>): RuntimeValue {
  const graph = new DependencyGraph();
  graph.setCurrentSheet('Sheet1');
  // Register the formula away from the value grid to avoid self-reference.
  const anchorRow = 9999;
  const anchorColumn = 9999;
  graph.setFormula('Sheet1', anchorRow, anchorColumn, `=${expression}`, Parser.parse(expression));
  return graph.recalculate('Sheet1', anchorRow, anchorColumn, (_sheet, row, column) =>
    values[`${row},${column}`] ?? null,
  );
}

/** Shape a matrix result for transport. */
export function shapeResult(result: RuntimeValue): CalcResponse['matrix'] | undefined {
  if (isMatrix(result)) {
    const m = result as MatrixValue;
    return { rows: m.rows, columns: m.columns, values: m.values };
  }
  return undefined;
}
