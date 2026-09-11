import { it } from 'vitest';
import { createGrid, buildPrintHtml } from '../src/index.js';
it('debug', () => {
  const wb = createGrid(null, { worksheets: [{ rows: 5, columns: 5 }] });
  const html = buildPrintHtml(wb, 'Sheet1');
  const m = /@page[^}]*/.exec(html);
  console.log('PAGE:', JSON.stringify(m?.[0]));
});
