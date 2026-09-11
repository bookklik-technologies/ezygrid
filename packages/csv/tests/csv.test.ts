import { describe, it, expect } from 'vitest';
import { parseCsv, stringifyCsv, detectDelimiter } from '../src/index.js';

describe('CSV parse (§35.1)', () => {
  it('parses basic rows with numeric coercion', () => {
    const result = parseCsv('a,1\nb,2.5');
    expect(result.rows).toEqual([['a', 1], ['b', 2.5]]);
  });

  it('detects delimiters', () => {
    expect(detectDelimiter('a,b,c')).toBe(',');
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('a|b|c')).toBe('|');
  });

  it('handles quoted fields with embedded separators, quotes and newlines', () => {
    const result = parseCsv('"a,b","say ""hi""","multi\nline"');
    expect(result.rows).toEqual([['a,b', 'say "hi"', 'multi\nline']]);
  });

  it('strips BOM', () => {
    const result = parseCsv('\uFEFFa,b');
    expect(result.rows).toEqual([['a', 'b']]);
  });

  it('explicit headers', () => {
    const result = parseCsv('name,age\nAda,36', { headers: true });
    expect(result.headers).toEqual(['name', 'age']);
    expect(result.rows).toEqual([['Ada', 36]]);
  });

  it('numbers disabled keeps strings', () => {
    const result = parseCsv('a,1', { numbers: false });
    expect(result.rows).toEqual([['a', '1']]);
  });

  it('handles CRLF and final row without newline', () => {
    expect(parseCsv('a,b\r\nc,d').rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\nc,d').rows).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('CSV stringify (§35.1)', () => {
  it('quotes fields containing separators, quotes and newlines', () => {
    const csv = stringifyCsv([['a,b', 'say "hi"', 'line1\nline2']]);
    expect(csv).toBe('"a,b","say ""hi""","line1\nline2"\r\n');
  });

  it('custom delimiter', () => {
    expect(stringifyCsv([[1, 'x']], { delimiter: ';' })).toBe('1;x\r\n');
  });

  it('formula injection guard (§50.3)', () => {
    const csv = stringifyCsv([['=cmd()', '+plus', '-dash', '@at', 'ok']], { escapeFormulas: true });
    expect(csv).toBe("'=cmd(),'+plus,'-dash,'@at,ok\r\n");
  });

  it('round-trips through parse', () => {
    const rows = [['a', 1], ['b', 2.5], ['c,d', 'multi\nline']];
    const csv = stringifyCsv(rows);
    expect(parseCsv(csv).rows).toEqual(rows);
  });
});

