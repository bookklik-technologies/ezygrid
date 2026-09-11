import { describe, it, expect } from 'vitest';
import { createGrid } from '../src/index.js';

describe('Structural operations + reference rewriting', () => {
  it('insertRows shifts formulas referencing rows below the insertion', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [[10], ['=A1*2'], ['=A1+A2']] }],
    });
    const sheet = wb.worksheets[0]!;
    expect(sheet.getValue(1, 0)).toBe(20);
    expect(sheet.getValue(2, 0)).toBe(30);
    sheet.insertRows(1, 1);
    // formula '=A1*2' moved from row1 to row2, refs unchanged (A1 above insertion)
    expect(sheet.cells.getCell(2, 0)?.formula).toBe('=A1*2');
    // '=A1+A2' moved to row 3; A2 was below insertion -> becomes A3
    expect(sheet.cells.getCell(3, 0)?.formula).toBe('=A1+A3');
    expect(sheet.getValue(3, 0)).toBe(30);
  });

  it('deleteRows turns deleted references into #REF!', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [['a'], ['b'], ['=A1+A2']] }],
    });
    const sheet = wb.worksheets[0]!;
    sheet.deleteRows(1, 1);
    expect(sheet.cells.getCell(1, 0)?.formula).toBe('=A1+#REF!');
  });

  it('insertColumns shifts column references', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [[1, 2], ['=A1+B1']] }],
    });
    const sheet = wb.worksheets[0]!;
    sheet.insertColumns(1, 1);
    expect(sheet.cells.getCell(1, 0)?.formula).toBe('=A1+C1');
  });

  it('formulas recalculate correctly after structural change', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [[10], [20], ['=A1+A2']] }],
    });
    const sheet = wb.worksheets[0]!;
    expect(sheet.getValue(2, 0)).toBe(30);
    sheet.insertRows(2, 1); // insert right below the data, formula moves down
    expect(sheet.cells.getCell(3, 0)?.formula).toBe('=A1+A2');
    sheet.setValue(0, 0, 100);
    expect(sheet.getValue(3, 0)).toBe(120);
  });
});
