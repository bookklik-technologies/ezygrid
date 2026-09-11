import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Spreadsheet } from '@ezygrid/react';

function App() {
  return createElement('div', null,
    createElement('h2', null, 'Ezygrid + React 19'),
    createElement(Spreadsheet, {
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
      style: { height: '420px', border: '1px solid #e4e4e7' },
      onReady: (workbook) => {
        const sheet = workbook.activeWorksheet;
        sheet.setStyle('A1:D1', { bold: true, background: '#eef2ff' });
        sheet.setNumberFormat('B2:D4', '#,##0');
      },
    }),
  );
}

createRoot(document.querySelector('#root')!).render(createElement(App));
