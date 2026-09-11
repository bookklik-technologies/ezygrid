import type { Worksheet } from './workbook.js';
import type { SearchOptions, SearchResult } from './search.js';
import { SearchService } from './search.js';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace every occurrence of `query` inside `text`, honoring matchCase. */
function replaceOccurrences(text: string, query: string, replacement: string, options: SearchOptions): string {
  if (!options.matchCase) {
    return text.replace(new RegExp(escapeRegExp(query), 'gi'), () => replacement);
  }
  return text.split(query).join(replacement);
}

/** Replace helpers extending the search service (§21). */
export function replace(
  worksheet: Worksheet,
  query: string,
  replacement: string,
  from: { row: number; column: number },
  options: SearchOptions = {},
): SearchResult | undefined {
  const search = new SearchService();
  // Excel-like: the hit at or after the given position is replaced.
  const hits = search.find(worksheet, query, options);
  const hit =
    hits.find((h) => h.row > from.row || (h.row === from.row && h.column >= from.column)) ??
    hits[0];
  if (!hit) return undefined;
  // SearchResult.text is the ORIGINAL cell text (never lowercased), so the
  // rest of the string keeps its casing.
  const updated = replaceOccurrences(hit.text, query, replacement, options);
  const operation = worksheet.setValue(hit.row, hit.column, updated);
  return operation ? hit : undefined;
}

export function replaceAll(
  worksheet: Worksheet,
  query: string,
  replacement: string,
  options: SearchOptions = {},
): number {
  const search = new SearchService();
  const hits = search.find(worksheet, query, options);
  let count = 0;
  for (const hit of hits) {
    // Replace every occurrence within the cell, not just the first.
    const updated = replaceOccurrences(hit.text, query, replacement, options);
    if (updated === hit.text) continue;
    const operation = worksheet.setValue(hit.row, hit.column, updated);
    // Only successful writes count as replacements.
    if (operation) count += 1;
  }
  return count;
}
