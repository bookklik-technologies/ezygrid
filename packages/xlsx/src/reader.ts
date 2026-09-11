import type { WorksheetConfig } from '@ezygrid/core';

interface CellRecord {
  row: number;
  column: number;
  value?: string | number | boolean;
  formula?: string;
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
    const rowIndex = Number(match[1] ?? match[3]) - 1;
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
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const styleId = /s="(\d+)"/.exec(attrs)?.[1];
      const valueText = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const formulaText = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(inner)?.[1];
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
      if (formulaText !== undefined) {
        record.formula = unescapeXml(formulaText);
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

/** Parse styles.xml numFmt custom formats, keyed by cellXfs index. */
export function parseStylesXml(xml: string): string[] {
  const numFmtById = new Map<number, string>();
  const fmtRe = /<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = fmtRe.exec(xml)) !== null) {
    numFmtById.set(Number(match[1]), unescapeXml(match[2]!));
  }
  // cellXfs: xf entries referencing numFmtId
  const xfsSection = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? '';
  const xfRe = /<xf[^>]*numFmtId="(\d+)"[^>]*\/>/g;
  const formats: string[] = [];
  let xfMatch: RegExpExecArray | null;
  while ((xfMatch = xfRe.exec(xfsSection)) !== null) {
    const numFmtId = Number(xfMatch[1]);
    formats.push(numFmtById.get(numFmtId) ?? '');
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

/** Convert parsed sheet data into WorksheetConfig-compatible cell payloads. */
export function buildWorksheetConfigs(
  sheets: SheetParsed[],
  sharedStrings: string[],
  formats: string[],
): { configs: WorksheetConfig[]; formatsBySheet: Map<string, Map<string, string>> } {

  const configs: WorksheetConfig[] = [];
  const formatsBySheet = new Map<string, Map<string, string>>();
  for (const sheet of sheets) {
    const data: unknown[][] = [];
    const formatMap = new Map<string, string>();
    let maxColumn = -1;
    let maxRow = -1;
    for (const cell of sheet.cells) {
      maxColumn = Math.max(maxColumn, cell.column);
      maxRow = Math.max(maxRow, cell.row);
      let value: unknown;
      if (cell.formula !== undefined) {
        value = `=${cell.formula}`;
      } else if (cell.type === 's' && (cell as CellRecord & { shared?: number }).shared !== undefined) {
        value = sharedStrings[(cell as CellRecord & { shared?: number }).shared!] ?? '';
      } else if (cell.type === 'e') {
        value = String(cell.value ?? '');
      } else if (cell.type === 'inlineStr' || cell.type === 'str') {
        // Text cells (inline strings and cached formula strings) keep their
        // exact text; "00123" must not become the number 123.
        value = cell.value ?? '';
      } else if (typeof cell.value === 'string' && cell.type !== 'b') {
        // Untyped cells are numbers per the spec; coerce only those.
        const numeric = Number(cell.value);
        value = cell.value !== '' && !Number.isNaN(numeric) ? numeric : cell.value;
      } else {
        value = cell.value ?? null;
      }
      while (data.length <= cell.row) data.push([]);
      const rowData = data[cell.row]!;
      while (rowData.length <= maxColumn) rowData.push(null);
      rowData[cell.column] = value;
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

