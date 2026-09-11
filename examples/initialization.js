ExampleUI.ready(() => {
  const editor = new Ezygrid({
    target: '#editor',
    worksheets: [{ name: 'Order', rows: 50, columns: 8, data: [
      ['Item', 'Quantity', 'Unit price', 'Total'],
      ['Notebook', 2, 12, '=B2*C2'], ['Pen', 5, 3, '=B3*C3'],
    ] }],
  });
  editor.workbook.activeWorksheet.setStyle('A1:D1', { bold: true, background: '#edf3e7' });
  editor.renderer.render();
  document.querySelector('#btn-scan').addEventListener('click', () => {
    const instances = Ezygrid.initAll();
    ExampleUI.status(`Scan complete: ${instances.length} declarative instance reused. Existing edits were preserved.`);
  });
  ExampleUI.status('Both editors are ready. The first came from HTML; the second from JavaScript.');
});
