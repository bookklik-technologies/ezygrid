import { describe, it, expect } from 'vitest';
import {
  indexToColumn,
  columnToIndex,
  toA1,
  fromA1,
  parseRange,
  rectToRange,
  rectContains,
  rectsIntersect,
  parseRef,
} from '../src/index.js';

describe('A1 conversion', () => {
  it('converts indexes to column letters', () => {
    expect(indexToColumn(0)).toBe('A');
    expect(indexToColumn(25)).toBe('Z');
    expect(indexToColumn(26)).toBe('AA');
    expect(indexToColumn(701)).toBe('ZZ');
    expect(indexToColumn(702)).toBe('AAA');
  });

  it('converts letters to indexes', () => {
    expect(columnToIndex('A')).toBe(0);
    expect(columnToIndex('Z')).toBe(25);
    expect(columnToIndex('AA')).toBe(26);
    expect(columnToIndex('ZZ')).toBe(701);
    expect(columnToIndex('AAA')).toBe(702);
  });

  it('round-trips A1 addresses', () => {
    for (let c = 0; c < 800; c += 37) {
      for (let r = 0; r < 5000; r += 331) {
        expect(fromA1(toA1(r, c))).toEqual({ row: r, column: c });
      }
    }
  });

  it('accepts $-prefixed addresses', () => {
    expect(fromA1('$B$3')).toEqual({ row: 2, column: 1 });
    expect(fromA1('B$3')).toEqual({ row: 2, column: 1 });
  });

  it('throws on invalid input', () => {
    expect(() => fromA1('1A')).toThrow();
    expect(() => columnToIndex('A1')).toThrow();
    expect(() => indexToColumn(-1)).toThrow();
  });
});

describe('ranges', () => {
  it('parses single cells and ranges', () => {
    expect(parseRange('A1')).toMatchObject({ top: 0, left: 0, bottom: 0, right: 0 });
    expect(parseRange('B2:D4')).toMatchObject({ top: 1, left: 1, bottom: 3, right: 3 });
  });

  it('normalizes reversed ranges', () => {
    expect(parseRange('D4:B2')).toMatchObject({ top: 1, left: 1, bottom: 3, right: 3 });
  });

  it('parses sheet-qualified ranges', () => {
    expect(parseRange("Sheet1!A1:B2")).toMatchObject({ sheet: 'Sheet1', top: 0 });
    expect(parseRange("'My Sheet'!C3")).toMatchObject({ sheet: 'My Sheet', top: 2, left: 2 });
  });

  it('serializes rects back to A1', () => {
    expect(rectToRange({ top: 1, left: 1, bottom: 3, right: 3 })).toBe('B2:D4');
    expect(rectToRange({ top: 0, left: 0, bottom: 0, right: 0 })).toBe('A1');
  });

  it('contains and intersects', () => {
    const r = { top: 0, left: 0, bottom: 5, right: 5 };
    expect(rectContains(r, 3, 3)).toBe(true);
    expect(rectContains(r, 6, 3)).toBe(false);
    expect(rectsIntersect(r, { top: 5, left: 5, bottom: 9, right: 9 })).toBe(true);
    expect(rectsIntersect(r, { top: 6, left: 6, bottom: 9, right: 9 })).toBe(false);
  });
});

describe('sheet-qualified refs', () => {
  it('parses quoted sheet names', () => {
    expect(parseRef("'Q1 Sales'!A2")).toMatchObject({ sheet: 'Q1 Sales', row: 1, column: 0 });
  });
});
