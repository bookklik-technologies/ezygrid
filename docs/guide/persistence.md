# Persistence

Workbooks serialize to a versioned JSON format and restore losslessly.

## Save

```ts
const json = workbook.toJSON();
localStorage.setItem('my-grid', JSON.stringify(json));
```

## Load

```ts
import { Workbook } from '@ezygrid/core';

const data = JSON.parse(localStorage.getItem('my-grid'));
const workbook = Workbook.fromJSON(data);
```

## Format

```json
{
  "format": "ezygrid",
  "version": 2,
  "id": "…",
  "definedNames": { "…": {} },
  "worksheets": [ "…": {} ]
}
```

Each worksheet snapshot includes: `id`, `name`, `rows`, `columns`, `cells` (`[row, col, { raw?, formula? }]` triples), `styles`, `numberFormats`, `notes`, `cellEditors`, `merges`, `hiddenRows`, `hiddenColumns`, `rowSizes`, `columnSizes`, `rowGroups`, `nestedHeaders`, `tables`, `validations`, `conditionalFormats`, `charts`, `media`.

## Guarantees and limits

- `fromJSON` **strictly checks** `format` and `version`; mismatched data throws.
- Loading starts with a **clean history** — undo state is not serialized.
- Custom predicate callbacks (validation `predicate`, conditional format `predicate`) are **omitted** rather than degraded; reattach them after load.
- Cell coordinates, merges, sizes, notes, tables and charts restore exactly.

## Alternatives

- [XLSX](/guide/import-export) for Office interchange
- [CSV](/guide/import-export) for simple tabular text
- The [operation stream](/guide/events) for incremental sync (each `Operation` is JSON-serializable)
