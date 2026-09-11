import { describe, it, expect } from 'vitest';
import { createGrid, FillService } from '../src/index.js';
import type { Worksheet } from '../src/index.js';

function sheet(data: unknown[][]): { wb: ReturnType<typeof createGrid>; ws: Worksheet } {
  const wb = createGrid(null, { worksheets: [{ data }] });
  return { wb, ws: wb.activeWorksheet };
}

describe('FillService', () => {
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
