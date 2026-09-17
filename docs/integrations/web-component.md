# Web component

`@ezygrid/web-component` defines the `<ezy-grid>` custom element. Importing it in a browser self-registers the element; the module is SSR-safe (`defineEzyGridElement(tag)` and `createEzyGridElementClass()` are exported for custom tags).

## Usage

```html
<script type="module">
  import '@ezygrid/web-component';
  import '@ezygrid/theme-default/index.css';

  document.querySelector('ezy-grid').setConfig({
    worksheets: [{ name: 'Sheet1', data: [['hello', '=B1&" world"']] }],
  });
</script>

<ezy-grid style="height: 480px"></ezy-grid>
```

## Element API

| Member | Description |
| --- | --- |
| `workbook` (getter) | The `Workbook` instance, once configured |
| `renderer` (getter) | The `GridRenderer` |
| `setConfig(config: CreateGridOptions)` | Set workbook options |
| `setRendererOptions(options: GridRendererOptions)` | Set presentation options |

```js
const grid = document.querySelector('ezy-grid');
grid.setRendererOptions({ formulaBar: true, toolbar: true });
grid.workbook.activeWorksheet.setValue(0, 0, 'Hello');
```

The element hosts the grid DOM itself and picks up a CSS height from your styles.
