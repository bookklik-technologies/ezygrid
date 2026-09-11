import type { Worksheet, Workbook, CellStyle } from './workbook.js';
import { toA1, indexToColumn, tokenizeFormula } from '@ezygrid/model';

export interface ClipboardCell {
  raw?: unknown;
  formula?: string;
  style?: CellStyle;
}

export interface ClipboardRange {
  rows: number;
  columns: number;
  /** Source anchor in the originating sheet. */
  origin: { row: number; column: number };
  /** 2D matrix of raw cell payloads (formula preserved). */
  cells: ClipboardCell[][];
}

/**
 * Clipboard service (Phase 1 slice): TSV copy/paste with formula-aware
 * internal payload. The private MIME payload carries formulas so internal
 * transfers keep full fidelity; external paste reads TSV.
 */
export class ClipboardService {
  private buffer: ClipboardRange | null = null;

  /** Build the internal payload from a worksheet range. */
  copyFrom(
    worksheet: Worksheet,
    top: number,
    left: number,
    bottom: number,
    right: number,
    options: { valuesOnly?: boolean } = {},
  ): ClipboardRange {
    const cells: ClipboardCell[][] = [];
    for (let r = top; r <= bottom; r++) {
      const row: ClipboardCell[] = [];
      for (let c = left; c <= right; c++) {
        if (options.valuesOnly) {
          row.push({ raw: worksheet.getValue(r, c) as unknown });
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

  getBuffer(): ClipboardRange | null {
    return this.buffer;
  }

  /** Load text copied from another application without translating its formulas. */
  loadTSV(text: string): void {
    this.buffer = ClipboardService.fromTSV(text);
  }

  /** TSV text of the clipboard buffer (external format). */
  toTSV(): string {
    if (!this.buffer) return '';
    return this.buffer.cells
      .map((row) =>
        row
          .map((cell) => {
            const text = cell.formula ?? (cell.raw === null || cell.raw === undefined ? '' : String(cell.raw));
            return /[\\\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join('\t'),
      )
      .join('\n');
  }

  /** Parse external TSV into a clipboard payload. */
  static fromTSV(text: string): ClipboardRange {
    const rows: ClipboardCell[][] = [];
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    for (const line of lines) {
      if (line === '') continue;
      const cells: ClipboardCell[] = [];
      let i = 0;
      while (i <= line.length) {
        if (line[i] === '"') {
          let value = '';
          i += 1;
          while (i < line.length) {
            if (line[i] === '"' && line[i + 1] === '"') {
              value += '"';
              i += 2;
            } else if (line[i] === '"') {
              i += 1;
              break;
            } else {
              value += line[i]!;
              i += 1;
            }
          }
          cells.push({ raw: value });
        } else {
          let value = '';
          while (i < line.length && line[i] !== '\t') {
            value += line[i]!;
            i += 1;
          }
          const isNumeric = value !== '' && /^-?\d+(\.\d+)?$/.test(value);
          cells.push({ raw: isNumeric ? Number(value) : value === '' ? null : value });
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
  pasteTo(workbook: Workbook, worksheet: Worksheet, anchorRow: number, anchorColumn: number): void {
    if (!this.buffer) return;
    const dRow = anchorRow - this.buffer.origin.row;
    const dCol = anchorColumn - this.buffer.origin.column;
    for (let r = 0; r < this.buffer.rows; r++) {
      for (let c = 0; c < this.buffer.columns; c++) {
        const source = this.buffer.cells[r]![c]!;
        const targetRow = anchorRow + r;
        const targetColumn = anchorColumn + c;
        if (source.formula !== undefined) {
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
}

/**
 * Shift relative A1 references in a formula by (dRow, dCol).
 * Scans parsed reference tokens so quoted strings and function names are
 * never touched; references translated off the sheet become #REF!.
 */
export function translateFormula(formula: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) return formula;
  const body = formula.startsWith('=') ? formula.slice(1) : formula;
  let out = '';
  for (const token of tokenizeFormula(body)) {
    out += token.isRef ? translateRefToken(token.text, dRow, dCol) : token.text;
  }
  return `=${out}`;
}

function translateRefToken(token: string, dRow: number, dCol: number): string {
  const colon = token.indexOf(':');
  if (colon >= 0) {
    const a = translateRefPart(token.slice(0, colon), dRow, dCol);
    const b = translateRefPart(token.slice(colon + 1), dRow, dCol);
    // A range moved partially or fully off the sheet becomes #REF!.
    if (a === undefined || b === undefined) return '#REF!';
    return `${a}:${b}`;
  }
  return translateRefPart(token, dRow, dCol) ?? '#REF!';
}

function translateRefPart(part: string, dRow: number, dCol: number): string | undefined {
  const bang = part.lastIndexOf('!');
  const prefix = bang >= 0 ? part.slice(0, bang + 1) : '';
  const body = bang >= 0 ? part.slice(bang + 1) : part;
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/.exec(body);
  if (!m) return part;
  const dollarCol = m[1]!;
  const letters = m[2]!;
  const dollarRow = m[3]!;
  const digits = m[4]!;
  let column = 0;
  for (const ch of letters) column = column * 26 + ((ch.charCodeAt(0) | 32) - 96);
  column -= 1;
  const row = Number(digits) - 1;
  const newColumn = dollarCol === '$' ? column : column + dCol;
  const newRow = dollarRow === '$' ? row : row + dRow;
  // Translated coordinates must stay on the sheet.
  if (newRow < 0 || newColumn < 0) return undefined;
  return `${prefix}${dollarCol}${indexToColumn(newColumn)}${dollarRow}${newRow + 1}`;
}

