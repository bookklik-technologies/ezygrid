import { tokenize, type Token } from './lexer.js';
import { columnToIndex, fromA1 } from '@ezygrid/model';

export type AstNode =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'error'; value: string }
  | { kind: 'ref'; sheet?: string; row: number; column: number }
  | { kind: 'range'; sheet?: string; start: { row: number; column: number }; end: { row: number; column: number } }
  | { kind: 'name'; name: string }
  | { kind: 'structured'; table: string; column?: string; item?: boolean }
  | { kind: 'call'; name: string; args: AstNode[] }
  | { kind: 'unary'; op: '-' | '+'; operand: AstNode }
  | { kind: 'binary'; op: string; left: AstNode; right: AstNode }
  | { kind: 'percent'; operand: AstNode };

/**
 * Recursive-descent parser producing an AST.
 * Precedence (loosest to tightest): comparison, concat, additive, multiplicative, power, unary, percent/postfix.
 */
export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(input: string) {
    this.tokens = tokenize(input);
  }

  static parse(input: string): AstNode {
    const p = new Parser(input);
    const node = p.parseExpression();
    // The whole input must be consumed; "=1 2" must not silently accept "=1".
    if (p.pos < p.tokens.length && p.peek().type !== 'eof') {
      throw new Error(`Unexpected trailing token ${p.peek().type} "${p.peek().text}"`);
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    return this.tokens[this.pos++]!;
  }

  private expect(type: Token['type']): Token {
    const t = this.next();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} "${t.text}"`);
    return t;
  }

  private parseExpression(): AstNode {
    return this.parseComparison();
  }

  private parseComparison(): AstNode {
    let left = this.parseConcat();
    while (this.peek().type === 'operator' && ['=', '<>', '<', '>', '<=', '>='].includes(this.peek().text)) {
      const op = this.next().text;
      const right = this.parseConcat();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseConcat(): AstNode {
    let left = this.parseAdditive();
    while (this.peek().type === 'operator' && this.peek().text === '&') {
      this.next();
      const right = this.parseAdditive();
      left = { kind: 'binary', op: '&', left, right };
    }
    return left;
  }

  private parseAdditive(): AstNode {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'operator' && (this.peek().text === '+' || this.peek().text === '-')) {
      const op = this.next().text;
      const right = this.parseMultiplicative();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): AstNode {
    let left = this.parsePower();
    while (this.peek().type === 'operator' && (this.peek().text === '*' || this.peek().text === '/')) {
      const op = this.next().text;
      const right = this.parsePower();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parsePower(): AstNode {
    let left = this.parseUnary();
    while (this.peek().type === 'operator' && this.peek().text === '^') {
      this.next();
      const right = this.parseUnary();
      left = { kind: 'binary', op: '^', left, right };
    }
    return left;
  }

  private parseUnary(): AstNode {
    if (this.peek().type === 'operator' && (this.peek().text === '-' || this.peek().text === '+')) {
      const op = this.next().text as '-' | '+';
      return { kind: 'unary', op, operand: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): AstNode {
    let node = this.parsePrimary();
    while (this.peek().type === 'operator' && this.peek().text === '%') {
      this.next();
      node = { kind: 'percent', operand: node };
    }
    return node;
  }

  private parsePrimary(): AstNode {
    const t = this.next();

    if (t.type === 'number') return { kind: 'number', value: t.value as number };
    if (t.type === 'string') return { kind: 'string', value: t.value as string };
    if (t.type === 'boolean') {
      // Allow the zero-arg call forms TRUE() / FALSE().
      if (this.peek().type === 'lparen') {
        this.next();
        this.expect('rparen');
      }
      return { kind: 'boolean', value: t.value as boolean };
    }
    if (t.type === 'error') return { kind: 'error', value: t.value as string };

    if (t.type === 'lparen') {
      const inner = this.parseExpression();
      this.expect('rparen');
      return inner;
    }

    if (t.type === 'cellref') {
      const sheet = t.sheet;
      const body = (refText: string): string => {
        const bang = refText.lastIndexOf('!');
        return bang >= 0 ? refText.slice(bang + 1) : refText;
      };
      if (this.peek().type === 'colon') {
        this.next();
        const second = this.expect('cellref');
        const a = fromA1(body(t.text));
        const b = fromA1(body(second.text));
        return {
          kind: 'range',
          sheet: sheet ?? second.sheet,
          start: { row: Math.min(a.row, b.row), column: Math.min(a.column, b.column) },
          end: { row: Math.max(a.row, b.row), column: Math.max(a.column, b.column) },
        };
      }
      const addr = fromA1(body(t.text));
      return { kind: 'ref', sheet, row: addr.row, column: addr.column };
    }

    if (t.type === 'ident') {
      // structured reference: Table[Column] or Table[@Column] or bare Table
      if (this.peek().type === 'lbracket') {
        this.next();
        let column: string | undefined;
        let item = false;
        if (this.peek().type === 'operator' && this.peek().text === '@') {
          item = true;
          this.next();
        }
        if (this.peek().type === 'ident' || this.peek().type === 'cellref' || this.peek().type === 'rangeref') {
          column = this.next().text;
        }
        this.expect('rbracket');
        return { kind: 'structured', table: t.text, column, item };
      }
      // function call
      if (this.peek().type === 'lparen') {
        this.next();
        const args: AstNode[] = [];
        if (this.peek().type !== 'rparen') {
          args.push(this.parseExpression());
          while (this.peek().type === 'comma') {
            this.next();
            args.push(this.parseExpression());
          }
        }
        this.expect('rparen');
        return { kind: 'call', name: t.text.toUpperCase(), args };
      }
      return { kind: 'name', name: t.text };
    }

    throw new Error(`Unexpected token ${t.type} "${t.text}"`);
  }
}

export interface CellRef {
  sheet?: string;
  row: number;
  column: number;
}

export interface RangeRef {
  sheet?: string;
  start: { row: number; column: number };
  end: { row: number; column: number };
}

export interface FormulaDependencies {
  refs: CellRef[];
  ranges: RangeRef[];
  /**
   * True when the formula reads through an unregistered dynamic source
   * (defined name or structured table reference). Such formulas cannot be
   * invalidated through refs/ranges alone and must be treated conservatively
   * by dirty tracking (F02).
   */
  opaque?: boolean;
}

/**
 * Extract dependencies from an AST without expanding ranges into per-cell
 * references: rectangular ranges are kept as ranges so a small formula
 * (e.g. =SUM(A1:XFD1048576)) cannot force billion-entry registration.
 */
export function collectDependencies(node: AstNode, out: FormulaDependencies = { refs: [], ranges: [] }): FormulaDependencies {
  switch (node.kind) {
    case 'ref':
      out.refs.push({ sheet: node.sheet, row: node.row, column: node.column });
      break;
    case 'range':
      out.ranges.push({ sheet: node.sheet, start: { ...node.start }, end: { ...node.end } });
      break;
    case 'structured':
      out.opaque = true;
      break;
    case 'name':
      out.opaque = true;
      break;
    case 'unary':
    case 'percent':
      collectDependencies(node.operand, out);
      break;
    case 'binary':
      collectDependencies(node.left, out);
      collectDependencies(node.right, out);
      break;
    case 'call':
      for (const a of node.args) collectDependencies(a, out);
      break;
    default:
      break;
  }
  return out;
}

/** Extract referenced cells (row, column, sheet) from an AST for the dependency graph. */
export function collectRefs(
  node: AstNode,
  out: CellRef[] = [],
  budget = 1_000_000,
): typeof out {
  switch (node.kind) {
    case 'ref':
      out.push({ sheet: node.sheet, row: node.row, column: node.column });
      break;
    case 'range':
      for (let r = node.start.row; r <= node.end.row; r++) {
        for (let c = node.start.column; c <= node.end.column; c++) {
          if (out.length >= budget) throw new Error('reference budget exceeded');
          out.push({ sheet: node.sheet, row: r, column: c });
        }
      }
      break;
    case 'structured':
      break;
    case 'unary':
      collectRefs(node.operand, out);
      break;
    case 'percent':
      collectRefs(node.operand, out);
      break;
    case 'binary':
      collectRefs(node.left, out);
      collectRefs(node.right, out);
      break;
    case 'call':
      for (const a of node.args) collectRefs(a, out);
      break;
    default:
      break;
  }
  return out;
}

export { columnToIndex };
