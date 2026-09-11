import { createGrid, GridRenderer, buildThemeCss } from '../../packages/core/src/index.js';

// Theme builder demo: custom accent injected as CSS variables.
const style = document.createElement('style');
style.textContent = buildThemeCss({ selection: '#7c3aed', selectionSoft: 'rgba(124,58,237,0.10)' });
document.head.appendChild(style);

const wb = createGrid(null, {
  toolbar: true,
  formulaBar: true,
  worksheets: [
    {
      name: 'Inventory',
      rows: 300,
      columns: 10,
      data: [
        ['SKU', 'Item', 'Qty', 'Price', 'Status'],
        ['A-100', 'Widget', 25, 4.5, 'in stock'],
        ['A-101', 'Gadget', 3, 19.99, 'low'],
        ['B-200', 'Sprocket', 120, 2.25, 'in stock'],
        ['B-102', 'Doohickey', 0, 8.0, 'out'],
      ],
    },
  ],
});

const sheet = wb.activeWorksheet;

// Number formats
sheet.setStyle('A1:E1', { bold: true, background: '#f4f4f5' });
sheet.setNumberFormat('D2:D5', '#,##0.00');
sheet.setStyle('E2:E5', { align: 'center' });

// Validation: Qty must be 0..1000, Status from a list
sheet.addValidation({ range: 'C2:C50', type: 'number', action: 'reject', min: 0, max: 1000, message: 'Qty must be 0..1000' });
sheet.addValidation({ range: 'E2:E50', type: 'list', action: 'reject', values: ['in stock', 'low', 'out'] });

// Conditional formatting: highlight low/out rows
sheet.conditionalFormats.add({
  range: 'E2:E50',
  type: 'containsText',
  text: 'low',
  style: { background: '#fef9c3', color: '#854d0e' },
  priority: 1,
});
sheet.conditionalFormats.add({
  range: 'E2:E50',
  type: 'containsText',
  text: 'out',
  style: { background: '#fee2e2', color: '#b91c1c', bold: true },
  priority: 1,
});

// Structured table + chart
sheet.addTable({ name: 'InventoryTable', range: 'A1:E5' });
const chartId = sheet.addChart({
  type: 'column',
  source: 'A1:D4',
  firstRowIsHeader: true,
  anchor: { row: 7, column: 0 },
  width: 480,
  height: 260,
  title: 'Inventory value by item',
});

// Media overlay: a shape
sheet.addShape({ shape: 'textbox', text: 'Filtered rows are validated', anchor: { row: 13, column: 3 }, width: 180, height: 36, fill: '#eef2ff', stroke: '#c7d2fe' });

// Buttons wired to public APIs
document.querySelector('#btn-fill')?.addEventListener('click', () => {
  sheet.setValue(1, 3, 10);
  sheet.setValue(2, 3, 20);
});
document.querySelector('#btn-csv')?.addEventListener('click', () => {
  const csv = sheet.toCsv({ escapeFormulas: true });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'inventory.csv';
  a.click();
});
document.querySelector('#btn-chart')?.addEventListener('click', () => {
  sheet.charts.remove(chartId);
  location.hash = 'chart-removed';
});

new GridRenderer(document.querySelector('#grid'), wb);

(document.querySelector('#status') as HTMLElement).textContent =
  'Try: edit Qty (validated), use the fill handle, right-click for context menu, watch the chart.';

