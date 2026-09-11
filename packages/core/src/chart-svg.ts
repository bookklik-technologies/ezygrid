import type { ChartData, ChartSpec } from './charts.js';
import { DEFAULT_CHART_COLORS } from './charts.js';

/**
 * Internal SVG chart engine (§31.3). Pure function: ChartSpec + data in,
 * SVG markup out. Chart data stays provider-neutral.
 */
export function renderChartSVG(spec: ChartSpec, data: ChartData): string {
  const width = spec.width ?? 320;
  const height = spec.height ?? 240;
  const colors = spec.colors ?? DEFAULT_CHART_COLORS;
  const padding = { top: 28, right: 12, bottom: 32, left: 44 };
  const plotW = Math.max(10, width - padding.left - padding.right);
  const plotH = Math.max(10, height - padding.top - padding.bottom);

  const title = spec.title
    ? `<text x="${width / 2}" y="16" text-anchor="middle" font-size="12" fill="currentColor">${escapeXml(spec.title)}</text>`
    : '';

  switch (spec.type) {
    case 'pie':
    case 'doughnut':
      return pieSVG(spec, data, colors, title, width, height);
    default:
      return cartesianSVG(spec, data, colors, title, width, height, padding, plotW, plotH);
  }
}

function cartesianSVG(
  spec: ChartSpec,
  data: ChartData,
  colors: string[],
  title: string,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  plotW: number,
  plotH: number,
): string {
  const allValues = data.series.flatMap((s) => s.values);
  const maxV = Math.max(1, ...allValues);
  const categoryCount = Math.max(1, data.categories.length);
  const bandW = plotW / categoryCount;
  const bandH = plotH / categoryCount;

  let axes = `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotH}" stroke="currentColor" stroke-opacity="0.3"/>
<line x1="${padding.left}" x2="${padding.left + plotW}" y1="${padding.top + plotH}" y2="${padding.top + plotH}" stroke="currentColor" stroke-opacity="0.3"/>
<text x="${padding.left - 4}" y="${padding.top + 4}" text-anchor="end" font-size="9" fill="currentColor" fill-opacity="0.7">${formatTick(maxV)}</text>
<text x="${padding.left - 4}" y="${padding.top + plotH + 4}" font-size="9" fill="currentColor" fill-opacity="0.7">0</text>`;

  let content = '';
  data.series.forEach((series, seriesIndex) => {
    const color = colors[seriesIndex % colors.length];
    if (spec.type === 'line') {
      const points = series.values
        .map((v, i) => {
          const x = padding.left + bandW * i + bandW / 2;
          const y = padding.top + plotH - (v / maxV) * plotH;
          return `${round(x)},${round(y)}`;
        })
        .join(' ');
      content += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>`;
      series.values.forEach((v, i) => {
        const x = padding.left + bandW * i + bandW / 2;
        const y = padding.top + plotH - (v / maxV) * plotH;
        content += `<circle cx="${round(x)}" cy="${round(y)}" r="3" fill="${color}"/>`;
      });
    } else {
      // column or bar
      const groupCount = data.series.length;
      const barW = (bandW * 0.7) / groupCount;
      series.values.forEach((v, i) => {
        const barH = (v / maxV) * plotH;
        if (spec.type === 'bar') {
          const y = padding.top + bandH * i + (bandH - barW * groupCount) / 2 + barW * seriesIndex;
          content += `<rect x="${padding.left}" y="${round(y)}" width="${round((v / maxV) * plotW)}" height="${round(barW)}" fill="${color}"/>`;
        } else {
          const x = padding.left + bandW * i + (bandW - barW * groupCount) / 2 + barW * seriesIndex;
          content += `<rect x="${round(x)}" y="${round(padding.top + plotH - barH)}" width="${round(barW)}" height="${round(barH)}" fill="${color}"/>`;
        }
      });
    }
  });

  data.categories.forEach((category, i) => {
    const x = spec.type === 'bar'
      ? padding.left + 4
      : padding.left + bandW * i + bandW / 2;
    const y = spec.type === 'bar'
      ? padding.top + bandH * i + bandH / 2 + 3
      : padding.top + plotH + 14;
    content += `<text x="${round(x)}" y="${round(y)}" text-anchor="${spec.type === 'bar' ? 'start' : 'middle'}" font-size="9" fill="currentColor" fill-opacity="0.8">${escapeXml(category)}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${title}${axes}${content}</svg>`;
}

function pieSVG(
  spec: ChartSpec,
  data: ChartData,
  colors: string[],
  title: string,
  width: number,
  height: number,
): string {
  const values = data.series[0]?.values ?? [];
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = width / 2;
  const cy = height / 2 + 6;
  const radius = Math.min(width, height) / 2 - 12;
  const inner = spec.type === 'doughnut' ? radius * 0.55 : 0;

  let angle = -Math.PI / 2;
  let paths = '';
  values.forEach((v, i) => {
    const slice = (v / total) * Math.PI * 2;
    const end = angle + slice;
    paths += slicePath(cx, cy, radius, inner, angle, end, colors[i % colors.length]!);
    angle = end;
  });

  const legend = data.series[0]?.name
    ? `<text x="${cx}" y="${height - 6}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.8">${escapeXml(data.series[0]!.name)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${title}${paths}</svg>`;
}

function slicePath(
  cx: number,
  cy: number,
  radius: number,
  inner: number,
  start: number,
  end: number,
  color: string,
): string {
  const largeArc = end - start > Math.PI ? 1 : 0;
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  if (inner > 0) {
    const ix1 = cx + inner * Math.cos(end);
    const iy1 = cy + inner * Math.sin(end);
    const ix2 = cx + inner * Math.cos(start);
    const iy2 = cy + inner * Math.sin(start);
    return `<path d="M${round(x1)},${round(y1)} A${round(radius)},${round(radius)} 0 ${largeArc} 1 ${round(x2)},${round(y2)} L${round(ix1)},${round(iy1)} A${round(inner)},${round(inner)} 0 ${largeArc} 0 ${round(ix2)},${round(iy2)} Z" fill="${color}"/>`;
  }
  return `<path d="M${round(cx)},${round(cy)} L${round(x1)},${round(y1)} A${round(radius)},${round(radius)} 0 ${largeArc} 1 ${round(x2)},${round(y2)} Z" fill="${color}"/>`;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatTick(v: number): string {
  return v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10);
}
