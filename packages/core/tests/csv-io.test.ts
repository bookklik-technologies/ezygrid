import { describe, it, expect } from 'vitest';
import { createGrid } from '../src/index.js';

describe('Worksheet CSV import/export', () => {
  it('exports the used range with display formatting', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [['Month', 'Revenue'], ['Jan', 1200], ['Feb', '=B2*2']] }],
    });
    const ws = wb.activeWorksheet;
    const csv = ws.toCsv();
    expect(csv).toBe('Month,Revenue\r\nJan,1200\r\nFeb,2400\r\n');
  });

  it('applies number formats to exported values', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 10, columns: 5, data: [[1234.5]] }],
    });
    const ws = wb.activeWorksheet;
    ws.setNumberFormat('A1', '#,##0.00');
    expect(ws.toCsv()).toBe('"1,234.50"\r\n');
  });

  it('imports CSV values including formulas when enabled', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 20, columns: 5 }] });
    const ws = wb.activeWorksheet;
    ws.fromCsv('name,score\nAda,36\nGrace,42', { formulas: true });
    expect(ws.getValue(0, 0)).toBe('name');
    expect(ws.getValue(1, 1)).toBe(36);
    ws.setValue(2, 1, '=B2*2');
    expect(ws.getValue(2, 1)).toBe(72);
  });

  it('respects anchor and custom delimiter', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 20, columns: 5 }] });
    const ws = wb.activeWorksheet;
    ws.fromCsv('a;b;c', { anchor: 'B2' });
    expect(ws.getValue(1, 1)).toBe('a');
    expect(ws.getValue(1, 3)).toBe('c');
  });

  it('escapeFormulas guards dangerous exports', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['+SUM(A1:A2)']] }] });
    const ws = wb.activeWorksheet;
    expect(ws.toCsv({ escapeFormulas: true })).toBe("'+SUM(A1:A2)\r\n");
  });

  it('round-trips CSV through export and import', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [['Item', 'Qty'], ['Widget, large', 3], ['Bracket "small"', 7]] }],
    });
    const ws = wb.activeWorksheet;
    const csv = ws.toCsv();
    const wb2 = createGrid(null, { worksheets: [{ rows: 10, columns: 5 }] });
    wb2.activeWorksheet.fromCsv(csv);
    expect(wb2.activeWorksheet.getValue(0, 0)).toBe('Item');
    expect(wb2.activeWorksheet.getValue(1, 0)).toBe('Widget, large');
    expect(wb2.activeWorksheet.getValue(2, 0)).toBe('Bracket "small"');
    expect(wb2.activeWorksheet.getValue(2, 1)).toBe(7);
  });
});
