import { describe, it, expect } from 'vitest';
import { createGrid, Workbook, Worksheet } from '../src/index.js';
import { FormulaError } from '@ezygrid/formula';

describe('Workbook model', () => {
  it('creates a grid with data and evaluates formulas', () => {
    const wb = createGrid(null, {
      worksheets: [
        {
          name: 'Sales',
          rows: 100,
          columns: 10,
          data: [
            ['Month', 'Revenue', 'Cost', 'Profit'],
            ['Jan', 12000, 7000, '=B2-C2'],
            ['Feb', 15000, 8000, '=B3-C3'],
          ],
        },
      ],
    });
    const sheet = wb.getWorksheet('Sales')!;
    expect(sheet).toBeInstanceOf(Worksheet);
    expect(sheet.getValue(1, 3)).toBe(5000);
    expect(sheet.getValue(2, 3)).toBe(7000);
    expect(sheet.getAddress(1, 3)).toBe('D2');
  });

  it('recalculates when precedent values change', () => {
    const wb = new Workbook({
      worksheets: [{ data: [[10], ['=A1*2']] }],
    });
    const sheet = wb.worksheets[0]!;
    expect(sheet.getValue(1, 0)).toBe(20);
    sheet.setValue(0, 0, 50);
    expect(sheet.getValue(1, 0)).toBe(100);
  });

  it('emits cell.set operations on setValue', () => {
    const wb = new Workbook();
    const ops: unknown[] = [];
    wb.onOperation((o) => ops.push(o));
    const sheet = wb.worksheets[0]!;
    sheet.setValue(0, 0, 'hello');
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: 'cell.set' });
  });

  it('supports multiple worksheets and cross-sheet formulas', () => {
    const wb = new Workbook({
      worksheets: [
        { name: 'Sheet1', data: [[5]] },
        { name: 'Sheet2', data: [['=Sheet1!A1*3']] },
      ],
    });
    const s2 = wb.getWorksheet('Sheet2')!;
    expect(s2.getValue(0, 0)).toBe(15);
  });

  it('structural row insert shifts cells and formulas recalc', () => {
    const wb = new Workbook({
      worksheets: [{ data: [[1], [2], ['=A1+A2']] }],
    });
    const sheet = wb.worksheets[0]!;
    expect(sheet.getValue(2, 0)).toBe(3);
    sheet.insertRows(0, 1);
    // formula moved from row 2 to row 3; precedents shifted down by one
    expect(sheet.cells.getCell(3, 0)?.formula).toBe('=A2+A3');
    expect(sheet.getValue(3, 0)).toBe(3);
  });

  it('JSON snapshot round-trips values', () => {
    const wb = new Workbook({
      worksheets: [{ name: 'S1', data: [['a', 1, '=B1*2']] }],
    });
    const json = wb.toJSON() as { format: string; version: number; worksheets: { data: unknown[][] }[] };
    expect(json.format).toBe('ezygrid');
    expect(json.version).toBe(1);
    expect(json.worksheets[0]!.data[0]).toContain('a');
  });

  it('renders #DIV/0! as error string', () => {
    const wb = new Workbook({ worksheets: [{ data: [['=1/0']] }] });
    const sheet = wb.worksheets[0]!;
    expect(sheet.getValue(0, 0)).toBe('#DIV/0!');
    expect(new FormulaError('#DIV/0!').value).toBe('#DIV/0!');
  });
});
