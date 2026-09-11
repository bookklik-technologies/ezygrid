import { describe, it, expect } from 'vitest';
import { Parser, collectRefs } from '../src/index.js';

describe('Formula parser', () => {
  it('parses arithmetic with precedence', () => {
    const ast = Parser.parse('1+2*3');
    expect(ast).toMatchObject({ kind: 'binary', op: '+' });
  });

  it('parses parenthesized grouping', () => {
    const ast = Parser.parse('(1+2)*3');
    expect(ast).toMatchObject({ kind: 'binary', op: '*' });
    expect((ast as { left: unknown }).left).toMatchObject({ kind: 'binary', op: '+' });
  });

  it('parses function calls with args', () => {
    const ast = Parser.parse('SUM(A1,B2:B10,3)');
    expect(ast).toMatchObject({ kind: 'call', name: 'SUM' });
    expect((ast as { args: unknown[] }).args).toHaveLength(3);
  });

  it('parses refs, ranges and cross-sheet refs', () => {
    const refs = collectRefs(Parser.parse('Sheet2!B2 + SUM(A1:A3)'));
    expect(refs).toHaveLength(4);
    expect(refs[0]).toMatchObject({ sheet: 'Sheet2', row: 1, column: 1 });
  });

  it('parses absolute refs', () => {
    const refs = collectRefs(Parser.parse('$B$3'));
    expect(refs[0]).toMatchObject({ row: 2, column: 1 });
  });

  it('parses percent, unary, concat and comparison', () => {
    expect(() => Parser.parse('-50%')).not.toThrow();
    expect(() => Parser.parse('"a"&"b"')).not.toThrow();
    expect(() => Parser.parse('A1>=B1')).not.toThrow();
    expect(() => Parser.parse('A1<>B1')).not.toThrow();
  });

  it('parses string escapes and booleans', () => {
    expect(() => Parser.parse('IF(TRUE,"say ""hi""",FALSE)')).not.toThrow();
  });

  it('parses error literals', () => {
    const ast = Parser.parse('#N/A');
    expect(ast).toMatchObject({ kind: 'error', value: '#N/A' });
  });

  it('throws on malformed input', () => {
    expect(() => Parser.parse('1 +')).toThrow();
    expect(() => Parser.parse('(1')).toThrow();
  });
});
