import { describe, it, expect } from 'vitest';
import { formatValue } from '../src/index.js';

describe('formatValue', () => {
  it('passes through unmasked values', () => {
    expect(formatValue('hello')).toBe('hello');
    expect(formatValue(42)).toBe('42');
    expect(formatValue(null)).toBe('');
    expect(formatValue(true)).toBe('true');
  });

  it('groups thousands', () => {
    expect(formatValue(1234567, '#,##0')).toBe('1,234,567');
    expect(formatValue(1234567.89, '#,##0')).toBe('1,234,568');
  });

  it('supports decimals', () => {
    expect(formatValue(3.14159, '#,##0.00')).toBe('3.14');
    expect(formatValue(0.5, '0.00')).toBe('0.50');
  });

  it('applies percent', () => {
    expect(formatValue(0.1234, '0.0%')).toBe('12.3%');
    expect(formatValue(0.5, '0%')).toBe('50%');
  });

  it('applies currency prefix', () => {
    expect(formatValue(1234.5, '$#,##0.00')).toBe('$1,234.50');
  });

  it('formats Excel serial dates', () => {
    const serial = 46037; // 2026-01-15
    expect(formatValue(serial, 'yyyy-mm-dd')).toBe('2026-01-15');
    expect(formatValue(serial, 'dd/mm/yyyy')).toBe('15/01/2026');
    expect(formatValue(serial, 'mm/dd/yyyy')).toBe('01/15/2026');
  });
});
