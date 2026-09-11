import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/workbook.js';
import { replaceAll } from '../src/replace.js';

describe('high-severity fixes', () => {
  it('cross-sheet formula chains resolve against the owning sheet', () => {
    const wb = new Workbook({
      worksheets: [{ name: 'Sheet1' }, { name: 'Sheet2' }],
    });
    const s1 = wb.getWorksheet('Sheet1')!;
    const s2 = wb.getWorksheet('Sheet2')!;
    s2.setValue(0, 0, 21); // Sheet2!A1 = 21
    s1.setValue(0, 0, 1); // Sheet1!A1 = 1
    s2.setValue(0, 1, '=A1*2'); // Sheet2!B1 = Sheet2!A1*2
    s1.setValue(0, 1, '=Sheet2!B1'); // reads Sheet2!B1
    expect(s1.getValue(0, 1)).toBe(42);
  });

  it('spill-covered cells resolve evaluated values for raw readers', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, '=SEQUENCE(3)');
    expect(ws.getValue(1, 0)).toBe(2);
    // Named formula / aggregate over a spilled range sees evaluated values.
    const reader = ws.readRawValue(ws.name, 1, 0);
    expect(reader).toBe(2);
  });

  it('formula reads see other formulas results across sheets', () => {
    const wb = new Workbook({
      worksheets: [{ name: 'Sheet1' }, { name: 'Sheet2' }],
    });
    const s1 = wb.getWorksheet('Sheet1')!;
    const s2 = wb.getWorksheet('Sheet2')!;
    s2.setValue(0, 0, '=2+3'); // Sheet2!A1 = 5
    s1.setValue(0, 1, '=Sheet2!A1*2');
    expect(s1.getValue(0, 1)).toBe(10);
  });

  it('undo/redo keeps history consistent (no duplication, redo survives)', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, 1);
    ws.setValue(0, 0, 2);
    expect(ws.getValue(0, 0)).toBe(2);
    wb.undo();
    expect(ws.getValue(0, 0)).toBe(1);
    wb.redo();
    expect(ws.getValue(0, 0)).toBe(2);
    // A second undo must still target the same cell.
    wb.undo();
    expect(ws.getValue(0, 0)).toBe(1);
    expect(wb.canRedo).toBe(true);
  });

  it('redo after new edit clears redo', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, 1);
    wb.undo();
    ws.setValue(0, 0, 5);
    expect(wb.canRedo).toBe(false);
  });

  it('structural ops transform undo targets', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(2, 0, 'x'); // A3
    ws.insertRows(0, 1); // A3 -> A4
    wb.undo(); // undo of "set A3" now targets A4 and clears it
    expect(ws.getValue(3, 0)).toBe(null);
  });

  it('insertRows moves styles/notes/formats with data', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setStyle('A1', { bold: true });
    ws.setNote('A1', 'note');
    ws.setNumberFormat('A1', '#,##0');
    ws.setValue(0, 0, 5);
    ws.insertRows(0, 2);
    expect(ws.getStyle(2, 0)?.bold).toBe(true);
    expect(ws.getNote(2, 0)).toBe('note');
    expect(ws.getNumberFormat(2, 0)).toBe('#,##0');
    expect(ws.getValue(2, 0)).toBe(5);
  });

  it('insertRows preserves custom row sizes', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.rowSizes.setSize(1, 48);
    ws.insertRows(0, 1);
    expect(ws.rowSizes.sizeOf(2)).toBe(48);
  });

  it('scalar functions receive scalar cell values', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, -5);
    ws.setValue(0, 1, '=ABS(A1)');
    ws.setValue(1, 1, '=ISNUMBER(A1)');
    expect(ws.getValue(0, 1)).toBe(5);
    expect(ws.getValue(1, 1)).toBe(true);
  });

  it('errors propagate through matrix arguments', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, 1);
    ws.setValue(1, 0, '=BADREF()');
    ws.setValue(2, 0, 3);
    ws.setValue(0, 1, '=SUM(A1:A3)');
    expect(ws.getValue(0, 1)).toBe('#NAME?');
  });

  it('COUNTIFS reads each range/criterion pair in order', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    // A1:A3 = 1,2,3 ; B1:B3 = 10,20,30
    ws.setValue(0, 0, 1);
    ws.setValue(1, 0, 2);
    ws.setValue(2, 0, 3);
    ws.setValue(0, 1, 10);
    ws.setValue(1, 1, 20);
    ws.setValue(2, 1, 30);
    ws.setValue(0, 3, '=COUNTIFS(A1:A3,">1",B1:B3,">15")');
    expect(ws.getValue(0, 3)).toBe(2);
    ws.setValue(1, 3, '=SUMIFS(B1:B3,A1:A3,">1")');
    expect(ws.getValue(1, 3)).toBe(50);
  });

  it('used range uses absolute coordinates across pages', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(300, 0, 1); // A301
    ws.setValue(300, 0, null); // clear
    ws.setValue(301, 0, 2); // A302
    const used = ws.cells.usedRange!;
    expect(used.top).toBe(301);
    expect(used.bottom).toBe(301);
  });

  it('CSV import honors formulas:false literally', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.fromCsv('=1+1,=2+2', { formulas: false });
    expect(ws.getValue(0, 0)).toBe('=1+1');
    expect(ws.getValue(0, 1)).toBe('=2+2');
  });

  it('replace keeps original casing and replaces all occurrences', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, 'North Sales');
    ws.setValue(1, 0, 'north north');
    const count = replaceAll(ws, 'north', 'South');
    expect(count).toBe(2);
    expect(ws.getValue(0, 0)).toBe('South Sales');
    expect(ws.getValue(1, 0)).toBe('South South');
  });

  it('registerAllFormulas keeps other sheets working', () => {
    const wb = new Workbook({
      worksheets: [{ name: 'Sheet1' }, { name: 'Sheet2' }],
    });
    const s1 = wb.getWorksheet('Sheet1')!;
    const s2 = wb.getWorksheet('Sheet2')!;
    s1.setValue(0, 0, 5);
    s2.setValue(0, 0, '=Sheet1!A1*3');
    expect(s2.getValue(0, 0)).toBe(15);
    // structural change on Sheet1 re-registers ALL sheets' formulas
    s1.insertRows(0, 1);
    expect(s2.getValue(0, 0)).toBe(15);
  });
});
