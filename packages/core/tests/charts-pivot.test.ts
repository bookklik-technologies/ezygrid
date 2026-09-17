import { describe, it, expect } from 'vitest';
import { createGrid, renderChartSVG, readChartData, newPivotSpec } from '../src/index.js';
import type { Worksheet } from '../src/index.js';

function salesSheet(): Worksheet {
  const wb = createGrid(null, {
    worksheets: [{
      rows: 100,
      columns: 10,
      data: [
        ['Month', 'Revenue', 'Cost'],
        ['Jan', 100, 60],
        ['Feb', 120, 70],
        ['Mar', 80, 50],
      ],
    }],
  });
  return wb.activeWorksheet;
}

describe('Charts v1 (§31)', () => {
  it('reads chart data from a range with headers', () => {
    const ws = salesSheet();
    const chartId = ws.addChart({
      type: 'column',
      source: 'A1:C4',
      firstRowIsHeader: true,
      anchor: { row: 6, column: 0 },
      width: 320,
      height: 240,
      title: 'Revenue',
    });
    const chart = ws.charts.all().find((c) => c.id === chartId)!;
    const data = readChartData(ws, chart);
    expect(data.categories).toEqual(['Jan', 'Feb', 'Mar']);
    expect(data.series).toHaveLength(2);
    expect(data.series[0]!.name).toBe('Revenue');
    expect(data.series[0]!.values).toEqual([100, 120, 80]);
  });

  it('renders valid SVG for cartesian and pie charts', () => {
    const data = {
      categories: ['Jan', 'Feb', 'Mar'],
      series: [
        { name: 'Revenue', values: [100, 120, 80] },
        { name: 'Cost', values: [60, 70, 50] },
      ],
    };
    for (const type of ['column', 'bar'] as const) {
      const svg = renderChartSVG(
        { id: 't', type, source: 'A1:C4', anchor: { row: 0, column: 0 }, width: 320, height: 240 },
        data,
      );
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('<rect');
    }
    const line = renderChartSVG(
      { id: 'l', type: 'line', source: 'A1:C4', anchor: { row: 0, column: 0 }, width: 320, height: 240 },
      data,
    );
    expect(line).toContain('<polyline');
    const pie = renderChartSVG(
      { id: 'p', type: 'pie', source: 'A1:C4', anchor: { row: 0, column: 0 }, width: 320, height: 240 },
      { categories: ['a', 'b'], series: [{ name: 'S', values: [3, 1] }] },
    );
    expect(pie).toContain('<path');
  });

  it('removes charts', () => {
    const ws = salesSheet();
    const id = ws.addChart({ type: 'line', source: 'A1:C4', anchor: { row: 6, column: 0 }, width: 300, height: 200 });
    expect(ws.charts.all()).toHaveLength(1);
    ws.charts.remove(id);
    expect(ws.charts.all()).toHaveLength(0);
  });
});

describe('Pivot v1 (§33)', () => {
  it('groups and aggregates values', () => {
    const wb = createGrid(null, {
      worksheets: [{
        rows: 100,
        columns: 10,
        data: [
          ['Region', 'Product', 'Sales'],
          ['North', 'A', 10],
          ['North', 'B', 20],
          ['South', 'A', 30],
          ['South', 'B', 40],
        ],
      }],
    });
    const ws = wb.activeWorksheet;
    const spec = newPivotSpec({
      source: 'A1:C5',
      anchor: 'E1',
      rows: [0],
      values: [{ column: 2, agg: 'SUM' }],
    });
    const result = ws.pivots.compute(ws as Worksheet, spec);
    expect(result.header).toEqual(['Region', 'SUM']);
    expect(result.rows).toEqual([
      ['North', 30],
      ['South', 70],
    ]);
    expect(result.grandTotals).toEqual(['Total', 100]);
  });

  it('refresh writes the pivot output at the anchor', () => {
    const wb = createGrid(null, {
      worksheets: [{
        rows: 100,
        columns: 10,
        data: [
          ['Region', 'Sales'],
          ['North', 10],
          ['South', 30],
          ['North', 5],
        ],
      }],
    });
    const ws = wb.activeWorksheet;
    ws.addPivot({ source: 'A1:B4', anchor: 'D1', rows: [0], values: [{ column: 1, agg: 'AVG' }] });
    expect(ws.getValue(0, 3)).toBe('Region');
    expect(ws.getValue(0, 4)).toBe('AVG');
    expect(ws.getValue(1, 3)).toBe('North');
    expect(ws.getValue(1, 4)).toBe(7.5);
    expect(ws.getValue(2, 3)).toBe('South');
    expect(ws.getValue(3, 3)).toBe('Total');
    expect(ws.getValue(3, 4)).toBe(15);
  });

  it('supports MIN/MAX/COUNT aggregations', () => {
    const wb = createGrid(null, {
      worksheets: [{
        rows: 100,
        columns: 10,
        data: [['K', 'V'], ['a', 3], ['a', 7], ['b', 1]],
      }],
    });
    const ws = wb.activeWorksheet;
    const spec = newPivotSpec({ source: 'A1:B4', anchor: 'D1', rows: [0], values: [{ column: 1, agg: 'MAX' }] });
    expect(ws.pivots.compute(ws as Worksheet, spec).rows).toEqual([['a', 7], ['b', 1]]);
    const spec2 = newPivotSpec({ source: 'A1:B4', anchor: 'D1', rows: [0], values: [{ column: 1, agg: 'COUNT' }] });
    expect(ws.pivots.compute(ws as Worksheet, spec2).rows).toEqual([['a', 2], ['b', 1]]);
  });
});

