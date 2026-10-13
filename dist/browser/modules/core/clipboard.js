document.currentScript.__ezygridRegister("core/clipboard", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClipboardService = void 0;
exports.translateFormula = translateFormula;
const model_1 = require("@ezygrid/model");
/**
 * Clipboard service (Phase 1 slice): TSV copy/paste with formula-aware
 * internal payload. The private MIME payload carries formulas so internal
 * transfers keep full fidelity; external paste reads TSV.
 */
class ClipboardService {
    buffer = null;
    /** Build the internal payload from a worksheet range. */
    copyFrom(worksheet, top, left, bottom, right, options = {}) {
        const cells = [];
        for (let r = top; r <= bottom; r++) {
            const row = [];
            for (let c = left; c <= right; c++) {
                if (options.valuesOnly) {
                    row.push({ raw: worksheet.getValue(r, c) });
                }
                else {
                    const record = worksheet.cells.getCell(r, c);
                    if (record) {
                        row.push({
                            raw: record.raw,
                            formula: record.formula,
                            style: worksheet.getStyle(r, c),
                            // A raw text value starting with "=" must paste as text (F16).
                            literal: record.formula === undefined &&
                                typeof record.raw === 'string' &&
                                record.raw.startsWith('='),
                        });
                    }
                    else {
                        row.push({ raw: null });
                    }
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
        this.buffer = ClipboardService.fromTSV(text);
    }
    /**
     * TSV text with doubled-quote escaping for quoted fields. Literal
     * formula-looking text is quoted to retain its interpretation on paste.
     */
    toTSV() {
        if (!this.buffer)
            return '';
        return this.buffer.cells
            .map((row) => row
            .map((cell) => {
            const text = cell.formula ?? (cell.raw === null || cell.raw === undefined ? '' : String(cell.raw));
            return /["\t\n\r]/.test(text) || cell.literal ? `"${text.replace(/"/g, '""')}"` : text;
        })
            .join('\t'))
            .join('\n');
    }
    /**
     * Parse external TSV into a clipboard payload. The parser is quote-aware
     * over the WHOLE stream: quoted multiline cells stay one field and blank
     * lines are preserved as rows (F16).
     */
    static fromTSV(text) {
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const rows = [];
        let cells = [];
        let field = '';
        let quoted = false;
        let wasQuoted = false;
        const pushField = () => {
            // A quoted field is always text; an unquoted field may become a
            // formula (spreadsheet semantics) or a number.
            if (wasQuoted) {
                cells.push({ raw: field, literal: true });
            }
            else {
                const isNumeric = field !== '' && /^-?\d+(\.\d+)?$/.test(field);
                cells.push({ raw: isNumeric ? Number(field) : field === '' ? null : field });
            }
            field = '';
            quoted = false;
            wasQuoted = false;
        };
        for (let i = 0; i < normalized.length;) {
            const ch = normalized[i];
            if (quoted) {
                if (ch === '"') {
                    if (normalized[i + 1] === '"') {
                        field += '"';
                        i += 2;
                    }
                    else {
                        quoted = false;
                        i += 1;
                    }
                }
                else {
                    field += ch;
                    i += 1;
                }
                continue;
            }
            if (ch === '"' && field === '' && !wasQuoted) {
                quoted = true;
                wasQuoted = true;
                i += 1;
                continue;
            }
            if (ch === '\t') {
                pushField();
                i += 1;
                continue;
            }
            if (ch === '\n') {
                pushField();
                rows.push(cells);
                cells = [];
                i += 1;
                continue;
            }
            field += ch;
            i += 1;
        }
        // Trailing row unless the text ended exactly on a newline.
        if (field !== '' || cells.length > 0 || wasQuoted) {
            pushField();
            rows.push(cells);
        }
        const height = rows.length;
        const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
        for (const row of rows) {
            while (row.length < width)
                row.push({ raw: null });
        }
        return { rows: height, columns: width, origin: { row: 0, column: 0 }, cells: rows };
    }
    /**
     * Paste the buffer at a target anchor. Relative formula references move
     * with the paste offset; absolute parts stay fixed (§12.3). The whole
     * paste is one history transaction (F09).
     */
    pasteTo(workbook, worksheet, anchorRow, anchorColumn) {
        if (!this.buffer)
            return;
        const history = workbook.history;
        history.beginBatch();
        // One notification transaction for the whole paste: one render pass (F02).
        workbook.beginUpdate();
        try {
            const dRow = anchorRow - this.buffer.origin.row;
            const dCol = anchorColumn - this.buffer.origin.column;
            for (let r = 0; r < this.buffer.rows; r++) {
                for (let c = 0; c < this.buffer.columns; c++) {
                    const source = this.buffer.cells[r][c];
                    const targetRow = anchorRow + r;
                    const targetColumn = anchorColumn + c;
                    if (source.formula !== undefined) {
                        worksheet.setValue(targetRow, targetColumn, translateFormula(source.formula, dRow, dCol));
                    }
                    else if (source.literal) {
                        worksheet.setValue(targetRow, targetColumn, source.raw ?? null, { literal: true });
                    }
                    else {
                        worksheet.setValue(targetRow, targetColumn, source.raw ?? null);
                    }
                    if (source.style) {
                        worksheet.setStyle((0, model_1.toA1)(targetRow, targetColumn), source.style);
                    }
                }
            }
        }
        finally {
            workbook.endUpdate();
            history.endBatch();
        }
    }
}
exports.ClipboardService = ClipboardService;
/**
 * Shift relative A1 references in a formula by (dRow, dCol).
 * Scans parsed reference tokens so quoted strings and function names are
 * never touched; references translated off the sheet become #REF!.
 */
function translateFormula(formula, dRow, dCol) {
    if (dRow === 0 && dCol === 0)
        return formula;
    const body = formula.startsWith('=') ? formula.slice(1) : formula;
    let out = '';
    for (const token of (0, model_1.tokenizeFormula)(body)) {
        out += token.isRef ? translateRefToken(token.text, dRow, dCol) : token.text;
    }
    return `=${out}`;
}
function translateRefToken(token, dRow, dCol) {
    const colon = token.indexOf(':');
    if (colon >= 0) {
        const a = translateRefPart(token.slice(0, colon), dRow, dCol);
        const b = translateRefPart(token.slice(colon + 1), dRow, dCol);
        // A range moved partially or fully off the sheet becomes #REF!.
        if (a === undefined || b === undefined)
            return '#REF!';
        return `${a}:${b}`;
    }
    return translateRefPart(token, dRow, dCol) ?? '#REF!';
}
function translateRefPart(part, dRow, dCol) {
    const bang = part.lastIndexOf('!');
    const prefix = bang >= 0 ? part.slice(0, bang + 1) : '';
    const body = bang >= 0 ? part.slice(bang + 1) : part;
    const m = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/.exec(body);
    if (!m)
        return part;
    const dollarCol = m[1];
    const letters = m[2];
    const dollarRow = m[3];
    const digits = m[4];
    let column = 0;
    for (const ch of letters)
        column = column * 26 + ((ch.charCodeAt(0) | 32) - 96);
    column -= 1;
    const row = Number(digits) - 1;
    const newColumn = dollarCol === '$' ? column : column + dCol;
    const newRow = dollarRow === '$' ? row : row + dRow;
    // Translated coordinates must stay on the sheet.
    if (newRow < 0 || newColumn < 0)
        return undefined;
    return `${prefix}${dollarCol}${(0, model_1.indexToColumn)(newColumn)}${dollarRow}${newRow + 1}`;
}

});
