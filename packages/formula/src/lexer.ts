export type TokenType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'error'
  | 'ident'
  | 'cellref'
  | 'rangeref'
  | 'sheetref'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'colon'
  | 'eof';

export interface Token {
  type: TokenType;
  text: string;
  value?: number | string | boolean;
  /** sheet-qualified prefix, e.g. Sheet1 for Sheet1!A1 */
  sheet?: string;
}

const OPERATORS = ['<>', '<=', '>=', '+', '-', '*', '/', '^', '&', '%', '=', '<', '>'];

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i]!;

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    // number
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i;
      while (j < n && /[0-9]/.test(input[j]!)) j += 1;
      if (input[j] === '.') {
        j += 1;
        while (j < n && /[0-9]/.test(input[j]!)) j += 1;
      }
      if (input[j] === 'e' || input[j] === 'E') {
        let k = j + 1;
        if (input[k] === '+' || input[k] === '-') k += 1;
        if (/[0-9]/.test(input[k] ?? '')) {
          j = k;
          while (j < n && /[0-9]/.test(input[j]!)) j += 1;
        }
      }
      tokens.push({ type: 'number', text: input.slice(i, j), value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }

    // string literal with doubled-quote escape
    if (ch === '"') {
      let j = i + 1;
      let out = '';
      while (j < n) {
        if (input[j] === '"') {
          if (input[j + 1] === '"') {
            out += '"';
            j += 2;
          } else {
            j += 1;
            break;
          }
        } else {
          out += input[j]!;
          j += 1;
        }
      }
      tokens.push({ type: 'string', text: input.slice(i, j), value: out });
      i = j;
      continue;
    }

    // error literal
    if (ch === '#') {
      const rest = input.slice(i, i + 12);
      const m = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!|CIRCULAR!)/.exec(rest);
      if (m) {
        tokens.push({ type: 'error', text: `#${m[1]}`, value: `#${m[1]}` });
        i += m[0].length;
        continue;
      }
      throw new Error(`Unknown error literal at ${i}`);
    }

    // boolean TRUE/FALSE
    if (/^(TRUE|FALSE)(?![A-Za-z0-9_.])/i.test(input.slice(i, i + 5))) {
      const m = /^(TRUE|FALSE)/i.exec(input.slice(i, i + 5))!;
      tokens.push({ type: 'boolean', text: m[0], value: m[0].toUpperCase() === 'TRUE' });
      i += m[0].length;
      continue;
    }

    // identifier / reference (may be sheet-quoted)
    if (/[A-Za-z_$']/.test(ch)) {
      let j = i;
      let sheet: string | undefined;
      // quoted sheet
      if (ch === "'") {
        let sheetName = '';
        j += 1;
        while (j < n) {
          if (input[j] === "'" && input[j + 1] === "'") {
            sheetName += "'";
            j += 2;
          } else if (input[j] === "'") {
            j += 1;
            break;
          } else {
            sheetName += input[j]!;
            j += 1;
          }
        }
        if (input[j] !== '!') throw new Error(`Expected ! after quoted sheet near ${i}`);
        sheet = sheetName;
        j += 1;
      }
      const scan = (): number => {
        while (j < n && /[A-Za-z0-9_.$]/.test(input[j]!)) j += 1;
        return j;
      };
      let bodyStart: number;
      if (sheet !== undefined) {
        bodyStart = j;
        scan();
      } else {
        scan();
        if (input[j] === '!' && j > i) {
          sheet = input.slice(i, j);
          j += 1;
          bodyStart = j;
          scan();
        } else {
          bodyStart = i;
        }
      }
      const text = input.slice(i, j);
      const body = input.slice(bodyStart, j);
      // A name like LOG10 looks like a cell ref (LOG + 10); a trailing "("
      // marks it as a function call instead.
      const followedByParen = /^\s*\(/.test(input.slice(j));
      const isRef =
        /^[A-Za-z]{1,3}\$?[0-9]{1,7}$/.test(body.replace(/\$/g, '')) && !followedByParen;
      tokens.push({ type: isRef ? 'cellref' : 'ident', text, sheet });
      i = j;
      continue;
    }

    // operators
    const two = input.slice(i, i + 2);
    if (OPERATORS.includes(two)) {
      tokens.push({ type: 'operator', text: two });
      i += 2;
      continue;
    }
    if (OPERATORS.includes(ch)) {
      tokens.push({ type: 'operator', text: ch });
      i += 1;
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'lparen', text: '(' }); i += 1; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', text: ')' }); i += 1; continue; }
    if (ch === '[') { tokens.push({ type: 'lbracket', text: '[' }); i += 1; continue; }
    if (ch === ']') { tokens.push({ type: 'rbracket', text: ']' }); i += 1; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', text: ',' }); i += 1; continue; }
    if (ch === ':') { tokens.push({ type: 'colon', text: ':' }); i += 1; continue; }

    throw new Error(`Unexpected character "${ch}" at position ${i}`);
  }

  tokens.push({ type: 'eof', text: '' });
  return tokens;
}
