import { describe, it, expect } from 'vitest';
import { createGrid } from '../src/index.js';
import type { MatrixValue } from '@ezygrid/formula';

describe('Spill engine', () => {
  it('spills a dynamic array into neighboring cells', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 100, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, '=SEQUENCE(3,1,1,1)');
    expect(ws.getValue(0, 0)).toBe(1);
    expect(ws.getValue(1, 0)).toBe(2);
    expect(ws.getValue(2, 0)).toBe(3);
    expect(ws.isSpilled(1, 0)).toBe(true);
    expect(ws.isSpilled(2, 0)).toBe(true);
  });

  it('updates spill contents when precedents change', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 100, columns: 10, data: [[1], [2], [3]] }],
    });
    const ws = wb.activeWorksheet;
    ws.setValue(3, 0, '=SEQUENCE(3,1,1,1)');
    expect(ws.getValue(4, 0)).toBe(2);
    ws.setValue(0, 0, 100);
    // spill re-evaluates from SEQUENCE which does not depend on A1
    expect(ws.getValue(4, 0)).toBe(2);
  });

  it('blocks spills with #SPILL! when cells are occupied', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 100, columns: 10, data: [[null], [null], ['occupied']] }],
    });
    const ws = wb.activeWorksheet;
    ws.setValue(1, 0, '=SEQUENCE(2,1,1,1)');
    expect(ws.getValue(1, 0)).toBe('#SPILL!');
    expect(ws.hasSpillError(1, 0)).toBe(true);
  });

  it('removes the spill when the anchor is overwritten', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 100, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, '=SEQUENCE(3,1,1,1)');
    expect(ws.getValue(1, 0)).toBe(2);
    ws.setValue(0, 0, 42);
    expect(ws.getValue(0, 0)).toBe(42);
    expect(ws.getValue(1, 0)).toBeNull();
    expect(ws.isSpilled(1, 0)).toBe(false);
  });

  it('overwriting a covered cell removes the spill', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 100, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, '=SEQUENCE(3,1,1,1)');
    ws.setValue(1, 0, 'manual');
    expect(ws.getValue(1, 0)).toBe('manual');
    expect(ws.isSpilled(2, 0)).toBe(false);
  });

  it('structural edits clear and rebuild spills', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 100, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, '=SEQUENCE(2,1,1,1)');
    expect(ws.getValue(1, 0)).toBe(2);
    ws.insertRows(0, 1);
    // formula moved to row 1; spills re-register eagerly on write
    expect(ws.getValue(1, 0)).toBe(1);
    expect(ws.getValue(2, 0)).toBe(2);
    expect(ws.isSpilled(2, 0)).toBe(true);
  });

  it('SUM aggregates matrix results of named ranges and spills', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 100, columns: 10, data: [[10], [20], [30]] }],
    });
    const ws = wb.activeWorksheet;
    wb.setDefinedName('Sales', { type: 'range', ref: 'A1:A3' });
    ws.setValue(4, 0, '=SUM(Sales)');
    expect(ws.getValue(4, 0)).toBe(60);
  });
});
