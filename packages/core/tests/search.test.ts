import { describe, it, expect } from 'vitest';
import { createGrid, SearchService } from '../src/index.js';

describe('SearchService', () => {
  it('finds values in row-major order', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [['alpha', 'beta'], ['gamma', 'alpha-ish']] }],
    });
    const ws = wb.activeWorksheet;
    const results = new SearchService().find(ws, 'alpha');
    expect(results.map((r) => `${r.row},${r.column}`)).toEqual(['0,0', '1,1']);
  });

  it('match case and whole cell options', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [['Foo'], ['foo'], ['Foo bar']] }],
    });
    const ws = wb.activeWorksheet;
    const caseSensitive = new SearchService().find(ws, 'Foo', { matchCase: true });
    expect(caseSensitive.map((r) => r.row)).toEqual([0, 2]);
    const whole = new SearchService().find(ws, 'foo', { wholeCell: true, matchCase: true });
    expect(whole.map((r) => r.row)).toEqual([1]);
  });

  it('searches formula text optionally', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[5], ['=A1*2']] }] });
    const ws = wb.activeWorksheet;
    const byValue = new SearchService().find(ws, '10');
    expect(byValue.map((r) => r.row)).toEqual([1]);
    const byFormula = new SearchService().find(ws, 'A1', { searchFormulas: true });
    expect(byFormula.map((r) => r.row)).toEqual([1]);
  });

  it('findNext wraps around', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [['x'], ['x'], ['x']] }],
    });
    const ws = wb.activeWorksheet;
    const search = new SearchService();
    const first = search.findNext(ws, 'x', { row: 0, column: 0 });
    expect(first?.row).toBe(1);
    const wrapped = search.findNext(ws, 'x', { row: 2, column: 0 });
    expect(wrapped?.row).toBe(0);
  });
});
