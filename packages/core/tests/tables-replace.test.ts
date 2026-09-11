import { describe, it, expect } from 'vitest';
import { createGrid, replace, replaceAll } from '../src/index.js';

describe('Structured tables (§25)', () => {
  it('creates tables with unique names and extracted columns', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 50, columns: 10, data: [['Region', 'Sales'], ['North', 10], ['South', 20]] }],
    });
    const ws = wb.activeWorksheet;
    ws.addTable({ name: 'SalesTable', range: 'A1:B3' });
    const table = ws.getTable('SalesTable')!;
    expect(table.name).toBe('SalesTable');
    expect(table.columns.map((c) => c.name)).toEqual(['Region', 'Sales']);
    expect(() => ws.addTable({ name: 'SalesTable', range: 'A1:B3' })).toThrow();
  });

  it('structured references resolve table columns', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 50, columns: 10, data: [['Region', 'Sales'], ['North', 10], ['South', 20]] }],
    });
    const ws = wb.activeWorksheet;
    ws.addTable({ name: 'SalesTable', range: 'A1:B3' });
    ws.setValue(4, 0, '=SUM(SalesTable[Sales])');
    expect(ws.getValue(4, 0)).toBe(30);
  });

  it('structured references expose the whole table for COUNTA', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 50, columns: 10, data: [['A', 'B'], ['x', 'y']] }],
    });
    const ws = wb.activeWorksheet;
    ws.addTable({ name: 'DataTable', range: 'A1:B2' });
    ws.setValue(3, 0, '=COUNTA(DataTable)');
    // COUNTA flattens matrices including header? Table ref excludes header.
    expect(ws.getValue(3, 0)).toBe(2);
  });

  it('banded rows are detectable through the table store', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 50, columns: 10, data: [['H'], ['a'], ['b'], ['c']] }],
    });
    const ws = wb.activeWorksheet;
    ws.addTable({ name: 'T', range: 'A1:A4' });
    expect(ws.tables.at(1, 0)?.name).toBe('T');
    expect(ws.tables.at(5, 0)).toBeUndefined();
  });

  it('table removal breaks structured references', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 50, columns: 10, data: [['A'], [1], [2]] }],
    });
    const ws = wb.activeWorksheet;
    ws.addTable({ name: 'TT', range: 'A1:A3' });
    ws.setValue(5, 0, '=SUM(TT[A])');
    expect(ws.getValue(5, 0)).toBe(3);
    ws.tables.remove('TT');
    expect(ws.getValue(5, 0)).toBe('#NAME?');
  });
});

describe('Search and replace (§21)', () => {
  it('replaces the next occurrence from a position', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['foo'], ['bar'], ['foo bar']] }] });
    const ws = wb.activeWorksheet;
    const hit = replace(ws, 'foo', 'baz', { row: 0, column: 0 });
    expect(hit).toBeDefined();
    expect(ws.getValue(0, 0)).toBe('baz'); // hit at the start position is replaced
    expect(ws.getValue(2, 0)).toBe('foo bar');
  });

  it('replaces all occurrences', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['foo'], ['foo bar'], ['nope']] }] });
    const ws = wb.activeWorksheet;
    const count = replaceAll(ws, 'foo', 'qux');
    expect(count).toBe(2);
    expect(ws.getValue(0, 0)).toBe('qux');
    expect(ws.getValue(1, 0)).toBe('qux bar');
  });

  it('replace honors match case', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['Foo'], ['foo']] }] });
    const ws = wb.activeWorksheet;
    const count = replaceAll(ws, 'Foo', 'X', { matchCase: true });
    expect(count).toBe(1);
    expect(ws.getValue(0, 0)).toBe('X');
    expect(ws.getValue(1, 0)).toBe('foo');
  });
});

