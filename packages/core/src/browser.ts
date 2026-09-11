import type { Ezygrid as EzygridConstructor } from './ezy-grid.js';

/** Available through the classic browser loader; package imports stay synchronous. */
export type BrowserEzygrid = typeof EzygridConstructor & {
  readonly ready: Promise<BrowserEzygrid>;
};

declare global {
  var Ezygrid: BrowserEzygrid;
}
