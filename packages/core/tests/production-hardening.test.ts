import { describe, it, expect, vi } from 'vitest';
import { Workbook } from '../src/workbook.js';
import { replaceAll } from '../src/replace.js';
import { stringifyCsv } from '@ezygrid/csv';
import { createZip, readZip } from '../src/xlsx/zip.js';
import { formatValue } from '../src/format.js';
import { ClipboardService } from '../src/clipboard.js';
import { Parser } from '@ezygrid/formula';

describe('CSV export injection safety (H2)', () => {
  it('escapes formula-prefixed cells by default', () => {
    const csv = stringifyCsv([['=cmd|"/c calc"!A1', 'plain', '+2+3', '@SUM(1)']]);
    // The escaped field also gets RFC-quoted because it contains quotes.
    expect(csv).toContain(`"'=cmd|""/c calc""!A1"`);
    expect(csv).toContain("'+2+3");
    expect(csv).toContain("'@SUM(1)");
    expect(csv).toContain('plain');
  });

  it('allows opting out explicitly', () => {
    expect(stringifyCsv([['=1+1']], { escapeFormulas: false })).toContain('=1+1');
  });
});

describe('transaction coalescing (H1)', () => {
  it('records one history entry for a batched editor action instead of document snapshots', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    const sizes: number[] = [];
    const push = wb.history.push.bind(wb.history);
    wb.history.push = ((op, inverse) => {
      const payload = (op as { payload?: unknown }).payload;
      if (op.type === 'document.restore') sizes.push(JSON.stringify(payload).length);
      return push(op, inverse);
    }) as typeof wb.history.push;

    wb.transaction(() => {
      ws.setValue(0, 0, 'a');
      ws.setStyle('A1:B2', { bold: true });
      ws.setValue(3, 3, 'b');
    });

    expect(sizes).toHaveLength(0);
    expect(wb.canUndo).toBe(true);
    // One undo reverts the whole action.
    wb.undo();
    expect(ws.getValue(0, 0)).toBe(null);
    expect(ws.getValue(3, 3)).toBe(null);
    expect(ws.getStyle(0, 0)?.bold).toBeUndefined();
    wb.redo();
    expect(ws.getValue(0, 0)).toBe('a');
    expect(ws.getStyle(0, 0)?.bold).toBe(true);
  });

  it('falls back to a snapshot pair when an action is not fully reversible', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    let sawRestore = false;
    const push = wb.history.push.bind(wb.history);
    wb.history.push = ((op, inverse) => {
      if (op.type === 'document.restore') sawRestore = true;
      return push(op, inverse);
    }) as typeof wb.history.push;

    wb.transaction(() => {
      ws.setValue(0, 0, 'a');
      // Chart additions emit no inverse: the snapshot path covers them.
      ws.addChart({ type: 'column', source: 'A1:B2', title: 't' });
    });
    expect(sawRestore).toBe(true);
    wb.undo();
    expect(ws.getValue(0, 0)).toBe(null);
  });

  it('rolls back and rethrows when the action throws', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    expect(() =>
      wb.transaction(() => {
        ws.setValue(0, 0, 'kept');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(ws.getValue(0, 0)).toBe(null);
  });
});

describe('silent mutations repaint via view.update markers (H3)', () => {
  it('emits view.update without creating history entries', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    const types: string[] = [];
    wb.onOperation((op) => types.push(op.type));
    types.length = 0;

    ws.hideRows(0, 2);
    ws.showRows(0);
    ws.hideColumns(1);
    ws.groupRows(0, 3);
    ws.collapseGroup(0);
    ws.expandGroup(0);
    ws.setNestedHeaders([['A', { title: 'B', span: 2 }]]);
    ws.freezeRows = 1;
    ws.addChart({ type: 'column', source: 'A1:B2', title: 't' });
    ws.addImage({ src: 'https://example.com/a.png' });

    expect(types.filter((t) => t === 'view.update').length).toBeGreaterThanOrEqual(7);
    expect(wb.canUndo).toBe(false);
  });

  it('filter changes emit view.update and repaint rows', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, 'a');
    ws.setValue(1, 0, 'b');
    const ops: string[] = [];
    wb.onOperation((op) => ops.push(op.type));
    ws.setFilter(0, (v) => v === 'a');
    expect(ops).toContain('view.update');
    expect(ws.isRowHidden(1)).toBe(true);
  });
});

describe('conditional-format memoization (H4)', () => {
  it('scans a duplicates rule range once per revision, not per cell', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    for (let r = 0; r < 20; r++) ws.setValue(r, 0, r % 5);
    ws.conditionalFormats.add({ range: 'A1:A20', type: 'duplicates', style: { bold: true }, priority: 1 });
    const spy = vi.spyOn(ws, 'getValue');
    const matches = (r: number) => Object.keys(ws.conditionalFormats.evaluate(ws, r, 0)).length > 0;
    for (let r = 0; r < 20; r++) matches(r);
    const firstPass = spy.mock.calls.length;
    expect(firstPass).toBeGreaterThan(0);
    // Second pass over the same cells without a mutation: no rescan.
    for (let r = 0; r < 20; r++) matches(r);
    expect(spy.mock.calls.length).toBe(firstPass);
    // After a mutation the cache is invalidated and rescans once.
    ws.setValue(5, 0, 9);
    for (let r = 0; r < 20; r++) matches(r);
    expect(spy.mock.calls.length).toBeGreaterThan(firstPass);
    spy.mockRestore();
  });
});

describe('range clamping (M2)', () => {
  it('clamps huge metadata ranges to sheet dimensions instead of hanging', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setStyle('A1:ZZZ9999999', { bold: true });
    expect(ws.getStyle(0, 0)?.bold).toBe(true);
    // Outside the sheet entirely: no-op, no throw.
    ws.setStyle('ZZZ1:ZZZ5', { bold: true });
    expect(ws.getStyle(0, 0)?.bold).toBe(true);
  });

  it('conditional format scans clamp out-of-sheet rule ranges', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, 5);
    ws.conditionalFormats.add({ range: 'A1:ZZZ9999999', type: 'topN', n: 1, style: { bold: true }, priority: 1 });
    expect(ws.conditionalFormats.evaluate(ws, 0, 0)).toEqual({ bold: true });
  });
});

describe('TSV clipboard fidelity (M3)', () => {
  it('does not quote-quote cells containing quote characters', () => {
    const clip = new ClipboardService();
    clip.buffer = {
      rows: 1,
      columns: 2,
      origin: { row: 0, column: 0 },
      cells: [
        [
          { raw: 'a"b' },
          { raw: 'plain' },
        ],
      ],
    };
    expect(clip.toTSV()).toBe('a"b\tplain');
  });

  it('quotes cells containing tabs or newlines so row structure survives', () => {
    const clip = new ClipboardService();
    clip.buffer = {
      rows: 1,
      columns: 2,
      origin: { row: 0, column: 0 },
      cells: [[{ raw: 'multi\nline' }, { raw: 'x' }]],
    };
    const tsv = clip.toTSV();
    expect(tsv).toBe('"multi\nline"\tx');
    // Round-trips through the quote-aware parser as one cell.
    const back = ClipboardService.fromTSV(tsv);
    expect(back.rows).toBe(1);
    expect(back.cells[0]![0]!.raw).toBe('multi\nline');
  });
});

describe('replace writes literal text (M10)', () => {
  it('does not turn a replacement into a live formula', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    ws.setValue(0, 0, '1');
    const count = replaceAll(ws, '1', '=1+1');
    expect(count).toBe(1);
    expect(ws.cells.getCell(0, 0)?.formula).toBeUndefined();
    // The replacement text stays literal, not a formula.
    expect(ws.getValue(0, 0)).toBe('=1+1');
  });
});

describe('zip writer UTF-8 name sizing (M5)', () => {
  it('round-trips non-ASCII entry names', async () => {
    const name = 'xl/worksheets/sheet-ünïcödé.xml';
    const zip = createZip([{ name, data: new TextEncoder().encode('hello') }]);
    const files = await readZip(zip);
    expect(new TextDecoder().decode(files.get(name))).toBe('hello');
  });
});

describe('xlsx part caps (M7)', () => {
  it('rejects packages declaring too many parts', async () => {
    const { workbookFromXlsx } = await import('../src/xlsx/index.js');
    const entries = [];
    for (let i = 0; i < 1025; i++) {
      entries.push({ name: `xl/worksheets/sheet${i}.xml`, data: new Uint8Array(8) });
    }
    const bytes = createZip(entries);
    await expect(workbookFromXlsx(bytes)).rejects.toThrow(/too many parts/);
  });
});

describe('image source allowlist (L2)', () => {
  it('rejects http: and non-image data URLs, accepts https/data/blob', () => {
    const wb = new Workbook({});
    const ws = wb.activeWorksheet;
    expect(() => ws.addImage({ src: 'http://example.com/a.png' })).toThrow(/https/);
    expect(() => ws.addImage({ src: 'data:text/html;base64,AAAA' })).toThrow(/https/);
    expect(() => ws.addImage({ src: 'https://example.com/a.png' })).not.toThrow();
    expect(() => ws.addImage({ src: 'data:image/png;base64,AAAA' })).not.toThrow();
  });
});

describe('format engine (L6)', () => {
  it('keeps booleans textual under numeric masks', () => {
    expect(formatValue(true, '#,##0.00')).toBe('true');
  });

  it('formats Excel serials 1-59 with the 1900 epoch adjustment', () => {
    expect(formatValue(1, 'yyyy-mm-dd')).toBe('1900-01-01');
    expect(formatValue(59, 'yyyy-mm-dd')).toBe('1900-02-28');
    expect(formatValue(61, 'yyyy-mm-dd')).toBe('1900-03-01');
    expect(formatValue(45658, 'yyyy-mm-dd')).toBe('2025-01-01');
  });
});

describe('formula lexer (L8)', () => {
  it('rejects unterminated string literals', () => {
    expect(() => Parser.parse('"abc')).toThrow(/unterminated string/i);
    expect(() => Parser.parse('"ab""c"')).not.toThrow();
  });
});

describe('chart SVG escaping invariant (L1)', () => {
  it('escapes hostile chart titles and categories so cell text cannot inject markup', async () => {
    const { renderChartSVG } = await import('../src/chart-svg.js');
    const svg = renderChartSVG(
      { type: 'column', source: 'A1:B2', title: '</title><script>alert(1)</script>' },
      { categories: ['<img src=x onerror=alert(1)>'], series: [{ name: '<script>', values: [1, 2] }] },
    );
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<img');
  });
});

describe('data/dimension mismatch warning (L9)', () => {
  it('warns when config.data exceeds declared dimensions', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Workbook({ worksheets: [{ data: [[1], [2], [3]], rows: 2 }] });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
