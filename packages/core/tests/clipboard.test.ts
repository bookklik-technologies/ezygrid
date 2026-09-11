import { describe, it, expect } from 'vitest';
import { ClipboardService, translateFormula, createGrid } from '../src/index.js';
import type { Workbook, Worksheet } from '../src/index.js';

function setup(data: unknown[][]): { wb: Workbook; sheet: Worksheet } {
  const wb = createGrid(null, { worksheets: [{ data }] });
  return { wb, sheet: wb.activeWorksheet };
}

describe('ClipboardService', () => {
  it('copies values and formulas into the internal payload', () => {
    const { wb } = setup([[1, 2], ['=A1+B1', 'x']]);
    const sheet = wb.activeWorksheet;
    const clipboard = new ClipboardService();
    const buffer = clipboard.copyFrom(sheet, 0, 0, 1, 1);
    expect(buffer.rows).toBe(2);
    expect(buffer.cells[1]![0]!.formula).toBe('=A1+B1');
    const tsv = clipboard.toTSV();
    expect(tsv).toBe('1\t2\n=A1+B1\tx');
  });

  it('pastes values with formula translation', () => {
    const { wb } = setup([[10, 20], ['=A1+B1']]);
    const sheet = wb.activeWorksheet;
    const clipboard = new ClipboardService();
    clipboard.copyFrom(sheet, 0, 0, 1, 1);
    clipboard.pasteTo(wb, sheet, 2, 0);
    expect(sheet.cells.getCell(3, 0)?.formula).toBe('=A3+B3');
    expect(sheet.getValue(3, 0)).toBe(30);
  });

  it('keeps absolute references fixed when pasting', () => {
    const { wb } = setup([['=A1*$B$1']]);
    const sheet = wb.activeWorksheet;
    const clipboard = new ClipboardService();
    clipboard.copyFrom(sheet, 0, 0, 0, 0);
    clipboard.pasteTo(wb, sheet, 1, 0);
    expect(sheet.cells.getCell(1, 0)?.formula).toBe('=A2*$B$1');
  });

  it('parses external TSV including quotes and numbers', () => {
    const buffer = ClipboardService.fromTSV('a\t"b\tc"\t42\n"x""y"\t\t');
    expect(buffer.rows).toBe(2);
    expect(buffer.columns).toBe(3);
    expect(buffer.cells[0]![1]!.raw).toBe('b\tc');
    expect(buffer.cells[0]![2]!.raw).toBe(42);
    expect(buffer.cells[1]![0]!.raw).toBe('x"y');
    expect(buffer.cells[1]![1]!.raw).toBeNull();
  });

  it('translateFormula shifts only relative parts', () => {
    expect(translateFormula('=A1*$D$1', 1, 0)).toBe('=A2*$D$1');
    expect(translateFormula('=SUM(B2:B10)', 0, 1)).toBe('=SUM(C2:C10)');
    expect(translateFormula('=A1', 0, 3)).toBe('=D1');
  });
});
