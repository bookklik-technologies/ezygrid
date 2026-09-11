import { describe, it, expect } from 'vitest';
import { createGrid, buildPrintHtml } from '../src/index.js';

describe('Print layout (§36)', () => {
  it('builds an HTML document with @page rules', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [['A', 'B'], [1, 2]] }],
    });
    const html = buildPrintHtml(wb, 'Sheet1', { orientation: 'landscape', paperSize: 'A4' });
    expect(html).toContain('@page { size: 297mm 210mm;');
    expect(html).toContain('<table>');
  });

  it('portrait Letter', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 5, columns: 5 }] });
    const html = buildPrintHtml(wb, 'Sheet1', { paperSize: 'Letter' });
    expect(html).toContain('@page { size: 216mm 279mm;');
  });

  it('repeats header rows via thead', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [['H1', 'H2'], ['a', 'b'], ['c', 'd']] }],
    });
    const html = buildPrintHtml(wb, 'Sheet1', { repeatHeaderRows: 1 });
    expect(html).toContain('<thead>');
    expect(html).toContain('H1');
  });

  it('applies cell styles to print output', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 5, columns: 5, data: [['x']] }],
    });
    const ws = wb.activeWorksheet;
    ws.setStyle('A1', { bold: true });
    ws.setNumberFormat('A1', '#,##0.00');
    const html = buildPrintHtml(wb, 'Sheet1');
    expect(html).toContain('font-weight:bold');
  });

  it('escapes cell text', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['<script>alert(1)</script>']] }] });
    const html = buildPrintHtml(wb, 'Sheet1');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('gridlines can be disabled', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 5, columns: 5 }] });
    const html = buildPrintHtml(wb, 'Sheet1', { gridlines: false });
    expect(html).toContain('td { border: none; }');
  });
});
