import type { Rect } from '@ezygrid/model';
import type { Worksheet } from './workbook.js';

export interface SortSpec {
  column: number;
  direction: 'asc' | 'desc';
}

export type CellPayload = { raw?: unknown; formula?: string; styleId?: number } | undefined;

/**
 * Sort service (§19 prototype): stable, number/text/blank-aware multi-column
 * sorting. Row records move with their formulas; reference rewriting for
 * sorted formulas is intentionally deferred to the Phase 3 formula engine.
 */
export class SortService {
  sort(worksheet: Worksheet, rect: Rect, specs: SortSpec[]): void {
    if (specs.length === 0) return;
    const height = rect.bottom - rect.top + 1;
    if (height < 2) return;

    // snapshot row payloads
    const rows: CellPayload[][] = [];
    for (let r = rect.top; r <= rect.bottom; r++) {
      const row: CellPayload[] = [];
      for (let c = rect.left; c <= rect.right; c++) {
        const record = worksheet.cells.getCell(r, c);
        row.push(record ? { ...record } : undefined);
      }
      rows.push(row);
    }

    const keys = rows.map((row) => specs.map((spec) => compareKey(row[spec.column - rect.left])));
    const order = rows.map((_, i) => i);
    order.sort((a, b) => {
      for (let s = 0; s < specs.length; s++) {
        const cmp = compareKeys(keys[a]![s]!, keys[b]![s]!);
        if (cmp !== 0) return specs[s]!.direction === 'desc' ? -cmp : cmp;
      }
      return a - b; // stable
    });

    // clear then write back in sorted order
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        worksheet.cells.setCell(r, c, undefined);
      }
    }
    rows.forEach((_, i) => {
      const target = rect.top + i;
      const source = order[i]!;
      const row = rows[source]!;
      for (let c = rect.left; c <= rect.right; c++) {
        const payload = row[c - rect.left];
        if (payload) worksheet.cells.setCell(target, c, payload);
      }
    });
    worksheet.refreshFormulas();
  }
}

function compareKey(payload: CellPayload): { kind: 'blank' | 'number' | 'text'; value: number | string } {
  if (!payload || (payload.raw === undefined && payload.formula === undefined)) {
    return { kind: 'blank', value: '' };
  }
  if (payload.formula !== undefined) {
    return { kind: 'text', value: payload.formula };
  }
  const raw = payload.raw;
  if (raw === null || raw === undefined || raw === '') return { kind: 'blank', value: '' };
  if (typeof raw === 'number') return { kind: 'number', value: raw };
  if (typeof raw === 'boolean') return { kind: 'number', value: raw ? 1 : 0 };
  return { kind: 'text', value: String(raw) };
}

function compareKeys(
  a: { kind: 'blank' | 'number' | 'text'; value: number | string },
  b: { kind: 'blank' | 'number' | 'text'; value: number | string },
): number {
  if (a.kind === 'blank' && b.kind === 'blank') return 0;
  if (a.kind === 'blank') return 1;
  if (b.kind === 'blank') return -1;
  if (a.kind === 'number' && b.kind === 'number') return (a.value as number) - (b.value as number);
  const at = a.kind === 'number' ? String(a.value) : a.value;
  const bt = b.kind === 'number' ? String(b.value) : b.value;
  return at < bt ? -1 : at > bt ? 1 : 0;
}
