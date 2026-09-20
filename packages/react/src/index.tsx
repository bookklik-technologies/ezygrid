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
  /**
   * Called once after the workbook and renderer are created (client only).
   * May return a cleanup function, invoked before the renderer is destroyed
   * — use it to unsubscribe listeners taken against the workbook so a
   * StrictMode double-mount does not leak them onto the discarded instance.
   */
  onReady?: (workbook: Workbook, renderer: GridRenderer) => void | (() => void);
  className?: string;
  style?: CSSProperties;
}

/**
 * React wrapper (§46.1): thin and uncontrolled — the workbook model owns
 * state; React re-renders never touch the grid. SSR-safe: all DOM work
 * happens inside an effect, and cleanup destroys the renderer. Under
 * StrictMode the effect runs twice (M8): the first onReady instance is
 * discarded, so consumers must tear down subscriptions they take in
 * onReady via the returned renderer/workbook — keep a cleanup from
 * onReady and call it before the renderer is destroyed.
 */
export function Spreadsheet({ renderer: rendererOptions, onReady, className, style, ...config }: SpreadsheetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const workbook = createGrid(container, config);
    const renderer = new GridRenderer(container, workbook, rendererOptions);
    const disposeReady = onReady?.(workbook, renderer);
    return () => {
      if (typeof disposeReady === 'function') disposeReady();
      renderer.destroy();
    };
    // The grid intentionally mounts once; the model owns updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} style={style} />;
}
