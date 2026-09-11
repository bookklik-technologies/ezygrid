import { describe, it, expect } from 'vitest';
import { createGrid, ClipboardService } from '../src/index.js';

describe('Styles', () => {
  it('sets, merges, and clears styles on ranges', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[1, 2], [3, 4]] }] });
    const ws = wb.activeWorksheet;
    ws.setStyle('A1:B2', { bold: true });
    expect(ws.getStyle(0, 0)?.bold).toBe(true);
    ws.setStyle('A1', { color: 'red' });
    expect(ws.getStyle(0, 0)).toMatchObject({ bold: true, color: 'red' });
    expect(ws.getStyle(1, 1)?.bold).toBe(true);
    ws.clearStyle('A1:B2');
    expect(ws.getStyle(0, 0)).toBeUndefined();
  });

  it('clipboard copies and pastes styles', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['x']] }] });
    const ws = wb.activeWorksheet;
    ws.setStyle('A1', { bold: true, color: 'red' });
    const clipboard = new ClipboardService();
    clipboard.copyFrom(ws, 0, 0, 0, 0);
    clipboard.pasteTo(wb, ws, 2, 0);
    expect(ws.getStyle(2, 0)).toMatchObject({ bold: true, color: 'red' });
  });
});

describe('Notes', () => {
  it('sets, gets, and clears notes', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['x']] }] });
    const ws = wb.activeWorksheet;
    ws.setNote('A1', 'checked by finance');
    expect(ws.getNote(0, 0)).toBe('checked by finance');
    ws.clearNote('A1');
    expect(ws.getNote(0, 0)).toBeUndefined();
  });
});

describe('Nested headers', () => {
  it('accepts multi-level groups', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 10, columns: 4 }] });
    const ws = wb.activeWorksheet;
    ws.setNestedHeaders([
      [{ title: 'Financials', span: 2 }, { title: 'Ops', span: 2 }],
      ['Revenue', 'Cost', 'Units', 'Hours'],
    ]);
    expect(ws.nestedHeaders).toHaveLength(2);
  });
});

describe('Row groups', () => {
  it('collapses and expands groups via the hidden-row channel', () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 20, columns: 4, data: [['hdr'], ['a'], ['b'], ['tail']] }],
    });
    const ws = wb.activeWorksheet;
    ws.groupRows(1, 2);
    expect(ws.isRowHidden(1)).toBe(false);
    ws.collapseGroup(1);
    expect(ws.isRowHidden(1)).toBe(true);
    expect(ws.isRowHidden(2)).toBe(true);
    ws.expandGroup(1);
    expect(ws.isRowHidden(1)).toBe(false);
    ws.ungroupRows(1);
    expect(ws.getGroups()).toHaveLength(0);
  });
});

describe('Pagination view state', () => {
  it('paste special keeps row identity and does not touch the model', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[1], [2], [3], [4], [5], [6]] }] });
    const ws = wb.activeWorksheet;
    const clipboard = new ClipboardService();
    clipboard.copyFrom(ws, 0, 0, 1, 0);
    clipboard.pasteTo(wb, ws, 6, 0);
    expect(ws.getValue(6, 0)).toBe(1);
    expect(ws.rowCount).toBe(1000); // pagination is a view concern, not the model
  });
});
