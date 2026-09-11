import type { Worksheet } from './workbook.js';

export interface SearchOptions {
  matchCase?: boolean;
  wholeCell?: boolean;
  /** Include formula text in the haystack (default: displayed values only). */
  searchFormulas?: boolean;
}

export interface SearchResult {
  row: number;
  column: number;
  text: string;
}

/**
 * Search service (§21): scans the used range of a worksheet in row-major
 * order against displayed values.
 */
export class SearchService {
  find(worksheet: Worksheet, query: string, options: SearchOptions = {}): SearchResult[] {
    const results: SearchResult[] = [];
    const used = worksheet.cells.usedRange;
    if (!used || query === '') return results;
    const needle = options.matchCase ? query : query.toLowerCase();

    for (let r = used.top; r <= used.bottom; r++) {
      for (let c = used.left; c <= used.right; c++) {
        const record = worksheet.cells.getCell(r, c);
        if (!record) continue;
        let haystack: string;
        if (options.searchFormulas && record.formula !== undefined) {
          haystack = record.formula;
        } else {
          const value = worksheet.getValue(r, c);
          haystack = value === null || value === undefined ? '' : String(value);
        }
        // Keep the ORIGINAL text in the result so replacement writes back
        // the same casing; comparison uses a lowercase copy.
        const comparable = options.matchCase ? haystack : haystack.toLowerCase();
        const hit = options.wholeCell ? comparable === needle : comparable.includes(needle);
        if (hit) results.push({ row: r, column: c, text: haystack });
      }
    }
    return results;
  }

  /** Next match at or after the given cell, wrapping around. */
  findNext(
    worksheet: Worksheet,
    query: string,
    from: { row: number; column: number },
    options: SearchOptions = {},
  ): SearchResult | undefined {
    const results = this.find(worksheet, query, options);
    if (results.length === 0) return undefined;
    const after = results.find(
      (r) => r.row > from.row || (r.row === from.row && r.column > from.column),
    );
    return after ?? results[0];
  }
}
