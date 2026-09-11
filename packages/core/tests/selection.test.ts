import { describe, it, expect } from 'vitest';
import { SelectionService } from '../src/index.js';

function filled(sheet: string): (row: number, column: number) => boolean {
  const data = new Set<string>();
  sheet.split('\n').forEach((line, r) => {
    line.split('').forEach((ch, c) => {
      if (ch === 'x') data.add(`${r},${c}`);
    });
  });
  return (row, column) => data.has(`${row},${column}`);
}

describe('SelectionService', () => {
  it('active cell and ranges start at A1', () => {
    const sel = new SelectionService(100, 26);
    expect(sel.describe()).toBe('A1');
    expect(sel.isActive(0, 0)).toBe(true);
  });

  it('extendTo builds a range from the anchor', () => {
    const sel = new SelectionService(100, 26);
    sel.setActive(2, 1);
    sel.extendTo(5, 3);
    expect(sel.describe()).toBe('B3:D6');
    expect(sel.isWithin(4, 2)).toBe(true);
    expect(sel.isWithin(6, 2)).toBe(false);
  });

  it('move with shift extends the range', () => {
    const sel = new SelectionService(100, 26);
    sel.move('right', true, false, () => false);
    expect(sel.describe()).toBe('A1:B1');
  });

  it('ctrl+arrow jumps to the end of contiguous data', () => {
    // column A filled rows 0-3, blank row 4, data row 5
    const isFilled = filled('x\nx\nx\nx\n.\nx');
    const sel = new SelectionService(100, 26);
    sel.setActive(0, 0);
    sel.move('down', false, true, isFilled);
    expect(sel.describe()).toBe('A4');
    sel.move('down', false, true, isFilled);
    expect(sel.describe()).toBe('A6');
    sel.move('down', false, true, isFilled);
    expect(sel.describe()).toBe('A100'); // jumps to sheet edge past the last block
  });

  it('ctrl+arrow from blank region lands on first data block', () => {
    const isFilled = filled('....\n....\nxx');
    const sel = new SelectionService(100, 26);
    sel.setActive(0, 0);
    sel.move('down', false, true, isFilled);
    expect(sel.describe()).toBe('A3');
  });

  it('arrow navigation clamps at edges', () => {
    const sel = new SelectionService(10, 5);
    sel.move('up', false, false, () => false);
    expect(sel.isActive(0, 0)).toBe(true);
    sel.move('left', false, false, () => false);
    expect(sel.isActive(0, 0)).toBe(true);
  });

  it('select all, row, column', () => {
    const sel = new SelectionService(10, 5);
    sel.selectAll();
    expect(sel.describe()).toBe('A1:E10');
    sel.selectRow(2);
    expect(sel.describe()).toBe('A3:E3');
    sel.selectColumn(1);
    expect(sel.describe()).toBe('B1:B10');
  });

  it('ctrl+click adds an independent range', () => {
    const sel = new SelectionService(100, 26);
    sel.setActive(0, 0);
    sel.addRange(5, 5);
    expect(sel.state.ranges).toHaveLength(2);
    expect(sel.isActive(5, 5));
  });
});
