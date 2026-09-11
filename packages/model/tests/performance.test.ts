import { describe, it, expect } from 'vitest';
import { SparseCellStore, SizeIndex } from '../src/index.js';

describe('Phase 0 exit criteria', () => {
  it('1,000,000-row empty sheet allocates no per-cell state', () => {
    const store = new SparseCellStore();
    // Simulate logical dimensions without allocating anything.
    const logicalRows = 1_000_000;
    const logicalColumns = 16_384;
    expect(store.pageCount).toBe(0);
    // touch far corners to prove addressing works at scale
    store.setCell(logicalRows - 1, logicalColumns - 1, { raw: 'end' });
    expect(store.getCell(logicalRows - 1, logicalColumns - 1)?.raw).toBe('end');
    expect(store.pageCount).toBe(1);
  });

  it('100k populated cells use proportional (paged) memory and stay fast', () => {
    const started = Date.now();
    const store = new SparseCellStore();
    for (let r = 0; r < 500; r++) {
      for (let c = 0; c < 200; c++) {
        store.setCell(r, c, { raw: r * c });
      }
    }
    const elapsed = Date.now() - started;
    expect(store.pageCount).toBeLessThanOrEqual(4); // 500/256 + 200/256 pages
    expect(elapsed).toBeLessThan(1000); // generous CI budget
  });

  it('viewport index resolves arbitrary rows in a 1M-row sheet in O(log n)', () => {
    const index = new SizeIndex(1_000_000, 24);
    index.setSize(999_999, 48);
    const started = performance.now();
    for (let i = 0; i < 1000; i++) {
      const row = index.indexAt(24_000_000 + i);
      expect(row).toBeGreaterThanOrEqual(999_998);
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(100); // 1000 queries must be fast
  });

  it('pixel offset mapping is exact across 100k rows', () => {
    const index = new SizeIndex(100_000, 20);
    index.setSize(50_000, 60);
    expect(index.offsetOf(50_000)).toBe(50_000 * 20);
    expect(index.offsetOf(50_001)).toBe(50_000 * 20 + 60);
    expect(index.indexAt(50_000 * 20 + 30)).toBe(50_000);
  });
});
