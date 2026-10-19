import type { Worksheet } from '../workbook.js';
import { DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT } from '../workbook.js';
import { formatValue } from '../format.js';
import type { EditorShell } from './editor-shell.js';

export type LayoutAxis = 'row' | 'column';
export type HeaderLevels = (string | { title: string; span: number })[][];
export interface HeaderGroup { label: string; from: string; to: string }

export function columnName(index: number): string {
  if (index < 0 || !Number.isInteger(index)) return '?';
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
  return label;
}

export function columnIndex(label: string): number {
  if (!/^[A-Z]+$/i.test(label.trim())) return -1;
  let index = 0;
  for (const character of label.trim().toUpperCase()) index = index * 26 + character.charCodeAt(0) - 64;
  return index - 1;
}

export function readHeaderGroups(levels: Worksheet['nestedHeaders']): HeaderGroup[][] {
  return levels.map(level => {
    let column = 0;
    return level.map(group => {
      const span = typeof group === 'string' ? 1 : group.span;
      const item = { label: typeof group === 'string' ? group : group.title, from: columnName(column), to: columnName(column + span - 1) };
      column += span; return item;
    });
  });
}

export function writeHeaderGroups(levels: HeaderGroup[][], columnCount: number): HeaderLevels {
  return levels.map((level, levelIndex) => {
    const groups = level.map(group => ({ title: group.label, start: columnIndex(group.from), end: columnIndex(group.to) })).sort((a, b) => a.start - b.start);
    const result: HeaderLevels[number] = []; let next = 0;
    for (const group of groups) {
      if (group.start < 0 || group.end < group.start || group.end >= columnCount) throw new Error(`Level ${levelIndex + 1}: choose valid first and last columns inside this worksheet.`);
      if (group.start < next) throw new Error(`Level ${levelIndex + 1}: header groups cannot overlap.`);
      if (group.start > next) result.push({ title: '', span: group.start - next });
      result.push({ title: group.title, span: group.end - group.start + 1 }); next = group.end + 1;
    }
    return result;
  });
}

/** Update UI-managed header ranges alongside a column operation, in the same transaction. */
export function shiftHeaderGroups(levels: Worksheet['nestedHeaders'], at: number, count: number, insert: boolean): HeaderLevels {
  return levels.map(level => {
    let column = 0; let next = 0; const result: HeaderLevels[number] = [];
    for (const item of level) {
      const span = typeof item === 'string' ? 1 : item.span;
      const title = typeof item === 'string' ? item : item.title;
      let start = column; let end = column + span; column = end;
      if (insert) { if (start >= at) start += count; if (end > at) end += count; }
      else {
        const edge = (position: number) => position <= at ? position : position >= at + count ? position - count : at;
        start = edge(start); end = edge(end);
      }
      if (end <= start) continue;
      if (start > next) result.push({ title: '', span: start - next });
      result.push({ title, span: end - start }); next = end;
    }
    return result;
  });
}

export function commitLayout(host: EditorShell, action: () => void): void {
  host.renderer.commitEdits();
  host.workbook.transaction(action);
  host.renderer.render();
}

/** Fit populated bands and reset empty custom-sized bands, without scanning an entire axis. */
export function fittedSizes(sheet: Worksheet, axis: LayoutAxis, start: number, end: number, doc: Document, fontFamily: string): Map<number, number> {
  const context = doc.createElement('canvas').getContext('2d');
  const sizes = new Map<number, number>();
  sheet.cells.forEach((row, column) => {
    const index = axis === 'row' ? row : column;
    if (index < start || index > end || sheet.merges.findAt(row, column)) return;
    const text = formatValue(sheet.getValue(row, column), sheet.getNumberFormat(row, column));
    if (!text) return;
    const style = { ...sheet.getStyle(row, column), ...sheet.conditionalFormats.evaluate(sheet, row, column) };
    const table = sheet.tables.at(row, column);
    const bold = table?.totalRow && row === table.range.bottom ? true : style.bold ?? (table?.headerRow && row === table.range.top);
    const fontSize = style.fontSize ?? 13;
    if (context) context.font = `${style.italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${style.fontFamily ?? fontFamily}`;
    const lines = text.split(/\r?\n/);
    const widths = lines.map(line => context?.measureText(line).width ?? line.length * fontSize * .6);
    const lineCount = widths.reduce((sum, width) => sum + (style.wrap ? Math.max(1, Math.ceil(width / Math.max(1, sheet.columnSizes.sizeOf(column) - 12))) : 1), 0);
    const size = axis === 'row' ? lineCount * fontSize * 1.45 + 4 : Math.max(...widths) + 16;
    sizes.set(index, Math.max(sizes.get(index) ?? (axis === 'row' ? 16 : 24), Math.min(2000, Math.ceil(size))));
  });
  const current = axis === 'row' ? sheet.rowSizes : sheet.columnSizes;
  for (const index of current.getCustomSizes().keys()) if (index >= start && index <= end && !sizes.has(index)) sizes.set(index, axis === 'row' ? DEFAULT_ROW_HEIGHT : DEFAULT_COLUMN_WIDTH);
  return sizes;
}
