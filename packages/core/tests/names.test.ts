import { describe, it, expect } from 'vitest';
import { createGrid } from '../src/index.js';

describe('Defined names (§26)', () => {
  it('resolves named constants in formulas', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[100]] }] });
    const ws = wb.activeWorksheet;
    wb.setDefinedName('TaxRate', { type: 'value', value: 0.08 });
    ws.setValue(1, 0, '=A1*(1+TaxRate)');
    expect(ws.getValue(1, 0)).toBe(108);
  });

  it('resolves named ranges in aggregates', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [[10], [20], [30]] }],
    });
    const ws = wb.activeWorksheet;
    wb.setDefinedName('Sales2026', { type: 'range', ref: 'A1:A3' });
    ws.setValue(4, 0, '=SUM(Sales2026)');
    expect(ws.getValue(4, 0)).toBe(60);
    ws.setValue(0, 0, 40);
    expect(ws.getValue(4, 0)).toBe(90);
  });

  it('returns #NAME? for unknown names', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['=NoSuchName+1']] }] });
    const ws = wb.activeWorksheet;
    expect(ws.getValue(0, 0)).toBe('#NAME?');
  });

  it('removes names', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[1]] }] });
    const ws = wb.activeWorksheet;
    wb.setDefinedName('K', { type: 'value', value: 2 });
    ws.setValue(1, 0, '=A1*K');
    expect(ws.getValue(1, 0)).toBe(2);
    wb.removeDefinedName('K');
    expect(ws.getValue(1, 0)).toBe('#NAME?');
  });

  it('evaluates named formulas', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[10], [20]] }] });
    const ws = wb.activeWorksheet;
    wb.setDefinedName('Total', { type: 'value', value: '=A1+A2' });
    ws.setValue(2, 0, '=Total');
    expect(ws.getValue(2, 0)).toBe(30);
  });
});
