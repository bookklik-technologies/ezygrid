document.currentScript.__ezygridRegister("core/xlsx/index", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unescapeXml = exports.formatValue = exports.parseRange = exports.createZip = exports.readZip = void 0;
exports.workbookToXlsx = workbookToXlsx;
exports.workbookFromXlsx = workbookFromXlsx;
const workbook_js_1 = require("../workbook.js");
const format_js_1 = require("../format.js");
Object.defineProperty(exports, "formatValue", { enumerable: true, get: function () { return format_js_1.formatValue; } });
const model_1 = require("@ezygrid/model");
Object.defineProperty(exports, "parseRange", { enumerable: true, get: function () { return model_1.parseRange; } });
const writer_js_1 = require("./writer.js");
const reader_js_1 = require("./reader.js");
Object.defineProperty(exports, "unescapeXml", { enumerable: true, get: function () { return reader_js_1.unescapeXml; } });
const zip_js_1 = require("./zip.js");
Object.defineProperty(exports, "readZip", { enumerable: true, get: function () { return zip_js_1.readZip; } });
Object.defineProperty(exports, "createZip", { enumerable: true, get: function () { return zip_js_1.createZip; } });
const styles_js_1 = require("./styles.js");
/** Export a workbook to XLSX (Open XML, §35.3). */
function workbookToXlsx(workbook) {
    return (0, writer_js_1.workbookToXlsxBytes)(workbook);
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
function resolvePartPath(target) {
    let t = target;
    if (t.startsWith('/'))
        return t.slice(1);
    while (t.startsWith('./'))
        t = t.slice(2);
    if (t.startsWith('../'))
        return t.replace(/^(\.\.\/)+/, '');
    return `xl/${t}`;
}
/**
 * Import an XLSX package (§35.2): multiple sheets, raw values, formulas,
 * shared strings, merges and custom number formats. Deflated packages
 * decompress via DecompressionStream.
 */
async function workbookFromXlsx(bytes) {
    const files = await (0, zip_js_1.readZip)(bytes);
    if (files.size > MAX_PART_COUNT) {
        throw new Error(`xlsx package declares too many parts (${files.size} > ${MAX_PART_COUNT})`);
    }
    const decodedCache = new Map();
    const decodeChecked = (path, data) => {
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
    if (!workbookXmlData)
        throw new Error('missing xl/workbook.xml');
    const sheetRefs = (0, reader_js_1.parseWorkbookXml)(decodeChecked('xl/workbook.xml', workbookXmlData));
    const sharedStringsXml = files.get('xl/sharedStrings.xml');
    const sharedStrings = sharedStringsXml ? (0, reader_js_1.parseSharedStrings)(decodeChecked('xl/sharedStrings.xml', sharedStringsXml)) : [];
    const stylesXml = files.get('xl/styles.xml');
    const formats = stylesXml ? (0, reader_js_1.parseStylesXml)(decodeChecked('xl/styles.xml', stylesXml)) : [];
    const cellStyles = stylesXml ? (0, styles_js_1.parseCellStyles)(decodeChecked('xl/styles.xml', stylesXml)) : [];
    // Resolve each sheet's part through the workbook relationships instead of
    // guessing filenames from sheet order.
    const relsXml = files.get('xl/_rels/workbook.xml.rels');
    const rels = relsXml ? (0, reader_js_1.parseWorkbookRels)(decodeChecked('xl/_rels/workbook.xml.rels', relsXml)) : new Map();
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
        const parsed = (0, reader_js_1.parseSheetXml)(xmlText);
        return { name: ref.name, ...parsed, xml: xmlText };
    });
    const { configs, formatsBySheet } = (0, reader_js_1.buildWorksheetConfigs)(sheets, sharedStrings, formats);
    const workbook = new workbook_js_1.Workbook({
        worksheets: configs.map((config, index) => ({
            ...config,
            name: sheetRefs[index].name,
        })),
    });
    // Apply merges and number formats per sheet.
    sheets.forEach((sheet, index) => {
        const target = workbook.worksheets[index];
        if (!target)
            return;
        (0, styles_js_1.applySheetGeometry)(target, sheet.xml);
        for (const cell of sheet.cells) {
            const style = cellStyles[cell.styleId ?? 0];
            if (style && Object.keys(style).length)
                target.setStyle((0, model_1.toA1)(cell.row, cell.column), style);
        }
        for (const merge of sheet.merges) {
            target.merge(merge);
        }
        const formatMap = formatsBySheet.get(sheet.name);
        if (formatMap) {
            for (const [key, mask] of formatMap) {
                const [row, column] = key.split(',').map(Number);
                target.setNumberFormat((0, model_1.toA1)(row, column), mask);
            }
        }
    });
    workbook.history.clear();
    return workbook;
}
function decode(data) {
    return new TextDecoder().decode(data);
}

});
