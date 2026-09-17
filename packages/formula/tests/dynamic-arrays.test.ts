import { describe, it, expect } from 'vitest';
import { isMatrix, type MatrixValue } from '../src/index.js';
import { evaluateStandalone } from '../src/index.js';

function evalExpr(expression: string, values: Record<string, unknown> = {}): unknown {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) raw[key] = value;
  const result = evaluateStandalone(expression, raw as never);
  if (isMatrix(result)) return result as MatrixValue;
  return result instanceof Error ? result.value : result;
}

describe('Dynamic array functions', () => {
  it('SEQUENCE builds a stepped matrix', () => {
    const m = evalExpr('SEQUENCE(3,2,10,5)') as MatrixValue;
    expect(m.rows).toBe(3);
    expect(m.columns).toBe(2);
    expect(m.values[0]).toEqual([10, 15]);
    expect(m.values[2]).toEqual([30, 35]);
  });

  it('UNIQUE dedupes rows', () => {
    const m = evalExpr('UNIQUE(SEQUENCE(1,1,1,1))') as MatrixValue;
    expect(m.rows).toBe(1);
  });

  it('TRANSPOSE flips dimensions', () => {
    const m = evalExpr('TRANSPOSE(SEQUENCE(3,2,1,1))') as MatrixValue;
    expect(m.rows).toBe(2);
    expect(m.columns).toBe(3);
    expect(m.values[0]).toEqual([1, 3, 5]);
  });

  it('SORT orders a matrix with order flag', () => {
    // build matrix via nested literals is unsupported; use SEQUENCE sorted desc
    const m = evalExpr('SORT(SEQUENCE(3,1,1,1),1,-1)') as MatrixValue;
    expect(m.values.map((r) => r[0])).toEqual([3, 2, 1]);
  });

  it('FILTER keeps matching rows', () => {
    // range rows 0..2 col 0 = 1,2,3; condition column rows 0..2 col 1
    const values = { '0,0': 1, '0,1': 0, '1,0': 2, '1,1': 1, '2,0': 3, '2,1': 1 };
    const m = evalExpr('FILTER(A1:B3, B1:B3)', values) as MatrixValue;
    expect(m.rows).toBe(2);
    expect(m.values[0]).toEqual([2, 1]);
    expect(m.values[1]).toEqual([3, 1]);
  });

  it('XLOOKUP finds exact matches and honors if_not_found', () => {
    const values = { '0,0': 'a', '0,1': 1, '1,0': 'b', '1,1': 2 };
    expect(evalExpr('XLOOKUP("b", A1:A2, B1:B2)', values)).toBe(2);
    expect(evalExpr('XLOOKUP("z", A1:A2, B1:B2, "none")', values)).toBe('none');
  });

  it('XMATCH returns the position', () => {
    const values = { '0,0': 'a', '1,0': 'b', '2,0': 'c' };
    expect(evalExpr('XMATCH("c", A1:A3)', values)).toBe(3);
  });

  it('LET binds names in scope', () => {
    expect(evalExpr('LET(x, 5, y, 3, x*y)')).toBe(15);
    expect(evalExpr('LET(rate, 0.08, amount, 100, amount*(1+rate))')).toBeCloseTo(108);
  });

  it('LET shadows names within scope only', () => {
    expect(evalExpr('LET(x, 2, x+10)')).toBe(12);
  });
});

