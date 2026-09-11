/* Shared page controls. The live examples use the public Ezygrid API. */
window.ExampleUI = {
  status(message, state = 'ready') {
    const element = document.querySelector('#status');
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
  },
  fail(error) {
    console.error(error);
    ExampleUI.status('Unable to open this demo. Run npm run examples:build and check that all browser files are available. ' + error.message, 'error');
    document.querySelectorAll('[data-ready]').forEach((button) => { button.disabled = true; });
  },
  ready(setup) {
    if (!window.Ezygrid) {
      ExampleUI.fail(new Error('The Ezygrid loader could not be loaded.'));
      return;
    }
    Ezygrid.ready.then(() => setup()).then(() => {
      document.querySelectorAll('[data-ready]').forEach((button) => { button.disabled = false; });
    }).catch(ExampleUI.fail);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = document.getElementById(button.dataset.copy);
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = 'Copied';
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = 'Selected — press Ctrl+C / ⌘C';
      }
      setTimeout(() => { button.textContent = 'Copy code'; }, 2500);
    });
  });
});
