import type { CellStyle } from '../workbook.js';

/** Shared cell typography and borders, including recycled and frozen cells. */
export function applyStyle(element: HTMLElement, style: CellStyle, zoom = 1): void {
  const css = element.style;
  css.fontFamily = style.fontFamily ?? 'inherit';
  css.fontSize = style.fontSize ? `${style.fontSize * zoom}px` : '';
  css.whiteSpace = style.wrap ? 'pre-wrap' : 'pre';
  css.overflowWrap = style.wrap ? 'anywhere' : 'normal';
  css.lineHeight = '1.45';
  css.display = 'flex';
  css.flexDirection = 'column';
  css.justifyContent = style.verticalAlign === 'bottom' ? 'flex-end' : style.verticalAlign === 'middle' ? 'center' : 'flex-start';
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    const border = style.borders?.[edge];
    css.setProperty(`border-${edge}`, border
      ? `${border.width}px ${border.style} ${border.color}`
      : border === null ? 'none' : edge === 'right' || edge === 'bottom' ? '1px solid var(--ezygrid-gridline, #e2e8f0)' : 'none');
  }
}
