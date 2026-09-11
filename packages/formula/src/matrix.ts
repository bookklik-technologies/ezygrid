import type { RuntimeValue } from './functions.js';
import { FormulaError } from './errors.js';

/** Matrix value produced by dynamic-array functions and named ranges. */
export interface MatrixValue {
  kind: 'matrix';
  rows: number;
  columns: number;
  values: RuntimeValue[][];
}

export function matrix(values: RuntimeValue[][]): MatrixValue {
  return { kind: 'matrix', rows: values.length, columns: values[0]?.length ?? 0, values };
}

export function isMatrix(v: unknown): v is MatrixValue {
  return typeof v === 'object' && v !== null && (v as MatrixValue).kind === 'matrix';
}

/** Flatten a value into a list of scalars (matrices are traversed row-major). */
export function flatten(v: RuntimeValue): RuntimeValue[] {
  if (isMatrix(v)) {
    const out: RuntimeValue[] = [];
    for (const row of v.values) for (const item of row) out.push(item);
    return out;
  }
  return [v];
}

export function matrixFromCells(cells: RuntimeValue[][]): MatrixValue {
  return matrix(cells);
}

/** Coerce a scalar; matrices must be single-element to be usable as scalars. */
export function scalarOf(v: RuntimeValue): RuntimeValue {
  if (isMatrix(v)) {
    if (v.rows === 1 && v.columns === 1) return v.values[0]![0]!;
    throw new FormulaError('#VALUE!');
  }
  return v;
}
