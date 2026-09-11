import { describe, it, expect } from 'vitest';
import {
  createGrid,
  MergeStore,
  CommandRegistry,
  createDefaultCommands,
  SortService,
} from '../src/index.js';
import type { Worksheet } from '../src/index.js';

describe('MergeStore', () => {
  it('merges a rect and exposes anchor/covered semantics', () => {
    const store = new MergeStore();
    const merge = store.merge({ top: 0, left: 0, bottom: 1, right: 1 });
    expect(merge).toBeDefined();
    expect(store.isCovered(1, 1)).toBe(true);
    expect(store.isCovered(0, 0)).toBe(false);
    expect(store.findAt(1, 0)?.id).toBe(merge!.id);
  });

  it('rejects overlapping merges', () => {
    const store = new MergeStore();
    store.merge({ top: 0, left: 0, bottom: 1, right: 1 });
    expect(store.merge({ top: 1, left: 1, bottom: 3, right: 3 })).toBeUndefined();
  });

  it('unmerges by any covered cell', () => {
    const store = new MergeStore();
    store.merge({ top: 0, left: 0, bottom: 2, right: 2 });
    expect(store.unmergeAt(2, 2)).toBe(true);
    expect(store.findAt(0, 0)).toBeUndefined();
  });
});

describe('Worksheet merge integration', () => {
  it('merge keeps anchor data and unmerge restores', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['title']] }] });
    const ws = wb.activeWorksheet;
    ws.merge('A1:B2');
    expect(ws.merges.findAt(1, 1)).toBeDefined();
    expect(ws.getValue(0, 0)).toBe('title');
    ws.unmerge('A1:B2');
    expect(ws.merges.all).toHaveLength(0);
  });
});

describe('CommandRegistry', () => {
  it('executes commands by id with context', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['x']] }] });
    const ws = wb.activeWorksheet as Worksheet;
    const registry = new CommandRegistry();
    registry.register({ id: 'test.clear', title: 'Clear', execute: (ctx) => ctx.worksheet.setValue(0, 0, null) });
    void ws;
    expect(registry.execute('test.clear', { workbook: wb, worksheet: wb.activeWorksheet, selection: undefined as never })).toBe(true);
    expect(wb.activeWorksheet.getValue(0, 0)).toBeNull();
    expect(registry.execute('missing', { workbook: wb, worksheet: wb.activeWorksheet, selection: undefined as never })).toBe(false);
  });

  it('respects isEnabled', () => {
    const registry = new CommandRegistry();
    registry.register({
      id: 'locked',
      title: 'Locked',
      isEnabled: () => false,
      execute: () => {
        throw new Error('should not run');
      },
    });
    expect(registry.execute('locked', { workbook: undefined as never, worksheet: undefined as never, selection: undefined as never })).toBe(false);
  });

  it('provides a default command set', () => {
    const commands = createDefaultCommands({ copy: () => {}, cut: () => {}, paste: () => {}, fillDown: () => {} });
    expect(commands.map((c) => c.id)).toContain('edit.undo');
    expect(commands.find((c) => c.id === 'clipboard.copy')?.shortcut).toBe('Mod+C');
  });
});

describe('Sorting via SortService', () => {
  it('sorts rows by a numeric column ascending, blanks last', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [
        [30, 'c'], [null, 'blank'], [10, 'a'], [20, 'b'],
      ] }],
    });
    const ws = wb.activeWorksheet;
    new SortService().sort(ws, { top: 0, left: 0, bottom: 3, right: 1 }, [{ column: 0, direction: 'asc' }]);
    expect(ws.getValue(0, 0)).toBe(10);
    expect(ws.getValue(1, 0)).toBe(20);
    expect(ws.getValue(2, 0)).toBe(30);
    expect(ws.getValue(3, 0)).toBeNull();
    expect(ws.getValue(0, 1)).toBe('a');
    expect(ws.getValue(3, 1)).toBe('blank');
  });

  it('sorts descending and multi-column', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [
        ['x', 1], ['x', 2], ['a', 5],
      ] }],
    });
    const ws = wb.activeWorksheet;
    new SortService().sort(ws, { top: 0, left: 0, bottom: 2, right: 1 }, [
      { column: 0, direction: 'asc' },
      { column: 1, direction: 'desc' },
    ]);
    expect(ws.getValue(0, 1)).toBe(5);
    expect(ws.getValue(1, 1)).toBe(2);
    expect(ws.getValue(2, 1)).toBe(1);
  });

  it('formulas move with their rows and keep working', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [
        ['b', 2], ['a', 1], ['=B1+B2'],
      ] }],
    });
    const ws = wb.activeWorksheet;
    new SortService().sort(ws, { top: 0, left: 0, bottom: 1, right: 1 }, [{ column: 0, direction: 'asc' }]);
    expect(ws.getValue(0, 0)).toBe('a');
    expect(ws.getValue(1, 0)).toBe('b');
    expect(ws.cells.getCell(2, 0)?.formula).toBe('=B1+B2');
    expect(ws.getValue(2, 0)).toBe(3);
  });
});
