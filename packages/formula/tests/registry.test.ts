import { describe, it, expect } from 'vitest';
import { formulaRegistry, FUNCTIONS, evaluateStandalone } from '../src/index.js';
import type { FunctionImpl } from '../src/index.js';

describe('Formula registry (§14.7)', () => {
  it('registers custom functions with metadata', () => {
    formulaRegistry.register({
      name: 'MYFUNC',
      category: 'Custom',
      description: 'Doubles a number',
      signature: 'MYFUNC(value)',
      evaluate: (args: Parameters<FunctionImpl>[0]) => Number(args[0] ?? 0) * 2,
    });
    expect(FUNCTIONS.MYFUNC).toBeDefined();
    const meta = formulaRegistry.get('MYFUNC');
    expect(meta?.category).toBe('Custom');
    expect(formulaRegistry.suggest('MYFUNC').map((m) => m.name)).toContain('MYFUNC');
    formulaRegistry.unregister('MYFUNC');
    expect(formulaRegistry.get('MYFUNC')).toBeUndefined();
  });

  it('suggests functions by prefix', () => {
    const suggestions = formulaRegistry.suggest('SU');
    expect(suggestions.map((m) => m.name)).toContain('SUM');
    expect(suggestions.map((m) => m.name)).toContain('SUBSTITUTE');
    const exact = formulaRegistry.suggest('ROUND');
    expect(exact[0]!.name).toBe('ROUND');
  });

  it('custom functions evaluate through the graph', () => {
    formulaRegistry.register({
      name: 'DOUBLE',
      evaluate: (args) => Number(args[0] ?? 0) * 2,
    });
    expect(evaluateStandalone('DOUBLE(21)', {})).toBe(42);
    formulaRegistry.unregister('DOUBLE');
  });
});

describe('Calculation worker (§14.4)', () => {
  it('evaluates formulas against a flat values payload', () => {
    const values = { '0,0': 10, '1,0': 20 };
    expect(evaluateStandalone('A1+A2', values as never)).toBe(30);
  });

  it('returns typed errors without throwing', () => {
    const result = evaluateStandalone('1/0', {});
    expect(result instanceof Error ? result.value : result).toBe('#DIV/0!');
  });

  it('evaluates dynamic arrays for transport', () => {
    const result = evaluateStandalone('SEQUENCE(2,2,1,1)', {});
    expect((result as { kind: string }).kind).toBe('matrix');
  });
});

