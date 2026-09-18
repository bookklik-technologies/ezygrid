import { createId } from '@ezygrid/model';
import { parseRange } from '@ezygrid/model';
import type { Worksheet } from './workbook.js';

export type ChartType = 'column' | 'bar' | 'line' | 'pie' | 'doughnut';

export interface ChartSeries {
  name?: string;
  /** Column index in the source range for this series. */
  column: number;
}

export interface ChartSpec extends FloatingPosition {
  id: string;
  type: ChartType;
  source: string;
  /** Whether the first row holds series names / categories. */
  firstRowIsHeader?: boolean;
  title?: string;
  colors?: string[];
}

export interface FloatingPosition {
  anchor: { row: number; column: number };
  offsetX?: number;
  offsetY?: number;
  width?: number;
  height?: number;
}

export const DEFAULT_CHART_COLORS = ['#2563eb', '#00b374', '#0ea5e9', '#00ff99', '#1e40af', '#00875a'];

/**
 * Validate a chart color at the public boundary (F01): only plain CSS color
 * values are accepted, so a string like `red" onpointerover="alert(1)`
 * can never reach an SVG attribute.
 */
export function sanitizeChartColor(value: string): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return text;
  if (/^[a-z]{1,32}$/i.test(text)) return text.toLowerCase();
  if (/^(rgb|rgba|hsl|hsla)\(\s*[\d\s.,%/]+\)$/i.test(text)) return text.replace(/\s+/g, ' ');
  return null;
}

/**
 * Charts v1 (§31): provider-neutral ChartSpec bound to worksheet ranges,
 * rendered by an internal SVG engine into the media overlay.
 */
export class ChartEngine {
  private charts: ChartSpec[] = [];

  add(spec: Omit<ChartSpec, 'id'>): ChartSpec {
    const colors = Array.isArray(spec.colors)
      ? spec.colors
          .map((color) => sanitizeChartColor(String(color)))
          .filter((color): color is string => color !== null)
      : undefined;
    const full: ChartSpec = {
      ...spec,
      colors: colors && colors.length > 0 ? colors : undefined,
      id: (spec as Partial<ChartSpec>).id ?? createId('chart'),
    };
    this.charts.push(full);
    return full;
  }

  remove(id: string): void {
    this.charts = this.charts.filter((c) => c.id !== id);
  }

  all(): readonly ChartSpec[] {
    return this.charts;
  }
}

export interface ChartData {
  categories: string[];
  /** One value slot per category; null = missing/nonnumeric (F22). */
  series: { name: string; values: (number | null)[] }[];
}

/** Read a rectangular range as chart data (first row = headers). */
export function readChartData(worksheet: Worksheet, spec: ChartSpec): ChartData {
  const rect = parseRange(spec.source);
  const headerOffset = spec.firstRowIsHeader === false ? 0 : 1;
  const categories: string[] = [];
  for (let r = rect.top + headerOffset; r <= rect.bottom; r++) {
    const v = worksheet.getValue(r, rect.left);
    categories.push(v === null || v === undefined ? '' : String(v));
  }
  const series: ChartData['series'] = [];
  for (let c = rect.left + 1; c <= rect.right; c++) {
    const name = headerOffset && worksheet.getValue(rect.top, c);
    const values: (number | null)[] = [];
    for (let r = rect.top + headerOffset; r <= rect.bottom; r++) {
      const v = worksheet.getValue(r, c);
      // Preserve the slot so values never shift onto the wrong category (F22).
      values.push(typeof v === 'number' && Number.isFinite(v) ? v : null);
    }
    series.push({ name: name === null || name === undefined ? `Series ${c - rect.left}` : String(name), values });
  }
  return { categories, series };
}

