import { describe, it, expect } from 'vitest';
import { createGrid } from '@ezygrid/core';

describe('self-reference and dependent cycles', () => {
  it('self-referencing formula yields #CIRCULAR! without overflowing', () => {
    const g = createGrid(undefined, { worksheets: [{ name: 'S' }] });
    const ws = g.worksheets[0];
    ws.setValue(0, 0, 10);
    expect(() => ws.setValue(0, 0, '=A1*3')).not.toThrow();
    expect(ws.getValue(0, 0)).toBe('#CIRCULAR!');
  });

  it('two-formula cycle yields #CIRCULAR! without overflowing', () => {
    const g = createGrid(undefined, { worksheets: [{ name: 'S' }] });
    const ws = g.worksheets[0];
    ws.setValue(0, 0, '=B1+1');
    ws.setValue(0, 1, '=A1+1');
    expect(ws.getValue(0, 0)).toBe('#CIRCULAR!');
  });
});
