import { describe, it, expect } from 'vitest';
import { Parser, DependencyGraph, FormulaError } from '../src/index.js';

const nullRaw = () => null;

describe('DependencyGraph evaluation', () => {
  it('evaluates arithmetic and functions', () => {
    const g = new DependencyGraph();
    const raw = (_sheet: unknown, row: number, column: number) => {
      const values: Record<string, unknown> = { '0,0': 10, '1,0': 20 };
      return (values[`${row},${column}`] ?? null) as never;
    };
    g.setCurrentSheet('Sheet1');
    g.setFormula('Sheet1', 2, 0, '=A1+A2', Parser.parse('A1+A2'));
    expect(g.recalculate('Sheet1', 2, 0, raw)).toBe(30);
  });

  it('propagates recalculation through dependents', () => {
    const g = new DependencyGraph();
    let a1 = 1;
    const raw = () => a1 as never;
    g.setFormula('Sheet1', 1, 0, '=A1*2', Parser.parse('A1*2'));
    g.setFormula('Sheet1', 2, 0, '=A2+1', Parser.parse('A2+1'));
    expect(g.recalculate('Sheet1', 2, 0, raw)).toBe(3);
    a1 = 5;
    // Incremental evaluation contract (F02): external raw changes must be
    // notified so dependents recompute; the workbook does this on setValue.
    g.notifyCellChange('Sheet1', 0, 0);
    expect(g.recalculate('Sheet1', 2, 0, raw)).toBe(11);
  });

  it('detects circular references', () => {
    const g = new DependencyGraph();
    g.setFormula('Sheet1', 0, 0, '=B1', Parser.parse('B1'));
    g.setFormula('Sheet1', 0, 1, '=A1', Parser.parse('A1'));
    const v = g.recalculate('Sheet1', 0, 1, nullRaw);
    expect(v instanceof FormulaError && v.value === '#CIRCULAR!').toBe(true);
  });

  it('produces #DIV/0! and #NAME? errors', () => {
    const g = new DependencyGraph();
    g.setFormula('Sheet1', 0, 0, '=1/0', Parser.parse('1/0'));
    expect((g.recalculate('Sheet1', 0, 0, nullRaw) as FormulaError).value).toBe('#DIV/0!');
    g.setFormula('Sheet1', 1, 0, '=NOSUCHFN(1)', Parser.parse('NOSUCHFN(1)'));
    expect((g.recalculate('Sheet1', 1, 0, nullRaw) as FormulaError).value).toBe('#NAME?');
  });
});
