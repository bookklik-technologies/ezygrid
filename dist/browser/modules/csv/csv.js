document.currentScript.__ezygridRegister("csv/csv", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectDelimiter = detectDelimiter;
exports.parseCsv = parseCsv;
exports.stringifyCsv = stringifyCsv;
const CANDIDATES = [',', ';', '\t', '|'];
/**
 * Detect the most likely delimiter (F23): a quote-aware scan counts
 * separators only OUTSIDE quoted fields and correctly traverses quoted
 * multiline fields instead of assuming a single physical line.
 */
function detectDelimiter(text) {
    const counts = new Map(CANDIDATES.map((candidate) => [candidate, 0]));
    let inQuotes = false;
    let i = 0;
    // Scan enough content to see real separators but stay bounded.
    const maxScan = Math.min(text.length, 64 * 1024);
    while (i < maxScan) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    i += 2;
                }
                else {
                    inQuotes = false;
                    i += 1;
                }
            }
            else {
                i += 1;
            }
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            i += 1;
            continue;
        }
        if (counts.has(ch))
            counts.set(ch, counts.get(ch) + 1);
        i += 1;
    }
    let best = ',';
    let bestCount = 0;
    for (const candidate of CANDIDATES) {
        const count = counts.get(candidate) ?? 0;
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
/**
 * RFC 4180 CSV parser (§35.1): quoted fields, escaped quotes, embedded
 * newlines, BOM stripping, delimiter detection and numeric coercion.
 */
function parseCsv(input, options = {}) {
    const stripBom = options.bom !== false;
    let text = input;
    if (stripBom && text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
    }
    const delimiter = options.delimiter ?? detectDelimiter(text);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                }
                else {
                    inQuotes = false;
                    i += 1;
                }
            }
            else {
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
            field = '';
            i += 1;
            continue;
        }
        if (ch === '\r' || ch === '\n') {
            if (ch === '\r' && text[i + 1] === '\n')
                i += 1;
            pushField(row, field, options.numbers !== false);
            field = '';
            rows.push(row);
            row = [];
            i += 1;
            continue;
        }
        field += ch;
        i += 1;
    }
    // final field / row (unless the text ended exactly on a newline)
    if (field !== '' || row.length > 0) {
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
    }
    else {
        row.push(field);
    }
}
/** Serialize rows to CSV with RFC 4180 quoting. */
function stringifyCsv(rows, options = {}) {
    const delimiter = options.delimiter ?? ',';
    const escapeFormulas = options.escapeFormulas !== false;
    const lines = [];
    for (const row of rows) {
        const fields = row.map((value) => {
            let text = value === null || value === undefined ? '' : String(value);
            if (escapeFormulas && /^[=+@-]/.test(text)) {
                text = `'${text}`;
            }
            if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) {
                return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        });
        lines.push(fields.join(delimiter));
    }
    return `${lines.join('\r\n')}\r\n`;
}

});
