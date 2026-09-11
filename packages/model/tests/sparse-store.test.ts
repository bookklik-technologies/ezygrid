import { describe, it, expect } from 'vitest';
import { SparseCellStore, PAGE_SIZE } from '../src/index.js';

describe('SparseCellStore', () => {
  it('stores and retrieves cells', () => {
    const store = new SparseCellStore();
    store.setCell(0, 0, { raw: 'hello' });
    store.setCell(10, 20, { raw: 42 });
    expect(store.getCell(0, 0)?.raw).toBe('hello');
    expect(store.getCell(10, 20)?.raw).toBe(42);
    expect(store.getCell(0, 1)).toBeUndefined();
  });

  it('creates one page per 256x256 region, not per cell', () => {
    const store = new SparseCellStore();
    for (let i = 0; i < 1000; i++) {
      store.setCell(i, i, { raw: i });
    }
    // 1000 diagonal cells span ceil(1000/256) = 4 pages in each axis -> 4 pages
    expect(store.pageCount).toBe(4);
  });

  it('1M-row empty sheet allocates nothing', () => {
    const store = new SparseCellStore();
    expect(store.pageCount).toBe(0);
    expect(store.usedRange).toBeUndefined();
    expect(PAGE_SIZE).toBe(256);
  });

  it('tracks used range', () => {
    const store = new SparseCellStore();
    store.setCell(5, 3, { raw: 1 });
    store.setCell(100, 50, { raw: 2 });
    expect(store.usedRange).toEqual({ top: 5, left: 3, bottom: 100, right: 50 });
  });

  it('deletes cells and empties pages', () => {
    const store = new SparseCellStore();
    store.setCell(1, 1, { raw: 'x' });
    store.setCell(1, 1, undefined);
    expect(store.getCell(1, 1)).toBeUndefined();
    expect(store.pageCount).toBe(0);
    expect(store.usedRange).toBeUndefined();
  });

  it('insertRows shifts cells below the index', () => {
    const store = new SparseCellStore();
    store.setCell(0, 0, { raw: 'a' });
    store.setCell(5, 0, { raw: 'b' });
    store.insertRows(3, 2);
    expect(store.getCell(0, 0)?.raw).toBe('a');
    expect(store.getCell(5, 0)).toBeUndefined();
    expect(store.getCell(7, 0)?.raw).toBe('b');
  });

  it('deleteRows removes cells in the deleted band and shifts up', () => {
    const store = new SparseCellStore();
    store.setCell(0, 0, { raw: 'a' });
    store.setCell(3, 0, { raw: 'b' });
    store.setCell(5, 0, { raw: 'c' });
    store.deleteRows(2, 2); // deletes rows 2 and 3
    expect(store.getCell(0, 0)?.raw).toBe('a');
    expect(store.getCell(3, 1)).toBeUndefined();
    // 'c' moved from row 5 to row 3
    expect(store.getCell(3, 0)?.raw).toBe('c');
    expect(store.getCell(5, 0)).toBeUndefined();
  });
});
