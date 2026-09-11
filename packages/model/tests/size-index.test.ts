import { describe, it, expect } from 'vitest';
import { SizeIndex } from '../src/index.js';

describe('SizeIndex (Fenwick tree)', () => {
  it('computes offsets with default sizes', () => {
    const idx = new SizeIndex(1000, 10);
    expect(idx.offsetOf(0)).toBe(0);
    expect(idx.offsetOf(5)).toBe(50);
    expect(idx.totalSize()).toBe(10000);
  });

  it('supports point resizing in O(log n)', () => {
    const idx = new SizeIndex(100, 10);
    idx.setSize(3, 40);
    expect(idx.sizeOf(3)).toBe(40);
    expect(idx.offsetOf(4)).toBe(70);
    expect(idx.offsetOf(10)).toBe(130);
  });

  it('finds index at pixel offset', () => {
    const idx = new SizeIndex(1000, 10);
    idx.setSize(5, 100); // offsets: rows 0-4 = 0..49, row 5 = 50..149, row 6 = 150
    expect(idx.indexAt(0)).toBe(0);
    expect(idx.indexAt(49)).toBe(4);
    expect(idx.indexAt(50)).toBe(5);
    expect(idx.indexAt(149)).toBe(5);
    expect(idx.indexAt(150)).toBe(6);
   });
});
