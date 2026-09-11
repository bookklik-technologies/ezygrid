import { describe, it, expect } from 'vitest';
import { createGrid, FillService } from '../src/index.js';
import type { Worksheet } from '../src/index.js';

function sheet(data: unknown[][]): { wb: ReturnType<typeof createGrid>; ws: Worksheet } {
  const wb = createGrid(null, { worksheets: [{ data }] });
  return { wb, ws: wb.activeWorksheet };
}

describe('FillService', () => {
  it('extends a numeric seed rectangle along both axes without changing its source', () => {
    const { ws } = sheet([[1, 2], [3, 4]]);
    new FillService().fillRange(ws,
      { top: 0, bottom: 1, left: 0, right: 1 },
      { top: 0, bottom: 3, left: 0, right: 3 });
    const values = Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_, column) => ws.getValue(row, column)));
    expect(values).toEqual([[1, 2, 3, 4], [3, 4, 5, 6], [5, 6, 7, 8], [7, 8, 9, 10]]);
    expect(ws.getValue(4, 4)).toBeNull();
  });

  it.each([[0, 0], [0, 4], [4, 0], [4, 4]])('fills toward row %i and column %i', (row, column) => {
    const { ws } = sheet([]);
    ws.setValue(2, 2, 7);
    const target = { top: Math.min(2, row), bottom: Math.max(2, row), left: Math.min(2, column), right: Math.max(2, column) };
    new FillService().fillRange(ws, { top: 2, bottom: 2, left: 2, right: 2 }, target);
    for (let r = target.top; r <= target.bottom; r++) {
      for (let c = target.left; c <= target.right; c++) expect(ws.getValue(r, c)).toBe(7);
    }
  });

  it('translates relative and mixed references across both axes', () => {
    const { ws } = sheet([]);
    ws.setValue(2, 2, '=A1+$B$1+B$2+$A2');
    new FillService().fillRange(ws,
      { top: 2, bottom: 2, left: 2, right: 2 },
      { top: 2, bottom: 4, left: 2, right: 4 });
    expect(ws.cells.getCell(2, 2)?.formula).toBe('=A1+$B$1+B$2+$A2');
    expect(ws.cells.getCell(4, 4)?.formula).toBe('=C3+$B$1+D$2+$A4');
  });

  it('translates formulas when expanding up and left', () => {
    const { ws } = sheet([]);
    ws.setValue(3, 3, '=C3+$A$1');
    new FillService().fillRange(ws,
      { top: 3, bottom: 3, left: 3, right: 3 },
      { top: 1, bottom: 3, left: 1, right: 3 });
    expect(ws.cells.getCell(1, 1)?.formula).toBe('=A1+$A$1');
  });

  it('rejects a target that would shrink the source before writing', () => {
    const { ws } = sheet([[1, 2], [3, 4]]);
    expect(() => new FillService().fillRange(ws,
      { top: 0, bottom: 1, left: 0, right: 1 },
      { top: 1, bottom: 3, left: 0, right: 3 })).toThrow(/contain the source/);
    expect(ws.getValue(2, 0)).toBeNull();
  });

  it('copies plain values down', () => {
    const { ws } = sheet([['x']]);
    new FillService().fill(ws, 'down', { top: 0, bottom: 0, left: 0, right: 0 }, 3);
    expect(ws.getValue(1, 0)).toBe('x');
    expect(ws.getValue(3, 0)).toBe('x');
  });

  it('extends arithmetic series down', () => {
    const { ws } = sheet([[2], [4]]);
    new FillService().fill(ws, 'down', { top: 0, bottom: 1, left: 0, right: 0 }, 4);
    expect(ws.getValue(2, 0)).toBe(6);
    expect(ws.getValue(3, 0)).toBe(8);
    expect(ws.getValue(4, 0)).toBe(10);
  });

  it('translates formulas when filling down', () => {
    const { ws } = sheet([[10], [20], ['=A1+A2']]);
    new FillService().fill(ws, 'down', { top: 2, bottom: 2, left: 0, right: 0 }, 4);
    expect(ws.cells.getCell(3, 0)?.formula).toBe('=A2+A3');
    expect(ws.getValue(3, 0)).toBe(50); // A2=20 + A3(=A1+A2)=30
    expect(ws.getValue(4, 0)).toBe(80); // A3=50 + A4(=A2+A3)
  });

  it('extends numbered text labels', () => {
    const { ws } = sheet([['Item 1', 'Item 2']]);
    new FillService().fill(ws, 'right', { top: 0, bottom: 0, left: 0, right: 1 }, 3);
    expect(ws.getValue(0, 2)).toBe('Item 3');
    expect(ws.getValue(0, 3)).toBe('Item 4');
  });

  it('fills right with series across columns', () => {
    const { ws } = sheet([[1, 3]]);
    new FillService().fill(ws, 'right', { top: 0, bottom: 0, left: 0, right: 1 }, 4);
    expect(ws.getValue(0, 2)).toBe(5);
    expect(ws.getValue(0, 3)).toBe(7);
    expect(ws.getValue(0, 4)).toBe(9);
  });

  it('fills up', () => {
    const { ws } = sheet([[null], [null], [10], [12]]);
    new FillService().fill(ws, 'up', { top: 2, bottom: 3, left: 0, right: 0 }, 0);
    expect(ws.getValue(1, 0)).toBe(8);
    expect(ws.getValue(0, 0)).toBe(6);
  });
});
