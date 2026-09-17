import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Spreadsheet } from '@ezygrid/react';

function App() {
  return createElement(Spreadsheet, {
    worksheets: [
      {
        name: 'Budget',
        rows: 200,
        columns: 10,
        data: [
          ['Department', 'Budget', 'Actual', 'Variance'],
          ['Engineering', 100000, 92000, '=B2-C2'],
          ['Marketing', 40000, 45000, '=B3-C3'],
          ['Ops', 30000, 27000, '=B4-C4'],
        ],
      },
    ],
    renderer: { formulaBar: true, toolbar: true },
    style: { height: '100%' },
    onReady: (workbook, renderer) => {
      const sheet = workbook.activeWorksheet;
      sheet.columnSizes.setSize(0, 160);
      sheet.setStyle('A1:D1', { bold: true, background: '#e6f7ee' });
      sheet.setNumberFormat('B2:D4', '#,##0');
      renderer.render();
      const status = document.querySelector('#status');
      if (status) status.textContent = 'Ready. Edit actual spend in column C to recalculate variance.';
    },
  });
}

createRoot(document.querySelector('#root')!).render(createElement(App));
