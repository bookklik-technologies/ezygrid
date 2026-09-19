import { describe, expect, it } from 'vitest';
import { createGrid, Workbook } from '../src/index.js';

function setup() {
  const workbook = createGrid(null, { worksheets: [{ rows: 10, columns: 10 }] });
  return { workbook, sheet: workbook.activeWorksheet };
}

describe('worksheet dimensions', () => {
  it('emits reversible size operations and persists committed dimensions', () => {
    const { workbook, sheet } = setup();
    const operations: string[] = [];
    workbook.onOperation((operation) => operations.push(operation.type));
    sheet.setColumnWidth(1, 175.5);
    sheet.setRowHeight(2, 45);
    expect(operations).toEqual(['columns.resize', 'rows.resize']);
    workbook.undo();
    expect(sheet.rowSizes.sizeOf(2)).toBe(24);
    expect(sheet.columnSizes.sizeOf(1)).toBe(175.5);
    workbook.undo();
    expect(sheet.columnSizes.sizeOf(1)).toBe(100);
    expect(workbook.canUndo).toBe(false);
    workbook.redo();
    workbook.redo();
    const restored = Workbook.fromJSON(workbook.toJSON()).activeWorksheet;
    expect(restored.columnSizes.sizeOf(1)).toBe(175.5);
    expect(restored.rowSizes.sizeOf(2)).toBe(45);
  });

  it('validates dimensions without recording invalid or unchanged values', () => {
    const { workbook, sheet } = setup();
    sheet.setColumnWidth(0, 100);
    sheet.setRowHeight(0, 24);
    for (const size of [-1, NaN, Infinity]) {
      expect(() => sheet.setColumnWidth(0, size)).toThrow(RangeError);
      expect(() => sheet.setRowHeight(0, size)).toThrow(RangeError);
    }
    for (const index of [-1, 0.5, 10, NaN, Infinity]) {
      expect(() => sheet.setColumnWidth(index, 50)).toThrow(RangeError);
      expect(() => sheet.setRowHeight(index, 50)).toThrow(RangeError);
    }
    expect(sheet.columnSizes.sizeOf(0)).toBe(100);
    expect(sheet.rowSizes.sizeOf(0)).toBe(24);
    expect(workbook.canUndo).toBe(false);
    sheet.setRowHeight(0, 0);
    expect(sheet.rowSizes.sizeOf(0)).toBe(0);
  });

  it('keeps resize history aligned across insertions and unrelated axis deletions', () => {
    const { workbook, sheet } = setup();
    sheet.setRowHeight(2, 50);
    sheet.insertRows(0, 2);
    sheet.deleteColumns(0);
    expect(sheet.rowSizes.sizeOf(4)).toBe(50);
    workbook.undo();
    workbook.undo();
    workbook.undo();
    expect(sheet.rowSizes.sizeOf(2)).toBe(24);
    workbook.redo();
    expect(sheet.rowSizes.sizeOf(2)).toBe(50);
  });

  it('replays sizes on the original worksheet after switching sheets', () => {
    const { workbook, sheet } = setup();
    const other = workbook.addWorksheet({ rows: 10, columns: 10 });
    workbook.history.clear();
    sheet.setColumnWidth(1, 180);
    workbook.setActiveWorksheet(other.id);
    workbook.undo();
    expect(sheet.columnSizes.sizeOf(1)).toBe(100);
    workbook.redo();
    expect(sheet.columnSizes.sizeOf(1)).toBe(180);
    expect(other.columnSizes.sizeOf(1)).toBe(100);
  });
});
