import { describe, it, expect } from 'vitest';
import { transformFormula, transformRefToken, transformAddress } from '../src/index.js';

describe('Reference Transform Engine', () => {
  const insertRow = { kind: 'row' as const, at: 2, delta: 1 };

  it('shifts relative refs below the insertion point', () => {
    expect(transformFormula('A3+B4', insertRow)).toBe('A4+B5');
  });

  it('leaves refs above the insertion point untouched', () => {
    expect(transformFormula('A1+B2', insertRow)).toBe('A1+B2');
  });

  it('shifts absolute rows during structural edits (unlike copy offsets)', () => {
    expect(transformFormula('A$3', insertRow)).toBe('A$4');
    expect(transformFormula('$A3', insertRow)).toBe('$A4');
  });

  it('handles ranges', () => {
    expect(transformFormula('SUM(B2:B10)', insertRow)).toBe('SUM(B2:B11)');
  });

  it('turns deleted refs into #REF!', () => {
    const deleteRow = { kind: 'row' as const, at: 3, delta: -1 };
    expect(transformFormula('A4+A1', deleteRow)).toBe('#REF!+A1');
  });

  it('collapses ranges whose endpoint is deleted', () => {
    const deleteRow = { kind: 'row' as const, at: 3, delta: -1 };
    expect(transformFormula('SUM(A2:A4)', deleteRow)).toBe('SUM(A2)');
  });

  it('works on columns', () => {
    const insertCol = { kind: 'column' as const, at: 1, delta: 2 };
    expect(transformFormula('B1+C1', insertCol)).toBe('D1+E1');
    expect(transformFormula('$B1', insertCol)).toBe('$D1');
  });

  it('ignores function names and string literals', () => {
    expect(transformFormula('SUM(A3,"LOG10")', insertRow)).toBe('SUM(A4,"LOG10")');
    expect(transformFormula('LOG10(A3)', insertRow)).toBe('LOG10(A4)');
  });

  it('transformRefToken endpoint behaviors', () => {
    expect(transformRefToken('A2:B4', insertRow)).toBe('A2:B5');
  });

  it('transformAddress shifts a plain address', () => {
    expect(transformAddress('A3', insertRow)).toBe('A4');
  });
});
