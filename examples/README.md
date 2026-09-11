# Ezygrid examples

Start at [the example gallery](index.html). Each demo includes a live editor,
suggested interactions, and a copyable setup snippet.

## Run locally

```sh
npm run examples:build
```

Open `examples/index.html` directly, or serve the repository with your local web
server. With WAMP, use `http://localhost/ezygrid/examples/`.

The build generates the browser loader and the React demo. The vanilla examples
are ordinary HTML, CSS, and JavaScript files; there are no application bundles
for them. If loading fails, the page shows setup guidance and disables its controls.

| Example | What to try | JavaScript |
| --- | --- | --- |
| [Initialization](initialization.html) | Compare a declarative host with a configured editor; rescan without losing edits. | [initialization.js](initialization.js) |
| [Formulas](basic.html) | Edit revenue, watch totals, and inspect a cross-sheet target reference. | [basic.js](basic.js) |
| [Inventory](full.html) | Validate quantities, restock products, toggle the chart, and download CSV. | [full.js](full.js) |
| [Lifecycle](initialization-global.html) | Load from the document head, retrieve an instance, destroy it, and initialize again. | [lifecycle.js](lifecycle.js) |
| [React](react.html) | Use the first-party component with a budget worksheet. | [src/react.tsx](src/react.tsx) |

## Script-tag setup

Copy the **complete** `packages/core/dist/browser/` directory to your static
assets, then include `ezygrid.js`. It loads its dependency files relative to itself.

```html
<div id="editor" style="height: 460px"></div>
<script src="/ezygrid/ezygrid.js"></script>
<script>
  Ezygrid.ready.then(() => {
    const editor = new Ezygrid({ target: '#editor' });
  }).catch(console.error);
</script>
```

For automatic initialization, add `data-ezg-editor` to a host. For custom data,
pass `worksheets` to the constructor. Toolbar and formula bar options belong in
`renderer`. Always give the host an explicit height.

Drag the corner handle to select multiple cells without changing their contents.
Hold Alt (Option on macOS) before dragging to autofill instead. Escape cancels a drag.

`examples.css` supplies the gallery layout; `demo.js` handles page status and
copy buttons. Neither file is required to use Ezygrid in your own application.
The React demo intentionally retains its framework bundle.
