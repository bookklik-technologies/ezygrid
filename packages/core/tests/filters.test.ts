import { describe, it, expect } from 'vitest';
import { createGrid, ClipboardService } from '../src/index.js';

describe('Hide/show rows and columns', () => {
  it('hides and shows a row band', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['a'], ['b'], ['c']] }] });
    const ws = wb.activeWorksheet;
    ws.hideRows(1, 1);
    expect(ws.isRowHidden(1)).toBe(true);
    expect(ws.isRowHidden(0)).toBe(false);
    ws.showRows(1);
    expect(ws.isRowHidden(1)).toBe(false);
  });

  it('hides and shows columns', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['a', 'b', 'c']] }] });
    const ws = wb.activeWorksheet;
    ws.hideColumns(1, 2);
    expect(ws.isColumnHidden(1)).toBe(true);
    expect(ws.isColumnHidden(2)).toBe(true);
    expect(ws.isColumnHidden(0)).toBe(false);
    ws.showColumns(1);
    expect(ws.isColumnHidden(1)).toBe(false);
    expect(ws.isColumnHidden(2)).toBe(true);
  });
});

describe('Filters', () => {
  it('hides non-matching rows and restores on clear', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [[10], [50], [20], [80]] }],
    });
    const ws = wb.activeWorksheet;
    ws.setFilter(0, (v) => typeof v === 'number' && v < 40);
    expect(ws.isRowHidden(0)).toBe(false);
    expect(ws.isRowHidden(1)).toBe(true);
    expect(ws.isRowHidden(2)).toBe(false);
    expect(ws.isRowHidden(3)).toBe(true);
    ws.clearFilter();
    expect(ws.isRowHidden(1)).toBe(false);
    expect(ws.isRowHidden(3)).toBe(false);
  });

  it('evaluates formulas with the filter predicate', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [[5, '=A1*2'], [100, '=A2*2']] }],
    });
    const ws = wb.activeWorksheet;
    ws.setFilter(1, (v) => typeof v === 'number' && v < 100);
    expect(ws.isRowHidden(0)).toBe(false);
    expect(ws.isRowHidden(1)).toBe(true);
  });

  it('supports multiple filters', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [[1, 'x'], [2, 'y'], [3, 'x']] }],
    });
    const ws = wb.activeWorksheet;
    ws.setFilter(0, (v) => (v as number) > 1);
    ws.setFilter(1, (v) => v === 'y');
    expect(ws.isRowHidden(0)).toBe(true);
    expect(ws.isRowHidden(1)).toBe(false);
    expect(ws.isRowHidden(2)).toBe(true);
  });
});

describe('Paste special: values only', () => {
  it('copies evaluated values, stripping formulas', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[10, '=A1*2']] }] });
    const ws = wb.activeWorksheet;
    const clipboard = new ClipboardService();
    clipboard.copyFrom(ws, 0, 0, 0, 1, { valuesOnly: true });
    const buffer = clipboard.getBuffer()!;
    expect(buffer.cells[0]![0]!.raw).toBe(10);
    expect(buffer.cells[0]![1]!.raw).toBe(20);
    expect(buffer.cells[0]![1]!.formula).toBeUndefined();
    clipboard.pasteTo(wb, ws, 2, 0);
    expect(ws.cells.getCell(2, 1)?.formula).toBeUndefined();
    expect(ws.getValue(2, 1)).toBe(20);
  });
});
