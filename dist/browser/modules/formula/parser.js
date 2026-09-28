document.currentScript.__ezygridRegister("formula/parser", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.columnToIndex = exports.Parser = void 0;
exports.collectDependencies = collectDependencies;
exports.collectRefs = collectRefs;
const lexer_js_1 = require("./lexer.js");
const model_1 = require("@ezygrid/model");
Object.defineProperty(exports, "columnToIndex", { enumerable: true, get: function () { return model_1.columnToIndex; } });
/**
 * Recursive-descent parser producing an AST.
 * Precedence (loosest to tightest): comparison, concat, additive, multiplicative, power, unary, percent/postfix.
 */
class Parser {
    tokens;
    pos = 0;
    constructor(input) {
        this.tokens = (0, lexer_js_1.tokenize)(input);
    }
    static parse(input) {
        const p = new Parser(input);
        const node = p.parseExpression();
        // The whole input must be consumed; "=1 2" must not silently accept "=1".
        if (p.pos < p.tokens.length && p.peek().type !== 'eof') {
            throw new Error(`Unexpected trailing token ${p.peek().type} "${p.peek().text}"`);
        }
        return node;
    }
    peek() {
        return this.tokens[this.pos];
    }
    next() {
        return this.tokens[this.pos++];
    }
    expect(type) {
        const t = this.next();
        if (t.type !== type)
            throw new Error(`Expected ${type}, got ${t.type} "${t.text}"`);
        return t;
    }
    parseExpression() {
        return this.parseComparison();
    }
    parseComparison() {
        let left = this.parseConcat();
        while (this.peek().type === 'operator' && ['=', '<>', '<', '>', '<=', '>='].includes(this.peek().text)) {
            const op = this.next().text;
            const right = this.parseConcat();
            left = { kind: 'binary', op, left, right };
        }
        return left;
    }
    parseConcat() {
        let left = this.parseAdditive();
        while (this.peek().type === 'operator' && this.peek().text === '&') {
            this.next();
            const right = this.parseAdditive();
            left = { kind: 'binary', op: '&', left, right };
        }
        return left;
    }
    parseAdditive() {
        let left = this.parseMultiplicative();
        while (this.peek().type === 'operator' && (this.peek().text === '+' || this.peek().text === '-')) {
            const op = this.next().text;
            const right = this.parseMultiplicative();
            left = { kind: 'binary', op, left, right };
        }
        return left;
    }
    parseMultiplicative() {
        let left = this.parsePower();
        while (this.peek().type === 'operator' && (this.peek().text === '*' || this.peek().text === '/')) {
            const op = this.next().text;
            const right = this.parsePower();
            left = { kind: 'binary', op, left, right };
        }
        return left;
    }
    parsePower() {
        let left = this.parseUnary();
        while (this.peek().type === 'operator' && this.peek().text === '^') {
            this.next();
            const right = this.parseUnary();
            left = { kind: 'binary', op: '^', left, right };
        }
        return left;
    }
    parseUnary() {
        if (this.peek().type === 'operator' && (this.peek().text === '-' || this.peek().text === '+')) {
            const op = this.next().text;
            return { kind: 'unary', op, operand: this.parseUnary() };
        }
        return this.parsePostfix();
    }
    parsePostfix() {
        let node = this.parsePrimary();
        while (this.peek().type === 'operator' && this.peek().text === '%') {
            this.next();
            node = { kind: 'percent', operand: node };
        }
        return node;
    }
    parsePrimary() {
        const t = this.next();
        if (t.type === 'number')
            return { kind: 'number', value: t.value };
        if (t.type === 'string')
            return { kind: 'string', value: t.value };
        if (t.type === 'boolean') {
            // Allow the zero-arg call forms TRUE() / FALSE().
            if (this.peek().type === 'lparen') {
                this.next();
                this.expect('rparen');
            }
            return { kind: 'boolean', value: t.value };
        }
        if (t.type === 'error')
            return { kind: 'error', value: t.value };
        if (t.type === 'lparen') {
            const inner = this.parseExpression();
            this.expect('rparen');
            return inner;
        }
        if (t.type === 'cellref') {
            const sheet = t.sheet;
            const body = (refText) => {
                const bang = refText.lastIndexOf('!');
                return bang >= 0 ? refText.slice(bang + 1) : refText;
            };
            if (this.peek().type === 'colon') {
                this.next();
                const second = this.expect('cellref');
                const a = (0, model_1.fromA1)(body(t.text));
                const b = (0, model_1.fromA1)(body(second.text));
                return {
                    kind: 'range',
                    sheet: sheet ?? second.sheet,
                    start: { row: Math.min(a.row, b.row), column: Math.min(a.column, b.column) },
                    end: { row: Math.max(a.row, b.row), column: Math.max(a.column, b.column) },
                };
            }
            const addr = (0, model_1.fromA1)(body(t.text));
            return { kind: 'ref', sheet, row: addr.row, column: addr.column };
        }
        if (t.type === 'ident') {
            // structured reference: Table[Column] or Table[@Column] or bare Table
            if (this.peek().type === 'lbracket') {
                this.next();
                let column;
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
                const args = [];
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
exports.Parser = Parser;
/**
 * Extract dependencies from an AST without expanding ranges into per-cell
 * references: rectangular ranges are kept as ranges so a small formula
 * (e.g. =SUM(A1:XFD1048576)) cannot force billion-entry registration.
 */
function collectDependencies(node, out = { refs: [], ranges: [] }) {
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
            for (const a of node.args)
                collectDependencies(a, out);
            break;
        default:
            break;
    }
    return out;
}
/** Extract referenced cells (row, column, sheet) from an AST for the dependency graph. */
function collectRefs(node, out = [], budget = 1_000_000) {
    switch (node.kind) {
        case 'ref':
            out.push({ sheet: node.sheet, row: node.row, column: node.column });
            break;
        case 'range':
            for (let r = node.start.row; r <= node.end.row; r++) {
                for (let c = node.start.column; c <= node.end.column; c++) {
                    if (out.length >= budget)
                        throw new Error('reference budget exceeded');
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
            for (const a of node.args)
                collectRefs(a, out);
            break;
        default:
            break;
    }
    return out;
}

});
