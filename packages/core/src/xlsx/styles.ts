import type { CellStyle, Worksheet } from '../workbook.js';
import { unescapeXml } from './reader.js';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (xml: string, key: string) => unescapeXml(new RegExp(`\\b${key}="([^"]*)"`).exec(xml)?.[1] ?? '');
const color = (value?: string) => value && /^#[0-9a-f]{6}$/i.test(value) ? `FF${value.slice(1).toUpperCase()}` : undefined;
const readColor = (xml: string) => { const rgb = attr(xml, 'rgb'); return /^[0-9a-f]{8}$/i.test(rgb) ? `#${rgb.slice(2).toLowerCase()}` : undefined; };

export class XlsxStyles {
  private entries: { style: CellStyle; mask: string }[] = [{ style: {}, mask: '' }];
  private ids = new Map<string, number>();

  id(style: CellStyle = {}, mask = ''): number {
    if (!Object.keys(style).length && !mask) return 0;
    const key = JSON.stringify([style, mask]);
    const found = this.ids.get(key);
    if (found !== undefined) return found;
    const index = this.entries.length;
    this.entries.push({ style, mask }); this.ids.set(key, index); return index;
  }

  xml(): string {
    const fonts: string[] = []; const fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']; const borders: string[] = []; const formats: string[] = []; const xfs: string[] = [];
    this.entries.forEach(({ style, mask }, index) => {
      const textColor = color(style.color); const fillColor = color(style.background);
      fonts.push(`<font><sz val="${style.fontSize ?? 13}"/><name val="${escape(style.fontFamily ?? 'Outfit')}"/>${style.bold ? '<b/>' : ''}${style.italic ? '<i/>' : ''}${style.underline ? '<u/>' : ''}${textColor ? `<color rgb="${textColor}"/>` : ''}</font>`);
      const fillId = fillColor ? fills.length : 0;
      if (fillColor) fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${fillColor}"/><bgColor indexed="64"/></patternFill></fill>`);
      const edges = ['left', 'right', 'top', 'bottom'].map((edge) => {
        const border = style.borders?.[edge as keyof NonNullable<CellStyle['borders']>];
        if (!border) return `<${edge}/>`;
        const kind = border.style === 'solid' ? border.width >= 3 ? 'thick' : border.width >= 2 ? 'medium' : 'thin' : border.style;
        return `<${edge} style="${kind}"><color rgb="${color(border.color) ?? 'FF64748B'}"/></${edge}>`;
      }).join('');
      borders.push(`<border>${edges}<diagonal/></border>`);
      const numFmtId = mask ? 164 + index : 0;
      if (mask) formats.push(`<numFmt numFmtId="${numFmtId}" formatCode="${escape(mask)}"/>`);
      xfs.push(`<xf numFmtId="${numFmtId}" fontId="${index}" fillId="${fillId}" borderId="${index}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="${style.align ?? 'general'}" vertical="${style.verticalAlign === 'middle' ? 'center' : style.verticalAlign ?? 'top'}" wrapText="${style.wrap ? 1 : 0}"/></xf>`);
    });
    return `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${formats.length}">${formats.join('')}</numFmts><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs></styleSheet>`;
  }
}

export function parseCellStyles(xml: string): CellStyle[] {
  const section = (name: string) => new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? '';
  const entries = (name: string, tag: string) => [...section(name).matchAll(new RegExp(`<${tag}\\b[^>]*(?:/>|>[\\s\\S]*?</${tag}>)`, 'g'))].map((match) => match[0]);
  const fonts = entries('fonts', 'font'); const fills = entries('fills', 'fill'); const borders = entries('borders', 'border');
  return entries('cellXfs', 'xf').map((xf) => {
    const font = fonts[Number(attr(xf, 'fontId'))] ?? '';
    const fill = fills[Number(attr(xf, 'fillId'))] ?? '';
    const border = borders[Number(attr(xf, 'borderId'))] ?? '';
    const alignment = /<alignment\b[^>]*\/>/.exec(xf)?.[0] ?? '';
    const style: CellStyle = {};
    const family = attr(/<name\b[^>]*\/>/.exec(font)?.[0] ?? '', 'val');
    const size = Number(attr(/<sz\b[^>]*\/>/.exec(font)?.[0] ?? '', 'val'));
    if (family) style.fontFamily = family;
    if (size > 0) style.fontSize = size;
    if (/<b\b/.test(font)) style.bold = true;
    if (/<i\b/.test(font)) style.italic = true;
    if (/<u\b/.test(font)) style.underline = true;
    const foreground = readColor(/<color\b[^>]*\/>/.exec(font)?.[0] ?? '');
    if (foreground) style.color = foreground;
    const background = readColor(/<fgColor\b[^>]*\/>/.exec(fill)?.[0] ?? '');
    if (background) style.background = background;
    const horizontal = attr(alignment, 'horizontal');
    if (['left', 'center', 'right'].includes(horizontal)) style.align = horizontal as CellStyle['align'];
    const vertical = attr(alignment, 'vertical');
    if (['top', 'center', 'bottom'].includes(vertical)) style.verticalAlign = vertical === 'center' ? 'middle' : vertical as 'top' | 'bottom';
    if (attr(alignment, 'wrapText') === '1') style.wrap = true;
    for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
      const entry = new RegExp(`<${edge}\\b[^>]*(?:/>|>[\\s\\S]*?</${edge}>)`).exec(border)?.[0] ?? '';
      const kind = attr(entry, 'style');
      if (!kind) continue;
      style.borders ??= {};
      style.borders[edge] = { color: readColor(entry) ?? '#64748b', width: kind === 'thick' ? 3 : kind === 'medium' ? 2 : 1, style: kind === 'dashed' || kind === 'dotted' ? kind : 'solid' };
    }
    return style;
  });
}

export function applySheetGeometry(sheet: Worksheet, xml: string): void {
  for (const match of xml.matchAll(/<row\b([^>]*)>/g)) {
    const row = Number(attr(match[1]!, 'r')) - 1; const height = Number(attr(match[1]!, 'ht'));
    if (row >= 0 && row < sheet.rowCount && height > 0) sheet.rowSizes.setSize(row, height / .75);
  }
  for (const match of xml.matchAll(/<col\b([^>]*)\/>/g)) {
    const from = Number(attr(match[1]!, 'min')) - 1; const end = Number(attr(match[1]!, 'max')); const width = Number(attr(match[1]!, 'width'));
    if (from >= 0 && width > 0) for (let column = from; column < Math.min(end, sheet.columnCount); column++) sheet.columnSizes.setSize(column, width * 7);
  }
}
