import { describe, it, expect } from 'vitest';
import { createGrid } from '../src/index.js';

describe('History (undo/redo)', () => {
  it('undo restores the previous cell value', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['old']] }] });
    const sheet = wb.worksheets[0]!;
    sheet.setValue(0, 0, 'new');
    expect(sheet.getValue(0, 0)).toBe('new');
    expect(wb.canUndo).toBe(true);
    wb.undo();
    expect(sheet.getValue(0, 0)).toBe('old');
    expect(wb.canRedo).toBe(true);
    wb.redo();
    expect(sheet.getValue(0, 0)).toBe('new');
  });

  it('undo restores formulas and recalculates', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[10], ['=A1*2']] }] });
    const sheet = wb.worksheets[0]!;
    expect(sheet.getValue(1, 0)).toBe(20);
    sheet.setValue(1, 0, '=A1*3');
    expect(sheet.getValue(1, 0)).toBe(30);
    wb.undo();
    expect(sheet.getValue(1, 0)).toBe(20);
  });

  it('undo can clear a newly created cell', () => {
    const wb = createGrid(null);
    const sheet = wb.worksheets[0]!;
    sheet.setValue(0, 0, 'hello');
    wb.undo();
    expect(sheet.getValue(0, 0)).toBeNull();
  });

  it('redo after new edit clears redo stack', () => {
    const wb = createGrid(null);
    const sheet = wb.worksheets[0]!;
    sheet.setValue(0, 0, 'a');
    wb.undo();
    sheet.setValue(0, 0, 'b');
    expect(wb.canRedo).toBe(false);
  });

  it('emits undo/redo operations for persistence correlation', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['x']] }] });
    const sheet = wb.worksheets[0]!;
    const types: string[] = [];
    wb.onOperation((o) => types.push(o.type));
    sheet.setValue(0, 0, 'y');
    wb.undo();
    expect(types).toContain('undo');
  });
});
