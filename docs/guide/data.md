# Sorting, filtering & search

## Sorting

`SortService` performs a stable multi-column sort over **evaluated** values:

```ts
import { SortService } from '@ezygrid/core';
import { parseRange } from '@ezygrid/model';

const sorter = new SortService();
sorter.sort(sheet, parseRange('A2:D50'), [
  { column: 2, direction: 'desc' }, // primary key: column C
  { column: 0, direction: 'asc' },  // secondary: column A
]);
```

Notes:

- Sorts cells, translated relative formulas, styles, notes, formats and editors as one atomic permutation
- One reversible history entry
- Refuses ranges containing merges or spilled dynamic arrays

## Filtering

Filters are predicate functions per column, applied to evaluated values. Filtered visibility is tracked separately from manual hides:

```ts
sheet.setFilter(2, (value) => Number(value) > 100);  // column C predicate
sheet.setFilter(0, (value) => String(value).startsWith('Jan'));
sheet.refreshFilters();
sheet.clearFilter(2);
sheet.clearFilter();   // all columns
```

Filters live in `sheet.filters: Map<number, (value) => boolean>`.

## Search

```ts
import { SearchService } from '@ezygrid/core';

const search = new SearchService();

const hits = search.find(sheet, 'widget', { matchCase: false, wholeCell: false, searchFormulas: false });
// SearchResult[]: { row, column, text }

const next = search.findNext(sheet, 'widget', { row: 0, column: 0 }, options);
```

## Replace

```ts
import { replace, replaceAll } from '@ezygrid/core';

replace(sheet, 'Widget', 'Gadget', { row: 0, column: 0 }, options); // first match from a position
const count = replaceAll(sheet, 'Widget', 'Gadget', options);        // number of replacements
```

Options for search and replace share `SearchOptions { matchCase?, wholeCell?, searchFormulas? }`.
