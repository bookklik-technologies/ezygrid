import type { Rect } from '@ezygrid/model';
import { translateFormula } from './clipboard.js';
import type { CellSnapshot } from './workbook.js';
import type { Worksheet } from './workbook.js';

export interface SortSpec {
  column: number;
  direction: 'asc' | 'desc';
}

/**
 * Sort service (§19): stable, multi-column sorting over EVALUATED values.
 * One atomic permutation moves cell records, relative formulas (translated
 * by the row delta), styles, notes, number formats and cell editors, and
 * records a reversible history entry so Undo restores the permutation (F12/F08).
 * Merged or spilled ranges are rejected until their sort behavior is defined.
 */
export class SortService {
  sort(worksheet: Worksheet, rect: Rect, specs: SortSpec[]): void {
    if (specs.length === 0) return;
    const height = rect.bottom - rect.top + 1;
    if (height < 2) return;

    // Unsupported layouts fail loudly instead of scattering data (F12).
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        if (worksheet.merges.findAt(r, c)) {
          throw new Error('sorting ranges containing merged cells is not supported');
        }
        if (worksheet.isSpilled(r, c) || worksheet.hasSpillError(r, c)) {
          throw new Error('sorting ranges containing spilled arrays is not supported');
        }
      }
    }

    // Snapshot the complete band before any mutation.
    const before: CellSnapshot[] = this.capture(worksheet, rect);

    // Sort keys come from evaluated values so formulas sort like their
    // results, not their text (F12).
    const rowKeys = new Map<number, ReturnType<typeof compareValue>[]>();
    for (let r = rect.top; r <= rect.bottom; r++) {
      rowKeys.set(
        r,
        specs.map((spec) => compareValue(worksheet.getValue(r, spec.column))),
      );
    }
    const order = [...rowKeys.keys()];
    order.sort((a, b) => {
      const ka = rowKeys.get(a)!;
      const kb = rowKeys.get(b)!;
      for (let s = 0; s < specs.length; s++) {
        const cmp = compareKeys(ka[s]!, kb[s]!);
        if (cmp !== 0) return specs[s]!.direction === 'desc' ? -cmp : cmp;
      }
      return a - b; // stable
    });

    this.writePermutation(worksheet, rect, order);
    const after: CellSnapshot[] = this.capture(worksheet, rect);

    worksheet.refreshFormulas();
    worksheet.workbook.emitOperation(
      {
        id: `sort-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        workbookId: worksheet.workbook.id,
        worksheetId: worksheet.id,
        type: 'cells.replace',
        payload: { cells: after },
        timestamp: Date.now(),
      },
      [
        {
          id: `sort-undo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
          workbookId: worksheet.workbook.id,
          worksheetId: worksheet.id,
          type: 'cells.replace',
          payload: { cells: before },
          timestamp: Date.now(),
        },
      ],
    );
  }

  private capture(worksheet: Worksheet, rect: Rect): CellSnapshot[] {
    const cells: CellSnapshot[] = [];
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        const record = worksheet.cells.getCell(r, c);
        if (!record) continue;
        cells.push({
          row: r,
          column: c,
          raw: record.raw,
          formula: record.formula,
          style: worksheet.getStyle(r, c) ?? null,
          note: worksheet.getNote(r, c) ?? null,
          format: worksheet.getNumberFormat(r, c) ?? null,
          editor: worksheet.getEditorFor(r, c) ?? null,
        });
      }
    }
    return cells;
  }

  /** Write the permuted layout: rows move with their formulas and metadata. */
  private writePermutation(worksheet: Worksheet, rect: Rect, order: number[]): void {
    // Snapshot current row payloads (records + coordinate-keyed metadata).
    const rows: {
      cells: Map<number, { raw?: unknown; formula?: string }>;
      styles: Map<number, CellSnapshot['style']>;
      notes: Map<number, CellSnapshot['note']>;
      formats: Map<number, CellSnapshot['format']>;
      editors: Map<number, CellSnapshot['editor']>;
    }[] = [];
    for (let r = rect.top; r <= rect.bottom; r++) {
      const cells = new Map<number, { raw?: unknown; formula?: string }>();
      const styles = new Map<number, CellSnapshot['style']>();
      const notes = new Map<number, CellSnapshot['note']>();
      const formats = new Map<number, CellSnapshot['format']>();
      const editors = new Map<number, CellSnapshot['editor']>();
      for (let c = rect.left; c <= rect.right; c++) {
        const record = worksheet.cells.getCell(r, c);
        if (record) cells.set(c, { raw: record.raw, formula: record.formula });
        styles.set(c, worksheet.getStyle(r, c) ?? null);
        notes.set(c, worksheet.getNote(r, c) ?? null);
        formats.set(c, worksheet.getNumberFormat(r, c) ?? null);
        editors.set(c, worksheet.getEditorFor(r, c) ?? null);
      }
      rows.push({ cells, styles, notes, formats, editors });
    }

    // Clear the rect, then write back in sorted order. Relative formulas
    // translate by the row delta so they keep pointing at their own row (F12).
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        const record = worksheet.cells.getCell(r, c);
        if (record?.formula !== undefined) {
          worksheet.workbook.formulaGraph.removeFormula(worksheet.name, r, c);
        }
        worksheet.cells.setCell(r, c, undefined);
        worksheet.styles.delete(`${r},${c}`);
        worksheet.notes.delete(`${r},${c}`);
        worksheet.numberFormats.delete(`${r},${c}`);
        worksheet.cellEditors.delete(`${r},${c}`);
      }
    }
    rows.forEach((_, i) => {
      const target = rect.top + i;
      const source = order[i]!;
      const dRow = target - source;
      const data = rows[source]!;
      for (const [c, cell] of data.cells) {
        worksheet.cells.setCell(
          target,
          c,
          cell.formula !== undefined
            ? { formula: translateFormula(cell.formula, dRow, 0) }
            : { raw: cell.raw },
        );
      }
      for (const [c, style] of data.styles) {
        if (style) worksheet.styles.set(`${target},${c}`, style);
      }
      for (const [c, note] of data.notes) {
        if (note !== null && note !== undefined) worksheet.notes.set(`${target},${c}`, note);
      }
      for (const [c, format] of data.formats) {
        if (format !== null && format !== undefined) worksheet.numberFormats.set(`${target},${c}`, format);
      }
      for (const [c, editor] of data.editors) {
        if (editor !== null && editor !== undefined) worksheet.cellEditors.set(`${target},${c}`, editor);
      }
    });
  }
}

function compareValue(value: unknown): { kind: 'blank' | 'number' | 'text'; value: number | string } {
  if (value === null || value === undefined || value === '') return { kind: 'blank', value: '' };
  if (typeof value === 'number') return { kind: 'number', value };
  if (typeof value === 'boolean') return { kind: 'number', value: value ? 1 : 0 };
  if (value instanceof Error) return { kind: 'text', value: value.message };
  return { kind: 'text', value: String(value) };
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
