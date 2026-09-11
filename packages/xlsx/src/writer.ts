import { toA1, rectToRange } from '@ezygrid/model';
import type { Workbook, Worksheet } from '@ezygrid/core';
import { formatValue } from '@ezygrid/core';
import { createZip, type ZipEntry } from './zip.js';

const encoder = new TextEncoder();

function xmlEscape(text: string): string {
  return text.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
}

function columnLetters(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function ref(row: number, column: number): string {
  return `${columnLetters(column)}${row + 1}`;
}

interface CellOutput {
  attrs: string;
  value?: string;
  formula?: string;
}

/** Build the OOXML package (§35.3): standards-compliant minimal parts. */
export function workbookToXlsxBytes(workbook: Workbook): Uint8Array {
  const sharedStrings: string[] = [];
  const sharedIndex = new Map<string, number>();
  const numberFormats: string[] = [];
  const formatId = new Map<string, number>();

  const entries: ZipEntry[] = [];
  const sheetParts: string[] = [];
  const sheetNames: string[] = [];

  workbook.worksheets.forEach((sheet, sheetIndex) => {
    sheetNames.push(sheet.name);
    sheetParts.push(buildSheetXml(sheet, sharedStrings, sharedIndex, numberFormats, formatId));
    void sheetIndex;
  });

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
${sheetNames
  .map(
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  )
  .join('\n')}
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetNames
  .map(
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  )
  .join('\n')}
<Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId${sheetNames.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${sheetNames
  .map(
    (name, i) =>
      `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
  )
  .join('\n')}
</sheets>
<calcPr calcMode="auto" fullCalcOnLoad="1"/>
</workbook>`;

  const stylesXml = buildStylesXml(numberFormats);

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
${sharedStrings.map((s) => `<si><t>${xmlEscape(s)}</t></si>`).join('\n')}
</sst>`;

  entries.push({ name: '[Content_Types].xml', data: encoder.encode(contentTypes) });
  entries.push({ name: '_rels/.rels', data: encoder.encode(rootRels) });
  entries.push({ name: 'xl/workbook.xml', data: encoder.encode(workbookXml) });
  entries.push({ name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) });
  entries.push({ name: 'xl/styles.xml', data: encoder.encode(stylesXml) });
  if (sharedStrings.length > 0) {
    entries.push({ name: 'xl/sharedStrings.xml', data: encoder.encode(sharedStringsXml) });
  }
  sheetParts.forEach((xml, i) => {
    entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: encoder.encode(xml) });
  });

  return createZip(entries);
}

function buildStylesXml(numberFormats: string[]): string {
  const numFmtEntries = numberFormats
    .map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xmlEscape(code)}"/>`)
    .join('\n');
  const cellXfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>',
    ...numberFormats.map(
      (_, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>`,
    ),
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${numberFormats.length > 0 ? `<numFmts count="${numberFormats.length}">\n${numFmtEntries}\n</numFmts>` : ''}
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${numberFormats.length + 1}">${cellXfs}</cellXfs>
</styleSheet>`;
}

function buildSheetXml(
  sheet: Worksheet,
  sharedStrings: string[],
  sharedIndex: Map<string, number>,
  numberFormats: string[],
  formatId: Map<string, number>,
): string {
  const used = sheet.cells.usedRange;
  const rowsXml: string[] = [];
  if (used) {
    for (let r = used.top; r <= used.bottom; r++) {
      const cellsXml: string[] = [];
      for (let c = used.left; c <= used.right; c++) {
        const record = sheet.cells.getCell(r, c);
        if (!record) continue;
        const output = buildCellXml(
          sheet,
          r,
          c,
          record,
          sharedStrings,
          sharedIndex,
          numberFormats,
          formatId,
        );
        if (!output) continue;
        const attrs = ` r="${ref(r, c)}"${output.attrs}`;
        const inner = output.formula !== undefined
          ? `<f>${xmlEscape(output.formula)}</f>${output.value !== undefined ? `<v>${xmlEscape(output.value)}</v>` : ''}`
          : output.value !== undefined
            ? `<v>${xmlEscape(output.value)}</v>`
            : '';
        cellsXml.push(`<c${attrs}>${inner}</c>`);
      }
      if (cellsXml.length > 0) {
        rowsXml.push(`<row r="${r + 1}">${cellsXml.join('')}</row>`);
      }
    }
  }

  const merges = sheet.merges.all;
  const mergesXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges
          .map((m) => `<mergeCell ref="${rectToRange(m)}"/>`)
          .join('')}</mergeCells>`
      : '';

  const dimension = used
    ? `<dimension ref="${rectToRange(used)}"/>`
    : '<dimension ref="A1"/>';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${dimension}
<sheetData>
${rowsXml.join('\n')}
</sheetData>
${mergesXml}
</worksheet>`;
}

function buildCellXml(
  sheet: Worksheet,
  row: number,
  column: number,
  record: { raw?: unknown; formula?: string },
  sharedStrings: string[],
  sharedIndex: Map<string, number>,
  numberFormats: string[],
  formatId: Map<string, number>,
): CellOutput | undefined {
  const mask = sheet.getNumberFormat(row, column);
  let styleAttr = '';
  if (mask) {
    let id = formatId.get(mask);
    if (id === undefined) {
      id = 164 + numberFormats.length;
      numberFormats.push(mask);
      formatId.set(mask, id);
    }
    styleAttr = ` s="${id - 163}"`; // cellXfs index: custom formats start at index 1
  }

  if (record.formula !== undefined) {
    const cached = sheet.getValue(row, column);
    if (typeof cached === 'number') {
      return { attrs: styleAttr, formula: record.formula.slice(1), value: String(cached) };
    }
    if (typeof cached === 'string') {
      return {
        attrs: `${styleAttr} t="str"`,
        formula: record.formula.slice(1),
        value: cached,
      };
    }
    if (typeof cached === 'boolean') {
      return { attrs: `${styleAttr} t="b"`, formula: record.formula.slice(1), value: cached ? '1' : '0' };
    }
    // error or spilled values: formula only, no cached value
    return { attrs: styleAttr, formula: record.formula.slice(1) };
  }
  const raw = record.raw;
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number') {
    return { attrs: styleAttr, value: String(raw) };
  }
  if (typeof raw === 'boolean') {
    return { attrs: `${styleAttr} t="b"`, value: raw ? '1' : '0' };
  }
  const text = String(raw);
  let index = sharedIndex.get(text);
  if (index === undefined) {
    index = sharedStrings.length;
    sharedStrings.push(text);
    sharedIndex.set(text, index);
  }
  return { attrs: `${styleAttr} t="s"`, value: String(index) };
}

// Suppress unused import warning for display formatting helper reuse.
void formatValue;
void toA1;
