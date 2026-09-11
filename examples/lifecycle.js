ExampleUI.ready(() => {
  const target = document.querySelector('#editor');
  let editor = Ezygrid.getInstance(target);
  const toggle = document.querySelector('#btn-toggle');
  const scan = document.querySelector('#btn-scan');
  function seed() {
    const sheet = editor.workbook.activeWorksheet;
    sheet.columnSizes.setSize(0, 250);
    sheet.setValue(0, 0, 'Edit this cell, then rescan');
    sheet.setValue(1, 0, 'Your edits survive a rescan.');
    editor.renderer.render();
  }
  seed();
  toggle.addEventListener('click', () => {
    if (editor) {
      editor.destroy();
      editor = undefined;
      toggle.textContent = 'Initialize again';
      scan.disabled = true;
      ExampleUI.status('Editor destroyed. Its DOM and listeners were cleaned up; the host div remains.');
    } else {
      [editor] = Ezygrid.initAll(target);
      seed();
      toggle.textContent = 'Destroy editor';
      scan.disabled = false;
      ExampleUI.status('A fresh editor was initialized in the same host.');
    }
  });
  scan.addEventListener('click', () => {
    const [found] = Ezygrid.initAll(target);
    ExampleUI.status(found === editor ? 'Same instance returned. Your edits are preserved.' : 'Editor initialized.');
  });
  ExampleUI.status('Ready. This loader was included in the document head.');
});
