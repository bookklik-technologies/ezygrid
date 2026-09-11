import { describe, it, expect } from 'vitest';
import { FUNCTIONS } from '../src/index.js';
import type { EvalContext, RuntimeValue } from '../src/index.js';

function call(name: string, args: RuntimeValue[]): unknown {
  const fn = FUNCTIONS[name]!;
  const ctx: EvalContext = {
    currentSheet: 'Sheet1',
    getCellValue: () => null,
  };
  return fn(args, ctx, []);
}

describe('Tier-A function library', () => {
  it('aggregates numbers, ignoring blanks and non-numeric text', () => {
    expect(call('SUM', [1, 2, 3, null, 'x'])).toBe(6);
    expect(call('AVERAGE', [2, 4, 6])).toBe(4);
    expect(call('MIN', [3, 1, 2])).toBe(1);
    expect(call('MAX', [3, 1, 2])).toBe(3);
    expect(call('COUNT', [1, 'a', true, null])).toBe(2);
    expect(call('COUNTA', [1, 'a', true, null, ''])).toBe(3);
  });

  it('logic functions', () => {
    expect(call('IF', [true, 'yes', 'no'])).toBe('yes');
    expect(call('IF', [false, 'yes', 'no'])).toBe('no');
    expect(call('IFS', [false, 1, true, 2])).toBe(2);
    expect(call('AND', [true, 1])).toBe(true);
    expect(call('AND', [true, 0])).toBe(false);
    expect(call('OR', [false, 1])).toBe(true);
    expect(call('NOT', [false])).toBe(true);
  });

  it('rounding and math', () => {
    expect(call('ROUND', [2.345, 2])).toBeCloseTo(2.35);
    expect(call('ROUNDUP', [2.301, 1])).toBeCloseTo(2.4);
    expect(call('ROUNDDOWN', [2.399, 1])).toBeCloseTo(2.3);
    expect(call('ABS', [-5])).toBe(5);
    expect(call('MOD', [7, 3])).toBe(1);
    expect(call('POWER', [2, 10])).toBe(1024);
    expect(call('SQRT', [9])).toBe(3);
  });

  it('text functions', () => {
    expect(call('CONCAT', ['a', 'b', 'c'])).toBe('abc');
    expect(call('TEXTJOIN', ['-', true, 'a', '', 'b'])).toBe('a-b');
    expect(call('LEFT', ['hello', 2])).toBe('he');
    expect(call('RIGHT', ['hello', 2])).toBe('lo');
    expect(call('MID', ['hello', 2, 3])).toBe('ell');
    expect(call('LEN', ['hello'])).toBe(5);
    expect(call('TRIM', ['  a   b  '])).toBe('a b');
    expect(call('UPPER', ['aBc'])).toBe('ABC');
    expect(call('LOWER', ['aBc'])).toBe('abc');
  });

  it('date functions', () => {
    // DATE(2026,1,15) -> Excel serial
    expect(call('DATE', [2026, 1, 15])).toBeCloseTo(46037, 0);
    expect(call('YEAR', [46037])).toBe(2026);
    expect(call('MONTH', [46037])).toBe(1);
    expect(call('DAY', [46037])).toBe(15);
  });

  it('error handling functions', () => {
    expect(call('IFERROR', [1, 'fallback'])).toBe(1);
    expect(call('ISBLANK', [null])).toBe(true);
    expect(call('ISNUMBER', [5])).toBe(true);
    expect(call('ISTEXT', ['x'])).toBe(true);
  });

  it('throws typed errors', () => {
    expect(() => call('SQRT', [-1])).toThrow();
    expect(() => call('MOD', [1, 0])).toThrow();
    expect(() => call('AVERAGE', [])).toThrow();
  });
});
