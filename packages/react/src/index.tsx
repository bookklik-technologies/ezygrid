import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  createGrid,
  GridRenderer,
  type Workbook,
  type CreateGridOptions,
  type GridRendererOptions,
} from '@ezygrid/core';

export interface SpreadsheetProps extends CreateGridOptions {
  /** Options forwarded to the DOM renderer (toolbar, formula bar, zoom...). */
  renderer?: GridRendererOptions;
  /** Called once after the workbook and renderer are created (client only). */
  onReady?: (workbook: Workbook, renderer: GridRenderer) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * React wrapper (§46.1): thin and uncontrolled — the workbook model owns
 * state; React re-renders never touch the grid. SSR-safe: all DOM work
 * happens inside an effect, and cleanup destroys the renderer.
 */
export function Spreadsheet({ renderer: rendererOptions, onReady, className, style, ...config }: SpreadsheetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const workbook = createGrid(container, config);
    const renderer = new GridRenderer(container, workbook, rendererOptions);
    onReady?.(workbook, renderer);
    return () => {
      renderer.destroy();
    };
    // The grid intentionally mounts once; the model owns updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} style={style} />;
}
