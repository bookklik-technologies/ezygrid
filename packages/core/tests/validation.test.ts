import { describe, it, expect } from 'vitest';
import { createGrid } from '../src/index.js';

describe('Data validation (§24)', () => {
  it('rejects out-of-range numbers', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 50, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.addValidation({ range: 'A1:A10', type: 'number', action: 'reject', min: 1, max: 100 });
    expect(ws.setValue(0, 0, 50)).not.toBeNull();
    expect(ws.getValue(0, 0)).toBe(50);
    expect(ws.setValue(1, 0, 500)).toBeNull();
    expect(ws.getValue(1, 0)).toBeNull();
  });

  it('list validation restricts values', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 50, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.addValidation({ range: 'B1:B10', type: 'list', action: 'reject', values: ['low', 'high'] });
    expect(ws.setValue(0, 1, 'low')).not.toBeNull();
    expect(ws.setValue(1, 1, 'medium')).toBeNull();
  });

  it('warning action allows the write', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 50, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.addValidation({ range: 'C1:C5', type: 'number', action: 'warning', max: 10, message: 'large value' });
    const operation = ws.setValue(0, 2, 9999);
    expect(operation).not.toBeNull();
    expect(ws.getValue(0, 2)).toBe(9999);
  });

  it('custom predicate validation', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 50, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.addValidation({ range: 'D1:D5', type: 'custom', action: 'reject', predicate: (v) => String(v).startsWith('ID-') });
    expect(ws.setValue(0, 3, 'ID-42')).not.toBeNull();
    expect(ws.setValue(1, 3, 'nope')).toBeNull();
  });

  it('blank cells bypass validation', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 50, columns: 10 }] });
    const ws = wb.activeWorksheet;
    ws.addValidation({ range: 'A1:A5', type: 'number', action: 'reject', min: 0 });
    expect(ws.setValue(0, 0, null)).not.toBeNull();
  });

  it('rule removal restores writes', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 50, columns: 10 }] });
    const ws = wb.activeWorksheet;
    const rule = ws.addValidation({ range: 'A1', type: 'number', action: 'reject', min: 10 });
    expect(ws.setValue(0, 0, 1)).toBeNull();
    ws.removeValidation(rule.id);
    expect(ws.setValue(0, 0, 1)).not.toBeNull();
  });

  it('emits validation.reject operations', () => {
    const wb = createGrid(null, { worksheets: [{ rows: 50, columns: 10 }] });
    const ws = wb.activeWorksheet;
    const types: string[] = [];
    wb.onOperation((o) => types.push(o.type));
    ws.addValidation({ range: 'A1', type: 'number', action: 'reject', min: 100 });
    ws.setValue(0, 0, 1);
    expect(types).toContain('validation.reject');
  });
});
