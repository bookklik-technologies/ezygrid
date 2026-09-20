import { Workbook } from '../workbook.js';
import { formatValue } from '../format.js';
import { parseRange, toA1 } from '@ezygrid/model';
import { workbookToXlsxBytes } from './writer.js';
import {
  parseSheetXml,
  parseSharedStrings,
  parseWorkbookXml,
  parseWorkbookRels,
  parseStylesXml,
  buildWorksheetConfigs,
  unescapeXml,
} from './reader.js';
import { readZip, createZip } from './zip.js';
import { parseCellStyles, applySheetGeometry } from './styles.js';

export { readZip, createZip };

/** Export a workbook to XLSX (Open XML, §35.3). */
export function workbookToXlsx(workbook: Workbook): Uint8Array {
  return workbookToXlsxBytes(workbook);
}

/**
 * Per-part XML size caps for regex scanning (M7): a hostile archive can
 * force heavy O(n²) scanning on the main thread; parts beyond these bounds
 * are rejected with a clear error instead of hanging the tab. Real Excel
 * sheets stay far below these limits.
 */
const MAX_PART_XML_BYTES = 64 * 1024 * 1024; // sheet/sharedStrings/styles parts
const MAX_PART_COUNT = 1024;

/**
 * Resolve a relationship target to a package part path. Targets are relative
 * to xl/ (or package-absolute with a leading slash).
 */
function resolvePartPath(target: string): string {
  let t = target;
  if (t.startsWith('/')) return t.slice(1);
  while (t.startsWith('./')) t = t.slice(2);
  if (t.startsWith('../')) return t.replace(/^(\.\.\/)+/, '');
  return `xl/${t}`;
}

/**
 * Import an XLSX package (§35.2): multiple sheets, raw values, formulas,
 * shared strings, merges and custom number formats. Deflated packages
 * decompress via DecompressionStream.
 */
export async function workbookFromXlsx(bytes: Uint8Array): Promise<Workbook> {
  const files = await readZip(bytes);
  if (files.size > MAX_PART_COUNT) {
    throw new Error(`xlsx package declares too many parts (${files.size} > ${MAX_PART_COUNT})`);
  }
  const decodedCache = new Map<string, string>();
  const decodeChecked = (path: string, data: Uint8Array): string => {
    if (data.byteLength > MAX_PART_XML_BYTES) {
      throw new Error(`xlsx part ${path} exceeds the ${MAX_PART_XML_BYTES} byte import limit`);
    }
    let text = decodedCache.get(path);
    if (text === undefined) {
      text = decode(data);
      decodedCache.set(path, text);
    }
    return text;
  };
  const workbookXmlData = files.get('xl/workbook.xml');
  if (!workbookXmlData) throw new Error('missing xl/workbook.xml');
  const sheetRefs = parseWorkbookXml(decodeChecked('xl/workbook.xml', workbookXmlData));
  const sharedStringsXml = files.get('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsXml ? parseSharedStrings(decodeChecked('xl/sharedStrings.xml', sharedStringsXml)) : [];
  const stylesXml = files.get('xl/styles.xml');
  const formats = stylesXml ? parseStylesXml(decodeChecked('xl/styles.xml', stylesXml)) : [];
  const cellStyles = stylesXml ? parseCellStyles(decodeChecked('xl/styles.xml', stylesXml)) : [];

  // Resolve each sheet's part through the workbook relationships instead of
  // guessing filenames from sheet order.
  const relsXml = files.get('xl/_rels/workbook.xml.rels');
  const rels = relsXml ? parseWorkbookRels(decodeChecked('xl/_rels/workbook.xml.rels', relsXml)) : new Map<string, string>();

  const sheets = sheetRefs.map((ref, index) => {
    const relTarget = ref.rid !== undefined ? rels.get(ref.rid) : undefined;
    const path = relTarget ? resolvePartPath(relTarget) : `xl/worksheets/sheet${index + 1}.xml`;
    const xml = files.get(path);
    // Missing referenced parts are an import failure, never an empty
    // worksheet that silently loses data (F03).
    if (!xml) {
      throw new Error(`missing worksheet part ${path} for sheet "${ref.name}"`);
    }
    const xmlText = decodeChecked(path, xml);
    const parsed = parseSheetXml(xmlText);
    return { name: ref.name, ...parsed, xml: xmlText };
  });

  const { configs, formatsBySheet } = buildWorksheetConfigs(sheets, sharedStrings, formats);
  const workbook = new Workbook({
    worksheets: configs.map((config, index) => ({
      ...config,
      name: sheetRefs[index]!.name,
    })),
  });

  // Apply merges and number formats per sheet.
  sheets.forEach((sheet, index) => {
    const target = workbook.worksheets[index];
    if (!target) return;
    applySheetGeometry(target, sheet.xml);
    for (const cell of sheet.cells) {
      const style = cellStyles[cell.styleId ?? 0];
      if (style && Object.keys(style).length) target.setStyle(toA1(cell.row, cell.column), style);
    }
    for (const merge of sheet.merges) {
      target.merge(merge);
    }
    const formatMap = formatsBySheet.get(sheet.name);
    if (formatMap) {
      for (const [key, mask] of formatMap) {
        const [row, column] = key.split(',').map(Number) as [number, number];
        target.setNumberFormat(toA1(row, column), mask);
      }
    }
  });
  workbook.history.clear();
  return workbook;
}

function decode(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

// Re-exports for round-trip tooling.
export { parseRange, formatValue, unescapeXml };

