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

export const DEFAULT_CHART_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#7c3aed', '#0891b2'];

/**
 * Charts v1 (§31): provider-neutral ChartSpec bound to worksheet ranges,
 * rendered by an internal SVG engine into the media overlay.
 */
export class ChartEngine {
  private charts: ChartSpec[] = [];

  add(spec: Omit<ChartSpec, 'id'>): ChartSpec {
    const full: ChartSpec = { ...spec, id: createId('chart') };
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
  series: { name: string; values: number[] }[];
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
    const values: number[] = [];
    for (let r = rect.top + headerOffset; r <= rect.bottom; r++) {
      const v = worksheet.getValue(r, c);
      if (typeof v === 'number') values.push(v);
    }
    series.push({ name: name === null || name === undefined ? `Series ${c - rect.left}` : String(name), values });
  }
  return { categories, series };
}

