# React

`@ezygrid/react` ships a thin, uncontrolled `<Spreadsheet>` component (peer dependencies: `react` and `react-dom` **>= 18**).

## Install

```bash
pnpm add @ezygrid/react @ezygrid/core @ezygrid/theme-default
```

## Usage

```tsx
import { Spreadsheet } from '@ezygrid/react';
import '@ezygrid/theme-default/index.css';

export function Budget() {
  return (
    <Spreadsheet
      worksheets={[{ name: 'Budget', rows: 200, columns: 10, data: [['A', 'B'], [1, '=B1*2']] }]}
      renderer={{ formulaBar: true, toolbar: true }}
      style={{ height: 480 }}
      onReady={(workbook, renderer) => console.log('ready', workbook, renderer)}
    />
  );
}
```

## Props

`SpreadsheetProps` flattens workbook options at the top level plus:

| Prop | Type | Description |
| --- | --- | --- |
| `worksheets`, `id`, `extensions` | `CreateGridOptions` | Workbook options |
| `renderer` | `GridRendererOptions` | Presentation options |
| `onReady` | `(workbook: Workbook, renderer: GridRenderer) => void` | Called once mounted |
| `className` | `string` | Host container class |
| `style` | `CSSProperties` | Host container styles (give it a height) |

## Uncontrolled by design

The workbook model owns state. Parent re-renders **never** repaint the grid; the component mounts once and hands you the `workbook` handle. Mutate data through the model, not props:

```tsx
const ref = useRef<Workbook>();

<Spreadsheet onReady={(workbook) => { ref.current = workbook; }} />

// elsewhere
ref.current?.activeWorksheet.setValue(0, 0, 'Hello');
```

## SSR

The component is SSR-safe: nothing touches the DOM until mounted on the client.
