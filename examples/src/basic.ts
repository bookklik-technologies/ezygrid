import { createGrid, GridRenderer } from '../../packages/core/src/index.js';

const workbook = createGrid(null, {
  worksheets: [
    {
      name: 'Sales',
      rows: 200,
      columns: 12,
      data: [
        ['Month', 'Revenue', 'Cost', 'Profit'],
        ['Jan', 12000, 7000, '=B2-C2'],
        ['Feb', 15000, 8000, '=B3-C3'],
        ['Mar', 9000, 5000, '=B4-C4'],
        ['Q1', '=SUM(B2:B4)', '=SUM(C2:C4)', '=B5-C5'],
      ],
    },
    {
      name: 'People',
      rows: 100,
      columns: 8,
      data: [
        ['Name', 'Role', 'Score'],
        ['Ada', 'Engineer', 97],
        ['Grace', 'Admiral', 95],
        ['Linus', 'Kernel', 90],
      ],
    },
  ],
});

const sales = workbook.getWorksheet('Sales')!;
sales.setStyle('A1:D1', { bold: true, background: '#eef2ff' });
sales.setStyle('D2:D5', { color: '#15803d', bold: true });
sales.setNumberFormat('B2:C4', '#,##0');
sales.setValue(6, 0, 'Total revenue');
sales.setValue(6, 1, '=SUM(Sales!B2:B4)');

(document.querySelector('#status') as HTMLElement).textContent =
  `Workbook ${workbook.id} — ${workbook.worksheets.length} sheets, formulas live.`;

// Attach the DOM renderer to the host element (the model is authoritative;
// the grid is a projection of it).
new GridRenderer(document.querySelector('#grid'), workbook);
