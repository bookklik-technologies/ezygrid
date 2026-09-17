import type { CellInput, WorksheetConfig } from '@ezygrid/core';

/** Supported worksheet coordinate limits (OOXML spec bounds). */
const MAX_XLSX_ROWS = 1_048_576;
const MAX_XLSX_COLUMNS = 16_384;

interface CellRecord {
  row: number;
  column: number;
  value?: string | number | boolean;
  formula?: string;
  /** Shared-formula group index (t="shared"). */
  shared?: number;
  /** True when this cell is the master of a shared formula group. */
  sharedMaster?: boolean;
  type?: string;
  styleId?: number;
}

interface SheetParsed {
  name: string;
  cells: CellRecord[];
  merges: string[];
}

/** Parse a sheet XML body into cell records with a tolerant scanner. */
export function parseSheetXml(xml: string): { cells: CellRecord[]; merges: string[] } {
  const cells: CellRecord[] = [];
  const merges: string[] = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>|<row[^>]*r="(\d+)"[^>]*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(xml)) !== null) {
    const body = match[2] ?? '';
    const cellRe = /<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(body)) !== null) {
      const attrs = cellMatch[1] ?? cellMatch[3] ?? '';
      const inner = cellMatch[2] ?? '';
      const refMatch = /r="([A-Za-z]{1,3})(\d+)"/.exec(attrs);
      if (!refMatch) continue;
      const column = colToIndex(refMatch[1]!);
      const row = Number(refMatch[2]) - 1;
      if (row < 0 || row >= MAX_XLSX_ROWS || column < 0 || column >= MAX_XLSX_COLUMNS) {
        throw new Error(
          `worksheet cell coordinates exceed supported limits (${MAX_XLSX_ROWS} rows x ${MAX_XLSX_COLUMNS} columns)`,
        );
      }
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const styleId = /s="(\d+)"/.exec(attrs)?.[1];
      const valueText = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      // Formula elements: paired masters and self-closing shared followers (F05).
      const formulaFullMatch = /<f([^>]*)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
      const formulaAttrs = formulaFullMatch?.[1] ?? '';
      const formulaText = formulaFullMatch?.[2];
      let value: string | number | boolean | undefined;
      if (valueText !== undefined) {
        if (type === 's') value = undefined; // resolved via shared strings by caller
        else if (type === 'b') value = valueText === '1';
        else if (type === 'e') value = valueText;
        else value = valueText;
      } else if (type === 'inlineStr') {
        const inline = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(inner)?.[1];
        value = unescapeXml(inline ?? '');
      }
      const record: CellRecord = { row, column, type, value };
      if (styleId) record.styleId = Number(styleId);
      if (formulaFullMatch) {
        const sharedIndex = /si="(\d+)"/.exec(formulaAttrs)?.[1];
        if (/t="shared"/.test(formulaAttrs) && sharedIndex !== undefined) {
          record.shared = Number(sharedIndex);
          record.sharedMaster = formulaText !== undefined;
        } else if (formulaText !== undefined) {
          record.formula = unescapeXml(formulaText);
        }
      }
      if (type === 's' && valueText !== undefined) {
        (record as CellRecord & { shared?: number }).shared = Number(valueText);
      }
      cells.push(record);
    }
  }
  const mergeRe = /<mergeCell ref="([^"]+)"\/>/g;
  let mergeMatch: RegExpExecArray | null;
  while ((mergeMatch = mergeRe.exec(xml)) !== null) {
    merges.push(mergeMatch[1]!);
  }
  return { cells, merges };
}

/**
 * Translate a shared-formula master to a follower cell: relative references
 * shift by the offset between master and follower (F05).
 */
export function translateSharedFormula(
  formula: string,
  masterRow: number,
  masterColumn: number,
  row: number,
  column: number,
): string {
  const dRow = row - masterRow;
  const dColumn = column - masterColumn;
  if (dRow === 0 && dColumn === 0) return formula;
  let out = '';
  let i = 0;
  let tokenStart = -1;
  const isRefChar = (ch: string): boolean => /[A-Za-z0-9_$!:]/.test(ch);
  while (i < formula.length) {
    const ch = formula[i]!;
    if (ch === '"') {
      // string literal: copy verbatim to the closing quote
      let j = i + 1;
      while (j < formula.length) {
        if (formula[j] === '"' && formula[j + 1] === '"') j += 2;
        else if (formula[j] === '"') {
          j += 1;
          break;
        } else j += 1;
      }
      out += formula.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (isRefChar(ch) && tokenStart === -1) {
      tokenStart = i;
      i += 1;
      continue;
    }
    if (!isRefChar(ch) && tokenStart !== -1) {
      out += shiftSharedRef(formula.slice(tokenStart, i), dRow, dColumn);
      tokenStart = -1;
      continue;
    }
    i += 1;
  }
  if (tokenStart !== -1) {
    out += shiftSharedRef(formula.slice(tokenStart), dRow, dColumn);
  }
  return out;
}

/** Shift a single A1 reference token for a shared-formula follower. */
function shiftSharedRef(token: string, dRow: number, dColumn: number): string {
  const refRe = /^((?:'[^']*'|[A-Za-z_][\w.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/;
  const match = refRe.exec(token);
  if (!match) return token;
  const [, sheet, dollarCol, letters, dollarRow, digits] = match;
  const column = colToIndex(letters ?? 'A');
  const row = Number(digits) - 1;
  const newColumn = dollarCol === '$' ? column : column + dColumn;
  const newRow = dollarRow === '$' ? row : row + dRow;
  if (newRow < 0 || newColumn < 0 || newColumn >= MAX_XLSX_COLUMNS) return '#REF!';
  return `${sheet ?? ''}${dollarCol}${colToLetters(newColumn)}${dollarRow}${newRow + 1}`;
}

function colToLetters(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Parse sharedStrings.xml into the string table. */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const body = match[1]!;
    // Concatenate <t> runs (rich text shares become plain strings).
    let text = '';
    const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let tMatch: RegExpExecArray | null;
    let found = false;
    while ((tMatch = tRe.exec(body)) !== null) {
      text += tMatch[1]!;
      found = true;
    }
    if (!found) text = body;
    out.push(unescapeXml(text));
  }
  return out;
}

/** Parse workbook.xml: ordered sheet names with their relationship ids. */
export interface WorkbookSheetRef {
  name: string;
  /** Relationship id in xl/_rels/workbook.xml.rels (sheet parts are resolved through it). */
  rid?: string;
}

export function parseWorkbookXml(xml: string): WorkbookSheetRef[] {
  const refs: WorkbookSheetRef[] = [];
  const re = /<sheet\b[^>]*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const tag = match[0]!;
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    if (name === undefined) continue;
    const rid = /r:id="([^"]*)"/.exec(tag)?.[1];
    refs.push({ name: unescapeXml(name), rid });
  }
  return refs;
}

/** Parse xl/_rels/workbook.xml.rels: relationship id -> target path. */
export function parseWorkbookRels(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<Relationship\b[^>]*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const tag = match[0]!;
    const id = /Id="([^"]*)"/.exec(tag)?.[1];
    const target = /Target="([^"]*)"/.exec(tag)?.[1];
    if (id && target) map.set(id, target);
  }
  return map;
}

/**
 * Built-in number format ids per the OOXML spec (F06): the most common
 * masks so imported cells are not rendered as raw numbers.
 */
const BUILTIN_NUM_FORMATS: Record<number, string> = {
  0: '',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'mm-dd-yy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm',
  20: 'h:mm:ss',
  21: 'm/d/yy h:mm',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mmss.0',
  48: '##0.0E+0',
  49: '@',
};

/**
 * Parse styles.xml number formats, keeping ONE record per cellXfs entry so
 * style indexes stay aligned even when entries are paired or carry
 * children (F06). Built-in format ids map to their spec masks.
 */
export function parseStylesXml(xml: string): string[] {
  const numFmtById = new Map<number, string>();
  const fmtRe = /<numFmt\b([^>]*)\/>/g;
  let match: RegExpExecArray | null;
  while ((match = fmtRe.exec(xml)) !== null) {
    const attrs = match[1]!;
    const id = /numFmtId="(\d+)"/.exec(attrs)?.[1];
    const code = /formatCode="([^"]*)"/.exec(attrs)?.[1];
    if (id !== undefined && code !== undefined) {
      numFmtById.set(Number(id), unescapeXml(code));
    }
  }
  const formatFor = (numFmtId: number): string =>
    numFmtById.get(numFmtId) ?? BUILTIN_NUM_FORMATS[numFmtId] ?? '';
  // cellXfs: EVERY xf entry occupies one index, paired or self-closing (F06).
  const xfsSection = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? '';
  const xfRe = /<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g;
  const formats: string[] = [];
  let xfMatch: RegExpExecArray | null;
  while ((xfMatch = xfRe.exec(xfsSection)) !== null) {
    const attrs = xfMatch[1] ?? '';
    const numFmtId = /numFmtId="(\d+)"/.exec(attrs)?.[1];
    formats.push(numFmtId !== undefined ? formatFor(Number(numFmtId)) : '');
  }
  return formats;
}

export function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function colToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + ((ch.charCodeAt(0) | 32) - 96);
  }
  return n - 1;
}

/**
 * Convert parsed sheet data into WorksheetConfig cell payloads. Cells keep
 * EXPLICIT typing: XLSX text cells (shared strings, inline strings, cached
 * formula strings) stay literal text even when they begin with "=", and
 * only real <f> elements become formulas (F04).
 */
export function buildWorksheetConfigs(
  sheets: SheetParsed[],
  sharedStrings: string[],
  formats: string[],
): { configs: WorksheetConfig[]; formatsBySheet: Map<string, Map<string, string>> } {
  const configs: WorksheetConfig[] = [];
  const formatsBySheet = new Map<string, Map<string, string>>();
  for (const sheet of sheets) {
    const data: (CellInput | null)[][] = [];
    const formatMap = new Map<string, string>();
    let maxColumn = -1;
    let maxRow = -1;
    // Resolve shared-formula masters and translate follower formulas (F05).
    const masters = new Map<number, { row: number; column: number; formula: string }>();
    for (const cell of sheet.cells) {
      if (cell.shared !== undefined && cell.sharedMaster && cell.formula) {
        masters.set(cell.shared, { row: cell.row, column: cell.column, formula: cell.formula });
      }
    }
    for (const cell of sheet.cells) {
      maxColumn = Math.max(maxColumn, cell.column);
      maxRow = Math.max(maxRow, cell.row);
      let payload: CellInput;
      if (cell.formula !== undefined) {
        payload = { formula: cell.formula };
      } else if (cell.shared !== undefined && cell.type !== 's') {
        const master = masters.get(cell.shared);
        if (!master) {
          throw new Error(`shared formula si=${cell.shared} has no master definition`);
        }
        payload = {
          formula: translateSharedFormula(master.formula, master.row, master.column, cell.row, cell.column),
        };
      } else if (cell.type === 's' && (cell as CellRecord & { shared?: number }).shared !== undefined) {
        // Shared strings are TEXT by declaration (F04).
        payload = { value: sharedStrings[(cell as CellRecord & { shared?: number }).shared!] ?? '', literal: true };
      } else if (cell.type === 'e') {
        payload = { value: String(cell.value ?? ''), literal: true };
      } else if (cell.type === 'inlineStr' || cell.type === 'str') {
        // Text cells (inline strings and cached formula strings) keep their
        // exact text; "00123" must not become the number 123 (F04).
        payload = { value: cell.value ?? '', literal: true };
      } else if (typeof cell.value === 'string' && cell.type !== 'b') {
        // Untyped cells are numbers per the spec; coerce only those.
        const numeric = Number(cell.value);
        payload =
          cell.value !== '' && !Number.isNaN(numeric)
            ? { value: numeric }
            : { value: cell.value, literal: true };
      } else {
        payload = { value: cell.value ?? null, literal: true };
      }
      while (data.length <= cell.row) data.push([]);
      const rowData = data[cell.row]!;
      while (rowData.length <= maxColumn) rowData.push(null);
      rowData[cell.column] = payload;
      if (cell.styleId !== undefined) {
        const format = formats[cell.styleId];
        if (format) {
          formatMap.set(`${cell.row},${cell.column}`, format);
        }
      }
    }
    // Derive dimensions from the actual content so larger sheets are not
    // silently truncated by the default 1,000 rows x 26 columns.
    const rows = Math.max(1, maxRow + 1);
    const columns = Math.max(1, maxColumn + 1);
    configs.push({ data, rows, columns });
    formatsBySheet.set(sheet.name, formatMap);
  }
  return { configs, formatsBySheet };
}

export type { CellRecord, SheetParsed };
