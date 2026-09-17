import { Workbook, formatValue } from '@ezygrid/core';
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

export { readZip, createZip };

/** Export a workbook to XLSX (Open XML, §35.3). */
export function workbookToXlsx(workbook: Workbook): Uint8Array {
  return workbookToXlsxBytes(workbook);
}

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
  const workbookXmlData = files.get('xl/workbook.xml');
  if (!workbookXmlData) throw new Error('missing xl/workbook.xml');
  const sheetRefs = parseWorkbookXml(decode(workbookXmlData));
  const sharedStringsXml = files.get('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsXml ? parseSharedStrings(decode(sharedStringsXml)) : [];
  const stylesXml = files.get('xl/styles.xml');
  const formats = stylesXml ? parseStylesXml(decode(stylesXml)) : [];

  // Resolve each sheet's part through the workbook relationships instead of
  // guessing filenames from sheet order.
  const relsXml = files.get('xl/_rels/workbook.xml.rels');
  const rels = relsXml ? parseWorkbookRels(decode(relsXml)) : new Map<string, string>();

  const sheets = sheetRefs.map((ref, index) => {
    const relTarget = ref.rid !== undefined ? rels.get(ref.rid) : undefined;
    const path = relTarget ? resolvePartPath(relTarget) : `xl/worksheets/sheet${index + 1}.xml`;
    const xml = files.get(path);
    // Missing referenced parts are an import failure, never an empty
    // worksheet that silently loses data (F03).
    if (!xml) {
      throw new Error(`missing worksheet part ${path} for sheet "${ref.name}"`);
    }
    const parsed = parseSheetXml(decode(xml));
    return { name: ref.name, ...parsed };
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
  return workbook;
}

function decode(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

// Re-exports for round-trip tooling.
export { parseRange, formatValue, unescapeXml };

