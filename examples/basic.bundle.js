(() => {
  // packages/model/src/coordinates.ts
  function indexToColumn(index) {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError(`column index must be a non-negative integer, got ${index}`);
    }
    let n = index;
    let out = "";
    do {
      out = String.fromCharCode(65 + n % 26) + out;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
  }
  function columnToIndex(letters) {
    let n = 0;
    for (const ch of letters) {
      const code = ch.charCodeAt(0) | 32;
      if (code < 97 || code > 122) {
        throw new Error(`invalid column letters: "${letters}"`);
      }
      n = n * 26 + (code - 96);
    }
    return n - 1;
  }
  function toA1(row, column) {
    if (!Number.isInteger(row) || row < 0) {
      throw new RangeError(`row must be a non-negative integer, got ${row}`);
    }
    return `${indexToColumn(column)}${row + 1}`;
  }
  function fromA1(address) {
    const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(address);
    if (!m) {
      throw new Error(`invalid A1 address: "${address}"`);
    }
    return { row: Number(m[2]) - 1, column: columnToIndex(m[1]) };
  }
  function parseRange(range) {
    let sheet;
    let body = range;
    const bang = range.lastIndexOf("!");
    if (bang >= 0) {
      sheet = range.slice(0, bang).replace(/^'(.*)'$/, (_, inner) => inner.replace(/''/g, "'"));
      body = range.slice(bang + 1);
    }
    const parts = body.split(":");
    const a = fromA1(parts[0]);
    const b = parts[1] ? fromA1(parts[1]) : a;
    return {
      sheet,
      top: Math.min(a.row, b.row),
      left: Math.min(a.column, b.column),
      bottom: Math.max(a.row, b.row),
      right: Math.max(a.column, b.column)
    };
  }
  function rectToRange(rect) {
    const a = toA1(rect.top, rect.left);
    if (rect.top === rect.bottom && rect.left === rect.right) return a;
    return `${a}:${toA1(rect.bottom, rect.right)}`;
  }
  function rectContains(rect, row, column) {
    return row >= rect.top && row <= rect.bottom && column >= rect.left && column <= rect.right;
  }

  // packages/model/src/ids.ts
  var counter = 0;
  function createId(prefix = "id") {
    counter += 1;
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${rand}`;
  }

  // packages/model/src/sparse-store.ts
  var PAGE_BITS = 8;
  var PAGE_SIZE = 1 << PAGE_BITS;
  var PAGE_MASK = PAGE_SIZE - 1;
  function pageKey(pageRow, pageCol) {
    return pageRow * 1073741824 + pageCol;
  }
  function cellOffset(row, column) {
    return (row & PAGE_MASK) * PAGE_SIZE + (column & PAGE_MASK);
  }
  var SparseCellStore = class {
    pages = /* @__PURE__ */ new Map();
    used;
    getCell(row, column) {
      const page = this.pages.get(pageKey(Math.floor(row / PAGE_SIZE), Math.floor(column / PAGE_SIZE)));
      return page?.cells.get(cellOffset(row, column));
    }
    setCell(row, column, record) {
      const pKey = pageKey(Math.floor(row / PAGE_SIZE), Math.floor(column / PAGE_SIZE));
      if (!record) {
        const page2 = this.pages.get(pKey);
        if (page2) {
          page2.cells.delete(cellOffset(row, column));
          if (page2.cells.size === 0) {
            this.pages.delete(pKey);
          }
          this.recomputeUsedRange();
        }
        return;
      }
      let page = this.pages.get(pKey);
      if (!page) {
        page = { cells: /* @__PURE__ */ new Map() };
        this.pages.set(pKey, page);
      }
      page.cells.set(cellOffset(row, column), record);
      this.updateUsedRange(row, column);
    }
    get pageCount() {
      return this.pages.size;
    }
    /** Iterate every stored cell (sparse: only used cells are visited). */
    forEach(visit) {
      for (const [pKey, page] of this.pages) {
        const baseRow = Math.floor(pKey / 1073741824) * PAGE_SIZE;
        const baseCol = pKey % 1073741824 * PAGE_SIZE;
        for (const [offset, record] of page.cells) {
          visit(
            baseRow + Math.floor(offset / PAGE_SIZE),
            baseCol + offset % PAGE_SIZE,
            record
          );
        }
      }
    }
    get usedRange() {
      return this.used;
    }
    updateUsedRange(row, column) {
      if (!this.used) {
        this.used = { top: row, left: column, bottom: row, right: column };
        return;
      }
      const u = this.used;
      if (row < u.top) u.top = row;
      if (column < u.left) u.left = column;
      if (row > u.bottom) u.bottom = row;
      if (column > u.right) u.right = column;
    }
    /** Shift every stored cell by a structural row change at `index`. */
    insertRows(index, count) {
      this.transformRows(index, (r) => r >= index ? r + count : r);
    }
    deleteRows(index, count) {
      this.transformRows(index, (r) => {
        if (r < index) return r;
        if (r < index + count) return -1;
        return r - count;
      });
    }
    insertColumns(index, count) {
      this.transformColumns(index, (c) => c >= index ? c + count : c);
    }
    deleteColumns(index, count) {
      this.transformColumns(index, (c) => {
        if (c < index) return c;
        if (c < index + count) return -1;
        return c - count;
      });
    }
    rebuild() {
      this.recomputeUsedRange();
    }
    /** Drop every cell in a row band (used for structural undo prototype). */
    recomputeUsedRange() {
      this.used = void 0;
      for (const [pKey, page] of this.pages) {
        const baseRow = Math.floor(pKey / 1073741824) * PAGE_SIZE;
        const baseCol = pKey % 1073741824 * PAGE_SIZE;
        for (const offset of page.cells.keys()) {
          const row = baseRow + Math.floor(offset / PAGE_SIZE);
          const column = baseCol + offset % PAGE_SIZE;
          this.updateUsedRange(row, column);
        }
      }
    }
    transformRows(index, map) {
      const entries = [];
      for (const [pKey, page] of this.pages) {
        for (const [offset, record] of page.cells) {
          const baseRow = Math.floor(pKey / 1073741824) * PAGE_SIZE;
          const baseCol = pKey % 1073741824 * PAGE_SIZE;
          const row = baseRow + Math.floor(offset / PAGE_SIZE);
          const column = baseCol + offset % PAGE_SIZE;
          const mapped = map(row);
          if (mapped === -1) {
            page.cells.delete(offset);
          } else if (mapped !== row) {
            entries.push({ row: mapped, column, record });
            page.cells.delete(offset);
          }
        }
        if (page.cells.size === 0) this.pages.delete(pKey);
      }
      for (const e of entries) this.setCell(e.row, e.column, e.record);
      this.rebuild();
    }
    transformColumns(index, map) {
      const entries = [];
      for (const [pKey, page] of this.pages) {
        for (const [offset, record] of page.cells) {
          const baseRow = Math.floor(pKey / 1073741824) * PAGE_SIZE;
          const baseCol = pKey % 1073741824 * PAGE_SIZE;
          const row = baseRow + Math.floor(offset / PAGE_SIZE);
          const column = baseCol + offset % PAGE_SIZE;
          const mapped = map(column);
          if (mapped === -1) {
            page.cells.delete(offset);
          } else if (mapped !== column) {
            entries.push({ row, column: mapped, record });
            page.cells.delete(offset);
          }
        }
        if (page.cells.size === 0) this.pages.delete(pKey);
      }
      for (const e of entries) this.setCell(e.row, e.column, e.record);
      this.rebuild();
    }
  };

  // packages/model/src/size-index.ts
  var SizeIndex = class {
    n;
    tree;
    defaultSize;
    constructor(logicalSize, defaultSize) {
      this.n = logicalSize;
      this.defaultSize = defaultSize;
      this.tree = new Float64Array(this.n + 1);
      for (let i = 1; i <= this.n; i++) this.tree[i] = defaultSize;
      for (let i = 1; i <= this.n; i++) {
        const parent = i + (i & -i);
        const value = this.tree[i];
        if (parent <= this.n && value !== void 0) {
          this.tree[parent] = (this.tree[parent] ?? 0) + value;
        }
      }
    }
    /** Total pixel size of the first `count` items. */
    prefixSum(count) {
      let sum = 0;
      for (let i = Math.min(count, this.n); i > 0; i -= i & -i) sum += this.tree[i];
      return sum;
    }
    totalSize() {
      return this.prefixSum(this.n);
    }
    /** Pixel offset of item `index` (0-based). */
    offsetOf(index) {
      return this.prefixSum(index);
    }
    /** Update the size of item `index` (0-based) to `size`. */
    setSize(index, size) {
      const current = this.sizeOf(index);
      const delta = size - current;
      for (let i = index + 1; i <= this.n; i += i & -i) {
        this.tree[i] = (this.tree[i] ?? 0) + delta;
      }
    }
    sizeOf(index) {
      return this.prefixSum(index + 1) - this.prefixSum(index);
    }
    /** Largest index whose start offset is <= pixel, i.e. index containing `pixel`. */
    indexAt(pixel) {
      let pos = 0;
      let rem = pixel;
      const highest = 2 ** Math.floor(Math.log2(this.n));
      for (let stride = highest; stride > 0; stride >>= 1) {
        const next = pos + stride;
        if (next <= this.n && this.tree[next] <= rem) {
          pos = next;
          rem -= this.tree[next];
        }
      }
      return Math.max(0, Math.min(this.n - 1, pos));
    }
  };

  // packages/model/src/operations.ts
  var op = (workbookId, type, payload, worksheetId, actorId) => ({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    actorId,
    workbookId,
    worksheetId,
    type,
    payload,
    timestamp: Date.now()
  });

  // packages/model/src/history.ts
  var HistoryService = class {
    undoStack = [];
    redoStack = [];
    limit;
    batching = 0;
    constructor(limit = 500) {
      this.limit = limit;
    }
    push(operation, inverse) {
      if (this.batching > 0) {
        this.undoStack.push(operation);
        return;
      }
      this.undoStack.push(operation);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    beginBatch() {
      this.batching += 1;
    }
    endBatch() {
      this.batching = Math.max(0, this.batching - 1);
    }
    get canUndo() {
      return this.undoStack.length > 0;
    }
    get canRedo() {
      return this.redoStack.length > 0;
    }
    popUndo() {
      const op2 = this.undoStack.pop();
      if (op2) this.redoStack.push(op2);
      return op2;
    }
    popRedo() {
      const op2 = this.redoStack.pop();
      if (op2) this.undoStack.push(op2);
      return op2;
    }
    clear() {
      this.undoStack.length = 0;
      this.redoStack.length = 0;
    }
    /**
     * Transform the coordinates of stored cell operations after a structural
     * edit (row/column insert/delete). `mapper` maps (row, column) to the new
     * coordinates, or undefined when the target was deleted (the operation is
     * then dropped from history). Applies to both stacks.
     */
    transformCells(sheetId, mapper) {
      const apply = (stack) => {
        for (let i = stack.length - 1; i >= 0; i--) {
          const operation = stack[i];
          if (operation.type !== "cell.set" || operation.worksheetId !== sheetId) continue;
          const payload = operation.payload;
          const mapped = mapper(payload.row, payload.column);
          if (!mapped) {
            stack.splice(i, 1);
            continue;
          }
          payload.row = mapped.row;
          payload.column = mapped.column;
        }
      };
      apply(this.undoStack);
      apply(this.redoStack);
    }
  };

  // packages/model/src/ref-transform.ts
  var REF_TOKEN = /(?:'[^']*'|[A-Za-z_][A-Za-z0-9_.]*)?!?\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(?::\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?/y;
  function tokenizeFormula(formula) {
    const tokens = [];
    let i = 0;
    while (i < formula.length) {
      const ch = formula[i];
      if (ch === '"') {
        let j2 = i + 1;
        while (j2 < formula.length) {
          if (formula[j2] === '"' && formula[j2 + 1] === '"') j2 += 2;
          else if (formula[j2] === '"') {
            j2 += 1;
            break;
          } else j2 += 1;
        }
        tokens.push({ start: i, end: j2, isRef: false, text: formula.slice(i, j2) });
        i = j2;
        continue;
      }
      if (/[A-Za-z0-9_$'!]/.test(ch)) {
        REF_TOKEN.lastIndex = i;
        const m = REF_TOKEN.exec(formula);
        if (m && m.index === i) {
          const text = m[0];
          const after = formula.slice(i + text.length).match(/^\s*\(/);
          tokens.push({ start: i, end: i + text.length, isRef: !after, text });
          i += text.length;
          continue;
        }
      }
      let j = i + 1;
      while (j < formula.length && !/[A-Za-z0-9_$'!"]/.test(formula[j])) j += 1;
      tokens.push({ start: i, end: j, isRef: false, text: formula.slice(i, j) });
      i = j;
    }
    return tokens;
  }
  function shiftIndex(pos, shift) {
    const { at, delta } = shift;
    if (delta > 0) {
      return pos >= at ? pos + delta : pos;
    }
    const count = -delta;
    if (pos < at) return pos;
    if (pos < at + count) return void 0;
    return pos - count;
  }
  function shiftRefPart(part, shift) {
    const bang = part.lastIndexOf("!");
    const prefix = bang >= 0 ? part.slice(0, bang + 1) : "";
    const body = bang >= 0 ? part.slice(bang + 1) : part;
    const m = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/.exec(body);
    if (!m) return part;
    const dollarCol = m[1] ?? "";
    const letters = m[2] ?? "";
    const dollarRow = m[3] ?? "";
    const digits = m[4] ?? "";
    const column = columnToIndex(letters);
    const row = Number(digits) - 1;
    if (shift.kind === "row") {
      const mapped2 = shiftIndex(row, shift);
      if (mapped2 === void 0) return void 0;
      return `${prefix}${dollarCol}${letters}${dollarRow}${mapped2 + 1}`;
    }
    const mapped = shiftIndex(column, shift);
    if (mapped === void 0) return void 0;
    return `${prefix}${dollarCol}${indexToColumn(mapped)}${dollarRow}${digits}`;
  }
  function transformRefToken(token, shift) {
    const colon = token.indexOf(":");
    if (colon < 0) {
      return shiftRefPart(token, shift);
    }
    const a = shiftRefPart(token.slice(0, colon), shift);
    const b = shiftRefPart(token.slice(colon + 1), shift);
    if (a === void 0 && b === void 0) return void 0;
    if (a === void 0) return b;
    if (b === void 0) return a;
    return `${a}:${b}`;
  }
  function unquoteSheet(text) {
    if (text.startsWith("'") && text.endsWith("'")) {
      return text.slice(1, -1).replace(/''/g, "'");
    }
    return text;
  }
  function transformFormulaRefs(formula, shift, options) {
    const tokens = tokenizeFormula(formula);
    let out = "";
    for (const t of tokens) {
      if (!t.isRef) {
        out += t.text;
        continue;
      }
      const bang = t.text.lastIndexOf("!");
      const applies = bang >= 0 ? unquoteSheet(t.text.slice(0, bang)) === options.targetSheet : options.ownerSheet === options.targetSheet;
      out += applies ? transformRefToken(t.text, shift) ?? "#REF!" : t.text;
    }
    return out;
  }

  // packages/formula/src/errors.ts
  var FormulaError = class extends Error {
    value;
    constructor(value, message) {
      super(message ?? value);
      this.value = value;
    }
  };
  var ERR = {
    NULL: () => new FormulaError("#NULL!"),
    DIV0: () => new FormulaError("#DIV/0!"),
    VALUE: () => new FormulaError("#VALUE!"),
    REF: () => new FormulaError("#REF!"),
    NAME: () => new FormulaError("#NAME?"),
    NUM: () => new FormulaError("#NUM!"),
    NA: () => new FormulaError("#N/A"),
    SPILL: () => new FormulaError("#SPILL!"),
    CALC: () => new FormulaError("#CALC!"),
    CIRCULAR: () => new FormulaError("#CIRCULAR!")
  };

  // packages/formula/src/lexer.ts
  var OPERATORS = ["<>", "<=", ">=", "+", "-", "*", "/", "^", "&", "%", "=", "<", ">"];
  function tokenize(input) {
    const tokens = [];
    let i = 0;
    const n = input.length;
    while (i < n) {
      const ch = input[i];
      if (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        i += 1;
        continue;
      }
      if (/[0-9]/.test(ch) || ch === "." && /[0-9]/.test(input[i + 1] ?? "")) {
        let j = i;
        while (j < n && /[0-9]/.test(input[j])) j += 1;
        if (input[j] === ".") {
          j += 1;
          while (j < n && /[0-9]/.test(input[j])) j += 1;
        }
        if (input[j] === "e" || input[j] === "E") {
          let k = j + 1;
          if (input[k] === "+" || input[k] === "-") k += 1;
          if (/[0-9]/.test(input[k] ?? "")) {
            j = k;
            while (j < n && /[0-9]/.test(input[j])) j += 1;
          }
        }
        tokens.push({ type: "number", text: input.slice(i, j), value: Number(input.slice(i, j)) });
        i = j;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        let out = "";
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
            out += input[j];
            j += 1;
          }
        }
        tokens.push({ type: "string", text: input.slice(i, j), value: out });
        i = j;
        continue;
      }
      if (ch === "#") {
        const rest = input.slice(i, i + 12);
        const m = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!|CIRCULAR!)/.exec(rest);
        if (m) {
          tokens.push({ type: "error", text: `#${m[1]}`, value: `#${m[1]}` });
          i += m[0].length;
          continue;
        }
        throw new Error(`Unknown error literal at ${i}`);
      }
      if (/^(TRUE|FALSE)(?![A-Za-z0-9_.])/i.test(input.slice(i, i + 5))) {
        const m = /^(TRUE|FALSE)/i.exec(input.slice(i, i + 5));
        tokens.push({ type: "boolean", text: m[0], value: m[0].toUpperCase() === "TRUE" });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_$']/.test(ch)) {
        let j = i;
        let sheet;
        if (ch === "'") {
          let sheetName = "";
          j += 1;
          while (j < n) {
            if (input[j] === "'" && input[j + 1] === "'") {
              sheetName += "'";
              j += 2;
            } else if (input[j] === "'") {
              j += 1;
              break;
            } else {
              sheetName += input[j];
              j += 1;
            }
          }
          if (input[j] !== "!") throw new Error(`Expected ! after quoted sheet near ${i}`);
          sheet = sheetName;
          j += 1;
        }
        const scan = () => {
          while (j < n && /[A-Za-z0-9_.$]/.test(input[j])) j += 1;
          return j;
        };
        let bodyStart;
        if (sheet !== void 0) {
          bodyStart = j;
          scan();
        } else {
          scan();
          if (input[j] === "!" && j > i) {
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
        const followedByParen = /^\s*\(/.test(input.slice(j));
        const isRef = /^[A-Za-z]{1,3}\$?[0-9]{1,7}$/.test(body.replace(/\$/g, "")) && !followedByParen;
        tokens.push({ type: isRef ? "cellref" : "ident", text, sheet });
        i = j;
        continue;
      }
      const two = input.slice(i, i + 2);
      if (OPERATORS.includes(two)) {
        tokens.push({ type: "operator", text: two });
        i += 2;
        continue;
      }
      if (OPERATORS.includes(ch)) {
        tokens.push({ type: "operator", text: ch });
        i += 1;
        continue;
      }
      if (ch === "(") {
        tokens.push({ type: "lparen", text: "(" });
        i += 1;
        continue;
      }
      if (ch === ")") {
        tokens.push({ type: "rparen", text: ")" });
        i += 1;
        continue;
      }
      if (ch === "[") {
        tokens.push({ type: "lbracket", text: "[" });
        i += 1;
        continue;
      }
      if (ch === "]") {
        tokens.push({ type: "rbracket", text: "]" });
        i += 1;
        continue;
      }
      if (ch === ",") {
        tokens.push({ type: "comma", text: "," });
        i += 1;
        continue;
      }
      if (ch === ":") {
        tokens.push({ type: "colon", text: ":" });
        i += 1;
        continue;
      }
      throw new Error(`Unexpected character "${ch}" at position ${i}`);
    }
    tokens.push({ type: "eof", text: "" });
    return tokens;
  }

  // packages/formula/src/parser.ts
  var Parser = class _Parser {
    tokens;
    pos = 0;
    constructor(input) {
      this.tokens = tokenize(input);
    }
    static parse(input) {
      const p = new _Parser(input);
      const node = p.parseExpression();
      if (p.pos < p.tokens.length && p.peek().type !== "eof") {
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
      if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} "${t.text}"`);
      return t;
    }
    parseExpression() {
      return this.parseComparison();
    }
    parseComparison() {
      let left = this.parseConcat();
      while (this.peek().type === "operator" && ["=", "<>", "<", ">", "<=", ">="].includes(this.peek().text)) {
        const op2 = this.next().text;
        const right = this.parseConcat();
        left = { kind: "binary", op: op2, left, right };
      }
      return left;
    }
    parseConcat() {
      let left = this.parseAdditive();
      while (this.peek().type === "operator" && this.peek().text === "&") {
        this.next();
        const right = this.parseAdditive();
        left = { kind: "binary", op: "&", left, right };
      }
      return left;
    }
    parseAdditive() {
      let left = this.parseMultiplicative();
      while (this.peek().type === "operator" && (this.peek().text === "+" || this.peek().text === "-")) {
        const op2 = this.next().text;
        const right = this.parseMultiplicative();
        left = { kind: "binary", op: op2, left, right };
      }
      return left;
    }
    parseMultiplicative() {
      let left = this.parsePower();
      while (this.peek().type === "operator" && (this.peek().text === "*" || this.peek().text === "/")) {
        const op2 = this.next().text;
        const right = this.parsePower();
        left = { kind: "binary", op: op2, left, right };
      }
      return left;
    }
    parsePower() {
      let left = this.parseUnary();
      while (this.peek().type === "operator" && this.peek().text === "^") {
        this.next();
        const right = this.parseUnary();
        left = { kind: "binary", op: "^", left, right };
      }
      return left;
    }
    parseUnary() {
      if (this.peek().type === "operator" && (this.peek().text === "-" || this.peek().text === "+")) {
        const op2 = this.next().text;
        return { kind: "unary", op: op2, operand: this.parseUnary() };
      }
      return this.parsePostfix();
    }
    parsePostfix() {
      let node = this.parsePrimary();
      while (this.peek().type === "operator" && this.peek().text === "%") {
        this.next();
        node = { kind: "percent", operand: node };
      }
      return node;
    }
    parsePrimary() {
      const t = this.next();
      if (t.type === "number") return { kind: "number", value: t.value };
      if (t.type === "string") return { kind: "string", value: t.value };
      if (t.type === "boolean") {
        if (this.peek().type === "lparen") {
          this.next();
          this.expect("rparen");
        }
        return { kind: "boolean", value: t.value };
      }
      if (t.type === "error") return { kind: "error", value: t.value };
      if (t.type === "lparen") {
        const inner = this.parseExpression();
        this.expect("rparen");
        return inner;
      }
      if (t.type === "cellref") {
        const sheet = t.sheet;
        const body = (refText) => {
          const bang = refText.lastIndexOf("!");
          return bang >= 0 ? refText.slice(bang + 1) : refText;
        };
        if (this.peek().type === "colon") {
          this.next();
          const second = this.expect("cellref");
          const a = fromA1(body(t.text));
          const b = fromA1(body(second.text));
          return {
            kind: "range",
            sheet: sheet ?? second.sheet,
            start: { row: Math.min(a.row, b.row), column: Math.min(a.column, b.column) },
            end: { row: Math.max(a.row, b.row), column: Math.max(a.column, b.column) }
          };
        }
        const addr = fromA1(body(t.text));
        return { kind: "ref", sheet, row: addr.row, column: addr.column };
      }
      if (t.type === "ident") {
        if (this.peek().type === "lbracket") {
          this.next();
          let column;
          let item = false;
          if (this.peek().type === "operator" && this.peek().text === "@") {
            item = true;
            this.next();
          }
          if (this.peek().type === "ident" || this.peek().type === "cellref" || this.peek().type === "rangeref") {
            column = this.next().text;
          }
          this.expect("rbracket");
          return { kind: "structured", table: t.text, column, item };
        }
        if (this.peek().type === "lparen") {
          this.next();
          const args = [];
          if (this.peek().type !== "rparen") {
            args.push(this.parseExpression());
            while (this.peek().type === "comma") {
              this.next();
              args.push(this.parseExpression());
            }
          }
          this.expect("rparen");
          return { kind: "call", name: t.text.toUpperCase(), args };
        }
        return { kind: "name", name: t.text };
      }
      throw new Error(`Unexpected token ${t.type} "${t.text}"`);
    }
  };
  function collectRefs(node, out = []) {
    switch (node.kind) {
      case "ref":
        out.push({ sheet: node.sheet, row: node.row, column: node.column });
        break;
      case "range":
        for (let r = node.start.row; r <= node.end.row; r++) {
          for (let c = node.start.column; c <= node.end.column; c++) {
            out.push({ sheet: node.sheet, row: r, column: c });
          }
        }
        break;
      case "structured":
        break;
      case "unary":
        collectRefs(node.operand, out);
        break;
      case "percent":
        collectRefs(node.operand, out);
        break;
      case "binary":
        collectRefs(node.left, out);
        collectRefs(node.right, out);
        break;
      case "call":
        for (const a of node.args) collectRefs(a, out);
        break;
      default:
        break;
    }
    return out;
  }

  // packages/formula/src/matrix.ts
  function matrix(values) {
    return { kind: "matrix", rows: values.length, columns: values[0]?.length ?? 0, values };
  }
  function isMatrix(v) {
    return typeof v === "object" && v !== null && v.kind === "matrix";
  }
  function flatten(v) {
    if (isMatrix(v)) {
      const out = [];
      for (const row of v.values) for (const item of row) out.push(item);
      return out;
    }
    return [v];
  }

  // packages/formula/src/functions.ts
  function toNumber(v) {
    if (v instanceof FormulaError) throw v;
    if (v === null || v === "") return 0;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    const n = Number(v);
    if (Number.isNaN(n)) throw ERR.VALUE();
    return n;
  }
  function toText(v) {
    if (v instanceof FormulaError) throw v;
    if (v === null) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  }
  function toBool(v) {
    if (v instanceof FormulaError) throw v;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (v === null || v === "") return false;
    const s = String(v).toUpperCase();
    if (s === "TRUE") return true;
    if (s === "FALSE") return false;
    throw ERR.VALUE();
  }
  function numbersOf(args) {
    const nums = [];
    for (const a of args) {
      for (const v of flatten(a)) {
        if (v === null) continue;
        if (typeof v === "number") nums.push(v);
        else if (typeof v === "boolean") nums.push(v ? 1 : 0);
        else if (typeof v === "string") {
          const n = Number(v);
          if (!Number.isNaN(n) && v.trim() !== "") nums.push(n);
        }
      }
    }
    return nums;
  }
  function flatTexts(args) {
    const texts = [];
    for (const a of args) {
      for (const v of flatten(a)) {
        if (v !== null) texts.push(toText(v));
      }
    }
    return texts;
  }
  function ifArgs(args) {
    if (args.length < 2) throw ERR.VALUE();
    const cond = toBool(args[0]);
    if (cond) return args[1] ?? true;
    return args[2] ?? false;
  }
  function lookupMatch(needle, haystack, matchType = 1) {
    if (matchType === 0) {
      for (let i = 0; i < haystack.length; i++) {
        const v = haystack[i];
        if (v instanceof FormulaError) continue;
        const nv = typeof needle === "number" ? v === null ? null : Number(v) : v === null ? "" : toText(v);
        if (nv === needle) return i + 1;
      }
      throw ERR.NA();
    }
    let best = -1;
    for (let i = 0; i < haystack.length; i++) {
      const v = haystack[i];
      if (v === null || v instanceof FormulaError) continue;
      if (typeof needle === "number") {
        const n = Number(v);
        if (Number.isNaN(n)) continue;
        if (matchType === 1 ? n <= needle : n >= needle) best = i;
      } else {
        const s = toText(v);
        const cmp = matchType === 1 ? s <= needle ? 0 : 1 : s >= needle ? 0 : 1;
        if (cmp === 0) best = i;
      }
    }
    if (best === -1) throw ERR.NA();
    return best + 1;
  }
  function comparison(op2, left, right) {
    if (left instanceof FormulaError) throw left;
    if (right instanceof FormulaError) throw right;
    let a = left;
    let b = right;
    if (typeof a === "number" || typeof b === "number") {
      const na2 = a === null || a === "" ? 0 : typeof a === "string" ? Number.isNaN(Number(a)) ? NaN : Number(a) : typeof a === "boolean" ? a ? 1 : 0 : a;
      const nb2 = b === null || b === "" ? 0 : typeof b === "string" ? Number.isNaN(Number(b)) ? NaN : Number(b) : typeof b === "boolean" ? b ? 1 : 0 : b;
      if (typeof na2 === "number" && typeof nb2 === "number") {
        a = na2;
        b = nb2;
      } else {
        a = toText(a);
        b = toText(b);
      }
    }
    if (typeof a === "string" && typeof b === "string") {
      const cmp = a.localeCompare(b);
      switch (op2) {
        case "=":
          return cmp === 0;
        case "<>":
          return cmp !== 0;
        case "<":
          return cmp < 0;
        case ">":
          return cmp > 0;
        case "<=":
          return cmp <= 0;
        case ">=":
          return cmp >= 0;
        default:
          throw ERR.VALUE();
      }
    }
    const na = toNumber(a);
    const nb = toNumber(b);
    switch (op2) {
      case "=":
        return na === nb;
      case "<>":
        return na !== nb;
      case "<":
        return na < nb;
      case ">":
        return na > nb;
      case "<=":
        return na <= nb;
      case ">=":
        return na >= nb;
      default:
        throw ERR.VALUE();
    }
  }
  function parseCriteria(criteria) {
    if (criteria instanceof FormulaError) {
      return (v) => v instanceof FormulaError && v.value === criteria.value;
    }
    if (typeof criteria === "string") {
      const m = /^(<>|<=|>=|=|<|>)(.*)$/.exec(criteria);
      if (m) {
        const [, opStr, rest] = m;
        const target = rest === void 0 || rest === "" ? null : /^-?[0-9]+(\.[0-9]+)?$/.test(rest) ? Number(rest) : rest;
        return (v) => {
          try {
            return comparison(opStr === "=" ? "=" : opStr, v, target);
          } catch {
            return false;
          }
        };
      }
    }
    return (v) => {
      try {
        return comparison("=", v, criteria);
      } catch {
        return false;
      }
    };
  }
  function sumIfImpl(args, ctx, nodes) {
    return conditionalSum(args, ctx, nodes, 1, 2);
  }
  function conditionalSum(args, ctx, nodes, critIndex, sumIndex) {
    if (nodes.length < 2) throw ERR.VALUE();
    const rangeNode = nodes[0];
    const sumNode = nodes.length > sumIndex ? nodes[sumIndex] : rangeNode;
    const criteria = args[critIndex];
    const match = parseCriteria(criteria);
    const rangeCells = nodeCells(rangeNode);
    const sumCells = nodeCells(sumNode);
    let total = 0;
    for (let i = 0; i < rangeCells.length; i++) {
      const rv = ctx.getCellValue(rangeCells[i].sheet, rangeCells[i].row, rangeCells[i].column);
      if (match(rv)) {
        const sc = sumCells[i];
        if (sc) {
          const sv = ctx.getCellValue(sc.sheet, sc.row, sc.column);
          if (typeof sv === "number") total += sv;
        }
      }
    }
    return total;
  }
  function countIfImpl(args, ctx, nodes) {
    if (nodes.length < 2) throw ERR.VALUE();
    const rangeCells = nodeCells(nodes[0]);
    const match = parseCriteria(args[1]);
    let count = 0;
    for (const c of rangeCells) {
      const v = ctx.getCellValue(c.sheet, c.row, c.column);
      if (match(v)) count += 1;
    }
    return count;
  }
  function nodeCells(node) {
    if (node.kind === "ref") return [{ sheet: node.sheet, row: node.row, column: node.column }];
    if (node.kind === "range") {
      const cells = [];
      for (let r = node.start.row; r <= node.end.row; r++) {
        for (let c = node.start.column; c <= node.end.column; c++) {
          cells.push({ sheet: node.sheet, row: r, column: c });
        }
      }
      return cells;
    }
    throw ERR.VALUE();
  }
  function matrixFromNode(node, ctx) {
    const cells = nodeCells(node);
    if (cells.length === 0) throw ERR.VALUE();
    const cols = node.kind === "range" ? node.end.column - node.start.column + 1 : 1;
    const values = [];
    for (let r = 0; r < cells.length / cols; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const cell = cells[r * cols + c];
        row.push(ctx.getCellValue(cell.sheet, cell.row, cell.column));
      }
      values.push(row);
    }
    return matrix(values);
  }
  function flattenArgs(args) {
    const out = [];
    for (const a of args) {
      if (a && typeof a === "object" && a.kind === "matrix") {
        for (const row of a.values) out.push(...row);
      } else {
        out.push(a);
      }
    }
    return out;
  }
  var asMatrixArg = (args, nodes, ctx, index) => {
    const value = args[index];
    if (value && typeof value === "object" && value.kind === "matrix") {
      return value;
    }
    const node = nodes[index];
    if (!node) throw ERR.VALUE();
    return matrixFromNode(node, ctx);
  };
  var FUNCTIONS = {
    SUM: (args) => numbersOf(args).reduce((a, b) => a + b, 0),
    AVERAGE: (args) => {
      const nums = numbersOf(args);
      if (nums.length === 0) throw ERR.DIV0();
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    },
    MIN: (args) => {
      const nums = numbersOf(args);
      return nums.length ? Math.min(...nums) : 0;
    },
    MAX: (args) => {
      const nums = numbersOf(args);
      return nums.length ? Math.max(...nums) : 0;
    },
    COUNT: (args) => numbersOf(args).length,
    COUNTA: (args) => flattenArgs(args).filter((a) => a !== null && a !== "").length,
    IF: ifArgs,
    IFS: (args) => {
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (toBool(args[i])) return args[i + 1];
      }
      throw ERR.NA();
    },
    AND: (args) => args.every((a) => toBool(a)),
    OR: (args) => args.some((a) => toBool(a)),
    NOT: (args) => !toBool(args[0]),
    ROUND: (args) => {
      const n = toNumber(args[0]);
      const d = args.length > 1 ? Math.trunc(toNumber(args[1])) : 0;
      const f = 10 ** d;
      return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
    },
    ROUNDUP: (args) => {
      const n = toNumber(args[0]);
      const d = args.length > 1 ? Math.trunc(toNumber(args[1])) : 0;
      const f = 10 ** d;
      return (n < 0 ? -Math.ceil(Math.abs(n) * f) : Math.ceil(n * f)) / f;
    },
    ROUNDDOWN: (args) => {
      const n = toNumber(args[0]);
      const d = args.length > 1 ? Math.trunc(toNumber(args[1])) : 0;
      const f = 10 ** d;
      return (n < 0 ? -Math.floor(Math.abs(n) * f) : Math.floor(n * f)) / f;
    },
    ABS: (args) => Math.abs(toNumber(args[0])),
    MOD: (args) => {
      const a = toNumber(args[0]);
      const b = toNumber(args[1]);
      if (b === 0) throw ERR.DIV0();
      return a - b * Math.floor(a / b);
    },
    POWER: (args) => Math.pow(toNumber(args[0]), toNumber(args[1])),
    SQRT: (args) => {
      const n = toNumber(args[0]);
      if (n < 0) throw ERR.NUM();
      return Math.sqrt(n);
    },
    CONCAT: (args) => flatTexts(args).join(""),
    CONCATENATE: (args) => flatTexts(args).join(""),
    TEXTJOIN: (args) => {
      const sep = toText(args[0]);
      const skipEmpty = toBool(args[1]);
      const parts = args.slice(2).filter((a) => a !== null).map(toText);
      return (skipEmpty ? parts.filter((p) => p !== "") : parts).join(sep);
    },
    LEFT: (args) => {
      const s = toText(args[0]);
      const n = args.length > 1 ? Math.trunc(toNumber(args[1])) : 1;
      if (n < 0) throw ERR.VALUE();
      return s.slice(0, n);
    },
    RIGHT: (args) => {
      const s = toText(args[0]);
      const n = args.length > 1 ? Math.trunc(toNumber(args[1])) : 1;
      if (n < 0) throw ERR.VALUE();
      return n === 0 ? "" : s.slice(-n);
    },
    MID: (args) => {
      const s = toText(args[0]);
      const start = Math.trunc(toNumber(args[1]));
      const count = Math.trunc(toNumber(args[2]));
      if (start < 1 || count < 0) throw ERR.VALUE();
      return s.slice(start - 1, start - 1 + count);
    },
    LEN: (args) => toText(args[0]).length,
    TRIM: (args) => toText(args[0]).replace(/\s+/g, " ").trim(),
    UPPER: (args) => toText(args[0]).toUpperCase(),
    LOWER: (args) => toText(args[0]).toLowerCase(),
    PROPER: (args) => toText(args[0]).replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
    TODAY: () => {
      const d = /* @__PURE__ */ new Date();
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5 + 25569;
    },
    NOW: () => Date.now() / 864e5 + 25569 - (/* @__PURE__ */ new Date()).getTimezoneOffset() / 1440,
    DATE: (args) => {
      const y = toNumber(args[0]);
      const m = toNumber(args[1]);
      const d = toNumber(args[2]);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / 864e5 + 25569;
    },
    YEAR: (args) => {
      const serial = toNumber(args[0]);
      return new Date(Math.round((serial - 25569) * 864e5)).getUTCFullYear();
    },
    MONTH: (args) => {
      const serial = toNumber(args[0]);
      return new Date(Math.round((serial - 25569) * 864e5)).getUTCMonth() + 1;
    },
    DAY: (args) => {
      const serial = toNumber(args[0]);
      return new Date(Math.round((serial - 25569) * 864e5)).getUTCDate();
    },
    VLOOKUP: (args, ctx, nodes) => {
      const needle = args[0];
      const tableNode = nodes[1];
      if (!tableNode || tableNode.kind !== "range" && tableNode.kind !== "ref") throw ERR.VALUE();
      const cells = nodeCells(tableNode);
      const cols = tableNode.kind === "range" ? tableNode.end.column - tableNode.start.column + 1 : 1;
      const colIndex = Math.trunc(toNumber(args[2]));
      const match = parseCriteria(typeof needle === "string" && args.length > 3 && !toBool(args[3]) ? needle : "=" + String(needle));
      for (let r = 0; r < cells.length / cols; r++) {
        const first = cells[r * cols];
        const v = ctx.getCellValue(first.sheet, first.row, first.column);
        if (match(v)) {
          const target = cells[r * cols + (colIndex - 1)];
          if (!target) throw ERR.REF();
          return ctx.getCellValue(target.sheet, target.row, target.column);
        }
      }
      throw ERR.NA();
    },
    HLOOKUP: (args, ctx, nodes) => {
      const needle = args[0];
      const tableNode = nodes[1];
      if (!tableNode || tableNode.kind !== "range") throw ERR.VALUE();
      const cells = nodeCells(tableNode);
      const cols = tableNode.end.column - tableNode.start.column + 1;
      const rowIndex = Math.trunc(toNumber(args[2]));
      const match = parseCriteria("=" + String(needle));
      for (let c = 0; c < cols; c++) {
        const v = ctx.getCellValue(cells[c].sheet, cells[c].row, cells[c].column);
        if (match(v)) {
          const target = cells[rowIndex * cols - cols + c];
          if (!target) throw ERR.REF();
          return ctx.getCellValue(target.sheet, target.row, target.column);
        }
      }
      throw ERR.NA();
    },
    INDEX: (args, ctx, nodes) => {
      const rangeNode = nodes[0];
      const row = Math.trunc(toNumber(args[1]));
      const col = args.length > 2 ? Math.trunc(toNumber(args[2])) : 1;
      if (rangeNode.kind === "range") {
        const r = rangeNode.start.row + row - 1;
        const c = rangeNode.start.column + col - 1;
        if (r > rangeNode.end.row || c > rangeNode.end.column) throw ERR.REF();
        return ctx.getCellValue(rangeNode.sheet, r, c);
      }
      if (rangeNode.kind === "ref") {
        if (row !== 1 || col !== 1) throw ERR.REF();
        return ctx.getCellValue(rangeNode.sheet, rangeNode.row, rangeNode.column);
      }
      throw ERR.VALUE();
    },
    MATCH: (args, ctx, nodes) => {
      const needle = args[0];
      const cells = nodeCells(nodes[1]);
      const type = args.length > 2 ? Math.trunc(toNumber(args[2])) : 1;
      const values = cells.map((c) => ctx.getCellValue(c.sheet, c.row, c.column));
      return lookupMatch(needle, values, type);
    },
    COUNTIF: countIfImpl,
    COUNTIFS: (args, ctx, nodes) => {
      let count = 0;
      const pairs = [];
      for (let i = 0; i + 1 < args.length && i + 1 < nodes.length; i += 2) {
        pairs.push({ cells: nodeCells(nodes[i]), match: parseCriteria(args[i + 1]) });
      }
      if (pairs.length === 0) throw ERR.VALUE();
      const size = pairs[0].cells.length;
      for (const p of pairs) {
        if (p.cells.length !== size) throw ERR.VALUE();
      }
      for (let i = 0; i < size; i++) {
        let ok = true;
        for (const p of pairs) {
          const c = p.cells[i];
          const v = c ? ctx.getCellValue(c.sheet, c.row, c.column) : null;
          if (!p.match(v)) {
            ok = false;
            break;
          }
        }
        if (ok) count += 1;
      }
      return count;
    },
    SUMIF: sumIfImpl,
    SUMIFS: (args, ctx, nodes) => {
      if (nodes.length < 3) throw ERR.VALUE();
      const sumCells = nodeCells(nodes[0]);
      const pairs = [];
      for (let i = 1; i + 1 < args.length && i + 1 < nodes.length; i += 2) {
        pairs.push({ cells: nodeCells(nodes[i]), match: parseCriteria(args[i + 1]) });
      }
      if (pairs.length === 0) throw ERR.VALUE();
      for (const p of pairs) {
        if (p.cells.length !== sumCells.length) throw ERR.VALUE();
      }
      let total = 0;
      for (let i = 0; i < sumCells.length; i++) {
        let ok = true;
        for (const p of pairs) {
          const c = p.cells[i];
          const v = c ? ctx.getCellValue(c.sheet, c.row, c.column) : null;
          if (!p.match(v)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const sc = sumCells[i];
          const sv = ctx.getCellValue(sc.sheet, sc.row, sc.column);
          if (typeof sv === "number") total += sv;
        }
      }
      return total;
    },
    AVERAGEIF: (args, ctx, nodes) => {
      const total = conditionalSum(args, ctx, nodes, 1, 2);
      const count = countMatching(args, ctx, nodes);
      if (count === 0) throw ERR.DIV0();
      return total / count;
    },
    ISBLANK: (args) => {
      const value = flatten(args[0] ?? null)[0] ?? null;
      return value === null || value === "";
    },
    ISNUMBER: (args) => typeof args[0] === "number",
    ISTEXT: (args) => typeof args[0] === "string",
    ISERROR: (args) => args[0] instanceof FormulaError,
    ISNA: (args) => args[0] instanceof FormulaError && args[0].value === "#N/A",
    IFERROR: (args) => args[0] instanceof FormulaError ? args[1] ?? null : args[0],
    IFNA: (args) => args[0] instanceof FormulaError && args[0].value === "#N/A" ? args[1] ?? null : args[0],
    // ── Dynamic arrays (§14.2) ──────────────────────────────────────────────
    XLOOKUP: (args, ctx, nodes) => {
      const needle = args[0];
      const lookupMatrix = asMatrixArg(args, nodes, ctx, 1);
      const returnMatrix = asMatrixArg(args, nodes, ctx, 2);
      const match = parseCriteria("=" + String(needle));
      for (let r = 0; r < lookupMatrix.rows; r++) {
        if (match(lookupMatrix.values[r][0] ?? null)) {
          const row = returnMatrix.values[r] ?? [];
          if (row.length === 1) return row[0];
          return matrix([row]);
        }
      }
      if (args.length > 3) return args[3];
      throw ERR.NA();
    },
    XMATCH: (args, ctx, nodes) => {
      const needle = args[0];
      const lookupMatrix = asMatrixArg(args, nodes, ctx, 1);
      const match = parseCriteria("=" + String(needle));
      for (let r = 0; r < lookupMatrix.rows; r++) {
        if (match(lookupMatrix.values[r][0] ?? null)) return r + 1;
      }
      throw ERR.NA();
    },
    FILTER: (args, ctx, nodes) => {
      const source = asMatrixArg(args, nodes, ctx, 0);
      const include = asMatrixArg(args, nodes, ctx, 1);
      const keep = [];
      for (let r = 0; r < source.rows; r++) {
        const cond = include.values[r]?.[0] ?? null;
        if (toBool(cond)) keep.push(source.values[r]);
      }
      if (keep.length === 0) {
        if (args.length > 2) return args[2];
        throw ERR.CALC();
      }
      return matrix(keep);
    },
    SORT: (args, ctx, nodes) => {
      const source = asMatrixArg(args, nodes, ctx, 0);
      const index = args.length > 1 ? Math.trunc(toNumber(args[1])) : 1;
      const order = args.length > 2 ? Math.trunc(toNumber(args[2])) : 1;
      const sorted = [...source.values].sort((a, b) => {
        const av = a[index - 1] ?? null;
        const bv = b[index - 1] ?? null;
        let cmp;
        if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
        else {
          const at = av === null ? "" : String(av);
          const bt = bv === null ? "" : String(bv);
          cmp = at < bt ? -1 : at > bt ? 1 : 0;
        }
        return order === -1 ? -cmp : cmp;
      });
      return matrix(sorted);
    },
    SORTBY: (args, ctx, nodes) => {
      const source = asMatrixArg(args, nodes, ctx, 0);
      const by = asMatrixArg(args, nodes, ctx, 1);
      const order = args.length > 2 ? Math.trunc(toNumber(args[2])) : 1;
      const sorted = source.values.map((row, i) => ({ row, key: by.values[i]?.[0] ?? null })).sort((a, b) => order === -1 ? cmpV(b.key, a.key) : cmpV(a.key, b.key)).map((e) => e.row);
      return matrix(sorted);
    },
    UNIQUE: (args, ctx, nodes) => {
      const source = asMatrixArg(args, nodes, ctx, 0);
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const row of source.values) {
        const key2 = JSON.stringify(row);
        if (!seen.has(key2)) {
          seen.add(key2);
          out.push(row);
        }
      }
      return matrix(out);
    },
    SEQUENCE: (args) => {
      const rows = Math.trunc(toNumber(args[0]));
      const cols = args.length > 1 ? Math.trunc(toNumber(args[1])) : 1;
      const start = args.length > 2 ? toNumber(args[2]) : 1;
      const step = args.length > 3 ? toNumber(args[3]) : 1;
      const values = [];
      let n = start;
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
          row.push(n);
          n += step;
        }
        values.push(row);
      }
      return matrix(values);
    },
    TRANSPOSE: (args, ctx, nodes) => {
      const source = asMatrixArg(args, nodes, ctx, 0);
      const out = [];
      for (let c = 0; c < source.columns; c++) {
        const row = [];
        for (let r = 0; r < source.rows; r++) {
          row.push(source.values[r][c] ?? null);
        }
        out.push(row);
      }
      return matrix(out);
    },
    ROWS: (args, ctx, nodes) => asMatrixArg(args, nodes, ctx, 0).rows,
    COLUMNS: (args, ctx, nodes) => asMatrixArg(args, nodes, ctx, 0).columns,
    CHOOSE: (args) => {
      const index = Math.trunc(toNumber(args[0]));
      if (index < 1 || index >= args.length) throw ERR.VALUE();
      return args[index];
    },
    // ── Math & trig ──────────────────────────────────────────────────────────
    SUMPRODUCT: (args, ctx, nodes) => {
      if (nodes.length === 0) throw ERR.VALUE();
      const matrices = nodes.map((_node, i) => asMatrixArg(args, nodes, ctx, i));
      const rows = matrices[0].rows;
      const cols = matrices[0].columns;
      let total = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let product = 1;
          for (const m of matrices) {
            const v = m.values[r]?.[c];
            product *= typeof v === "number" ? v : 0;
          }
          total += product;
        }
      }
      return total;
    },
    SUMSQ: (args) => numbersOf(args).reduce((a, b) => a + b * b, 0),
    PRODUCT: (args) => numbersOf(args).reduce((a, b) => a * b, 1),
    INT: (args) => Math.floor(toNumber(args[0])),
    TRUNC: (args) => {
      const digits = args.length > 1 ? Math.trunc(toNumber(args[1])) : 0;
      const f = 10 ** digits;
      return Math.trunc(toNumber(args[0]) * f) / f;
    },
    SIGN: (args) => Math.sign(toNumber(args[0])),
    EXP: (args) => Math.exp(toNumber(args[0])),
    LN: (args) => {
      const n = toNumber(args[0]);
      if (n <= 0) throw ERR.NUM();
      return Math.log(n);
    },
    LOG: (args) => {
      const n = toNumber(args[0]);
      const base = args.length > 1 ? toNumber(args[1]) : 10;
      if (n <= 0 || base <= 0) throw ERR.NUM();
      return Math.log(n) / Math.log(base);
    },
    LOG10: (args) => {
      const n = toNumber(args[0]);
      if (n <= 0) throw ERR.NUM();
      return Math.log10(n);
    },
    CEILING: (args) => {
      const n = toNumber(args[0]);
      const sig = args.length > 1 ? toNumber(args[1]) : 1;
      if (sig === 0) return 0;
      return Math.ceil(n / sig) * sig;
    },
    FLOOR: (args) => {
      const n = toNumber(args[0]);
      const sig = args.length > 1 ? toNumber(args[1]) : 1;
      if (sig === 0) throw ERR.DIV0();
      return Math.floor(n / sig) * sig;
    },
    PI: () => Math.PI,
    DEGREES: (args) => toNumber(args[0]) * 180 / Math.PI,
    RADIANS: (args) => toNumber(args[0]) * Math.PI / 180,
    SIN: (args) => Math.sin(toNumber(args[0])),
    COS: (args) => Math.cos(toNumber(args[0])),
    TAN: (args) => Math.tan(toNumber(args[0])),
    ASIN: (args) => {
      const n = toNumber(args[0]);
      if (n < -1 || n > 1) throw ERR.NUM();
      return Math.asin(n);
    },
    ACOS: (args) => {
      const n = toNumber(args[0]);
      if (n < -1 || n > 1) throw ERR.NUM();
      return Math.acos(n);
    },
    ATAN: (args) => Math.atan(toNumber(args[0])),
    ATAN2: (args) => Math.atan2(toNumber(args[0]), toNumber(args[1])),
    RAND: () => Math.random(),
    RANDBETWEEN: (args) => {
      const lo = Math.ceil(toNumber(args[0]));
      const hi = Math.floor(toNumber(args[1]));
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    },
    // ── Statistical ──────────────────────────────────────────────────────────
    MEDIAN: (args) => {
      const nums = numbersOf(args).sort((a, b) => a - b);
      if (nums.length === 0) throw ERR.NUM();
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
    },
    MODE: (args) => {
      const counts = /* @__PURE__ */ new Map();
      for (const n of numbersOf(args)) counts.set(n, (counts.get(n) ?? 0) + 1);
      let best;
      let bestCount = 0;
      for (const [value, count] of counts) {
        if (count > bestCount) {
          best = value;
          bestCount = count;
        }
      }
      if (bestCount <= 1) throw ERR.NA();
      return best;
    },
    STDEV: (args) => varianceImpl(numbersOf(args), false, true),
    STDEVP: (args) => varianceImpl(numbersOf(args), true, true),
    VAR: (args) => varianceImpl(numbersOf(args), false, false),
    VARP: (args) => varianceImpl(numbersOf(args), true, false),
    LARGE: (args) => {
      const nums = numbersOf([args[0]]).sort((a, b) => b - a);
      const k = Math.trunc(toNumber(args[1]));
      if (k < 1 || k > nums.length) throw ERR.NUM();
      return nums[k - 1];
    },
    SMALL: (args) => {
      const nums = numbersOf([args[0]]).sort((a, b) => a - b);
      const k = Math.trunc(toNumber(args[1]));
      if (k < 1 || k > nums.length) throw ERR.NUM();
      return nums[k - 1];
    },
    COUNTBLANK: (args, ctx, nodes) => {
      const cells = nodeCells(nodes[0]);
      let count = 0;
      for (const c of cells) {
        const v = ctx.getCellValue(c.sheet, c.row, c.column);
        if (v === null || v === "") count += 1;
      }
      return count;
    },
    RANK: (args, ctx, nodes) => {
      const value = toNumber(args[0]);
      const nums = numbersOf([asMatrixArg(args, nodes, ctx, 1)]);
      const order = args.length > 2 ? Math.trunc(toNumber(args[2])) : 0;
      const sorted = [...nums].sort((a, b) => order === 0 ? b - a : a - b);
      const index = sorted.indexOf(value);
      if (index === -1) throw ERR.NA();
      return index + 1;
    },
    // ── Text ────────────────────────────────────────────────────────────────
    FIND: (args) => {
      const needle = toText(args[0]);
      const haystack = toText(args[1]);
      const start = args.length > 2 ? Math.trunc(toNumber(args[2])) : 1;
      const index = haystack.indexOf(needle, start - 1);
      if (index === -1) throw ERR.VALUE();
      return index + 1;
    },
    SEARCH: (args) => {
      const needle = toText(args[0]).toLowerCase();
      const haystack = toText(args[1]).toLowerCase();
      const start = args.length > 2 ? Math.trunc(toNumber(args[2])) : 1;
      const index = haystack.indexOf(needle, start - 1);
      if (index === -1) throw ERR.VALUE();
      return index + 1;
    },
    SUBSTITUTE: (args) => {
      const text = toText(args[0]);
      const oldText = toText(args[1]);
      const newText = toText(args[2]);
      if (oldText === "") return text;
      if (args.length > 3) {
        const instance = Math.trunc(toNumber(args[3]));
        let count = 0;
        return text.replace(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), (match) => {
          count += 1;
          return count === instance ? newText : match;
        });
      }
      return text.split(oldText).join(newText);
    },
    REPLACE: (args) => {
      const text = toText(args[0]);
      const start = Math.trunc(toNumber(args[1]));
      const length = Math.trunc(toNumber(args[2]));
      const newText = toText(args[3]);
      if (start < 1 || length < 0) throw ERR.VALUE();
      return text.slice(0, start - 1) + newText + text.slice(start - 1 + length);
    },
    REPT: (args) => {
      const count = Math.trunc(toNumber(args[1]));
      if (count < 0) throw ERR.VALUE();
      return toText(args[0]).repeat(count);
    },
    EXACT: (args) => toText(args[0]) === toText(args[1]),
    VALUE: (args) => {
      const v = args[0];
      if (typeof v === "number") return v;
      const n = Number(toText(v));
      if (Number.isNaN(n)) throw ERR.VALUE();
      return n;
    },
    CHAR: (args) => String.fromCharCode(Math.trunc(toNumber(args[0]))),
    CODE: (args) => toText(args[0]).charCodeAt(0),
    // ── Information ─────────────────────────────────────────────────────────
    ISERR: (args) => args[0] instanceof FormulaError && args[0].value !== "#N/A",
    NA: () => ERR.NA(),
    N: (args) => {
      const v = args[0];
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? 1 : 0;
      return 0;
    },
    // ── Logical ─────────────────────────────────────────────────────────────
    XOR: (args) => args.filter((a) => toBool(a)).length % 2 === 1,
    SWITCH: (args) => {
      const subject = args[0];
      for (let i = 1; i + 1 < args.length; i += 2) {
        if (looseEqual(args[i], subject)) return args[i + 1];
      }
      if (args.length % 2 === 0) return args[args.length - 1];
      throw ERR.NA();
    },
    TRUE: () => true,
    FALSE: () => false,
    // ── Date & time ─────────────────────────────────────────────────────────
    HOUR: (args) => fractionParts(toNumber(args[0])).hours,
    MINUTE: (args) => fractionParts(toNumber(args[0])).minutes,
    SECOND: (args) => fractionParts(toNumber(args[0])).seconds,
    TIME: (args) => {
      const h = toNumber(args[0]);
      const m = toNumber(args[1]);
      const s = toNumber(args[2]);
      return (h * 3600 + m * 60 + s) % 86400 / 86400;
    },
    WEEKDAY: (args) => {
      const serial = toNumber(args[0]);
      const type = args.length > 1 ? Math.trunc(toNumber(args[1])) : 1;
      const dow = new Date(Math.round((serial - 25569) * 864e5)).getUTCDay();
      if (type === 2) return dow === 0 ? 7 : dow;
      if (type === 3) return dow;
      return dow + 1;
    },
    WEEKNUM: (args) => {
      const serial = toNumber(args[0]);
      const days = Math.floor(serial) - 25569;
      const date = new Date(days * 864e5);
      const start = Date.UTC(date.getUTCFullYear(), 0, 1);
      return Math.floor((date.getTime() - start) / (7 * 864e5)) + 1;
    },
    EDATE: (args) => {
      const serial = toNumber(args[0]);
      const months = Math.trunc(toNumber(args[1]));
      const date = new Date(Math.round((serial - 25569) * 864e5));
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()) / 864e5 + 25569;
    },
    EOMONTH: (args) => {
      const serial = toNumber(args[0]);
      const months = Math.trunc(toNumber(args[1]));
      const date = new Date(Math.round((serial - 25569) * 864e5));
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0));
      return Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()) / 864e5 + 25569;
    },
    DAYS: (args) => Math.trunc(toNumber(args[0])) - Math.trunc(toNumber(args[1])),
    // ── Financial ───────────────────────────────────────────────────────────
    PMT: (args) => {
      const rate = toNumber(args[0]);
      const nper = toNumber(args[1]);
      const pv = toNumber(args[2]);
      const fv = args.length > 3 ? toNumber(args[3]) : 0;
      const type = args.length > 4 ? toNumber(args[4]) : 0;
      if (nper === 0) throw ERR.DIV0();
      if (rate === 0) return -(pv + fv) / nper;
      const factor = (1 + rate) ** nper;
      return -(pv * factor + fv) * rate / ((factor - 1) * (1 + rate * type));
    },
    FV: (args) => {
      const rate = toNumber(args[0]);
      const nper = toNumber(args[1]);
      const pmt = toNumber(args[2]);
      const pv = args.length > 3 ? toNumber(args[3]) : 0;
      const type = args.length > 4 ? toNumber(args[4]) : 0;
      if (rate === 0) return -(pv + pmt * nper);
      const factor = (1 + rate) ** nper;
      return -(pv * factor + pmt * (1 + rate * type) * ((factor - 1) / rate));
    },
    PV: (args) => {
      const rate = toNumber(args[0]);
      const nper = toNumber(args[1]);
      const pmt = toNumber(args[2]);
      const fv = args.length > 3 ? toNumber(args[3]) : 0;
      const type = args.length > 4 ? toNumber(args[4]) : 0;
      if (rate === 0) return -(fv + pmt * nper);
      const factor = (1 + rate) ** nper;
      return -(fv + pmt * (1 + rate * type) * ((factor - 1) / rate)) / factor;
    },
    NPV: (args) => {
      const rate = toNumber(args[0]);
      const cashflows = numbersOf(args.slice(1));
      let total = 0;
      for (let i = 0; i < cashflows.length; i++) {
        total += cashflows[i] / (1 + rate) ** (i + 1);
      }
      return total;
    }
  };
  function cmpV(a, b) {
    if (typeof a === "number" && typeof b === "number") return a - b;
    const at = a === null ? "" : String(a);
    const bt = b === null ? "" : String(b);
    return at < bt ? -1 : at > bt ? 1 : 0;
  }
  function varianceImpl(nums, population, sqrt) {
    if (nums.length < (population ? 1 : 2)) throw ERR.DIV0();
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const ss = nums.reduce((acc, n) => acc + (n - mean) ** 2, 0);
    const denom = population ? nums.length : nums.length - 1;
    const v = ss / denom;
    return sqrt ? Math.sqrt(v) : v;
  }
  function fractionParts(serial) {
    const dayFraction = serial - Math.floor(serial);
    const totalSeconds = Math.round(dayFraction * 86400);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const seconds = totalSeconds % 60;
    return { hours, minutes, seconds };
  }
  function looseEqual(a, b) {
    if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
    try {
      return comparison("=", a, b);
    } catch {
      return false;
    }
  }
  function countMatching(args, ctx, nodes) {
    const rangeCells = nodeCells(nodes[0]);
    const match = parseCriteria(args[1]);
    let count = 0;
    for (const c of rangeCells) {
      if (match(ctx.getCellValue(c.sheet, c.row, c.column))) count += 1;
    }
    return count;
  }

  // packages/formula/src/dependency-graph.ts
  function key(sheet, row, column, currentSheet) {
    return `${sheet ?? currentSheet}!${row},${column}`;
  }
  function splitKey(k) {
    const bang = k.lastIndexOf("!");
    const sheet = bang >= 0 ? k.slice(0, bang) : "";
    const [row, column] = k.slice(bang + 1).split(",");
    return [sheet, Number(row), Number(column)];
  }
  var DependencyGraph = class _DependencyGraph {
    formulas = /* @__PURE__ */ new Map();
    currentSheet = "";
    namesResolver;
    tableResolver;
    letScopes = [];
    setCurrentSheet(sheet) {
      this.currentSheet = sheet;
    }
    setNamesResolver(resolver) {
      this.namesResolver = resolver;
    }
    setTableResolver(resolver) {
      this.tableResolver = resolver;
    }
    /** Public evaluation context for ad-hoc evaluation (named formulas, worker). */
    createContext(sheet, getRaw) {
      this.currentSheet = sheet;
      return this.buildContext(getRaw, /* @__PURE__ */ new Set());
    }
    /** Register or update a formula at the given cell. */
    setFormula(sheet, row, column, formula, ast) {
      const k = key(sheet, row, column, sheet);
      const refs = collectRefs(ast).map((r) => ({
        sheet: r.sheet ?? sheet,
        row: r.row,
        column: r.column
      }));
      const refKeys = refs.map((r) => key(r.sheet, r.row, r.column, sheet));
      const existing = this.formulas.get(k);
      if (existing) {
        for (const p of existing.precedents) {
          this.formulas.get(p)?.dependents.delete(k);
        }
      }
      const entry = {
        sheet,
        ast,
        formula,
        value: null,
        dependents: existing?.dependents ?? /* @__PURE__ */ new Set(),
        precedents: new Set(refKeys),
        evaluating: false
      };
      this.formulas.set(k, entry);
      for (const p of refKeys) {
        this.formulas.get(p)?.dependents.add(k);
        if (!this.formulas.has(p)) {
          const [pSheet] = splitKey(p);
          this.formulas.set(p, {
            sheet: pSheet,
            ast: { kind: "number", value: 0 },
            formula: "",
            value: null,
            dependents: /* @__PURE__ */ new Set([k]),
            precedents: /* @__PURE__ */ new Set(),
            evaluating: false
          });
        }
      }
      this.markDirty(k);
    }
    removeFormula(sheet, row, column) {
      const k = key(sheet, row, column, sheet);
      const entry = this.formulas.get(k);
      if (!entry) return;
      for (const p of entry.precedents) {
        this.formulas.get(p)?.dependents.delete(k);
      }
      if (entry.formula) {
        if (entry.dependents.size > 0) {
          entry.formula = "";
          entry.ast = { kind: "number", value: 0 };
          entry.value = null;
          entry.evaluating = false;
          this.markDirty(k);
          return;
        }
        this.formulas.delete(k);
      }
    }
    /** Recalculate the formula at k and all transitive dependents. */
    evaluate(k, getRaw, visited) {
      visited.add(k);
      const entry = this.formulas.get(k);
      if (!entry) return null;
      if (entry.evaluating) throw ERR.CIRCULAR();
      if (!entry.formula) return entry.value;
      entry.evaluating = true;
      try {
        const value = this.evaluateNode(entry.ast, this.buildContext(getRaw, visited, entry.sheet));
        entry.value = value;
      } catch (e) {
        entry.value = e instanceof FormulaError ? e : ERR.VALUE();
      } finally {
        entry.evaluating = false;
      }
      return entry.value;
    }
    markDirty(k) {
    }
    /** Recalculate the formula at the cell, resolving refs through `getRaw` and registered formulas. */
    recalculate(sheet, row, column, getRaw) {
      this.currentSheet = sheet;
      const k = key(sheet, row, column, sheet);
      return this.evaluateWithDependents(k, getRaw, /* @__PURE__ */ new Set());
    }
    buildContext(getRaw, visited, sheet) {
      const ownerSheet = sheet ?? this.currentSheet;
      return {
        currentSheet: ownerSheet,
        getCellValue: (s, r, c) => {
          const k = key(s, r, c, ownerSheet);
          const entry = this.formulas.get(k);
          if (entry?.formula) return this.evaluate(k, getRaw, visited);
          return getRaw(s ?? ownerSheet, r, c);
        },
        resolveName: (name) => {
          for (let i = this.letScopes.length - 1; i >= 0; i--) {
            const scope = this.letScopes[i];
            if (scope.has(name)) return scope.get(name);
          }
          if (this.namesResolver) return this.namesResolver(name);
          return ERR.NAME();
        },
        resolveTable: (table, column, item) => {
          if (this.tableResolver) return this.tableResolver(table, column, item);
          return ERR.NAME();
        }
      };
    }
    evaluateWithDependents(k, getRaw, visited) {
      const value = this.evaluate(k, getRaw, visited);
      const entry = this.formulas.get(k);
      if (entry) {
        for (const d of entry.dependents) {
          if (!visited.has(d)) {
            this.evaluateWithDependents(d, getRaw, visited);
          }
        }
      }
      return value;
    }
    /** Evaluate an AST node in a context. */
    evaluateNode(node, ctx) {
      switch (node.kind) {
        case "number":
          return node.value;
        case "string":
          return node.value;
        case "boolean":
          return node.value;
        case "error":
          return new FormulaError(node.value);
        case "ref":
          return ctx.getCellValue(node.sheet ?? ctx.currentSheet, node.row, node.column);
        case "range": {
          return ctx.getCellValue(node.sheet ?? ctx.currentSheet, node.start.row, node.start.column);
        }
        case "name":
          return ctx.resolveName ? ctx.resolveName(node.name) : ERR.NAME();
        case "structured":
          return ctx.resolveTable ? ctx.resolveTable(node.table, node.column, node.item) : ERR.NAME();
        case "unary": {
          const v = this.evaluateNode(node.operand, ctx);
          const n = typeof v === "number" ? v : Number(v ?? 0);
          if (Number.isNaN(n)) throw ERR.VALUE();
          return node.op === "-" ? -n : n;
        }
        case "percent": {
          const v = this.evaluateNode(node.operand, ctx);
          return (typeof v === "number" ? v : Number(v ?? 0)) / 100;
        }
        case "binary":
          return this.evaluateBinary(node, ctx);
        case "call": {
          if (node.name === "LET") {
            return this.evaluateLet(node, ctx);
          }
          if (node.name === "IF" || node.name === "IFS" || node.name === "SWITCH" || node.name === "CHOOSE") {
            return this.evaluateLazyCall(node, ctx);
          }
          const fn = FUNCTIONS[node.name];
          if (!fn) throw ERR.NAME();
          const args = [];
          let firstError;
          for (const argNode of node.args) {
            let value;
            try {
              value = this.evaluateNode(argNode, ctx);
            } catch (e) {
              if (e instanceof FormulaError) value = e;
              else throw e;
            }
            if (argNode.kind === "range" && !isMatrix(value)) {
              value = this.matrixFromRangeNode(argNode, ctx);
            }
            if (value instanceof FormulaError && !firstError) firstError = value;
            if (isMatrix(value) && !firstError) {
              outer: for (const row of value.values) {
                for (const v of row) {
                  if (v instanceof FormulaError) {
                    firstError = v;
                    break outer;
                  }
                }
              }
            }
            args.push(value);
          }
          const tolerant = _DependencyGraph.ERROR_TOLERANT.has(node.name);
          if (firstError && !tolerant) return firstError;
          return fn(args, ctx, node.args);
        }
        default:
          throw ERR.VALUE();
      }
    }
    /** Error-tolerant functions receive FormulaError args instead of propagating. */
    static ERROR_TOLERANT = /* @__PURE__ */ new Set([
      "IFERROR",
      "IFNA",
      "ISERROR",
      "ISERR",
      "ISNA",
      "ISNUMBER",
      "ISTEXT",
      "ISBLANK",
      "COUNTA"
    ]);
    /** Short-circuit evaluation for branch functions (IF, IFS, SWITCH, CHOOSE). */
    evaluateLazyCall(node, ctx) {
      const evalNode = (arg) => {
        try {
          return this.evaluateNode(arg, ctx);
        } catch (e) {
          if (e instanceof FormulaError) return e;
          throw e;
        }
      };
      switch (node.name) {
        case "IF": {
          const condition = evalNode(node.args[0] ?? { kind: "boolean", value: false });
          if (condition instanceof FormulaError) return condition;
          if (condition === true || typeof condition === "number" && condition !== 0) {
            return node.args[1] ? evalNode(node.args[1]) : true;
          }
          return node.args[2] ? evalNode(node.args[2]) : false;
        }
        case "IFS": {
          for (let i = 0; i + 1 < node.args.length; i += 2) {
            const condition = evalNode(node.args[i]);
            if (condition instanceof FormulaError) return condition;
            if (condition === true || typeof condition === "number" && condition !== 0) {
              return evalNode(node.args[i + 1]);
            }
          }
          throw ERR.NA();
        }
        case "SWITCH": {
          const subject = evalNode(node.args[0] ?? { kind: "string", value: "" });
          if (subject instanceof FormulaError) return subject;
          for (let i = 1; i + 1 < node.args.length; i += 2) {
            const candidate = evalNode(node.args[i]);
            if (candidate instanceof FormulaError) return candidate;
            if (looseEqualValues(candidate, subject)) return evalNode(node.args[i + 1]);
          }
          if (node.args.length % 2 === 0) return evalNode(node.args[node.args.length - 1]);
          throw ERR.NA();
        }
        case "CHOOSE": {
          const indexValue = evalNode(node.args[0] ?? { kind: "number", value: 0 });
          if (indexValue instanceof FormulaError) return indexValue;
          const index = Math.trunc(typeof indexValue === "number" ? indexValue : 0);
          if (index < 1 || index >= node.args.length) throw ERR.VALUE();
          return evalNode(node.args[index]);
        }
        default:
          throw ERR.VALUE();
      }
    }
    matrixFromRangeNode(node, ctx) {
      if (node.kind === "ref") {
        return { kind: "matrix", rows: 1, columns: 1, values: [[ctx.getCellValue(node.sheet ?? ctx.currentSheet, node.row, node.column)]] };
      }
      const values = [];
      for (let r = node.start.row; r <= node.end.row; r++) {
        const row = [];
        for (let c = node.start.column; c <= node.end.column; c++) {
          row.push(ctx.getCellValue(node.sheet ?? ctx.currentSheet, r, c));
        }
        values.push(row);
      }
      return { kind: "matrix", rows: values.length, columns: values[0]?.length ?? 0, values };
    }
    /** LET(name1, value1, ..., calculation) with scoped name bindings (§26). */
    evaluateLet(node, ctx) {
      const scope = /* @__PURE__ */ new Map();
      this.letScopes.push(scope);
      try {
        for (let i = 0; i + 1 < node.args.length - 1; i += 2) {
          const nameNode = node.args[i];
          if (nameNode.kind !== "name") throw ERR.VALUE();
          scope.set(nameNode.name, this.evaluateNode(node.args[i + 1], ctx));
        }
        const last = node.args[node.args.length - 1];
        return this.evaluateNode(last, ctx);
      } finally {
        this.letScopes.pop();
      }
    }
    evaluateBinary(node, ctx) {
      const { op: op2 } = node;
      if (["=", "<>", "<", ">", "<=", ">="].includes(op2)) {
        const a2 = this.evaluateNode(node.left, ctx);
        const b2 = this.evaluateNode(node.right, ctx);
        return compareValues(op2, a2, b2);
      }
      if (op2 === "&") {
        const a2 = this.evaluateNode(node.left, ctx);
        const b2 = this.evaluateNode(node.right, ctx);
        if (a2 instanceof FormulaError) throw a2;
        if (b2 instanceof FormulaError) throw b2;
        return stringify(a2) + stringify(b2);
      }
      const a = this.evaluateNode(node.left, ctx);
      const b = this.evaluateNode(node.right, ctx);
      if (a instanceof FormulaError) throw a;
      if (b instanceof FormulaError) throw b;
      const na = toNumeric(a);
      const nb = toNumeric(b);
      switch (op2) {
        case "+":
          return na + nb;
        case "-":
          return na - nb;
        case "*":
          return na * nb;
        case "/":
          if (nb === 0) throw ERR.DIV0();
          return na / nb;
        case "^":
          return na ** nb;
        default:
          throw ERR.VALUE();
      }
    }
    /** Cached value of a formula cell (without recalculation). */
    /** Remove all formula registrations (used before bulk re-registration). */
    clear() {
      this.formulas.clear();
    }
    cachedValue(sheet, row, column) {
      return this.formulas.get(key(sheet, row, column, sheet))?.value ?? null;
    }
    get formulaCount() {
      let count = 0;
      for (const e of this.formulas.values()) if (e.formula) count += 1;
      return count;
    }
  };
  function stringify(v) {
    if (v === null) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (isMatrix(v)) return "";
    return String(v);
  }
  function looseEqualValues(a, b) {
    if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
    const na = typeof a === "number" ? a : void 0;
    const nb = typeof b === "number" ? b : void 0;
    if (na !== void 0 && nb !== void 0) return na === nb;
    return String(a) === String(b);
  }
  function toNumeric(v) {
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v === null || v === "") return 0;
    const n = Number(v);
    if (Number.isNaN(n)) throw ERR.VALUE();
    return n;
  }
  function compareValues(op2, a, b) {
    if (a instanceof FormulaError) throw a;
    if (b instanceof FormulaError) throw b;
    let left = a;
    let right = b;
    if (typeof left === "number" || typeof right === "number") {
      try {
        left = toNumeric(left);
        right = toNumeric(right);
      } catch {
        left = stringify(a);
        right = stringify(b);
      }
    }
    if (typeof left === "string" && typeof right === "string") {
      const c = left.localeCompare(right);
      switch (op2) {
        case "=":
          return c === 0;
        case "<>":
          return c !== 0;
        case "<":
          return c < 0;
        case ">":
          return c > 0;
        case "<=":
          return c <= 0;
        case ">=":
          return c >= 0;
        default:
          return false;
      }
    }
    const ln = toNumeric(left);
    const rn = toNumeric(right);
    switch (op2) {
      case "=":
        return ln === rn;
      case "<>":
        return ln !== rn;
      case "<":
        return ln < rn;
      case ">":
        return ln > rn;
      case "<=":
        return ln <= rn;
      case ">=":
        return ln >= rn;
      default:
        return false;
    }
  }

  // packages/formula/src/registry.ts
  var FUNCTION_CATEGORIES = {
    SUM: "Math",
    AVERAGE: "Statistical",
    MIN: "Statistical",
    MAX: "Statistical",
    COUNT: "Statistical",
    COUNTA: "Statistical",
    COUNTBLANK: "Statistical",
    IF: "Logical",
    IFS: "Logical",
    AND: "Logical",
    OR: "Logical",
    XOR: "Logical",
    NOT: "Logical",
    SWITCH: "Logical",
    TRUE: "Logical",
    FALSE: "Logical",
    IFERROR: "Logical",
    IFNA: "Logical",
    ROUND: "Math",
    ROUNDUP: "Math",
    ROUNDDOWN: "Math",
    ABS: "Math",
    MOD: "Math",
    POWER: "Math",
    SQRT: "Math",
    INT: "Math",
    TRUNC: "Math",
    SIGN: "Math",
    EXP: "Math",
    LN: "Math",
    LOG: "Math",
    LOG10: "Math",
    CEILING: "Math",
    FLOOR: "Math",
    PI: "Math",
    DEGREES: "Math",
    RADIANS: "Math",
    SIN: "Math",
    COS: "Math",
    TAN: "Math",
    ASIN: "Math",
    ACOS: "Math",
    ATAN: "Math",
    ATAN2: "Math",
    RAND: "Math",
    RANDBETWEEN: "Math",
    SUMSQ: "Math",
    PRODUCT: "Math",
    SUMPRODUCT: "Math",
    MEDIAN: "Statistical",
    MODE: "Statistical",
    STDEV: "Statistical",
    STDEVP: "Statistical",
    VAR: "Statistical",
    VARP: "Statistical",
    LARGE: "Statistical",
    SMALL: "Statistical",
    RANK: "Statistical",
    CONCAT: "Text",
    CONCATENATE: "Text",
    TEXTJOIN: "Text",
    LEFT: "Text",
    RIGHT: "Text",
    MID: "Text",
    LEN: "Text",
    TRIM: "Text",
    UPPER: "Text",
    LOWER: "Text",
    PROPER: "Text",
    FIND: "Text",
    SEARCH: "Text",
    SUBSTITUTE: "Text",
    REPLACE: "Text",
    REPT: "Text",
    EXACT: "Text",
    VALUE: "Text",
    CHAR: "Text",
    CODE: "Text",
    TODAY: "Date",
    NOW: "Date",
    DATE: "Date",
    YEAR: "Date",
    MONTH: "Date",
    DAY: "Date",
    HOUR: "Date",
    MINUTE: "Date",
    SECOND: "Date",
    TIME: "Date",
    WEEKDAY: "Date",
    WEEKNUM: "Date",
    EDATE: "Date",
    EOMONTH: "Date",
    DAYS: "Date",
    VLOOKUP: "Lookup",
    HLOOKUP: "Lookup",
    INDEX: "Lookup",
    MATCH: "Lookup",
    XLOOKUP: "Lookup",
    XMATCH: "Lookup",
    CHOOSE: "Lookup",
    ROWS: "Lookup",
    COLUMNS: "Lookup",
    COUNTIF: "Statistical",
    COUNTIFS: "Statistical",
    SUMIF: "Math",
    SUMIFS: "Math",
    AVERAGEIF: "Statistical",
    ISBLANK: "Information",
    ISNUMBER: "Information",
    ISTEXT: "Information",
    ISERROR: "Information",
    ISNA: "Information",
    ISERR: "Information",
    NA: "Information",
    N: "Information",
    FILTER: "Dynamic array",
    SORT: "Dynamic array",
    SORTBY: "Dynamic array",
    UNIQUE: "Dynamic array",
    SEQUENCE: "Dynamic array",
    TRANSPOSE: "Dynamic array",
    LET: "Logical",
    PMT: "Financial",
    FV: "Financial",
    PV: "Financial",
    NPV: "Financial"
  };
  var metadata = /* @__PURE__ */ new Map();
  for (const [name, category] of Object.entries(FUNCTION_CATEGORIES)) {
    metadata.set(name, { name, category });
  }
  var formulaRegistry = {
    register(def) {
      const name = def.name.toUpperCase();
      FUNCTIONS[name] = def.evaluate;
      metadata.set(name, {
        name,
        category: def.category ?? "Custom",
        description: def.description,
        signature: def.signature,
        volatile: def.volatile
      });
    },
    unregister(name) {
      const key2 = name.toUpperCase();
      delete FUNCTIONS[key2];
      metadata.delete(key2);
    },
    get(name) {
      return metadata.get(name.toUpperCase());
    },
    all() {
      return [...metadata.values()];
    },
    /** Autocomplete suggestions for a partial function name (§14.7). */
    suggest(prefix, limit = 10) {
      const key2 = prefix.toUpperCase();
      if (key2 === "") return [];
      const starts = [];
      const contains = [];
      for (const meta of metadata.values()) {
        if (meta.name.startsWith(key2)) starts.push(meta);
        else if (meta.name.includes(key2)) contains.push(meta);
      }
      return [...starts, ...contains].slice(0, limit);
    }
  };

  // packages/core/src/merges.ts
  var MergeStore = class {
    merges = [];
    merge(rect) {
      if (rect.top === rect.bottom && rect.left === rect.right) return void 0;
      if (this.merges.some((m) => overlaps(m, rect))) return void 0;
      const merge = { ...rect, id: createId("merge") };
      this.merges.push(merge);
      return merge;
    }
    unmergeAt(row, column) {
      const index = this.merges.findIndex(
        (m) => row >= m.top && row <= m.bottom && column >= m.left && column <= m.right
      );
      if (index === -1) return false;
      this.merges.splice(index, 1);
      return true;
    }
    /** The merge covering a cell (anchor or covered), if any. */
    findAt(row, column) {
      return this.merges.find((m) => row >= m.top && row <= m.bottom && column >= m.left && column <= m.right);
    }
    isCovered(row, column) {
      const merge = this.findAt(row, column);
      return merge !== void 0 && !(merge.top === row && merge.left === column);
    }
    get all() {
      return this.merges;
    }
    clear() {
      this.merges.length = 0;
    }
    /**
     * Shift merge bounds after a structural row/column change. `mapper` maps an
     * axis position to its new position (or undefined when the whole merge
     * collapses). Merges whose bounds invert are removed.
     */
    transform(mapper, axis) {
      for (let i = this.merges.length - 1; i >= 0; i--) {
        const m = this.merges[i];
        const start = mapper(axis === "row" ? m.top : m.left, true);
        const end = mapper(axis === "row" ? m.bottom : m.right, false);
        if (start === void 0 || end === void 0 || end < start) {
          this.merges.splice(i, 1);
          continue;
        }
        if (axis === "row") {
          m.top = start;
          m.bottom = end;
        } else {
          m.left = start;
          m.right = end;
        }
      }
    }
  };
  function overlaps(a, b) {
    return !(a.bottom < b.top || a.top > b.bottom || a.right < b.left || a.left > b.right);
  }

  // packages/core/src/tables.ts
  var TableStore = class {
    tables = [];
    add(worksheet, options) {
      const rect = parseRange(options.range);
      const name = options.name;
      if (this.tables.some((t) => t.name === name)) {
        throw new Error(`table name already in use: ${name}`);
      }
      const columns = [];
      if (options.headerRow !== false) {
        for (let c = rect.left; c <= rect.right; c++) {
          const header = worksheet.getValue(rect.top, c);
          columns.push({ name: header === null || header === void 0 ? `Column${c - rect.left + 1}` : String(header), index: c });
        }
      }
      const table = {
        id: createId("table"),
        name,
        range: rect,
        headerRow: options.headerRow ?? true,
        totalRow: options.totalRow ?? false,
        columns
      };
      this.tables.push(table);
      return table;
    }
    get(name) {
      return this.tables.find((t) => t.name === name);
    }
    at(row, column) {
      return this.tables.find(
        (t) => row >= t.range.top && row <= t.range.bottom && column >= t.range.left && column <= t.range.right
      );
    }
    all() {
      return this.tables;
    }
    remove(name) {
      this.tables = this.tables.filter((t) => t.name !== name);
    }
    /**
     * Shift table bounds after a structural row/column change. `mapper` maps an
     * axis position to its new position; undefined removes the position. Tables
     * whose range collapses are dropped; affected column definitions follow.
     */
    transform(mapper, axis) {
      for (const t of [...this.tables]) {
        const start = mapper(axis === "row" ? t.range.top : t.range.left, true);
        const end = mapper(axis === "row" ? t.range.bottom : t.range.right, false);
        if (start === void 0 || end === void 0 || end < start) {
          this.remove(t.name);
          continue;
        }
        if (axis === "row") {
          t.range = { ...t.range, top: start, bottom: end };
        } else {
          t.range = { ...t.range, left: start, right: end };
          t.columns = t.columns.map((c) => ({ ...c, index: mapper(c.index, true) ?? Number.NaN })).filter((c) => Number.isInteger(c.index) && c.index >= t.range.left && c.index <= t.range.right);
        }
      }
    }
  };

  // packages/core/src/validation.ts
  var ValidationService = class {
    rules = [];
    add(rule) {
      const full = { ...rule, id: createId("val") };
      this.rules.push(full);
      return full;
    }
    remove(id) {
      this.rules = this.rules.filter((r) => r.id !== id);
    }
    all() {
      return this.rules;
    }
    /** Rules applying to a cell. */
    forCell(worksheet, row, column) {
      return this.rules.filter((rule) => {
        const rect = parseRange(rule.range);
        return row >= rect.top && row <= rect.bottom && column >= rect.left && column <= rect.right;
      });
    }
    /** Validate a candidate value for a cell. */
    check(worksheet, row, column, value) {
      const rules = this.forCell(worksheet, row, column);
      for (const rule of rules) {
        if (value === null || value === void 0 || value === "") continue;
        if (!this.validateRule(rule, value)) {
          return {
            allowed: rule.action !== "reject",
            action: rule.action,
            message: rule.message ?? `Value rejected by ${rule.type} validation`
          };
        }
      }
      return { allowed: true, action: "warning" };
    }
    validateRule(rule, value) {
      switch (rule.type) {
        case "number": {
          const n = typeof value === "number" ? value : Number(value);
          if (Number.isNaN(n)) return false;
          if (rule.min !== void 0 && n < rule.min) return false;
          if (rule.max !== void 0 && n > rule.max) return false;
          return true;
        }
        case "list":
          return (rule.values ?? []).some((v) => v === value || String(v) === String(value));
        case "textLength":
          return String(value).length === (rule.length ?? String(value).length);
        case "custom":
          return rule.predicate ? rule.predicate(value) : true;
        default:
          return true;
      }
    }
  };

  // packages/core/src/conditional-format.ts
  var ConditionalFormatEngine = class {
    rules = [];
    add(rule) {
      const full = { ...rule, id: createId("cf") };
      this.rules.push(full);
      return full;
    }
    remove(id) {
      this.rules = this.rules.filter((r) => r.id !== id);
    }
    all() {
      return [...this.rules].sort((a, b) => a.priority - b.priority);
    }
    /** Evaluate all matching rules for a cell; returns the merged style patch. */
    evaluate(worksheet, row, column) {
      let patch;
      for (const rule of this.all()) {
        const rect = parseRange(rule.range);
        if (row < rect.top || row > rect.bottom || column < rect.left || column > rect.right) {
          continue;
        }
        const record = worksheet.cells.getCell(row, column);
        const value = record?.formula !== void 0 ? worksheet.getValue(row, column) : record?.raw ?? null;
        if (this.matches(rule, value, worksheet)) {
          patch = { ...patch, ...rule.style };
          if (rule.stopIfTrue) break;
        }
      }
      return patch ?? {};
    }
    matches(rule, value, worksheet) {
      switch (rule.type) {
        case "cellIs": {
          const n = typeof value === "number" ? value : Number(value);
          const target = typeof rule.value === "number" ? rule.value : Number(rule.value);
          if (Number.isNaN(n) || Number.isNaN(target)) {
            return String(value) === String(rule.value) && rule.operator === "eq";
          }
          switch (rule.operator) {
            case "gt":
              return n > target;
            case "lt":
              return n < target;
            case "gte":
              return n >= target;
            case "lte":
              return n <= target;
            case "eq":
              return n === target;
            case "neq":
              return n !== target;
            default:
              return false;
          }
        }
        case "containsText":
          return String(value ?? "").includes(rule.text ?? "");
        case "expression":
          return rule.predicate ? rule.predicate(value) : false;
        case "topN": {
          const n = rule.n ?? 10;
          const nums = this.rangeNumbers(rule.range, worksheet);
          const threshold = nums.sort((a, b) => b - a)[Math.min(n, nums.length) - 1];
          return typeof value === "number" && value >= (threshold ?? Infinity);
        }
        case "duplicates": {
          const nums = this.rangeValues(rule.range, worksheet);
          const key2 = String(value);
          return key2 !== "null" && nums.filter((v) => String(v) === key2).length > 1;
        }
        default:
          return false;
      }
    }
    rangeNumbers(range, worksheet) {
      const rect = parseRange(range);
      const out = [];
      for (let r = rect.top; r <= rect.bottom; r++) {
        for (let c = rect.left; c <= rect.right; c++) {
          const v = worksheet.getValue(r, c);
          if (typeof v === "number") out.push(v);
        }
      }
      return out;
    }
    rangeValues(range, worksheet) {
      const rect = parseRange(range);
      const out = [];
      for (let r = rect.top; r <= rect.bottom; r++) {
        for (let c = rect.left; c <= rect.right; c++) {
          const v = worksheet.getValue(r, c);
          if (v !== null) out.push(v);
        }
      }
      return out;
    }
  };

  // packages/core/src/charts.ts
  var DEFAULT_CHART_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#ca8a04", "#7c3aed", "#0891b2"];
  var ChartEngine = class {
    charts = [];
    add(spec) {
      const full = { ...spec, id: createId("chart") };
      this.charts.push(full);
      return full;
    }
    remove(id) {
      this.charts = this.charts.filter((c) => c.id !== id);
    }
    all() {
      return this.charts;
    }
  };
  function readChartData(worksheet, spec) {
    const rect = parseRange(spec.source);
    const headerOffset = spec.firstRowIsHeader === false ? 0 : 1;
    const categories = [];
    for (let r = rect.top + headerOffset; r <= rect.bottom; r++) {
      const v = worksheet.getValue(r, rect.left);
      categories.push(v === null || v === void 0 ? "" : String(v));
    }
    const series = [];
    for (let c = rect.left + 1; c <= rect.right; c++) {
      const name = headerOffset && worksheet.getValue(rect.top, c);
      const values = [];
      for (let r = rect.top + headerOffset; r <= rect.bottom; r++) {
        const v = worksheet.getValue(r, c);
        if (typeof v === "number") values.push(v);
      }
      series.push({ name: name === null || name === void 0 ? `Series ${c - rect.left}` : String(name), values });
    }
    return { categories, series };
  }

  // packages/core/src/pivot.ts
  var AGGREGATORS = {
    SUM: (v) => v.reduce((a, b) => a + b, 0),
    COUNT: (v) => v.length,
    COUNTA: (v) => v.length,
    AVG: (v) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0,
    MIN: (v) => v.length ? Math.min(...v) : 0,
    MAX: (v) => v.length ? Math.max(...v) : 0
  };
  var PivotEngine = class {
    compute(worksheet, spec) {
      const rect = parseRange(spec.source);
      const headerOffset = 1;
      const groupCols = spec.rows;
      const valueCols = spec.values;
      const groups = /* @__PURE__ */ new Map();
      const rowOrder = [];
      for (let r = rect.top + headerOffset; r <= rect.bottom; r++) {
        const key2 = spec.rows.map((c) => String(worksheet.getValue(r, rect.left + c) ?? "")).join("");
        if (!groups.has(key2)) {
          groups.set(key2, []);
          rowOrder.push(key2);
        }
        const record = [];
        for (let c = rect.left; c <= rect.right; c++) {
          record.push(worksheet.getValue(r, c));
        }
        groups.get(key2).push(record);
      }
      const header = [
        ...spec.rows.map((c) => String(worksheet.getValue(rect.top, rect.left + c) ?? `F${c}`)),
        ...spec.values.map((v) => v.label ?? `${v.agg}`)
      ];
      const rows = [];
      for (const key2 of rowOrder) {
        const records = groups.get(key2);
        const row = [];
        for (const groupCol of spec.rows) {
          row.push(records[0]?.[groupCol] ?? null);
        }
        for (const valueField of valueCols) {
          const valueIndex = valueFieldSourceIndex(valueField, rect, spec);
          const nums = [];
          for (const record of records) {
            const v = record[valueIndex];
            if (typeof v === "number") nums.push(v);
          }
          row.push(AGGREGATORS[valueField.agg](nums));
        }
        rows.push(row);
      }
      const grandTotals = spec.rows.map(() => "Total");
      for (const valueField of valueCols) {
        const nums = [];
        for (const record of groups.values()) {
          for (const record2 of record) {
            const v = record2[valueFieldSourceIndex(valueField, rect, spec)];
            if (typeof v === "number") nums.push(v);
          }
        }
        grandTotals.push(AGGREGATORS[valueField.agg](nums));
      }
      return { header, rows, grandTotals };
    }
    /** Compute and write the pivot at its anchor. */
    refresh(worksheet, spec) {
      const anchor = parseRange(spec.anchor);
      const { header, rows, grandTotals } = this.compute(worksheet, spec);
      const allRows = [header, ...rows, grandTotals];
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        for (let c = 0; c < row.length; c++) {
          worksheet.setValue(anchor.top + i, anchor.left + c, row[c]);
        }
      }
    }
  };
  function valueFieldSourceIndex(field, rect, spec) {
    return field.column;
  }

  // packages/core/src/media.ts
  var MediaStore = class {
    objects = [];
    addImage(image) {
      const full = { ...image, kind: "image", id: createId("media") };
      this.objects.push(full);
      return full;
    }
    addShape(shape) {
      const full = { ...shape, kind: "shape", id: createId("media") };
      this.objects.push(full);
      return full;
    }
    remove(id) {
      this.objects = this.objects.filter((o) => o.id !== id);
    }
    all() {
      return this.objects;
    }
  };

  // packages/csv/src/csv.ts
  var CANDIDATES = [",", ";", "	", "|"];
  function detectDelimiter(text) {
    const line = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
    let best = ",";
    let bestCount = 0;
    for (const candidate of CANDIDATES) {
      const count = line.split(candidate).length - 1;
      if (count > bestCount) {
        best = candidate;
        bestCount = count;
      }
    }
    return best;
  }
  function looksNumeric(text) {
    return /^-?\d+(\.\d+)?$/.test(text);
  }
  function parseCsv(input, options = {}) {
    const stripBom = options.bom !== false;
    let text = input;
    if (stripBom && text.charCodeAt(0) === 65279) {
      text = text.slice(1);
    }
    const delimiter = options.delimiter ?? detectDelimiter(text);
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            inQuotes = false;
            i += 1;
          }
        } else {
          field += ch;
          i += 1;
        }
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === delimiter) {
        pushField(row, field, options.numbers !== false);
        field = "";
        i += 1;
        continue;
      }
      if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && text[i + 1] === "\n") i += 1;
        pushField(row, field, options.numbers !== false);
        field = "";
        rows.push(row);
        row = [];
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
    }
    if (field !== "" || row.length > 0) {
      pushField(row, field, options.numbers !== false);
      rows.push(row);
    }
    let headers;
    let data = rows;
    if (options.headers && rows.length > 0) {
      headers = (rows[0] ?? []).map(String);
      data = rows.slice(1);
    }
    return { headers, rows: data };
  }
  function pushField(row, field, numbers) {
    if (numbers && looksNumeric(field)) {
      row.push(Number(field));
    } else {
      row.push(field);
    }
  }
  function stringifyCsv(rows, options = {}) {
    const delimiter = options.delimiter ?? ",";
    const lines = [];
    for (const row of rows) {
      const fields = row.map((value) => {
        let text = value === null || value === void 0 ? "" : String(value);
        if (options.escapeFormulas && /^[=+@-]/.test(text)) {
          text = `'${text}`;
        }
        if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      });
      lines.push(fields.join(delimiter));
    }
    return `${lines.join("\r\n")}\r
`;
  }

  // packages/core/src/format.ts
  function formatValue(value, mask) {
    if (value === null || value === void 0) return "";
    if (mask === void 0 || mask === "" || mask === "General") {
      return typeof value === "number" ? stripFloatNoise(value) : String(value);
    }
    if (typeof value === "number" && isDateMask(mask)) return formatSerialDate(value, mask);
    if (typeof value !== "number") {
      const n = Number(value);
      if (!Number.isNaN(n) && value !== "") {
        return applyNumericMask(n, mask);
      }
      return String(value);
    }
    return applyNumericMask(value, mask);
  }
  function stripFloatNoise(n) {
    return String(Math.round(n * 1e10) / 1e10);
  }
  var DATE_MASK = /(y{2,4}|m{1,2}|d{1,2})/i;
  function isDateMask(mask) {
    return DATE_MASK.test(mask) && !mask.includes("%");
  }
  function formatSerialDate(serial, mask) {
    const ms = Math.round((serial - 25569) * 864e5);
    const d = new Date(ms);
    const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return mask.replace(/yyyy/gi, yyyy).replace(/yy/gi, yyyy.slice(2)).replace(/mm/gi, mm).replace(/dd/gi, dd).replace(/\bm\b/gi, mm).replace(/\bd\b/gi, dd);
  }
  function applyNumericMask(n, mask) {
    const percent = mask.includes("%");
    const body = mask.replace(/%/g, "");
    const decimalMatch = /\.([0#]+)/.exec(body);
    const decimals = decimalMatch ? (decimalMatch[1].match(/0/g) ?? []).length : 0;
    const grouped = body.includes(",");
    const prefixMatch = /^[^#0.,]+/.exec(body);
    const prefix = prefixMatch ? prefixMatch[0] : "";
    const suffixMatch = /[^#0.,]+$/.exec(body);
    const suffix = percent ? `${suffixMatch ? suffixMatch[0] : ""}%` : suffixMatch ? suffixMatch[0] : "";
    const value = percent ? n * 100 : n;
    let text = value.toFixed(decimals);
    if (grouped) {
      const [intPart, fracPart] = text.split(".");
      const sign = intPart.startsWith("-") ? "-" : "";
      const digits = sign ? intPart.slice(1) : intPart;
      text = `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fracPart ? `.${fracPart}` : ""}`;
    }
    return `${prefix}${text}${suffix}`;
  }

  // packages/core/src/csv-export.ts
  function worksheetToCsv(worksheet, options = {}) {
    const rect = options.range ? parseRange(options.range) : worksheet.cells.usedRange;
    if (!rect) return "";
    const rows = [];
    for (let r = rect.top; r <= rect.bottom; r++) {
      const row = [];
      for (let c = rect.left; c <= rect.right; c++) {
        const value = worksheet.getValue(r, c);
        const mask = worksheet.getNumberFormat(r, c);
        row.push(formatValue(value, mask));
      }
      rows.push(row);
    }
    return stringifyCsv(rows, {
      delimiter: options.delimiter,
      escapeFormulas: options.escapeFormulas
    });
  }
  function worksheetFromCsv(worksheet, text, options = {}) {
    const parsed = parseCsv(text, options);
    const anchorRect = options.anchor ? parseRange(options.anchor) : { top: 0, left: 0, bottom: 0, right: 0 };
    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      for (let c = 0; c < row.length; c++) {
        const value = row[c];
        const asFormula = options.formulas === true && typeof value === "string" && value.startsWith("=");
        worksheet.setValue(anchorRect.top + r, anchorRect.left + c, value, { literal: !asFormula });
      }
    }
  }

  // packages/core/src/plugins.ts
  var PluginManager = class {
    disposers = [];
    plugins;
    constructor(plugins = []) {
      this.plugins = plugins;
    }
    get names() {
      return this.plugins.map((p) => p.name);
    }
    /** Run all plugin setups; errors are surfaced with the plugin name. */
    run(context) {
      for (const plugin of this.plugins) {
        try {
          const disposer = plugin.setup(context);
          if (typeof disposer === "function") this.disposers.push(disposer);
        } catch (error) {
          throw new Error(`plugin "${plugin.name}" failed during setup: ${error.message}`);
        }
      }
    }
    destroy() {
      for (const disposer of this.disposers.reverse()) {
        try {
          disposer();
        } catch {
        }
      }
      this.disposers.length = 0;
    }
  };

  // packages/core/src/workbook.ts
  var DEFAULT_ROW_HEIGHT = 24;
  var DEFAULT_COLUMN_WIDTH = 100;
  var Worksheet = class {
    id;
    name;
    workbook;
    cells = new SparseCellStore();
    rowSizes;
    columnSizes;
    rowCount;
    columnCount;
    /** Per-row overrides by row id (structural identity placeholder for Phase 0). */
    rowIds = /* @__PURE__ */ new Map();
    /** Merged ranges (§16): anchor-only data rule. */
    merges = new MergeStore();
    /** Structured tables (§25). */
    tables = new TableStore();
    /** Number format masks keyed by "row,column". */
    numberFormats = /* @__PURE__ */ new Map();
    /** Validation rules (§24). */
    validations = new ValidationService();
    /** Conditional formatting rules (§24.5). */
    conditionalFormats = new ConditionalFormatEngine();
    /** Charts (§31). */
    charts = new ChartEngine();
    /** Pivot engine (§33). */
    pivots = new PivotEngine();
    /** Floating media: images and shapes (§30/§32). */
    media = new MediaStore();
    /** Merge a range (A1 notation). Data lives on the anchor cell. */
    merge(range) {
      const rect = parseRange(range);
      this.merges.merge(rect);
    }
    /** Create a structured table from a range. */
    addTable(options) {
      this.tables.add(this, options);
    }
    getTable(name) {
      return this.tables.get(name);
    }
    // ── Validation (§24): applied on every write ────────────────────────────
    addValidation(rule) {
      return this.validations.add(rule);
    }
    removeValidation(id) {
      this.validations.remove(id);
    }
    // ── Charts / pivot / media convenience APIs ──────────────────────────────
    addChart(spec) {
      return this.charts.add(spec).id;
    }
    addPivot(spec) {
      const full = { ...spec, id: createId("pivot") };
      this.pivots.refresh(this, full);
      return full.id;
    }
    addImage(image) {
      return this.media.addImage(image).id;
    }
    addShape(shape) {
      return this.media.addShape(shape).id;
    }
    // ── CSV import/export (§35.1) ────────────────────────────────────────────
    toCsv(options) {
      return worksheetToCsv(this, options);
    }
    fromCsv(text, options) {
      worksheetFromCsv(this, text, options);
    }
    unmerge(range) {
      const rect = parseRange(range);
      this.merges.unmergeAt(rect.top, rect.left);
    }
    /** Apply a number format mask to a range (A1 notation). */
    setNumberFormat(range, mask) {
      const rect = parseRange(range);
      for (let r = rect.top; r <= rect.bottom; r++) {
        for (let c = rect.left; c <= rect.right; c++) {
          this.numberFormats.set(`${r},${c}`, mask);
        }
      }
    }
    getNumberFormat(row, column) {
      return this.numberFormats.get(`${row},${column}`);
    }
    /** Re-register all formulas after direct record manipulation (sort, paste). */
    refreshFormulas() {
      this.registerAllFormulas();
    }
    // ── Visibility (§15.1/§15.2): hide/show rows and columns ────────────────
    hiddenRows = /* @__PURE__ */ new Set();
    hiddenColumns = /* @__PURE__ */ new Set();
    hideRows(index, count = 1) {
      for (let i = 0; i < count; i++) this.hiddenRows.add(index + i);
    }
    showRows(index, count = 1) {
      for (let i = 0; i < count; i++) this.hiddenRows.delete(index + i);
    }
    hideColumns(index, count = 1) {
      for (let i = 0; i < count; i++) this.hiddenColumns.add(index + i);
    }
    showColumns(index, count = 1) {
      for (let i = 0; i < count; i++) this.hiddenColumns.delete(index + i);
    }
    isColumnHidden(column) {
      return this.hiddenColumns.has(column);
    }
    // ── Filters (§20 prototype): value-predicate row filters ────────────────
    filters = /* @__PURE__ */ new Map();
    filteredRows = /* @__PURE__ */ new Set();
    setFilter(column, predicate) {
      this.filters.set(column, predicate);
      this.applyFilters();
    }
    clearFilter(column) {
      if (column === void 0) this.filters.clear();
      else this.filters.delete(column);
      this.applyFilters();
    }
    applyFilters() {
      for (const row of this.filteredRows) this.hiddenRows.delete(row);
      this.filteredRows.clear();
      if (this.filters.size === 0) return;
      const used = this.cells.usedRange;
      if (!used) return;
      for (let r = used.top; r <= used.bottom; r++) {
        let visible = true;
        for (const [column, predicate] of this.filters) {
          const record = this.cells.getCell(r, column);
          const value = record === void 0 ? null : record.formula !== void 0 ? this.getValue(r, column) : record.raw ?? null;
          if (!predicate(value)) {
            visible = false;
            break;
          }
        }
        if (!visible) {
          this.hiddenRows.add(r);
          this.filteredRows.add(r);
        }
      }
    }
    // ── Cell editor assignment (§13.2 prototype) ─────────────────────────────
    cellEditors = /* @__PURE__ */ new Map();
    setCellEditor(range, type, options) {
      const rect = parseRange(range);
      for (let r = rect.top; r <= rect.bottom; r++) {
        for (let c = rect.left; c <= rect.right; c++) {
          this.cellEditors.set(`${r},${c}`, { type, options });
        }
      }
    }
    getEditorFor(row, column) {
      return this.cellEditors.get(`${row},${column}`);
    }
    // ── Cell styles (§23): cell-level properties with range application ─────
    styles = /* @__PURE__ */ new Map();
    setStyle(range, style) {
      const rect = parseRange(range);
      for (let r = rect.top; r <= rect.bottom; r++) {
        for (let c = rect.left; c <= rect.right; c++) {
          const key2 = `${r},${c}`;
          const current = this.styles.get(key2) ?? {};
          this.styles.set(key2, { ...current, ...style });
        }
      }
    }
    clearStyle(range) {
      const rect = parseRange(range);
      for (let r = rect.top; r <= rect.bottom; r++) {
        for (let c = rect.left; c <= rect.right; c++) {
          this.styles.delete(`${r},${c}`);
        }
      }
    }
    getStyle(row, column) {
      return this.styles.get(`${row},${column}`);
    }
    // ── Notes (§29.1): plain per-cell annotations ────────────────────────────
    notes = /* @__PURE__ */ new Map();
    setNote(range, text) {
      const rect = parseRange(range);
      for (let r = rect.top; r <= rect.bottom; r++) {
        for (let c = rect.left; c <= rect.right; c++) {
          this.notes.set(`${r},${c}`, text);
        }
      }
    }
    getNote(row, column) {
      return this.notes.get(`${row},${column}`);
    }
    clearNote(range) {
      const rect = parseRange(range);
      for (let r = rect.top; r <= rect.bottom; r++) {
        for (let c = rect.left; c <= rect.right; c++) {
          this.notes.delete(`${r},${c}`);
        }
      }
    }
    // ── Nested headers (§17.2): multi-level column header groups ────────────
    nestedHeadersConfig = [];
    setNestedHeaders(levels) {
      this.nestedHeadersConfig = levels;
    }
    get nestedHeaders() {
      return this.nestedHeadersConfig;
    }
    // ── Row groups (§15.1): outline collapse/expand ──────────────────────────
    rowGroupsConfig = [];
    groupHiddenRows = /* @__PURE__ */ new Set();
    groupRows(start, end) {
      if (end <= start) return;
      this.rowGroupsConfig.push({ start, end, collapsed: false });
    }
    ungroupRows(start) {
      const group = this.rowGroupsConfig.find((g) => g.start === start);
      if (!group) return;
      if (group.collapsed) this.expandGroup(start);
      this.rowGroupsConfig = this.rowGroupsConfig.filter((g) => g.start !== start);
    }
    collapseGroup(start) {
      const group = this.rowGroupsConfig.find((g) => g.start === start);
      if (!group || group.collapsed) return;
      group.collapsed = true;
      for (let r = group.start; r <= group.end; r++) this.groupHiddenRows.add(r);
    }
    expandGroup(start) {
      const group = this.rowGroupsConfig.find((g) => g.start === start);
      if (!group || !group.collapsed) return;
      group.collapsed = false;
      for (let r = group.start; r <= group.end; r++) this.groupHiddenRows.delete(r);
    }
    getGroups() {
      return this.rowGroupsConfig;
    }
    isRowHidden(row) {
      return this.hiddenRows.has(row) || this.groupHiddenRows.has(row);
    }
    constructor(workbook2, config = {}) {
      this.workbook = workbook2;
      this.id = config.id ?? createId("sheet");
      this.name = config.name ?? "Sheet1";
      this.rowCount = config.rows ?? 1e3;
      this.columnCount = config.columns ?? 26;
      this.rowSizes = new SizeIndex(this.rowCount, DEFAULT_ROW_HEIGHT);
      this.columnSizes = new SizeIndex(this.columnCount, DEFAULT_COLUMN_WIDTH);
      if (config.data) this.load2DArray(config.data);
    }
    load2DArray(data) {
      for (let r = 0; r < data.length; r++) {
        const row = data[r];
        for (let c = 0; c < row.length; c++) {
          const v = row[c];
          if (v === null || v === void 0 || v === "") continue;
          if (typeof v === "string" && v.startsWith("=")) {
            this.setCellRaw(r, c, void 0, v);
          } else {
            this.setCellRaw(r, c, v);
          }
        }
      }
    }
    setCellRaw(row, column, raw, formula) {
      if (formula === void 0 && (raw === void 0 || raw === null)) {
        this.cells.setCell(row, column, void 0);
        return;
      }
      const record = formula !== void 0 ? { formula } : { raw };
      this.cells.setCell(row, column, record);
      if (formula !== void 0) {
        const graph = this.workbook.formulaGraph;
        graph.setCurrentSheet(this.name);
        graph.setFormula(this.name, row, column, formula, Parser.parse(formula.slice(1)));
        this.getValue(row, column);
      }
    }
    /** Get the calculated display value of a cell (formulas evaluated via dependency graph). */
    getValue(row, column) {
      const coveredBy = this.spillCover.get(`${row},${column}`);
      const record = this.cells.getCell(row, column);
      if (coveredBy && !record) {
        const [anchorRow, anchorColumn] = coveredBy.split(",").map(Number);
        const result = this.evaluateAnchor(anchorRow, anchorColumn);
        if (result.matrix) {
          return result.matrix.values[row - anchorRow]?.[column - anchorColumn] ?? null;
        }
        return result.value;
      }
      if (!record) return null;
      if (record.formula !== void 0) {
        return this.evaluateAnchor(row, column).value;
      }
      return record.raw ?? null;
    }
    /** Evaluate an anchor formula, registering or clearing its spill. */
    evaluateAnchor(row, column) {
      const graph = this.workbook.formulaGraph;
      graph.setCurrentSheet(this.name);
      const value = graph.recalculate(
        this.name,
        row,
        column,
        (s, r, c) => this.readRawValue(s ?? this.name, r, c)
      );
      const key2 = `${row},${column}`;
      if (isMatrix(value)) {
        if (this.isSpillBlocked(row, column, value.rows, value.columns)) {
          this.clearSpill(key2);
          this.spillError.set(key2, true);
          return { value: "#SPILL!" };
        }
        this.spillError.delete(key2);
        this.registerSpill(row, column, value);
        return { matrix: value, value: value.values[0]?.[0] ?? null };
      }
      this.clearSpill(key2);
      this.spillError.delete(key2);
      return { value: value instanceof FormulaError ? value.value : value };
    }
    /** Spills keyed by anchor "row,column". */
    spills = /* @__PURE__ */ new Map();
    spillCover = /* @__PURE__ */ new Map();
    spillError = /* @__PURE__ */ new Map();
    isSpilled(row, column) {
      return this.spillCover.has(`${row},${column}`);
    }
    hasSpillError(row, column) {
      return this.spillError.has(`${row},${column}`);
    }
    isSpillBlocked(row, column, rows, columns) {
      for (let r = row; r < row + rows; r++) {
        for (let c = column; c < column + columns; c++) {
          if (r === row && c === column) continue;
          if (this.cells.getCell(r, c) !== void 0) return true;
        }
      }
      return false;
    }
    registerSpill(row, column, value) {
      const key2 = `${row},${column}`;
      this.spills.set(key2, { rows: value.rows, columns: value.columns });
      for (let r = row; r < row + value.rows; r++) {
        for (let c = column; c < column + value.columns; c++) {
          if (r === row && c === column) continue;
          this.spillCover.set(`${r},${c}`, key2);
        }
      }
    }
    clearSpill(key2) {
      const spill = this.spills.get(key2);
      if (!spill) return;
      const [row, column] = key2.split(",").map(Number);
      for (let r = row; r < row + spill.rows; r++) {
        for (let c = column; c < column + spill.columns; c++) {
          this.spillCover.delete(`${r},${c}`);
        }
      }
      this.spills.delete(key2);
    }
    clearAllSpills() {
      for (const key2 of [...this.spills.keys()]) this.clearSpill(key2);
      this.spillError.clear();
    }
    /**
     * Evaluated value of a cell for formula readers: raw records resolve
     * directly; formula cells and spill-covered cells resolve through the
     * graph (with spill support and cycle protection via the graph's
     * evaluating flags). Named ranges, tables and cross-sheet refs therefore
     * see formula-valued cells.
     */
    readRawValue(sheetName, row, column) {
      const sheet = sheetName === this.name ? this : this.workbook.getWorksheet(sheetName);
      if (!sheet) return new FormulaError("#REF!");
      return sheet.resolveEvaluatedValue(row, column);
    }
    /**
     * Runtime value used by formula readers: formulas evaluate through the
     * graph, spill-covered cells resolve via their anchor's matrix, and raw
     * records pass through.
     */
    resolveEvaluatedValue(row, column) {
      const coveredBy = this.spillCover.get(`${row},${column}`);
      if (coveredBy) {
        const [anchorRow, anchorColumn] = coveredBy.split(",").map(Number);
        const result = this.evaluateAnchor(anchorRow, anchorColumn);
        if (result.matrix) {
          return result.matrix.values[row - anchorRow]?.[column - anchorColumn] ?? null;
        }
        return result.value;
      }
      const record = this.cells.getCell(row, column);
      if (!record) return null;
      if (record.formula !== void 0) {
        const result = this.evaluateAnchor(row, column);
        return result.value;
      }
      return record.raw ?? null;
    }
    /**
     * Set a cell value; strings starting with "=" become formulas. Emits an
     * operation. Pass `{ literal: true }` to store text verbatim (CSV import
     * with formulas disabled).
     */
    setValue(row, column, value, options) {
      if (value !== null && value !== void 0) {
        const result = this.validations.check(this, row, column, value);
        if (result.action === "reject" && !result.allowed) {
          this.workbook.emitOperation(
            op(this.workbook.id, "validation.reject", { row, column, value, message: result.message }, this.id)
          );
          return null;
        }
      }
      let formula;
      let raw = value;
      if (!options?.literal && typeof value === "string" && value.startsWith("=")) {
        try {
          Parser.parse(value.slice(1));
        } catch (e) {
          this.workbook.emitOperation(
            op(
              this.workbook.id,
              "validation.reject",
              { row, column, value, message: `Invalid formula: ${e.message}` },
              this.id
            )
          );
          return null;
        }
        formula = value;
        raw = void 0;
      }
      const spillOwner = this.spillCover.get(`${row},${column}`) ?? `${row},${column}`;
      if (this.spills.has(spillOwner)) this.clearSpill(spillOwner);
      if (this.spillError.has(`${row},${column}`)) this.spillError.delete(`${row},${column}`);
      const previous = this.cells.getCell(row, column);
      const previousSnapshot = previous ? { raw: previous.raw, formula: previous.formula, styleId: previous.styleId } : void 0;
      if (previous?.formula !== void 0) {
        this.workbook.formulaGraph.removeFormula(this.name, row, column);
      }
      this.setCellRaw(row, column, raw, formula);
      const operation = op(
        this.workbook.id,
        "cell.set",
        { row, column, raw, formula, previous: previousSnapshot },
        this.id
      );
      this.workbook.emitOperation(operation);
      return operation;
    }
    getAddress(row, column) {
      return toA1(row, column);
    }
    /**
     * Register every formula cell of EVERY worksheet with the dependency
     * graph. The graph is workbook-wide, so clearing it and re-registering
     * only this sheet would orphan other sheets' formulas.
     */
    registerAllFormulas() {
      this.workbook.refreshFormulaGraph();
    }
    /** Rewrite formulas that reference this sheet after a structural change, then re-register. */
    rewriteFormulas(shift) {
      this.workbook.transformFormulasForStructuralChange(this.name, shift);
    }
    insertRows(index, count = 1) {
      this.clearAllSpills();
      this.cells.insertRows(index, count);
      this.rowCount += count;
      this.transformMetadata("row", index, count);
      this.transformSizes("row", index, count);
      this.rewriteFormulas({ kind: "row", at: index, delta: count });
      this.workbook.transformHistory(this.id, "row", index, count);
      this.workbook.emitOperation(
        op(this.workbook.id, "rows.insert", { index, count }, this.id)
      );
    }
    deleteRows(index, count = 1) {
      this.clearAllSpills();
      this.cells.deleteRows(index, count);
      this.rowCount = Math.max(1, this.rowCount - count);
      this.transformMetadata("row", index, -count);
      this.transformSizes("row", index, -count);
      this.rewriteFormulas({ kind: "row", at: index, delta: -count });
      this.workbook.transformHistory(this.id, "row", index, -count);
      this.workbook.emitOperation(
        op(this.workbook.id, "rows.delete", { index, count }, this.id)
      );
    }
    insertColumns(index, count = 1) {
      this.clearAllSpills();
      this.cells.insertColumns(index, count);
      this.columnCount += count;
      this.transformMetadata("column", index, count);
      this.transformSizes("column", index, count);
      this.rewriteFormulas({ kind: "column", at: index, delta: count });
      this.workbook.transformHistory(this.id, "column", index, count);
      this.workbook.emitOperation(
        op(this.workbook.id, "columns.insert", { index, count }, this.id)
      );
    }
    deleteColumns(index, count = 1) {
      this.clearAllSpills();
      this.cells.deleteColumns(index, count);
      this.columnCount = Math.max(1, this.columnCount - count);
      this.transformMetadata("column", index, -count);
      this.transformSizes("column", index, -count);
      this.rewriteFormulas({ kind: "column", at: index, delta: -count });
      this.workbook.transformHistory(this.id, "column", index, -count);
      this.workbook.emitOperation(
        op(this.workbook.id, "columns.delete", { index, count }, this.id)
      );
    }
    /**
     * Shift every coordinate-keyed and range-anchored metadata structure so
     * data stays attached to its styles, formats, notes, editors, validation
     * rules, merges, tables, visibility and floating objects.
     */
    transformMetadata(kind, at, delta) {
      const shift = (pos) => shiftPosition(pos, at, delta);
      const edge = (pos, isStart) => shiftRangeEdge(pos, at, delta, isStart);
      for (const map of [
        this.styles,
        this.numberFormats,
        this.notes,
        this.cellEditors
      ]) {
        const entries = [];
        for (const [key2, value] of map) {
          const [r, c] = key2.split(",").map(Number);
          const row = kind === "row" ? shift(r) : r;
          const column = kind === "column" ? shift(c) : c;
          if (row === void 0 || column === void 0) continue;
          entries.push([`${row},${column}`, value]);
        }
        map.clear();
        for (const [key2, value] of entries) map.set(key2, value);
      }
      const remapSet = (set) => {
        const mapped = /* @__PURE__ */ new Set();
        for (const pos of set) {
          const m = shift(pos);
          if (m !== void 0) mapped.add(m);
        }
        set.clear();
        for (const v of mapped) set.add(v);
      };
      if (kind === "row") {
        remapSet(this.hiddenRows);
        remapSet(this.groupHiddenRows);
        const rowIds = [];
        for (const [row, id] of this.rowIds) {
          const m = shift(row);
          if (m !== void 0) rowIds.push([m, id]);
        }
        this.rowIds.clear();
        for (const [row, id] of rowIds) this.rowIds.set(row, id);
        this.rowGroupsConfig = this.rowGroupsConfig.map((g) => ({
          ...g,
          start: edge(g.start, true) ?? Number.NaN,
          end: edge(g.end, false) ?? Number.NaN
        })).filter((g) => Number.isInteger(g.start) && Number.isInteger(g.end) && g.end >= g.start);
      } else {
        remapSet(this.hiddenColumns);
      }
      const transformRangeString = (range) => {
        const rect = parseRange(range);
        const bang = range.lastIndexOf("!");
        const prefix = bang >= 0 ? range.slice(0, bang + 1) : "";
        const top = kind === "row" ? edge(rect.top, true) : rect.top;
        const bottom = kind === "row" ? edge(rect.bottom, false) : rect.bottom;
        const left = kind === "column" ? edge(rect.left, true) : rect.left;
        const right = kind === "column" ? edge(rect.right, false) : rect.right;
        if (top === void 0 || bottom === void 0 || left === void 0 || right === void 0 || bottom < top || right < left) {
          return void 0;
        }
        return prefix + rectToRange({ top, left, bottom, right });
      };
      for (const rule of [...this.validations.all()]) {
        const mapped = transformRangeString(rule.range);
        if (mapped === void 0) this.validations.remove(rule.id);
        else rule.range = mapped;
      }
      for (const rule of [...this.conditionalFormats.all()]) {
        const mapped = transformRangeString(rule.range);
        if (mapped === void 0) this.conditionalFormats.remove(rule.id);
        else rule.range = mapped;
      }
      this.merges.transform(edge, kind);
      this.tables.transform(edge, kind);
      const anchorShift = (pos) => shift(pos) ?? at;
      const transformAnchor = (obj) => {
        if (kind === "row") obj.anchor.row = anchorShift(obj.anchor.row);
        else obj.anchor.column = anchorShift(obj.anchor.column);
      };
      for (const chart of this.charts.all()) {
        transformAnchor(chart);
        const mapped = transformRangeString(chart.source);
        if (mapped !== void 0) chart.source = mapped;
      }
      for (const media of this.media.all()) transformAnchor(media);
    }
    /** Preserve custom sizes across structural changes (no reset to defaults). */
    transformSizes(kind, at, delta) {
      const source = kind === "row" ? this.rowSizes : this.columnSizes;
      const defaultSize = kind === "row" ? DEFAULT_ROW_HEIGHT : DEFAULT_COLUMN_WIDTH;
      const newCount = kind === "row" ? this.rowCount : this.columnCount;
      const oldCount = newCount - delta;
      const fresh = new SizeIndex(newCount, defaultSize);
      for (let i = 0; i < oldCount; i++) {
        const mapped = shiftPosition(i, at, delta);
        if (mapped === void 0) continue;
        const size = source.sizeOf(i);
        if (size !== defaultSize) fresh.setSize(mapped, size);
      }
      if (kind === "row") Object.assign(this, { rowSizes: fresh });
      else Object.assign(this, { columnSizes: fresh });
    }
  };
  var Workbook = class {
    id;
    worksheets = [];
    formulaGraph = new DependencyGraph();
    history = new HistoryService();
    /** Defined names (26): named ranges, constants and formulas. */
    definedNames = /* @__PURE__ */ new Map();
    pluginManager;
    listeners = /* @__PURE__ */ new Set();
    constructor(options = {}) {
      this.id = options.id ?? createId("wb");
      this.pluginManager = new PluginManager(options.extensions ?? []);
      for (const config of options.worksheets ?? []) {
        this.worksheets.push(new Worksheet(this, config));
      }
      if (this.worksheets.length === 0) {
        this.worksheets.push(new Worksheet(this, { name: "Sheet1" }));
      }
      this.formulaGraph.setNamesResolver((name) => this.resolveNameValue(name));
      this.formulaGraph.setTableResolver((table, column, _item) => {
        const sheet = this.activeWorksheet;
        const tableDef = sheet.tables.get(table);
        if (!tableDef) return new FormulaError("#NAME?");
        const rect = tableDef.range;
        const top = tableDef.headerRow ? rect.top + 1 : rect.top;
        if (column === void 0) {
          return this.matrixFromRange(sheet, rect.left, rect.right, top, rect.bottom);
        }
        const colDef = tableDef.columns.find((c) => c.name === column);
        if (!colDef) return new FormulaError("#REF!");
        return this.matrixFromRange(sheet, colDef.index, colDef.index, top, rect.bottom);
      });
    }
    /** Build a matrix value from a worksheet rectangle. */
    matrixFromRange(sheet, left, right, top, bottom) {
      const values = [];
      for (let r = top; r <= bottom; r++) {
        const row = [];
        for (let c = left; c <= right; c++) {
          row.push(sheet.readRawValue(this.activeWorksheet.name, r, c));
        }
        values.push(row);
      }
      return { kind: "matrix", rows: values.length, columns: values[0]?.length ?? 0, values };
    }
    setDefinedName(name, definition) {
      this.definedNames.set(name, definition);
    }
    removeDefinedName(name) {
      this.definedNames.delete(name);
    }
    /** Resolve a defined name to a runtime value (constant) or matrix (range). */
    resolveNameValue(name) {
      const definition = this.definedNames.get(name);
      if (!definition) {
        const tableDef = this.activeWorksheet.tables.get(name);
        if (tableDef) {
          const rect2 = tableDef.range;
          return this.matrixFromRange(
            this.activeWorksheet,
            rect2.left,
            rect2.right,
            tableDef.headerRow ? rect2.top + 1 : rect2.top,
            rect2.bottom
          );
        }
        return new FormulaError("#NAME?");
      }
      if (definition.type === "value") {
        const value = definition.value;
        if (typeof value === "string" && value.startsWith("=")) {
          const graph = this.formulaGraph;
          const sheet2 = this.activeWorksheet;
          const ast = Parser.parse(value.slice(1));
          const ctx = graph.createContext(sheet2.name, (s, r, c) => {
            if (r < 0 || c < 0) return null;
            return sheet2.readRawValue(s ?? sheet2.name, r, c);
          });
          return graph.evaluateNode(ast, ctx);
        }
        return value ?? null;
      }
      const rect = parseRange(definition.ref);
      const sheet = rect.sheet ? this.getWorksheet(rect.sheet) : this.activeWorksheet;
      if (!sheet) return new FormulaError("#REF!");
      const values = [];
      for (let r = rect.top; r <= rect.bottom; r++) {
        const row = [];
        for (let c = rect.left; c <= rect.right; c++) {
          row.push(sheet.readRawValue(rect.sheet ?? this.activeWorksheet.name, r, c));
        }
        values.push(row);
      }
      return { kind: "matrix", rows: values.length, columns: values[0]?.length ?? 0, values };
    }
    getWorksheet(idOrName) {
      return this.worksheets.find((w) => w.id === idOrName) ?? this.worksheets.find((w) => w.name === idOrName);
    }
    get activeWorksheet() {
      return this.worksheets[0];
    }
    addWorksheet(config = {}) {
      const sheet = new Worksheet(this, config);
      this.worksheets.push(sheet);
      return sheet;
    }
    removeWorksheet(id) {
      const index = this.worksheets.findIndex((w) => w.id === id);
      if (index === -1) throw new Error(`worksheet not found: ${id}`);
      if (this.worksheets.length === 1) throw new Error("cannot remove the last worksheet");
      this.worksheets.splice(index, 1);
    }
    onOperation(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    emitOperation(operation) {
      this.recordWithInverse(operation);
      for (const listener of this.listeners) listener(operation);
    }
    recordWithInverse(operation) {
      if (operation.type === "cell.set") {
        const payload = operation.payload;
        const inverse = op(
          this.id,
          "cell.set",
          {
            row: payload.row,
            column: payload.column,
            raw: payload.previous?.raw,
            formula: payload.previous?.formula,
            previous: {
              raw: payload.raw,
              formula: payload.formula
            }
          },
          operation.worksheetId
        );
        this.history.push(operation, inverse);
      }
    }
    /** Apply a cell.set operation without re-recording history. */
    applyCellSet(payload, worksheetId) {
      const sheet = worksheetId !== void 0 ? this.worksheets.find((w) => w.id === worksheetId) : this.activeWorksheet;
      if (!sheet) return;
      const existing = sheet.cells.getCell(payload.row, payload.column);
      if (existing?.formula !== void 0) {
        this.formulaGraph.removeFormula(sheet.name, payload.row, payload.column);
      }
      if (payload.formula !== void 0) {
        const ast = Parser.parse(payload.formula.slice(1));
        sheet.cells.setCell(payload.row, payload.column, { formula: payload.formula });
        this.formulaGraph.setFormula(
          sheet.name,
          payload.row,
          payload.column,
          payload.formula,
          ast
        );
      } else {
        sheet.cells.setCell(
          payload.row,
          payload.column,
          payload.raw === null || payload.raw === void 0 ? void 0 : { raw: payload.raw }
        );
      }
    }
    /** Rebuild the workbook-wide formula graph from every worksheet's records. */
    refreshFormulaGraph() {
      const graph = this.formulaGraph;
      graph.clear();
      for (const sheet of this.worksheets) {
        sheet.cells.forEach((row, column, record) => {
          if (record.formula !== void 0) {
            graph.setFormula(sheet.name, row, column, record.formula, Parser.parse(record.formula.slice(1)));
          }
        });
      }
    }
    /**
     * Rewrite formulas on EVERY sheet whose references point at the sheet
     * whose rows/columns moved, then rebuild the graph.
     */
    transformFormulasForStructuralChange(sheetName, shift) {
      for (const sheet of this.worksheets) {
        const updates = [];
        sheet.cells.forEach((row, column, record) => {
          if (record.formula === void 0) return;
          const body = record.formula.slice(1);
          const transformed = transformFormulaRefs(body, shift, {
            ownerSheet: sheet.name,
            targetSheet: sheetName
          });
          if (transformed !== body) {
            updates.push({ row, column, formula: `=${transformed}` });
          }
        });
        for (const u of updates) {
          const record = sheet.cells.getCell(u.row, u.column);
          if (record) record.formula = u.formula;
        }
      }
      this.refreshFormulaGraph();
    }
    /** Keep undo/redo cell targets aligned with structural row/column changes. */
    transformHistory(sheetId, kind, at, delta) {
      this.history.transformCells(sheetId, (row, column) => {
        const mappedRow = kind === "row" ? shiftPosition(row, at, delta) : row;
        const mappedColumn = kind === "column" ? shiftPosition(column, at, delta) : column;
        if (mappedRow === void 0 || mappedColumn === void 0) return void 0;
        return { row: mappedRow, column: mappedColumn };
      });
    }
    undo() {
      const operation = this.history.popUndo();
      if (!operation) return;
      const sheet = this.worksheets.find((w) => w.id === operation.worksheetId);
      if (!sheet) return;
      const payload = operation.payload;
      this.applyCellSet(
        {
          row: payload.row,
          column: payload.column,
          raw: payload.previous?.raw,
          formula: payload.previous?.formula
        },
        operation.worksheetId
      );
      this.emitOperation({ ...operation, type: "undo", payload: { of: operation.id } });
    }
    redo() {
      const operation = this.history.popRedo();
      if (!operation || operation.type !== "cell.set") return;
      const sheet = this.worksheets.find((w) => w.id === operation.worksheetId);
      if (!sheet) return;
      this.applyCellSet(operation.payload, operation.worksheetId);
      this.emitOperation({ ...operation, type: "redo", payload: { of: operation.id } });
    }
    get canUndo() {
      return this.history.canUndo;
    }
    get canRedo() {
      return this.history.canRedo;
    }
    /** Native JSON snapshot (format v1). */
    toJSON() {
      return {
        format: "ezygrid",
        version: 1,
        id: this.id,
        worksheets: this.worksheets.map((sheet) => {
          const rows = [];
          const used = sheet.cells.usedRange;
          if (used) {
            for (let r = 0; r <= used.bottom; r++) {
              const row = [];
              for (let c = 0; c <= used.right; c++) {
                const record = sheet.cells.getCell(r, c);
                if (!record) {
                  row.push(null);
                  continue;
                }
                row.push(record.formula ?? record.raw ?? null);
              }
              rows.push(row);
            }
          }
          return {
            id: sheet.id,
            name: sheet.name,
            dimensions: { rows: sheet.rowCount, columns: sheet.columnCount },
            data: rows
          };
        })
      };
    }
  };
  function createGrid(_element, options = {}) {
    return new Workbook(options);
  }
  function shiftPosition(pos, at, delta) {
    if (delta > 0) return pos >= at ? pos + delta : pos;
    const count = -delta;
    if (pos < at) return pos;
    if (pos < at + count) return void 0;
    return pos - count;
  }
  function shiftRangeEdge(pos, at, delta, isStart) {
    if (delta > 0) return pos >= at ? pos + delta : pos;
    const count = -delta;
    if (pos < at) return pos;
    if (pos < at + count) return isStart ? at : at - 1;
    return pos - count;
  }

  // packages/core/src/selection.ts
  var SelectionService = class {
    state;
    rowCount;
    columnCount;
    listeners = /* @__PURE__ */ new Set();
    constructor(rowCount, columnCount) {
      this.rowCount = rowCount;
      this.columnCount = columnCount;
      this.state = {
        active: { row: 0, column: 0 },
        anchor: { row: 0, column: 0 },
        ranges: [{ top: 0, left: 0, bottom: 0, right: 0 }]
      };
    }
    onChange(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    emit() {
      for (const l of this.listeners) l(this.state);
    }
    clamp(row, column) {
      return {
        row: Math.max(0, Math.min(this.rowCount - 1, row)),
        column: Math.max(0, Math.min(this.columnCount - 1, column))
      };
    }
    setActive(row, column) {
      const p = this.clamp(row, column);
      this.state.active = p;
      this.state.anchor = p;
      this.state.ranges = [{ top: p.row, left: p.column, bottom: p.row, right: p.column }];
      this.emit();
    }
    beginRangeExpand(row, column) {
      const p = this.clamp(row, column);
      this.state.anchor = p;
      this.state.ranges = [{ top: p.row, left: p.column, bottom: p.row, right: p.column }];
      this.emit();
    }
    extendTo(row, column) {
      const a = this.state.anchor;
      const p = this.clamp(row, column);
      this.state.active = p;
      this.state.ranges = [
        {
          top: Math.min(a.row, p.row),
          left: Math.min(a.column, p.column),
          bottom: Math.max(a.row, p.row),
          right: Math.max(a.column, p.column)
        }
      ];
      this.emit();
    }
    addRange(row, column) {
      const p = this.clamp(row, column);
      this.state.active = p;
      this.state.anchor = p;
      this.state.ranges.push({ top: p.row, left: p.column, bottom: p.row, right: p.column });
      this.emit();
    }
    selectAll() {
      this.state = {
        active: { row: 0, column: 0 },
        anchor: { row: 0, column: 0 },
        ranges: [{ top: 0, left: 0, bottom: this.rowCount - 1, right: this.columnCount - 1 }]
      };
      this.emit();
    }
    selectRow(row) {
      this.state = {
        active: { row, column: 0 },
        anchor: { row, column: 0 },
        ranges: [{ top: row, left: 0, bottom: row, right: this.columnCount - 1 }]
      };
      this.emit();
    }
    selectColumn(column) {
      this.state = {
        active: { row: 0, column },
        anchor: { row: 0, column },
        ranges: [{ top: 0, left: column, bottom: this.rowCount - 1, right: column }]
      };
      this.emit();
    }
    get primary() {
      return this.state.ranges[this.state.ranges.length - 1];
    }
    isActive(row, column) {
      return this.state.active.row === row && this.state.active.column === column;
    }
    isWithin(row, column) {
      return this.state.ranges.some((r) => rectContains(r, row, column));
    }
    /** Expand to the data-region boundary (Ctrl+Arrow) using a filled-cell predicate. */
    move(direction, shift, ctrl, isFilled) {
      const { active } = this.state;
      let target = { ...active };
      if (ctrl) {
        target = this.dataBoundary(active.row, active.column, direction, isFilled);
      } else {
        switch (direction) {
          case "up":
            target = { row: active.row - 1, column: active.column };
            break;
          case "down":
            target = { row: active.row + 1, column: active.column };
            break;
          case "left":
            target = { row: active.row, column: active.column - 1 };
            break;
          case "right":
            target = { row: active.row, column: active.column + 1 };
            break;
        }
      }
      const p = this.clamp(target.row, target.column);
      if (shift) {
        this.extendTo(p.row, p.column);
      } else {
        this.setActive(p.row, p.column);
      }
    }
    /** Ctrl+Arrow jumps to the edge of the contiguous data region. */
    dataBoundary(row, column, direction, isFilled) {
      const dr = direction === "down" ? 1 : direction === "up" ? -1 : 0;
      const dc = direction === "right" ? 1 : direction === "left" ? -1 : 0;
      let r = row;
      let c = column;
      const inBounds = (row2, column2) => row2 >= 0 && row2 < this.rowCount && column2 >= 0 && column2 < this.columnCount;
      if (isFilled(r, c)) {
        let nr = r + dr;
        let nc = c + dc;
        while (inBounds(r, c) && isFilled(nr, nc)) {
          r = nr;
          c = nc;
          nr += dr;
          nc += dc;
        }
        if (r === row && c === column) {
          let br = r + dr;
          let bc = c + dc;
          while (inBounds(br, bc) && !isFilled(br, bc)) {
            br += dr;
            bc += dc;
          }
          if (inBounds(br, bc)) {
            r = br;
            c = bc;
            let nr2 = r + dr;
            let nc2 = c + dc;
            while (inBounds(nr2, nc2) && isFilled(nr2, nc2)) {
              r = nr2;
              c = nc2;
              nr2 += dr;
              nc2 += dc;
            }
          } else {
            r = Math.max(0, Math.min(this.rowCount - 1, br));
            c = Math.max(0, Math.min(this.columnCount - 1, bc));
          }
        }
      } else {
        while (inBounds(r, c) && !isFilled(r, c)) {
          r += dr;
          c += dc;
        }
        if (inBounds(r, c)) {
          let nr = r + dr;
          let nc = c + dc;
          while (inBounds(nr, nc) && isFilled(nr, nc)) {
            r = nr;
            c = nc;
            nr += dr;
            nc += dc;
          }
        } else {
          r = Math.max(0, Math.min(this.rowCount - 1, r));
          c = Math.max(0, Math.min(this.columnCount - 1, c));
        }
      }
      return { row: r, column: c };
    }
    describe() {
      const r = this.primary;
      if (r.top === r.bottom && r.left === r.right) return toA1(r.top, r.left);
      return `${toA1(r.top, r.left)}:${toA1(r.bottom, r.right)}`;
    }
  };

  // packages/core/src/editing.ts
  var EditService = class {
    mode = "idle";
    events;
    constructor(events = {}) {
      this.events = events;
    }
    get editing() {
      return this.mode === "editing";
    }
    get session() {
      return this.session_ ?? null;
    }
    session_ = null;
    beginEdit(sheet, row, column, initial) {
      const raw = sheet.cells.getCell(row, column);
      const initialText = initial !== void 0 ? initial : raw?.formula !== void 0 ? raw.formula : raw?.raw === null || raw?.raw === void 0 ? "" : String(raw.raw);
      this.session_ = { row, column, initial: initialText, mode: initial === void 0 ? "replace" : "edit" };
      this.mode = "editing";
      this.events.onEditStart?.(this.session_);
      return this.session_;
    }
    /** Commit the pending text; returns true when a value was written. */
    commit(sheet, text) {
      if (!this.session_) return false;
      const { row, column } = this.session_;
      const value = text ?? this.session_.initial;
      this.events.onCommit?.(this.session_, value);
      if (value !== "") {
        const parsed = value.startsWith("=") ? value : parseEditorValue(value);
        sheet.setValue(row, column, parsed);
      } else {
        sheet.setValue(row, column, null);
      }
      this.end();
      return true;
    }
    cancel() {
      if (!this.session_) return false;
      this.events.onEditCancel?.(this.session_);
      this.end();
      return true;
    }
    end() {
      this.session_ = null;
      this.mode = "idle";
    }
  };
  function parseEditorValue(text) {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
    if (/^(true|TRUE|True)$/.test(trimmed)) return true;
    if (/^(false|FALSE|False)$/.test(trimmed)) return false;
    return text;
  }

  // packages/core/src/clipboard.ts
  var ClipboardService = class _ClipboardService {
    buffer = null;
    /** Build the internal payload from a worksheet range. */
    copyFrom(worksheet, top, left, bottom, right, options = {}) {
      const cells = [];
      for (let r = top; r <= bottom; r++) {
        const row = [];
        for (let c = left; c <= right; c++) {
          if (options.valuesOnly) {
            row.push({ raw: worksheet.getValue(r, c) });
          } else {
            const record = worksheet.cells.getCell(r, c);
            row.push(record ? { raw: record.raw, formula: record.formula, style: worksheet.getStyle(r, c) } : { raw: null });
          }
        }
        cells.push(row);
      }
      this.buffer = { rows: bottom - top + 1, columns: right - left + 1, origin: { row: top, column: left }, cells };
      return this.buffer;
    }
    getBuffer() {
      return this.buffer;
    }
    /** Load text copied from another application without translating its formulas. */
    loadTSV(text) {
      this.buffer = _ClipboardService.fromTSV(text);
    }
    /** TSV text of the clipboard buffer (external format). */
    toTSV() {
      if (!this.buffer) return "";
      return this.buffer.cells.map(
        (row) => row.map((cell) => {
          const text = cell.formula ?? (cell.raw === null || cell.raw === void 0 ? "" : String(cell.raw));
          return /[\\\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        }).join("	")
      ).join("\n");
    }
    /** Parse external TSV into a clipboard payload. */
    static fromTSV(text) {
      const rows = [];
      const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      for (const line of lines) {
        if (line === "") continue;
        const cells = [];
        let i = 0;
        while (i <= line.length) {
          if (line[i] === '"') {
            let value = "";
            i += 1;
            while (i < line.length) {
              if (line[i] === '"' && line[i + 1] === '"') {
                value += '"';
                i += 2;
              } else if (line[i] === '"') {
                i += 1;
                break;
              } else {
                value += line[i];
                i += 1;
              }
            }
            cells.push({ raw: value });
          } else {
            let value = "";
            while (i < line.length && line[i] !== "	") {
              value += line[i];
              i += 1;
            }
            const isNumeric = value !== "" && /^-?\d+(\.\d+)?$/.test(value);
            cells.push({ raw: isNumeric ? Number(value) : value === "" ? null : value });
          }
          i += 1;
        }
        rows.push(cells);
      }
      const height = rows.length;
      const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
      for (const row of rows) {
        while (row.length < width) row.push({ raw: null });
      }
      return { rows: height, columns: width, origin: { row: 0, column: 0 }, cells: rows };
    }
    /**
     * Paste the buffer at a target anchor. Relative formula references move
     * with the paste offset; absolute parts stay fixed (§12.3).
     */
    pasteTo(workbook2, worksheet, anchorRow, anchorColumn) {
      if (!this.buffer) return;
      const dRow = anchorRow - this.buffer.origin.row;
      const dCol = anchorColumn - this.buffer.origin.column;
      for (let r = 0; r < this.buffer.rows; r++) {
        for (let c = 0; c < this.buffer.columns; c++) {
          const source = this.buffer.cells[r][c];
          const targetRow = anchorRow + r;
          const targetColumn = anchorColumn + c;
          if (source.formula !== void 0) {
            worksheet.setValue(targetRow, targetColumn, translateFormula(source.formula, dRow, dCol));
          } else {
            worksheet.setValue(targetRow, targetColumn, source.raw ?? null);
          }
          if (source.style) {
            worksheet.setStyle(toA1(targetRow, targetColumn), source.style);
          }
        }
      }
    }
  };
  function translateFormula(formula, dRow, dCol) {
    if (dRow === 0 && dCol === 0) return formula;
    const body = formula.startsWith("=") ? formula.slice(1) : formula;
    let out = "";
    for (const token of tokenizeFormula(body)) {
      out += token.isRef ? translateRefToken(token.text, dRow, dCol) : token.text;
    }
    return `=${out}`;
  }
  function translateRefToken(token, dRow, dCol) {
    const colon = token.indexOf(":");
    if (colon >= 0) {
      const a = translateRefPart(token.slice(0, colon), dRow, dCol);
      const b = translateRefPart(token.slice(colon + 1), dRow, dCol);
      if (a === void 0 || b === void 0) return "#REF!";
      return `${a}:${b}`;
    }
    return translateRefPart(token, dRow, dCol) ?? "#REF!";
  }
  function translateRefPart(part, dRow, dCol) {
    const bang = part.lastIndexOf("!");
    const prefix = bang >= 0 ? part.slice(0, bang + 1) : "";
    const body = bang >= 0 ? part.slice(bang + 1) : part;
    const m = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/.exec(body);
    if (!m) return part;
    const dollarCol = m[1];
    const letters = m[2];
    const dollarRow = m[3];
    const digits = m[4];
    let column = 0;
    for (const ch of letters) column = column * 26 + ((ch.charCodeAt(0) | 32) - 96);
    column -= 1;
    const row = Number(digits) - 1;
    const newColumn = dollarCol === "$" ? column : column + dCol;
    const newRow = dollarRow === "$" ? row : row + dRow;
    if (newRow < 0 || newColumn < 0) return void 0;
    return `${prefix}${dollarCol}${indexToColumn(newColumn)}${dollarRow}${newRow + 1}`;
  }

  // packages/core/src/commands.ts
  var CommandRegistry = class {
    commands = /* @__PURE__ */ new Map();
    register(command) {
      this.commands.set(command.id, command);
    }
    get(id) {
      return this.commands.get(id);
    }
    all() {
      return [...this.commands.values()];
    }
    execute(id, ctx) {
      const command = this.commands.get(id);
      if (!command) return false;
      if (command.isEnabled && !command.isEnabled(ctx)) return false;
      command.execute(ctx);
      return true;
    }
    /** Match a keyboard event against registered shortcuts ("Mod+C" style). */
    matchShortcut(event) {
      const mod = event.ctrlKey || event.metaKey;
      for (const command of this.commands.values()) {
        if (!command.shortcut) continue;
        const parts = command.shortcut.split("+").map((p) => p.trim());
        const needsMod = parts.some((p) => p.toLowerCase() === "mod");
        const needsShift = parts.some((p) => p.toLowerCase() === "shift");
        const key2 = parts[parts.length - 1];
        if (needsMod !== mod) continue;
        if (needsShift !== event.shiftKey) continue;
        if (key2.toLowerCase() === event.key.toLowerCase()) return command;
      }
      return void 0;
    }
  };
  function createDefaultCommands(hooks) {
    return [
      { id: "edit.undo", title: "Undo", shortcut: "Mod+Z", execute: (ctx) => ctx.workbook.undo() },
      { id: "edit.redo", title: "Redo", shortcut: "Mod+Y", execute: (ctx) => ctx.workbook.redo() },
      { id: "clipboard.copy", title: "Copy", shortcut: "Mod+C", execute: hooks.copy },
      { id: "clipboard.cut", title: "Cut", shortcut: "Mod+X", execute: hooks.cut },
      { id: "clipboard.paste", title: "Paste", shortcut: "Mod+V", execute: hooks.paste },
      { id: "cells.fillDown", title: "Fill down", shortcut: "Mod+D", execute: hooks.fillDown }
    ];
  }

  // packages/core/src/fill.ts
  var FillService = class {
    fill(worksheet, direction, rect, targetEnd) {
      if (direction === "down" || direction === "up") {
        const step2 = direction === "down" ? 1 : -1;
        const start2 = direction === "down" ? rect.bottom + 1 : rect.top - 1;
        for (let row = start2; direction === "down" ? row <= targetEnd : row >= targetEnd; row += step2) {
          for (let c = rect.left; c <= rect.right; c++) {
            worksheet.setValue(row, c, this.inferValue(worksheet, rect.top, rect.bottom, c, row - rect.top, "row"));
          }
        }
        return;
      }
      const step = direction === "right" ? 1 : -1;
      const start = direction === "right" ? rect.right + 1 : rect.left - 1;
      for (let column = start; direction === "right" ? column <= targetEnd : column >= targetEnd; column += step) {
        for (let r = rect.top; r <= rect.bottom; r++) {
          worksheet.setValue(r, column, this.inferValue(worksheet, rect.left, rect.right, r, column - rect.left, "column"));
        }
      }
    }
    inferValue(worksheet, from, to, other, distance, axis) {
      const get = (index) => axis === "row" ? worksheet.cells.getCell(index, other) : worksheet.cells.getCell(other, index);
      const count = to - from + 1;
      const first = get(from);
      if (!first) return null;
      if (first.formula !== void 0) {
        return translateFormula(first.formula, axis === "row" ? distance : 0, axis === "column" ? distance : 0);
      }
      if (count >= 2) {
        const second = get(from + 1);
        if (typeof first.raw === "number" && second && typeof second.raw === "number" && second.formula === void 0) {
          const stepValue = second.raw - first.raw;
          return first.raw + stepValue * distance;
        }
      }
      if (typeof first.raw === "string") {
        const m = /^(.*?)(\d+)$/.exec(first.raw);
        if (m && count >= 2) {
          const second = get(from + 1);
          const m2 = second?.raw !== void 0 ? /^(\D*?)(\d+)$/.exec(String(second.raw)) : void 0;
          if (m2 && m2[1] === m[1]) {
            const stepNum = Number(m2[2]) - Number(m[2]) || 1;
            const value = Number(m[2]) + stepNum * distance;
            return `${m[1]}${value}`;
          }
        }
        return first.raw;
      }
      return first.raw ?? null;
    }
  };

  // packages/core/src/chart-svg.ts
  function renderChartSVG(spec, data) {
    const width = spec.width ?? 320;
    const height = spec.height ?? 240;
    const colors = spec.colors ?? DEFAULT_CHART_COLORS;
    const padding = { top: 28, right: 12, bottom: 32, left: 44 };
    const plotW = Math.max(10, width - padding.left - padding.right);
    const plotH = Math.max(10, height - padding.top - padding.bottom);
    const title = spec.title ? `<text x="${width / 2}" y="16" text-anchor="middle" font-size="12" fill="currentColor">${escapeXml(spec.title)}</text>` : "";
    switch (spec.type) {
      case "pie":
      case "doughnut":
        return pieSVG(spec, data, colors, title, width, height);
      default:
        return cartesianSVG(spec, data, colors, title, width, height, padding, plotW, plotH);
    }
  }
  function cartesianSVG(spec, data, colors, title, width, height, padding, plotW, plotH) {
    const allValues = data.series.flatMap((s) => s.values);
    const maxV = Math.max(1, ...allValues);
    const categoryCount = Math.max(1, data.categories.length);
    const bandW = plotW / categoryCount;
    const bandH = plotH / categoryCount;
    let axes = `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotH}" stroke="currentColor" stroke-opacity="0.3"/>
<line x1="${padding.left}" x2="${padding.left + plotW}" y1="${padding.top + plotH}" y2="${padding.top + plotH}" stroke="currentColor" stroke-opacity="0.3"/>
<text x="${padding.left - 4}" y="${padding.top + 4}" text-anchor="end" font-size="9" fill="currentColor" fill-opacity="0.7">${formatTick(maxV)}</text>
<text x="${padding.left - 4}" y="${padding.top + plotH + 4}" font-size="9" fill="currentColor" fill-opacity="0.7">0</text>`;
    let content = "";
    data.series.forEach((series, seriesIndex) => {
      const color = colors[seriesIndex % colors.length];
      if (spec.type === "line") {
        const points = series.values.map((v, i) => {
          const x = padding.left + bandW * i + bandW / 2;
          const y = padding.top + plotH - v / maxV * plotH;
          return `${round(x)},${round(y)}`;
        }).join(" ");
        content += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>`;
        series.values.forEach((v, i) => {
          const x = padding.left + bandW * i + bandW / 2;
          const y = padding.top + plotH - v / maxV * plotH;
          content += `<circle cx="${round(x)}" cy="${round(y)}" r="3" fill="${color}"/>`;
        });
      } else {
        const groupCount = data.series.length;
        const barW = bandW * 0.7 / groupCount;
        series.values.forEach((v, i) => {
          const barH = v / maxV * plotH;
          if (spec.type === "bar") {
            const y = padding.top + bandH * i + (bandH - barW * groupCount) / 2 + barW * seriesIndex;
            content += `<rect x="${padding.left}" y="${round(y)}" width="${round(v / maxV * plotW)}" height="${round(barW)}" fill="${color}"/>`;
          } else {
            const x = padding.left + bandW * i + (bandW - barW * groupCount) / 2 + barW * seriesIndex;
            content += `<rect x="${round(x)}" y="${round(padding.top + plotH - barH)}" width="${round(barW)}" height="${round(barH)}" fill="${color}"/>`;
          }
        });
      }
    });
    data.categories.forEach((category, i) => {
      const x = spec.type === "bar" ? padding.left + 4 : padding.left + bandW * i + bandW / 2;
      const y = spec.type === "bar" ? padding.top + bandH * i + bandH / 2 + 3 : padding.top + plotH + 14;
      content += `<text x="${round(x)}" y="${round(y)}" text-anchor="${spec.type === "bar" ? "start" : "middle"}" font-size="9" fill="currentColor" fill-opacity="0.8">${escapeXml(category)}</text>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${title}${axes}${content}</svg>`;
  }
  function pieSVG(spec, data, colors, title, width, height) {
    const values = data.series[0]?.values ?? [];
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = width / 2;
    const cy = height / 2 + 6;
    const radius = Math.min(width, height) / 2 - 12;
    const inner = spec.type === "doughnut" ? radius * 0.55 : 0;
    let angle = -Math.PI / 2;
    let paths = "";
    values.forEach((v, i) => {
      const slice = v / total * Math.PI * 2;
      const end = angle + slice;
      paths += slicePath(cx, cy, radius, inner, angle, end, colors[i % colors.length]);
      angle = end;
    });
    const legend = data.series[0]?.name ? `<text x="${cx}" y="${height - 6}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.8">${escapeXml(data.series[0].name)}</text>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${title}${paths}</svg>`;
  }
  function slicePath(cx, cy, radius, inner, start, end, color) {
    const largeArc = end - start > Math.PI ? 1 : 0;
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);
    if (inner > 0) {
      const ix1 = cx + inner * Math.cos(end);
      const iy1 = cy + inner * Math.sin(end);
      const ix2 = cx + inner * Math.cos(start);
      const iy2 = cy + inner * Math.sin(start);
      return `<path d="M${round(x1)},${round(y1)} A${round(radius)},${round(radius)} 0 ${largeArc} 1 ${round(x2)},${round(y2)} L${round(ix1)},${round(iy1)} A${round(inner)},${round(inner)} 0 ${largeArc} 0 ${round(ix2)},${round(iy2)} Z" fill="${color}"/>`;
    }
    return `<path d="M${round(cx)},${round(cy)} L${round(x1)},${round(y1)} A${round(radius)},${round(radius)} 0 ${largeArc} 1 ${round(x2)},${round(y2)} Z" fill="${color}"/>`;
  }
  function escapeXml(text) {
    return text.replace(
      /[<>&"']/g,
      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]
    );
  }
  function round(n) {
    return Math.round(n * 100) / 100;
  }
  function formatTick(v) {
    return v >= 1e3 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10);
  }

  // packages/core/src/renderer.ts
  var HANDLED_NAV_KEYS = /* @__PURE__ */ new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Tab",
    "Enter",
    "Escape",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    "F2",
    "Delete",
    "Backspace"
  ]);
  var GridRenderer = class {
    selection;
    editing;
    container;
    worksheet;
    workbook;
    options;
    root;
    scrollEl;
    spacerEl;
    cellLayer;
    selectionOverlay;
    colHeaderEl;
    rowHeaderEl;
    cornerEl;
    frozenTopEl;
    frozenLeftEl;
    editorInput = null;
    fillHandle = null;
    fillPreview;
    fillRangeLabel;
    mediaLayer = null;
    cellPool = [];
    activeCells = /* @__PURE__ */ new Map();
    unlistenOperations = null;
    scrollRow = 0;
    scrollCol = 0;
    destroyed = false;
    constructor(container, workbook2, options = {}) {
      this.container = container;
      this.workbook = workbook2;
      this.worksheet = workbook2.activeWorksheet;
      this.options = {
        overscanRows: options.overscanRows ?? 5,
        overscanColumns: options.overscanColumns ?? 2,
        headerHeight: options.headerHeight ?? 24,
        headerWidth: options.headerWidth ?? 48,
        formulaBar: options.formulaBar ?? true,
        toolbar: options.toolbar ?? false,
        contextMenu: options.contextMenu ?? true,
        direction: options.direction ?? "ltr"
      };
      this.selection = new SelectionService(this.worksheet.rowCount, this.worksheet.columnCount);
      this.editing = new EditService();
      this.registerDefaultCommands();
      this.build();
      this.bind();
      this.render();
      this.unlistenOperations = workbook2.onOperation((operation) => {
        if (this.destroyed) return;
        switch (operation.type) {
          case "cell.set":
          case "rows.insert":
          case "rows.delete":
          case "columns.insert":
          case "columns.delete":
            if (operation.worksheetId !== this.worksheet.id) return;
            break;
          case "undo":
          case "redo":
            break;
          default:
            return;
        }
        this.render();
      });
      this.workbook.pluginManager.run({
        workbook: this.workbook,
        worksheet: this.worksheet,
        commands: this.commands,
        renderer: this
      });
    }
    get topInset() {
      return (this.options.formulaBar ? 24 : 0) + (this.options.toolbar ? 32 : 0);
    }
    formulaBarEl = null;
    nameBox = null;
    formulaInput = null;
    contextMenuEl = null;
    zoom = 1;
    /** Pagination view state (§22). */
    pagination = null;
    /** Enable a paginated view (database-grid mode). */
    enablePagination(pageSize) {
      this.pagination = { pageSize: Math.max(1, pageSize), page: 0 };
      this.render();
    }
    disablePagination() {
      this.pagination = null;
      this.render();
    }
    setPage(page) {
      if (!this.pagination) return;
      const pageCount = Math.ceil(this.worksheet.rowCount / this.pagination.pageSize);
      this.pagination.page = Math.max(0, Math.min(pageCount - 1, page));
      this.render();
    }
    getPage() {
      return this.pagination?.page ?? 0;
    }
    getPageCount() {
      if (!this.pagination) return 1;
      return Math.max(1, Math.ceil(this.worksheet.rowCount / this.pagination.pageSize));
    }
    setZoom(zoom) {
      if (!Number.isFinite(zoom) || zoom <= 0) return;
      this.zoom = zoom;
      for (const [, el] of this.activeCells) {
        el.remove();
        this.cellPool.push(el);
      }
      this.activeCells.clear();
      this.render();
    }
    getZoom() {
      return this.zoom;
    }
    // Zoom-aware coordinate helpers.
    zOffsetX(column) {
      return this.worksheet.columnSizes.offsetOf(column) * this.zoom;
    }
    zOffsetY(row) {
      return this.worksheet.rowSizes.offsetOf(row) * this.zoom;
    }
    zSizeX(column) {
      return this.worksheet.columnSizes.sizeOf(column) * this.zoom;
    }
    zSizeY(row) {
      return this.worksheet.rowSizes.sizeOf(row) * this.zoom;
    }
    zIndexRow(pixel) {
      return this.worksheet.rowSizes.indexAt(pixel / this.zoom);
    }
    zIndexColumn(pixel) {
      return this.worksheet.columnSizes.indexAt(pixel / this.zoom);
    }
    build() {
      const doc = this.container.ownerDocument;
      this.root = doc.createElement("div");
      this.root.className = "ezygrid";
      this.root.tabIndex = 0;
      this.root.style.position = "relative";
      this.root.style.width = "100%";
      this.root.style.height = "100%";
      this.root.style.overflow = "hidden";
      this.root.style.userSelect = "none";
      this.root.style.boxSizing = "border-box";
      this.root.style.fontFamily = "var(--ezygrid-font-family, system-ui, sans-serif)";
      this.root.style.fontSize = "var(--ezygrid-font-size, 13px)";
      this.root.style.background = "var(--ezygrid-bg, #ffffff)";
      this.root.style.color = "var(--ezygrid-text, #111111)";
      this.root.setAttribute("role", "grid");
      this.root.setAttribute("aria-rowcount", String(this.worksheet.rowCount));
      this.root.setAttribute("aria-colcount", String(this.worksheet.columnCount));
      if (this.options.direction === "rtl") {
        this.root.style.direction = "rtl";
      }
      this.scrollEl = doc.createElement("div");
      this.scrollEl.className = "ezygrid-scroll";
      Object.assign(this.scrollEl.style, {
        position: "absolute",
        left: `${this.options.headerWidth}px`,
        top: `${this.options.headerHeight + this.topInset}px`,
        right: "0",
        bottom: "0",
        overflow: "auto"
      });
      this.spacerEl = doc.createElement("div");
      this.spacerEl.className = "ezygrid-spacer";
      this.scrollEl.appendChild(this.spacerEl);
      this.cellLayer = doc.createElement("div");
      this.cellLayer.className = "ezygrid-cells";
      this.scrollEl.appendChild(this.cellLayer);
      this.mediaLayer = doc.createElement("div");
      this.mediaLayer.className = "ezygrid-media";
      Object.assign(this.mediaLayer.style, {
        position: "absolute",
        left: "0",
        top: "0",
        pointerEvents: "none"
      });
      this.scrollEl.appendChild(this.mediaLayer);
      this.selectionOverlay = doc.createElement("div");
      this.selectionOverlay.className = "ezygrid-selection";
      Object.assign(this.selectionOverlay.style, {
        position: "absolute",
        boxSizing: "border-box",
        border: "2px solid var(--ezygrid-selection, #2563eb)",
        pointerEvents: "none",
        display: "none"
      });
      this.scrollEl.appendChild(this.selectionOverlay);
      this.fillPreview = doc.createElement("div");
      this.fillPreview.className = "ezygrid-fill-preview";
      Object.assign(this.fillPreview.style, {
        position: "absolute",
        boxSizing: "border-box",
        border: "2px dashed var(--ezygrid-selection, #2563eb)",
        background: "var(--ezygrid-selection-soft, rgba(37,99,235,0.08))",
        pointerEvents: "none",
        zIndex: "4",
        display: "none"
      });
      this.scrollEl.appendChild(this.fillPreview);
      this.fillRangeLabel = doc.createElement("div");
      this.fillRangeLabel.className = "ezygrid-fill-range";
      this.fillRangeLabel.setAttribute("role", "status");
      Object.assign(this.fillRangeLabel.style, {
        position: "absolute",
        padding: "4px 8px",
        border: "1px solid var(--ezygrid-selection, #2563eb)",
        borderRadius: "4px",
        background: "var(--ezygrid-bg, #fff)",
        color: "var(--ezygrid-text, #111)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        fontSize: "12px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: "20",
        display: "none"
      });
      this.root.appendChild(this.fillRangeLabel);
      this.fillHandle = doc.createElement("div");
      this.fillHandle.className = "ezygrid-fillhandle";
      this.fillHandle.title = "Drag to fill cells. Press Escape to cancel.";
      Object.assign(this.fillHandle.style, {
        position: "absolute",
        width: "8px",
        height: "8px",
        background: "var(--ezygrid-selection, #2563eb)",
        boxShadow: "0 0 0 1px var(--ezygrid-bg, #fff)",
        zIndex: "5",
        cursor: "crosshair",
        display: "none"
      });
      this.scrollEl.appendChild(this.fillHandle);
      this.colHeaderEl = doc.createElement("div");
      this.colHeaderEl.className = "ezygrid-colheader";
      Object.assign(this.colHeaderEl.style, {
        position: "absolute",
        top: `${this.topInset}px`,
        left: `${this.options.headerWidth}px`,
        right: "0",
        height: `${this.options.headerHeight}px`,
        overflow: "hidden"
      });
      this.rowHeaderEl = doc.createElement("div");
      this.rowHeaderEl.className = "ezygrid-rowheader";
      Object.assign(this.rowHeaderEl.style, {
        position: "absolute",
        top: `${this.options.headerHeight + this.topInset}px`,
        left: "0",
        width: `${this.options.headerWidth}px`,
        bottom: "0",
        overflow: "hidden"
      });
      this.cornerEl = doc.createElement("div");
      this.cornerEl.className = "ezygrid-corner";
      Object.assign(this.cornerEl.style, {
        position: "absolute",
        top: `${this.topInset}px`,
        left: "0",
        width: `${this.options.headerWidth}px`,
        height: `${this.options.headerHeight}px`,
        background: "var(--ezygrid-header-bg, #f4f4f5)",
        borderRight: "1px solid var(--ezygrid-gridline, #e4e4e7)",
        borderBottom: "1px solid var(--ezygrid-gridline, #e4e4e7)"
      });
      this.frozenTopEl = doc.createElement("div");
      this.frozenTopEl.className = "ezygrid-frozen-top";
      Object.assign(this.frozenTopEl.style, {
        position: "absolute",
        left: `${this.options.headerWidth}px`,
        top: `${this.options.headerHeight + this.topInset}px`,
        right: "0",
        overflow: "hidden",
        pointerEvents: "none"
      });
      this.frozenLeftEl = doc.createElement("div");
      this.frozenLeftEl.className = "ezygrid-frozen-left";
      Object.assign(this.frozenLeftEl.style, {
        position: "absolute",
        left: `${this.options.headerWidth}px`,
        top: `${this.options.headerHeight + this.topInset}px`,
        bottom: "0",
        overflow: "hidden",
        pointerEvents: "none"
      });
      if (this.options.formulaBar) {
        const bar = doc.createElement("div");
        bar.className = "ezygrid-formulabar";
        Object.assign(bar.style, {
          position: "absolute",
          top: `${this.options.toolbar ? 32 : 0}px`,
          left: "0",
          right: "0",
          height: "24px",
          display: "flex",
          alignItems: "stretch",
          boxSizing: "border-box"
        });
        this.nameBox = doc.createElement("input");
        this.nameBox.className = "ezygrid-namebox";
        Object.assign(this.nameBox.style, {
          width: "90px",
          boxSizing: "border-box"
        });
        this.nameBox.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.navigateToAddress(this.nameBox.value);
            this.nameBox.blur();
          }
          e.stopPropagation();
        });
        this.formulaInput = doc.createElement("input");
        this.formulaInput.className = "ezygrid-formulainput";
        Object.assign(this.formulaInput.style, {
          flex: "1",
          boxSizing: "border-box",
          font: "inherit"
        });
        this.formulaInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const { row, column } = this.selection.state.active;
            this.worksheet.setValue(row, column, this.formulaInput.value);
            this.formulaInput.blur();
            this.root.focus({ preventScroll: true });
            this.render();
          } else if (e.key === "Escape") {
            e.preventDefault();
            this.updateFormulaBar();
            this.formulaInput.blur();
            this.root.focus({ preventScroll: true });
          }
          e.stopPropagation();
        });
        bar.append(this.nameBox, this.formulaInput);
        this.formulaBarEl = bar;
        this.root.appendChild(bar);
      }
      if (this.options.toolbar) {
        const toolbar = doc.createElement("div");
        toolbar.className = "ezygrid-toolbar";
        Object.assign(toolbar.style, {
          position: "absolute",
          top: "0",
          left: "0",
          right: "0",
          height: "32px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "0 4px",
          boxSizing: "border-box"
        });
        const buttonIds = [
          "edit.undo",
          "edit.redo",
          "format.bold",
          "format.italic",
          "format.underline",
          "clipboard.copy",
          "clipboard.cut",
          "clipboard.paste",
          "cells.fillDown"
        ];
        for (const id of buttonIds) {
          const button = doc.createElement("button");
          button.type = "button";
          button.className = "ezygrid-toolbar-button";
          button.textContent = this.commands.get(id)?.title ?? id;
          button.title = `${id}${this.commands.get(id)?.shortcut ? ` (${this.commands.get(id).shortcut})` : ""}`;
          button.addEventListener("click", () => {
            this.commands.execute(id, this.commandContext());
            this.render();
            this.root.focus({ preventScroll: true });
          });
          toolbar.appendChild(button);
        }
        this.root.appendChild(toolbar);
      }
      if (this.options.contextMenu) {
        this.contextMenuEl = doc.createElement("div");
        this.contextMenuEl.className = "ezygrid-contextmenu";
        Object.assign(this.contextMenuEl.style, {
          position: "fixed",
          display: "none",
          minWidth: "160px",
          zIndex: "1000"
        });
        this.container.appendChild(this.contextMenuEl);
        this.cellLayer.addEventListener("contextmenu", this.onContextMenu);
        doc.addEventListener("mousedown", this.onGlobalMouseDown);
      }
      this.root.append(
        this.scrollEl,
        this.frozenTopEl,
        this.frozenLeftEl,
        this.colHeaderEl,
        this.rowHeaderEl,
        this.cornerEl
      );
      this.container.appendChild(this.root);
    }
    bind() {
      this.scrollEl.addEventListener("scroll", this.onScroll);
      this.cellLayer.addEventListener("mousedown", this.onMouseDown);
      this.cellLayer.addEventListener("dblclick", this.onDoubleClick);
      this.root.addEventListener("keydown", this.onKeyDown);
      this.root.addEventListener("copy", this.onCopy);
      this.root.addEventListener("cut", this.onCut);
      this.root.addEventListener("paste", this.onPaste);
      if (this.fillHandle) {
        this.fillHandle.addEventListener("mousedown", this.onFillHandleDown);
      }
    }
    onFillHandleDown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.commitEditor();
      this.root.focus({ preventScroll: true });
      this.fillDragging = true;
      this.fillSource = { ...this.selection.primary };
      this.fillTarget = null;
      this.fillPointer = { x: event.clientX, y: event.clientY };
      this.root.style.cursor = "crosshair";
      const doc = this.container.ownerDocument;
      doc.addEventListener("mousemove", this.onFillDragMove);
      doc.addEventListener("mouseup", this.onFillDragEnd);
      doc.addEventListener("keydown", this.onFillDragKeyDown, true);
      doc.defaultView?.addEventListener("blur", this.cancelFillDrag);
      this.renderFillPreview();
    };
    onFillDragMove = (event) => {
      if (!this.fillDragging) return;
      const cell = event.target.closest?.(".ezygrid-cell");
      this.fillPointer = { x: event.clientX, y: event.clientY };
      this.fillTarget = null;
      if (cell instanceof HTMLElement && this.cellLayer.contains(cell)) {
        const { row, col } = cell.dataset;
        if (row !== void 0 && col !== void 0) {
          this.fillTarget = { row: Number(row), column: Number(col) };
        }
      }
      this.renderFillPreview();
    };
    onFillDragKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancelFillDrag();
      }
    };
    cancelFillDrag = () => {
      this.fillDragging = false;
      this.fillSource = null;
      this.fillTarget = null;
      this.fillPointer = null;
      this.fillPreview.style.display = "none";
      this.fillRangeLabel.style.display = "none";
      this.root.style.cursor = "";
      const doc = this.container.ownerDocument;
      doc.removeEventListener("mousemove", this.onFillDragMove);
      doc.removeEventListener("mouseup", this.onFillDragEnd);
      doc.removeEventListener("keydown", this.onFillDragKeyDown, true);
      doc.defaultView?.removeEventListener("blur", this.cancelFillDrag);
      this.updateFormulaBar();
    };
    onContextMenu = (event) => {
      const target = event.target;
      const row = target.dataset?.row;
      const column = target.dataset?.col;
      if (row === void 0 || column === void 0) return;
      event.preventDefault();
      this.commitEditor();
      const r = Number(row);
      const c = Number(column);
      if (!this.selection.isWithin(r, c)) {
        this.selection.setActive(r, c);
        this.render();
      }
      this.root.focus({ preventScroll: true });
      this.showContextMenu(event.clientX, event.clientY);
    };
    onGlobalMouseDown = (event) => {
      if (!this.contextMenuEl) return;
      if (!this.contextMenuEl.contains(event.target)) {
        this.contextMenuEl.style.display = "none";
      }
    };
    showContextMenu(clientX, clientY) {
      const menu = this.contextMenuEl;
      if (!menu) return;
      const doc = this.container.ownerDocument;
      menu.textContent = "";
      const items = [
        { label: "Cut", run: () => this.copySelection(true) },
        { label: "Copy", run: () => this.copySelection(false) },
        { label: "Paste", run: () => {
          void this.pasteSelection();
        } },
        { label: "Edit cell", run: () => this.beginEditAt() },
        { label: "Fill down", run: () => this.commands.execute("cells.fillDown", this.commandContext()) },
        {
          label: "Clear contents",
          run: () => {
            const primary = this.selection.primary;
            for (let r = primary.top; r <= primary.bottom; r++) {
              for (let c = primary.left; c <= primary.right; c++) {
                this.worksheet.setValue(r, c, null);
              }
            }
          }
        },
        {
          label: "Clear formatting",
          run: () => this.commands.execute("format.clear", this.commandContext())
        }
      ];
      for (const item of items) {
        const el = doc.createElement("div");
        el.className = "ezygrid-contextmenu-item";
        el.textContent = item.label;
        Object.assign(el.style, {
          padding: "6px 12px",
          cursor: "pointer"
        });
        el.addEventListener("click", () => {
          this.root.focus({ preventScroll: true });
          item.run();
          menu.style.display = "none";
          this.render();
        });
        menu.appendChild(el);
      }
      Object.assign(menu.style, {
        display: "block",
        left: `${clientX}px`,
        top: `${clientY}px`,
        background: "var(--ezygrid-bg, #fff)",
        border: "1px solid var(--ezygrid-gridline, #e4e4e7)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
      });
    }
    onFillDragEnd = (event) => {
      if (!this.fillDragging || event.button !== 0) return;
      this.onFillDragMove(event);
      const source = this.fillSource;
      const plan = this.getFillPlan();
      this.cancelFillDrag();
      if (!source || !plan) return;
      this.fill.fill(this.worksheet, plan.direction, source, plan.end);
      this.selection.setActive(plan.range.top, plan.range.left);
      this.selection.extendTo(plan.range.bottom, plan.range.right);
      this.render();
    };
    onScroll = () => {
      this.scrollRow = this.zIndexRow(this.scrollTop());
      this.scrollCol = this.zIndexColumn(this.scrollLeft());
      this.render();
    };
    onMouseDown = (event) => {
      if (event.button !== 0) return;
      const target = event.target;
      let row = target.dataset?.row;
      let column = target.dataset?.col;
      if (row === void 0 || column === void 0) return;
      let r = Number(row);
      let c = Number(column);
      const merge = this.worksheet.merges.findAt(r, c);
      if (merge) {
        r = merge.top;
        c = merge.left;
      }
      if (this.editorInput && this.editorInput.value.startsWith("=")) {
        event.preventDefault();
        event.stopPropagation();
        const editor = this.editorInput;
        const insert = editor.selectionStart ?? editor.value.length;
        const reference = this.worksheet === this.workbook.getWorksheet(this.worksheet.name) ? toA1(r, c) : `${this.worksheet.name}!${toA1(r, c)}`;
        editor.value = editor.value.slice(0, insert) + reference + editor.value.slice(editor.selectionEnd ?? insert);
        const caret = insert + reference.length;
        editor.setSelectionRange(caret, caret);
        editor.focus();
        this.updateSuggestions(editor);
        return;
      }
      event.preventDefault();
      this.commitEditor();
      if (event.shiftKey) {
        this.selection.extendTo(r, c);
      } else if (event.ctrlKey || event.metaKey) {
        this.selection.addRange(r, c);
      } else {
        this.selection.setActive(r, c);
      }
      this.renderSelection();
      this.root.focus({ preventScroll: true });
    };
    onDoubleClick = (event) => {
      const target = event.target;
      if (event.button !== 0 || target.dataset.row === void 0 || target.dataset.col === void 0) return;
      if (this.editing.editing) return;
      event.preventDefault();
      this.beginEditAt();
    };
    onKeyDown = (event) => {
      if (this.fillDragging) {
        event.preventDefault();
        return;
      }
      if (this.editing.editing) return;
      if (this.editorInput) return;
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && (event.key === "b" || event.key === "B")) {
        event.preventDefault();
        this.commands.execute("format.bold", this.commandContext());
        this.render();
        return;
      }
      if (ctrl && (event.key === "i" || event.key === "I")) {
        event.preventDefault();
        this.commands.execute("format.italic", this.commandContext());
        this.render();
        return;
      }
      if (ctrl && (event.key === "u" || event.key === "U")) {
        event.preventDefault();
        this.commands.execute("format.underline", this.commandContext());
        this.render();
        return;
      }
      if (ctrl && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        this.workbook.undo();
        this.render();
        return;
      }
      if (ctrl && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        this.workbook.redo();
        this.render();
        return;
      }
      if (ctrl && (event.key === "d" || event.key === "D")) {
        event.preventDefault();
        this.commands.execute("cells.fillDown", this.commandContext());
        this.render();
        return;
      }
      if (ctrl && ["c", "x", "v"].includes(event.key.toLowerCase())) return;
      if (event.key === "F2") {
        event.preventDefault();
        this.beginEditAt();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const { row } = this.selection.state.active;
        this.selection.move("down", event.shiftKey, false, this.isFilled);
        this.render();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        this.selection.move(event.shiftKey ? "left" : "right", false, false, this.isFilled);
        this.render();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        const { active } = this.selection.state;
        this.worksheet.setValue(active.row, active.column, null);
        this.render();
        return;
      }
      if (HANDLED_NAV_KEYS.has(event.key)) {
        const direction = event.key === "ArrowUp" ? "up" : event.key === "ArrowDown" ? "down" : event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : event.key === "PageDown" ? "down" : event.key === "PageUp" ? "up" : event.key === "Home" ? "left" : "right";
        event.preventDefault();
        this.selection.move(direction, event.shiftKey, ctrl, this.isFilled);
        this.ensureActiveVisible();
        this.render();
        return;
      }
      if (event.key.length === 1 && !ctrl && !event.altKey) {
        event.preventDefault();
        this.beginEditAt(event.key);
      }
    };
    clipboard = new ClipboardService();
    commands = new CommandRegistry();
    fill = new FillService();
    fillDragging = false;
    fillSource = null;
    fillTarget = null;
    fillPointer = null;
    /** Share one destination calculation between the preview and the actual fill. */
    getFillPlan() {
      const source = this.fillSource;
      const target = this.fillTarget;
      if (!source || !target) return null;
      if (target.row > source.bottom) {
        return { direction: "down", end: target.row, range: { ...source, bottom: target.row } };
      }
      if (target.column > source.right) {
        return { direction: "right", end: target.column, range: { ...source, right: target.column } };
      }
      if (target.row < source.top) {
        return { direction: "up", end: target.row, range: { ...source, top: target.row } };
      }
      if (target.column < source.left) {
        return { direction: "left", end: target.column, range: { ...source, left: target.column } };
      }
      return null;
    }
    renderFillPreview() {
      if (!this.fillDragging || !this.fillSource || !this.fillPointer) return;
      const range = this.getFillPlan()?.range ?? this.fillSource;
      Object.assign(this.fillPreview.style, {
        display: "block",
        left: `${this.zOffsetX(range.left) - this.scrollLeft()}px`,
        top: `${this.zOffsetY(range.top) - this.scrollTop()}px`,
        width: `${this.zOffsetX(range.right + 1) - this.zOffsetX(range.left)}px`,
        height: `${this.zOffsetY(range.bottom + 1) - this.zOffsetY(range.top)}px`
      });
      const address = `${toA1(range.top, range.left)}:${toA1(range.bottom, range.right)}`;
      if (this.fillRangeLabel.textContent !== address) this.fillRangeLabel.textContent = address;
      if (this.nameBox) this.nameBox.value = address;
      this.fillRangeLabel.style.display = "block";
      const bounds = this.root.getBoundingClientRect();
      const left = Math.max(0, Math.min(
        this.fillPointer.x - bounds.left + 14,
        this.root.clientWidth - this.fillRangeLabel.offsetWidth - 8
      ));
      const top = Math.max(0, Math.min(
        this.fillPointer.y - bounds.top + 18,
        this.root.clientHeight - this.fillRangeLabel.offsetHeight - 8
      ));
      this.fillRangeLabel.style.left = `${left}px`;
      this.fillRangeLabel.style.top = `${top}px`;
    }
    commandContext() {
      return { workbook: this.workbook, worksheet: this.worksheet, selection: this.selection };
    }
    registerDefaultCommands() {
      for (const command of createDefaultCommands({
        copy: () => this.copySelection(false),
        cut: () => this.copySelection(true),
        paste: () => {
          void this.pasteSelection();
        },
        fillDown: (ctx) => {
          const primary = ctx.selection.primary;
          if (primary.bottom > primary.top) {
            this.fill.fill(ctx.worksheet, "down", primary, primary.bottom);
          } else {
            const above = ctx.worksheet.cells.getCell(primary.top - 1, primary.left);
            if (above) {
              ctx.worksheet.setValue(
                primary.top,
                primary.left,
                above.formula !== void 0 ? translateFormula(above.formula, 1, 0) : above.raw ?? null
              );
            }
          }
        }
      })) {
        this.commands.register(command);
      }
      this.registerStyleCommands();
    }
    registerStyleCommands() {
      const toggle = (id, title, shortcut, prop) => {
        this.commands.register({
          id,
          title,
          shortcut,
          execute: (ctx) => {
            const primary = ctx.selection.primary;
            const anchor = ctx.worksheet.getStyle(primary.top, primary.left);
            const next = !(anchor?.[prop] ?? false);
            ctx.worksheet.setStyle(
              `${toA1(primary.top, primary.left)}:${toA1(primary.bottom, primary.right)}`,
              { [prop]: next }
            );
          }
        });
      };
      toggle("format.bold", "Bold", "Mod+B", "bold");
      toggle("format.italic", "Italic", "Mod+I", "italic");
      toggle("format.underline", "Underline", "Mod+U", "underline");
      this.commands.register({
        id: "format.clear",
        title: "Clear formatting",
        execute: (ctx) => {
          const primary = ctx.selection.primary;
          ctx.worksheet.clearStyle(
            `${toA1(primary.top, primary.left)}:${toA1(primary.bottom, primary.right)}`
          );
        }
      });
      for (const align of ["left", "center", "right"]) {
        this.commands.register({
          id: `format.align.${align}`,
          title: `Align ${align}`,
          execute: (ctx) => {
            const primary = ctx.selection.primary;
            ctx.worksheet.setStyle(
              `${toA1(primary.top, primary.left)}:${toA1(primary.bottom, primary.right)}`,
              { align }
            );
          }
        });
      }
    }
    isTextControl(target) {
      return target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
    }
    onCopy = (event) => {
      if (this.isTextControl(event.target) || !event.clipboardData) return;
      event.preventDefault();
      this.copySelection(false, event.clipboardData);
    };
    onCut = (event) => {
      if (this.isTextControl(event.target) || !event.clipboardData) return;
      event.preventDefault();
      this.copySelection(true, event.clipboardData);
    };
    onPaste = (event) => {
      if (this.isTextControl(event.target) || !event.clipboardData) return;
      if (!event.clipboardData.types.includes("text/plain")) return;
      event.preventDefault();
      this.pasteText(event.clipboardData.getData("text/plain"));
    };
    pasteText(text, row = this.selection.state.active.row, column = this.selection.state.active.column) {
      this.root.querySelector(".ezygrid-clipboard-status")?.remove();
      if (text !== void 0 && (!this.clipboard.getBuffer() || text !== this.clipboard.toTSV())) {
        this.clipboard.loadTSV(text);
      }
      this.clipboard.pasteTo(this.workbook, this.worksheet, row, column);
      this.render();
    }
    async pasteSelection() {
      this.commitEditor();
      const { row, column } = this.selection.state.active;
      const clipboard = this.container.ownerDocument.defaultView?.navigator.clipboard;
      let text;
      try {
        text = await clipboard?.readText();
      } catch {
      }
      if (this.destroyed) return;
      if (text === void 0 && !this.clipboard.getBuffer()) {
        this.showClipboardHint();
        return;
      }
      this.pasteText(text, row, column);
    }
    showClipboardHint() {
      let hint = this.root.querySelector(".ezygrid-clipboard-status");
      if (!hint) {
        hint = this.container.ownerDocument.createElement("div");
        hint.className = "ezygrid-clipboard-status";
        hint.setAttribute("role", "status");
        Object.assign(hint.style, { position: "absolute", bottom: "0", left: "0", zIndex: "1000", background: "var(--ezygrid-bg, #fff)", padding: "6px 12px" });
        this.root.appendChild(hint);
      }
      hint.textContent = "Clipboard access is unavailable. Press Ctrl+V (or Command+V) to paste.";
      this.root.focus({ preventScroll: true });
    }
    copySelection(cut, data) {
      this.commitEditor();
      const primary = this.selection.primary;
      this.clipboard.copyFrom(
        this.worksheet,
        primary.top,
        primary.left,
        primary.bottom,
        primary.right
      );
      const text = this.clipboard.toTSV();
      if (data) {
        data.setData("text/plain", text);
      } else {
        const clipboard = this.container.ownerDocument.defaultView?.navigator.clipboard;
        if (clipboard?.writeText) {
          void clipboard.writeText(text).catch(() => this.copyTextFallback(text));
        } else {
          this.copyTextFallback(text);
        }
      }
      if (cut) {
        for (let r = primary.top; r <= primary.bottom; r++) {
          for (let c = primary.left; c <= primary.right; c++) {
            this.worksheet.setValue(r, c, null);
          }
        }
      }
    }
    copyTextFallback(text) {
      if (this.destroyed) return;
      const doc = this.container.ownerDocument;
      const focused = doc.activeElement;
      const input = doc.createElement("textarea");
      input.value = text;
      Object.assign(input.style, { position: "fixed", left: "-10000px", top: "0" });
      this.root.appendChild(input);
      input.select();
      try {
        doc.execCommand("copy");
      } catch {
      } finally {
        input.remove();
        if (focused?.isConnected) focused.focus({ preventScroll: true });
      }
    }
    commitEditor() {
      if (!this.editorInput || !this.editing.editing) return;
      this.editing.commit(this.worksheet, this.editorInput.value);
      this.unmountEditor();
      this.render();
    }
    isFilled = (row, column) => this.worksheet.cells.getCell(row, column) !== void 0;
    beginEditAt(initial) {
      if (this.editing.editing) return;
      const { row, column } = this.selection.state.active;
      const editorSpec = this.worksheet.getEditorFor(row, column);
      if (editorSpec?.type === "checkbox") {
        const current = this.worksheet.cells.getCell(row, column);
        const value = current?.raw === true ? false : true;
        this.worksheet.setValue(row, column, value);
        this.render();
        return;
      }
      this.editing.beginEdit(this.worksheet, row, column, initial);
      this.mountEditor();
    }
    mountEditor() {
      if (!this.editing.editing) return;
      const session = this.editing.session;
      if (!session) return;
      const doc = this.container.ownerDocument;
      const { row, column } = session;
      const editorSpec = this.worksheet.getEditorFor(row, column);
      let input;
      if (editorSpec?.type === "dropdown") {
        const select = doc.createElement("select");
        select.className = "ezygrid-editor";
        const options = editorSpec.options?.values ?? [];
        select.appendChild(doc.createElement("option"));
        for (const value of options) {
          const option = doc.createElement("option");
          option.value = String(value);
          option.textContent = String(value);
          select.appendChild(option);
        }
        const current = this.worksheet.getValue(row, column);
        if (current !== null) select.value = String(current);
        select.addEventListener("change", () => {
          this.editing.commit(this.worksheet, select.value);
          this.unmountEditor();
          this.render();
          this.root.focus({ preventScroll: true });
        });
        input = select;
      } else {
        const element = doc.createElement("input");
        element.className = "ezygrid-editor";
        if (editorSpec?.type === "number") element.type = "number";
        else if (editorSpec?.type === "date") element.type = "date";
        element.value = session.initial;
        input = element;
      }
      Object.assign(input.style, {
        position: "absolute",
        boxSizing: "border-box",
        font: "inherit",
        zIndex: "10",
        userSelect: "text"
      });
      this.positionEditor(input, row, column);
      input.addEventListener("keydown", (e) => {
        if (e.key === "F4") {
          e.preventDefault();
          cycleReference(input);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          this.editing.commit(this.worksheet, input.value);
          this.removeSuggestions();
          this.unmountEditor();
          this.render();
          this.root.focus({ preventScroll: true });
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.editing.cancel();
          this.removeSuggestions();
          this.unmountEditor();
          this.root.focus({ preventScroll: true });
        } else if (e.key === "Tab" && this.suggestionEl) {
          e.preventDefault();
          this.applyTopSuggestion(input);
        } else if (e.key === "Tab") {
          e.preventDefault();
          this.commitEditor();
          this.selection.move(e.shiftKey ? "left" : "right", false, false, this.isFilled);
          this.ensureActiveVisible();
          this.render();
          this.root.focus({ preventScroll: true });
        }
        e.stopPropagation();
      });
      input.addEventListener("input", () => {
        this.updateSuggestions(input);
      });
      input.addEventListener("blur", () => this.commitEditor());
      if (input instanceof HTMLInputElement && input.value.startsWith("=")) {
        this.updateSuggestions(input);
      }
      this.cellLayer.appendChild(input);
      this.editorInput = input;
      input.focus();
    }
    suggestionEl = null;
    /** Autocomplete dropdown while editing formulas (§14.7). */
    updateSuggestions(input) {
      this.removeSuggestions();
      const value = input.value;
      if (!value.startsWith("=")) return;
      const match = /[A-Za-z0-9.]+$/.exec(value);
      if (!match) return;
      const suggestions = suggest(match[0]);
      if (suggestions.length === 0) return;
      const doc = this.container.ownerDocument;
      const list = doc.createElement("div");
      list.className = "ezygrid-formula-suggestions";
      Object.assign(list.style, {
        position: "absolute",
        background: "var(--ezygrid-bg, #fff)",
        border: "1px solid var(--ezygrid-gridline, #e4e4e7)",
        zIndex: "100",
        fontSize: "12px"
      });
      list.style.left = input.style.left;
      list.style.top = `${parseFloat(input.style.top) + parseFloat(input.style.height)}px`;
      for (const suggestion of suggestions) {
        const item = doc.createElement("div");
        item.textContent = suggestion.signature ?? suggestion.name;
        Object.assign(item.style, { padding: "2px 8px", cursor: "pointer" });
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          input.value = replaceFunctionToken(input.value, suggestion.name);
          input.focus();
          this.removeSuggestions();
        });
        list.appendChild(item);
      }
      this.cellLayer.appendChild(list);
      this.suggestionEl = list;
    }
    applyTopSuggestion(input) {
      if (!this.suggestionEl) return;
      const first = this.suggestionEl.firstChild;
      if (first?.textContent) {
        const name = first.textContent.split("(")[0].trim();
        input.value = replaceFunctionToken(input.value, name);
        input.focus();
      }
      this.removeSuggestions();
    }
    removeSuggestions() {
      this.suggestionEl?.remove();
      this.suggestionEl = null;
    }
    positionEditor(input, row, column) {
      input.style.left = `${this.zOffsetX(column) - this.scrollLeft()}px`;
      input.style.top = `${this.zOffsetY(row) - this.scrollTop()}px`;
      input.style.width = `${this.zSizeX(column)}px`;
      input.style.height = `${this.zSizeY(row)}px`;
    }
    unmountEditor() {
      const input = this.editorInput;
      this.editorInput = null;
      input?.remove();
      this.removeSuggestions();
    }
    ensureActiveVisible() {
      const { row, column } = this.selection.state.active;
      const top = this.scrollTop();
      const left = this.scrollLeft();
      const height = this.viewportHeight();
      const width = this.viewportWidth();
      const cellTop = this.zOffsetY(row);
      const cellBottom = cellTop + this.zSizeY(row);
      const cellLeft = this.zOffsetX(column);
      const cellRight = cellLeft + this.zSizeX(column);
      if (cellTop < top) this.scrollEl.scrollTop = cellTop / this.zoom;
      else if (cellBottom > top + height) this.scrollEl.scrollTop = (cellBottom - height) / this.zoom;
      if (cellLeft < left) this.scrollEl.scrollLeft = cellLeft / this.zoom;
      else if (cellRight > left + width) this.scrollEl.scrollLeft = (cellRight - width) / this.zoom;
    }
    scrollLeft() {
      const value = this.scrollEl.scrollLeft;
      return Number.isFinite(value) ? value : 0;
    }
    scrollTop() {
      const value = this.scrollEl.scrollTop;
      return Number.isFinite(value) ? value : 0;
    }
    viewportHeight() {
      return (this.scrollEl.clientHeight ?? 480) || 480;
    }
    viewportWidth() {
      return (this.scrollEl.clientWidth ?? 640) || 640;
    }
    /** Programmatic scroll to make a cell the top-left of the viewport. */
    scrollTo(row, column) {
      this.scrollEl.scrollTop = this.worksheet.rowSizes.offsetOf(row) * this.zoom;
      this.scrollEl.scrollLeft = this.worksheet.columnSizes.offsetOf(column) * this.zoom;
      this.onScroll();
    }
    navigateToAddress(address) {
      try {
        const rect = parseRange(address);
        this.selection.setActive(rect.top, rect.left);
        this.ensureActiveVisible();
        this.render();
        this.updateFormulaBar();
      } catch {
      }
    }
    refresh() {
      this.render();
    }
    acquireCell() {
      const pooled = this.cellPool.pop();
      if (pooled) return pooled;
      const doc = this.container.ownerDocument;
      const div = doc.createElement("div");
      div.className = "ezygrid-cell";
      Object.assign(div.style, {
        position: "absolute",
        boxSizing: "border-box",
        overflow: "hidden",
        whiteSpace: "nowrap",
        borderRight: "1px solid var(--ezygrid-gridline, #e4e4e7)",
        borderBottom: "1px solid var(--ezygrid-gridline, #e4e4e7)",
        padding: "0 6px",
        lineHeight: "calc(var(--ezygrid-font-size, 13px) + 8px)"
      });
      return div;
    }
    placeCell(row, column, offsetX, offsetY, span) {
      const cell = this.acquireCell();
      this.activeCells.set(`${row},${column}`, cell);
      this.cellLayer.appendChild(cell);
      this.paintCell(cell, row, column, offsetX, offsetY, span);
    }
    /** Fill a (new or recycled) cell element with current content and state. */
    paintCell(cell, row, column, offsetX, offsetY, span) {
      const ws = this.worksheet;
      cell.dataset.row = String(row);
      cell.dataset.col = String(column);
      cell.style.left = `${offsetX}px`;
      cell.style.top = `${offsetY}px`;
      cell.style.width = `${span ? span.width : this.zSizeX(column)}px`;
      cell.style.height = `${span ? span.height : this.zSizeY(row)}px`;
      const value = ws.getValue(row, column);
      const mask = ws.getNumberFormat(row, column);
      cell.textContent = formatValue(value, mask);
      this.applyCellStyle(cell, row, column);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(column + 1));
      cell.setAttribute("aria-selected", this.selection.isWithin(row, column) ? "true" : "false");
    }
    applyCellStyle(cell, row, column) {
      const style = this.worksheet.getStyle(row, column);
      const conditional = this.worksheet.conditionalFormats.evaluate(this.worksheet, row, column);
      const merged = { ...style, ...conditional };
      cell.style.fontWeight = merged.bold ? "bold" : "";
      cell.style.fontStyle = merged.italic ? "italic" : "";
      cell.style.textDecoration = merged.underline ? "underline" : "";
      cell.style.color = merged.color ?? "";
      cell.style.textAlign = merged.align ?? "";
      if (this.selection.isWithin(row, column)) {
        cell.style.background = "var(--ezygrid-selection-soft, rgba(37,99,235,0.08))";
      } else {
        cell.style.background = merged.background ?? "";
      }
      const table = this.worksheet.tables.at(row, column);
      if (table && row > table.range.top) {
        const bandIndex = row - (table.headerRow ? table.range.top + 1 : table.range.top);
        const totalRowCell = table.totalRow && row === table.range.bottom;
        if (totalRowCell) {
          cell.style.fontWeight = "bold";
        } else if (bandIndex % 2 === 1 && !merged.background) {
          cell.style.background = "var(--ezygrid-table-band, rgba(0,0,0,0.03))";
        }
      }
      const note = this.worksheet.getNote(row, column);
      cell.title = note ?? "";
      cell.dataset.note = note !== void 0 ? "true" : "";
    }
    renderFrozen() {
      this.frozenTopEl.textContent = "";
      this.frozenLeftEl.textContent = "";
      const freezeRows = this.worksheet.freezeRows ?? 0;
      const freezeCols = this.worksheet.freezeColumns ?? 0;
      if (freezeRows === 0 && freezeCols === 0) return;
      const startX = this.scrollLeft();
      const startY = this.scrollTop();
      const frozenCell = (row, column, left, top, target) => {
        const cell = this.acquireCell();
        cell.dataset.row = String(row);
        cell.dataset.col = String(column);
        cell.style.left = `${left}px`;
        cell.style.top = `${top}px`;
        cell.style.width = `${this.zSizeX(column)}px`;
        cell.style.height = `${this.zSizeY(row)}px`;
        const value = this.worksheet.getValue(row, column);
        const mask = this.worksheet.getNumberFormat(row, column);
        cell.textContent = formatValue(value, mask);
        this.applyCellStyle(cell, row, column);
        target.appendChild(cell);
      };
      for (let r = 0; r < Math.min(freezeRows, this.worksheet.rowCount); r++) {
        if (this.worksheet.isRowHidden(r)) continue;
        for (let c = this.scrollCol; c < this.visibleColumnEnd(); c++) {
          if (c < freezeCols || this.worksheet.isColumnHidden(c)) continue;
          frozenCell(r, c, this.zOffsetX(c) - startX, this.zOffsetY(r), this.frozenTopEl);
        }
      }
      for (let c = 0; c < Math.min(freezeCols, this.worksheet.columnCount); c++) {
        if (this.worksheet.isColumnHidden(c)) continue;
        for (let r = this.scrollRow; r < this.visibleRowEnd(); r++) {
          if (r < freezeRows || this.worksheet.isRowHidden(r)) continue;
          frozenCell(r, c, this.zOffsetX(c), this.zOffsetY(r) - startY, this.frozenLeftEl);
        }
      }
    }
    visibleRowStart() {
      const start = this.zIndexRow(this.scrollTop());
      if (!this.pagination) return start;
      return Math.max(start, this.pagination.page * this.pagination.pageSize);
    }
    visibleRowEnd() {
      const ws = this.worksheet;
      const top = this.scrollTop() / this.zoom;
      const height = this.viewportHeight() / this.zoom;
      const start = this.visibleRowStart();
      let end = start;
      let bottom = top + height;
      while (end < ws.rowCount && this.zOffsetY(end) < bottom) end += 1;
      end = Math.min(ws.rowCount, end + this.options.overscanRows);
      if (this.pagination) {
        const pageStart = this.pagination.page * this.pagination.pageSize;
        const pageEnd = Math.min(ws.rowCount, pageStart + this.pagination.pageSize);
        end = Math.min(Math.max(end, pageStart + 1), pageEnd);
      }
      return end;
    }
    visibleColumnEnd() {
      const ws = this.worksheet;
      const left = this.scrollLeft() / this.zoom;
      const width = this.viewportWidth() / this.zoom;
      const start = this.zIndexColumn(this.scrollLeft());
      let end = start;
      let right = left + width;
      while (end < ws.columnCount && this.zOffsetX(end) < right) end += 1;
      return Math.min(ws.columnCount, end + this.options.overscanColumns);
    }
    renderHeaders() {
      const doc = this.container.ownerDocument;
      const ws = this.worksheet;
      this.colHeaderEl.textContent = "";
      this.rowHeaderEl.textContent = "";
      this.cornerEl.textContent = "";
      for (let c = this.scrollCol; c < this.visibleColumnEnd(); c++) {
        if (ws.isColumnHidden(c)) continue;
        const el = doc.createElement("div");
        el.className = "ezygrid-colheader-label";
        el.setAttribute("role", "columnheader");
        el.textContent = columnLabel(c);
        Object.assign(el.style, {
          position: "absolute",
          left: `${this.zOffsetX(c) - this.scrollLeft()}px`,
          top: `${this.nestedLevelCount() * this.options.headerHeight}px`,
          width: `${this.zSizeX(c)}px`,
          height: `${this.options.headerHeight}px`,
          boxSizing: "border-box",
          textAlign: "center",
          lineHeight: `${this.options.headerHeight}px`,
          background: "var(--ezygrid-header-bg, #f4f4f5)",
          color: "var(--ezygrid-header-text, #52525b)",
          fontWeight: "bold",
          borderRight: "1px solid var(--ezygrid-gridline, #e4e4e7)",
          borderBottom: "1px solid var(--ezygrid-gridline, #e4e4e7)"
        });
        this.colHeaderEl.appendChild(el);
      }
      this.renderNestedHeaders(doc);
      for (let r = this.scrollRow; r < this.visibleRowEnd(); r++) {
        if (ws.isRowHidden(r)) continue;
        const el = doc.createElement("div");
        el.className = "ezygrid-rowheader-label";
        el.setAttribute("role", "rowheader");
        el.textContent = String(r + 1);
        Object.assign(el.style, {
          position: "absolute",
          left: "0",
          top: `${this.zOffsetY(r) - this.scrollTop()}px`,
          width: `${this.options.headerWidth}px`,
          height: `${this.zSizeY(r)}px`,
          boxSizing: "border-box",
          textAlign: "right",
          paddingRight: "6px",
          lineHeight: `${this.zSizeY(r)}px`,
          background: "var(--ezygrid-header-bg, #f4f4f5)",
          color: "var(--ezygrid-header-text, #52525b)",
          borderRight: "1px solid var(--ezygrid-gridline, #e4e4e7)",
          borderBottom: "1px solid var(--ezygrid-gridline, #e4e4e7)"
        });
        this.rowHeaderEl.appendChild(el);
      }
      const corner = doc.createElement("div");
      corner.textContent = "";
      this.cornerEl.appendChild(corner);
    }
    nestedLevelCount() {
      return this.worksheet.nestedHeaders.length;
    }
    /** Render each nested header level with colspan-style spans. */
    renderNestedHeaders(doc) {
      const levels = this.worksheet.nestedHeaders;
      if (levels.length === 0) return;
      for (let level = 0; level < levels.length; level++) {
        const groups = levels[level];
        let column = 0;
        for (const group of groups) {
          const span = typeof group === "string" ? 1 : group.span;
          const title = typeof group === "string" ? group : group.title;
          const startColumn = column;
          column += span;
          if (column <= this.scrollCol || startColumn >= this.visibleColumnEnd()) continue;
          const left = Math.max(startColumn, this.scrollCol);
          const right = Math.min(column - 1, this.visibleColumnEnd() - 1);
          if (right < left) continue;
          const el = doc.createElement("div");
          el.className = "ezygrid-colheader-label ezygrid-nestedheader";
          el.setAttribute("role", "columnheader");
          el.textContent = title;
          Object.assign(el.style, {
            position: "absolute",
            left: `${this.zOffsetX(left) - this.scrollLeft()}px`,
            top: `${level * this.options.headerHeight}px`,
            width: `${this.zOffsetX(right + 1) - this.zOffsetX(left)}px`,
            height: `${this.options.headerHeight}px`,
            boxSizing: "border-box",
            textAlign: "center"
          });
          this.colHeaderEl.appendChild(el);
        }
      }
    }
    renderSelection() {
      const ws = this.worksheet;
      const primary = this.selection.primary;
      const top = this.zOffsetY(primary.top) - this.scrollTop();
      const left = this.zOffsetX(primary.left) - this.scrollLeft();
      const height = (ws.rowSizes.offsetOf(primary.bottom) + ws.rowSizes.sizeOf(primary.bottom) - ws.rowSizes.offsetOf(primary.top)) * this.zoom;
      const width = (ws.columnSizes.offsetOf(primary.right) + ws.columnSizes.sizeOf(primary.right) - ws.columnSizes.offsetOf(primary.left)) * this.zoom;
      Object.assign(this.selectionOverlay.style, {
        display: "block",
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`
      });
      if (this.fillHandle) {
        Object.assign(this.fillHandle.style, {
          display: "block",
          left: `${left + width - 4}px`,
          top: `${top + height - 4}px`
        });
      }
      this.updateFormulaBar();
      this.renderFillPreview();
    }
    updateFormulaBar() {
      if (!this.formulaInput || !this.nameBox) return;
      const { row, column } = this.selection.state.active;
      this.nameBox.value = this.selection.describe();
      const record = this.worksheet.cells.getCell(row, column);
      this.formulaInput.value = record?.formula !== void 0 ? record.formula : record?.raw === null || record?.raw === void 0 ? "" : String(record.raw);
    }
    /** Re-render the visible projection. Recycles cell elements between frames. */
    render() {
      if (this.destroyed) return;
      const ws = this.worksheet;
      this.spacerEl.style.width = `${ws.columnSizes.totalSize() * this.zoom}px`;
      this.spacerEl.style.height = `${ws.rowSizes.totalSize() * this.zoom}px`;
      for (const [key2, el] of this.activeCells) {
        const [r, c] = key2.split(",").map(Number);
        const covered = ws.merges.isCovered(r, c);
        if (covered || r < this.visibleRowStart() - this.options.overscanRows || r >= this.visibleRowEnd() || c < this.scrollCol - this.options.overscanColumns || c >= this.visibleColumnEnd() || ws.isRowHidden(r) || ws.isColumnHidden(c)) {
          el.remove();
          this.cellPool.push(el);
          this.activeCells.delete(key2);
        }
      }
      const rowEnd = this.visibleRowEnd();
      const colEnd = this.visibleColumnEnd();
      const startX = this.scrollLeft();
      const startY = this.scrollTop();
      for (let r = this.visibleRowStart(); r < rowEnd; r++) {
        if (ws.isRowHidden(r)) continue;
        for (let c = this.scrollCol; c < colEnd; c++) {
          if (ws.isColumnHidden(c)) continue;
          const key2 = `${r},${c}`;
          const merge = ws.merges.findAt(r, c);
          if (merge && !(merge.top === r && merge.left === c)) continue;
          const offsetX = this.zOffsetX(c) - startX;
          const offsetY = this.zOffsetY(r) - startY;
          const span = merge ? {
            width: (ws.columnSizes.offsetOf(merge.right) + ws.columnSizes.sizeOf(merge.right) - ws.columnSizes.offsetOf(c)) * this.zoom,
            height: (ws.rowSizes.offsetOf(merge.bottom) + ws.rowSizes.sizeOf(merge.bottom) - ws.rowSizes.offsetOf(r)) * this.zoom
          } : void 0;
          const existing = this.activeCells.get(key2);
          if (existing) {
            this.paintCell(existing, r, c, offsetX, offsetY, span);
            continue;
          }
          this.placeCell(r, c, offsetX, offsetY, span);
        }
      }
      this.renderHeaders();
      this.renderFrozen();
      this.renderSelection();
      this.renderMedia();
    }
    /** Floating charts, images and shapes (§30/§31/§32). */
    renderMedia() {
      if (!this.mediaLayer) return;
      const doc = this.container.ownerDocument;
      this.mediaLayer.textContent = "";
      for (const chart of this.worksheet.charts.all()) {
        const data = readChartData(this.worksheet, chart);
        const wrapper = doc.createElement("div");
        wrapper.className = "ezygrid-chart";
        wrapper.innerHTML = renderChartSVG(chart, data);
        Object.assign(wrapper.style, {
          position: "absolute",
          pointerEvents: "auto",
          background: "var(--ezygrid-bg, #fff)",
          border: "1px solid var(--ezygrid-gridline, #e4e4e7)",
          overflow: "hidden"
        });
        this.positionFloating(wrapper, chart.anchor, chart.offsetX, chart.offsetY);
        wrapper.style.width = `${chart.width ?? 320}px`;
        wrapper.style.height = `${chart.height ?? 240}px`;
        this.mediaLayer.appendChild(wrapper);
      }
      for (const object of this.worksheet.media.all()) {
        const el = doc.createElement("div");
        el.className = "ezygrid-media-object";
        Object.assign(el.style, {
          position: "absolute",
          pointerEvents: "auto",
          overflow: "hidden"
        });
        if (object.kind === "image") {
          const img = doc.createElement("img");
          img.src = object.src;
          img.alt = object.alt ?? "";
          img.style.width = "100%";
          img.style.height = "100%";
          el.appendChild(img);
        } else {
          el.style.border = `1px solid ${object.stroke ?? "var(--ezygrid-gridline, #e4e4e7)"}`;
          el.style.background = object.fill ?? "transparent";
          el.style.color = object.textColor ?? "inherit";
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.padding = "4px";
          el.style.boxSizing = "border-box";
          if (object.shape === "ellipse") el.style.borderRadius = "50%";
          el.textContent = object.text ?? "";
        }
        this.positionFloating(el, object.anchor, object.offsetX, object.offsetY);
        el.style.width = `${object.width}px`;
        el.style.height = `${object.height}px`;
        el.style.zIndex = String(object.zIndex ?? 1);
        this.mediaLayer.appendChild(el);
      }
    }
    positionFloating(el, anchor, offsetX, offsetY) {
      const left = this.zOffsetX(anchor.column) - this.scrollLeft() + (offsetX ?? 0);
      const top = this.zOffsetY(anchor.row) - this.scrollTop() + (offsetY ?? 0);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }
    get renderedCellCount() {
      return this.activeCells.size;
    }
    getCellElement(row, column) {
      return this.activeCells.get(`${row},${column}`);
    }
    getEditorInput() {
      return this.editorInput;
    }
    destroy() {
      this.destroyed = true;
      this.cancelFillDrag();
      this.unlistenOperations?.();
      this.unlistenOperations = null;
      this.scrollEl.removeEventListener("scroll", this.onScroll);
      this.cellLayer.removeEventListener("mousedown", this.onMouseDown);
      this.cellLayer.removeEventListener("dblclick", this.onDoubleClick);
      this.cellLayer.removeEventListener("contextmenu", this.onContextMenu);
      this.root.removeEventListener("keydown", this.onKeyDown);
      this.root.removeEventListener("copy", this.onCopy);
      this.root.removeEventListener("cut", this.onCut);
      this.root.removeEventListener("paste", this.onPaste);
      this.container.ownerDocument.removeEventListener("mousedown", this.onGlobalMouseDown);
      this.fillHandle?.removeEventListener("mousedown", this.onFillHandleDown);
      this.editing.cancel();
      this.unmountEditor();
      this.contextMenuEl?.remove();
      this.root.remove();
    }
  };
  function columnLabel(index) {
    let n = index;
    let out = "";
    do {
      out = String.fromCharCode(65 + n % 26) + out;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
  }
  function cycleReference(input) {
    const value = input.value;
    const matches = [...value.matchAll(/(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})(?![A-Za-z0-9])/g)];
    const last = matches[matches.length - 1];
    if (!last) return;
    const [, dc, letters, dr, digits] = last;
    const states = [
      `${letters}${digits}`,
      `$${letters}$${digits}`,
      `${letters}$${digits}`,
      `$${letters}${digits}`
    ];
    const currentIndex = states.findIndex((s) => s === last[0]);
    const next = states[(currentIndex + 1) % states.length];
    const start = last.index;
    const newValue = value.slice(0, start) + next + value.slice(start + last[0].length);
    input.value = newValue;
    const caret = start + next.length;
    input.setSelectionRange(caret, caret);
  }
  function replaceFunctionToken(value, name) {
    return value.replace(/[A-Za-z0-9.]+$/, `${name}(`);
  }
  function suggest(prefix) {
    return formulaRegistry.suggest(prefix, 8);
  }

  // examples/src/basic.ts
  var workbook = createGrid(null, {
    worksheets: [
      {
        name: "Sales",
        rows: 200,
        columns: 12,
        data: [
          ["Month", "Revenue", "Cost", "Profit"],
          ["Jan", 12e3, 7e3, "=B2-C2"],
          ["Feb", 15e3, 8e3, "=B3-C3"],
          ["Mar", 9e3, 5e3, "=B4-C4"],
          ["Q1", "=SUM(B2:B4)", "=SUM(C2:C4)", "=B5-C5"]
        ]
      },
      {
        name: "People",
        rows: 100,
        columns: 8,
        data: [
          ["Name", "Role", "Score"],
          ["Ada", "Engineer", 97],
          ["Grace", "Admiral", 95],
          ["Linus", "Kernel", 90]
        ]
      }
    ]
  });
  var sales = workbook.getWorksheet("Sales");
  sales.setStyle("A1:D1", { bold: true, background: "#eef2ff" });
  sales.setStyle("D2:D5", { color: "#15803d", bold: true });
  sales.setNumberFormat("B2:C4", "#,##0");
  sales.setValue(6, 0, "Total revenue");
  sales.setValue(6, 1, "=SUM(Sales!B2:B4)");
  document.querySelector("#status").textContent = `Workbook ${workbook.id} \u2014 ${workbook.worksheets.length} sheets, formulas live.`;
  new GridRenderer(document.querySelector("#grid"), workbook);
})();
