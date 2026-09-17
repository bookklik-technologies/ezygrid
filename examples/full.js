ExampleUI.ready(() => {
  const editor = new Ezygrid({
    target: '#grid',
    renderer: { toolbar: true, formulaBar: true },
    worksheets: [{ name: 'Inventory', rows: 100, columns: 10, data: [
      ['SKU', 'Item', 'Qty', 'Price', 'Status'],
      ['A-100', 'Widget', 25, 4.5, 'in stock'],
      ['A-101', 'Gadget', 3, 19.99, 'low'],
      ['B-200', 'Sprocket', 120, 2.25, 'in stock'],
      ['B-102', 'Doohickey', 0, 8, 'out'],
    ] }],
  });
  const sheet = editor.workbook.activeWorksheet;
  sheet.columnSizes.setSize(1, 130);
  sheet.setStyle('A1:E1', { bold: true, background: '#e6fff4' });
  sheet.setNumberFormat('D2:D5', '#,##0.00');
  sheet.addValidation({ range: 'C2:C50', type: 'number', action: 'reject', min: 0, max: 1000, message: 'Quantity must be between 0 and 1,000.' });
  sheet.addValidation({ range: 'E2:E50', type: 'list', action: 'reject', values: ['in stock', 'low', 'out'] });
  sheet.conditionalFormats.add({ range: 'E2:E50', type: 'containsText', text: 'low', style: { background: '#fff2ce', color: '#78540a' }, priority: 1 });
  sheet.conditionalFormats.add({ range: 'E2:E50', type: 'containsText', text: 'out', style: { background: '#ffe9e1', color: '#9a2d22', bold: true }, priority: 1 });
  sheet.addTable({ name: 'InventoryTable', range: 'A1:E5' });
  const chartOptions = { type: 'column', source: 'B1:C5', firstRowIsHeader: true, anchor: { row: 7, column: 0 }, width: 440, height: 230, title: 'Units in stock' };
  let chartId = sheet.addChart(chartOptions);
  sheet.addShape({ shape: 'textbox', text: 'Quantities accept 0–1,000. Edit the cells above.', anchor: { row: 19, column: 0 }, width: 440, height: 32, fill: '#e6fff4', stroke: '#d8e2ec' });
  editor.renderer.render();

  function refresh() {
    let units = 0;
    let value = 0;
    for (let row = 1; row <= 4; row++) {
      const quantity = Number(sheet.getValue(row, 2));
      const price = Number(sheet.getValue(row, 3));
      units += quantity;
      value += quantity * price;
    }
    document.querySelector('#units').textContent = Number.isFinite(units) ? units.toLocaleString('en') : '—';
    document.querySelector('#value').textContent = Number.isFinite(value) ? value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  }
  editor.workbook.onOperation(refresh);
  refresh();
  document.querySelector('#btn-fill').addEventListener('click', () => {
    sheet.setValue(1, 2, 40);
    sheet.setValue(2, 2, 20);
    sheet.setValue(2, 4, 'in stock');
    ExampleUI.status('Restocked Widget and Gadget. The chart and totals now reflect the new quantities.');
  });
  document.querySelector('#btn-csv').addEventListener('click', () => {
    const blob = new Blob([sheet.toCsv({ escapeFormulas: true })], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inventory.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ExampleUI.status('Inventory CSV download started.');
  });
  document.querySelector('#btn-chart').addEventListener('click', (event) => {
    if (chartId) {
      sheet.charts.remove(chartId);
      chartId = null;
      event.currentTarget.textContent = 'Show chart';
    } else {
      chartId = sheet.addChart(chartOptions);
      event.currentTarget.textContent = 'Hide chart';
    }
    editor.renderer.render();
    ExampleUI.status(chartId ? 'Chart restored.' : 'Chart hidden. Your inventory data is unchanged.');
  });
  ExampleUI.status('Ready. Quantities accept values from 0 to 1,000. Try editing C2.');
});
