import type { Workbook } from './workbook.js';
import { formatValue } from './format.js';

export type PaperSize = 'A4' | 'Letter';

export interface PrintOptions {
  orientation?: 'portrait' | 'landscape';
  paperSize?: PaperSize;
  /** Page margins in millimetres. */
  marginMm?: number;
  /** Number of leading rows repeated on every page (thead). */
  repeatHeaderRows?: number;
  /** Print gridlines (default true). */
  gridlines?: boolean;
  /** Include row/column headers (default false). */
  includeHeaders?: boolean;
}

const PAPER_MM: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 216, height: 279 },
};

function escapeHtml(text: string): string {
  return text.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
}

/**
 * Print layout (§36): builds a self-contained HTML document with @page rules
 * for paper size, orientation and margins. Browsers print or save it as PDF.
 */
export function buildPrintHtml(workbook: Workbook, sheetName: string, options: PrintOptions = {}): string {
  const sheet = workbook.getWorksheet(sheetName) ?? workbook.activeWorksheet;
  const used = sheet.cells.usedRange;
  const orientation = options.orientation ?? 'portrait';
  const paperSize = options.paperSize ?? 'A4';
  const marginMm = options.marginMm ?? 15;
  const gridlines = options.gridlines ?? true;
  const repeatHeaderRows = Math.max(0, options.repeatHeaderRows ?? 0);
  const paper = PAPER_MM[paperSize];
  const width = orientation === 'landscape' ? paper.height : paper.width;
  const height = orientation === 'landscape' ? paper.width : paper.height;

  let body = '';
  if (used) {
    const thead =
      repeatHeaderRows > 0
        ? `<thead>${rowsHtml(sheet, used.top, used.top + repeatHeaderRows - 1, used, gridlines)}</thead>`
        : '';
    const tbody = `<tbody>${rowsHtml(
      sheet,
      used.top + repeatHeaderRows,
      used.bottom,
      used,
      gridlines,
    )}</tbody>`;
    body = `<table><thead>${thead}</thead>${tbody}</table>`;
    void thead;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(sheet.name)}</title>
<style>
@page { size: ${width}mm ${height}mm; margin: ${marginMm}mm; }
body { font-family: system-ui, sans-serif; font-size: 11px; margin: 0; }
table { border-collapse: collapse; table-layout: fixed; width: 100%; }
td { padding: 2px 6px; overflow: hidden; white-space: nowrap; }
${gridlines ? 'td { border: 1px solid #e2e8f0; }' : 'td { border: none; }'}
thead td { font-weight: bold; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function rowsHtml(
  sheet: import('./workbook.js').Worksheet,
  from: number,
  to: number,
  used: { top: number; left: number; bottom: number; right: number } | undefined,
  gridlines: boolean,
): string {
  if (!used) return '';
  const out: string[] = [];
  for (let r = from; r <= to && r <= used.bottom; r++) {
    const cells: string[] = [];
    for (let c = used.left; c <= used.right; c++) {
      const value = sheet.getValue(r, c);
      const style = sheet.getStyle(r, c);
      const styles: string[] = [];
      if (style?.bold) styles.push('font-weight:bold');
      if (style?.italic) styles.push('font-style:italic');
      if (style?.color) styles.push(`color:${style.color}`);
      if (style?.background) styles.push(`background:${style.background}`);
      if (style?.align) styles.push(`text-align:${style.align}`);
      cells.push(
        `<td style="${escapeHtml(styles.join(';'))}">${escapeHtml(formatValue(value, sheet.getNumberFormat(r, c)))}</td>`,
      );
    }
    void gridlines;
    out.push(`<tr>${cells.join('')}</tr>`);
  }
  return out.join('');
}

/** Renderer convenience: open a print window (browser environments only). */
export function printHtml(html: string): boolean {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false;
  const frame = window.open('', '_blank');
  if (!frame) return false;
  frame.document.write(html);
  frame.document.close();
  frame.focus();
  frame.print();
  return true;
}
