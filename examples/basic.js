ExampleUI.ready(() => {
  const editor = new Ezygrid({
    target: '#grid',
    worksheets: [
      { name: 'Sales', rows: 100, columns: 10, data: [
        ['Month', 'Revenue', 'Cost', 'Profit'],
        ['January', 12000, 7000, '=B2-C2'],
        ['February', 15000, 8000, '=B3-C3'],
        ['March', 9000, 5000, '=B4-C4'],
        ['Q1 total', '=SUM(B2:B4)', '=SUM(C2:C4)', '=B5-C5'],
        [], ['Quarterly target', '=Targets!B2'], ['Target remaining', '=B7-B5'],
      ] },
      { name: 'Targets', data: [['Quarter', 'Revenue target'], ['Q1', 45000]] },
    ],
  });
  const sheet = editor.workbook.activeWorksheet;
  sheet.columnSizes.setSize(0, 160);
  sheet.setStyle('A1:D1', { bold: true, background: '#edf3e7' });
  sheet.setStyle('A5:D5', { bold: true, background: '#f1f5ed' });
  sheet.setStyle('D2:D5', { color: '#176b50', bold: true });
  sheet.setNumberFormat('B2:D5', '#,##0');
  sheet.setNumberFormat('B7:B8', '#,##0');
  editor.renderer.render();

  const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
  function refresh() {
    for (const [id, column] of [['revenue', 1], ['cost', 2], ['profit', 3]]) {
      const value = sheet.getValue(4, column);
      document.getElementById(id).textContent = typeof value === 'number' ? formatter.format(value) : String(value ?? '—');
    }
  }
  editor.workbook.onOperation(refresh);
  refresh();
  document.querySelector('#btn-update').addEventListener('click', () => {
    sheet.setValue(2, 1, 18000);
    ExampleUI.status('February revenue is now 18,000. Profit and the Q1 totals recalculated.');
  });
  document.querySelector('#btn-reset').addEventListener('click', () => {
    [12000, 15000, 9000].forEach((value, index) => sheet.setValue(index + 1, 1, value));
    ExampleUI.status('Original revenue values restored.');
  });
  ExampleUI.status('Ready. Double-click a cell to edit, or select it and press F2.');
});
