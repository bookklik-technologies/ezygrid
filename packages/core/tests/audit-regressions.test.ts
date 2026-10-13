import { describe, expect, it } from 'vitest';
import { ClipboardService, createGrid } from '../src/index.js';

describe('audit regressions', () => {
  it('invalidates cross-sheet ranges and transitive readers after edits and undo', () => {
    const wb = createGrid(null, { worksheets: [{ name: 'Input', data: [[1], [2]] }, { name: 'Totals' }] });
    const [input, totals] = wb.worksheets;
    totals!.setValue(0, 0, '=SUM(Input!A1:A2)');
    totals!.setValue(0, 1, '=A1*2');
    expect(totals!.getValue(0, 1)).toBe(6);
    input!.setValue(1, 0, 20);
    expect(totals!.getValue(0, 1)).toBe(42);
    wb.undo();
    expect(totals!.getValue(0, 1)).toBe(6);
    input!.setValue(1, 0, '=10');
    expect(totals!.getValue(0, 1)).toBe(22);
    input!.setValue(1, 0, 3);
    expect(totals!.getValue(0, 1)).toBe(8);
  });

  it('links range formula precedents in either registration order', () => {
    for (const rangeFirst of [true, false]) {
      const wb = createGrid(null);
      const sheet = wb.activeWorksheet;
      sheet.setValue(0, 0, 1);
      if (rangeFirst) sheet.setValue(0, 1, '=SUM(A1:A2)');
      sheet.setValue(1, 0, '=A1*2');
      if (!rangeFirst) sheet.setValue(0, 1, '=SUM(A1:A2)');
      expect(sheet.getValue(0, 1)).toBe(3);
      sheet.setValue(0, 0, 5);
      expect(sheet.getValue(0, 1)).toBe(15);
    }
  });

  it.each(['a"b', 'a\tb"c', '"hello"', 'line\n"two"', '=1+1'])('round-trips literal TSV text %j', (text) => {
    const wb = createGrid(null);
    wb.activeWorksheet.setValue(0, 0, text, { literal: true });
    const clipboard = new ClipboardService();
    clipboard.copyFrom(wb.activeWorksheet, 0, 0, 0, 0);
    clipboard.loadTSV(clipboard.toTSV());
    clipboard.pasteTo(wb, wb.activeWorksheet, 1, 0);
    expect(wb.activeWorksheet.getValue(1, 0)).toBe(text);
    expect(wb.activeWorksheet.cells.getCell(1, 0)?.formula).toBeUndefined();
  });

  it('undoes and redoes a CSV import as one action', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['original']] }] });
    const sheet = wb.activeWorksheet;
    wb.history.clear();
    sheet.fromCsv('one,two\nthree,four');
    wb.undo();
    expect(sheet.toCsv()).toBe('original\r\n');
    wb.redo();
    expect(sheet.toCsv()).toBe('one,two\r\nthree,four\r\n');
  });
});
