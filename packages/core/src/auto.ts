import { Ezygrid } from './ezy-grid.js';

export { Ezygrid } from './ezy-grid.js';

// This opt-in entry point is also safe to import during server-side rendering.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Ezygrid.initAll(), { once: true });
  } else {
    Ezygrid.initAll();
  }
}
