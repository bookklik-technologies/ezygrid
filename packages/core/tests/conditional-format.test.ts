import { describe, it, expect } from 'vitest';
import { createGrid } from '../src/index.js';

describe('Conditional formatting (§24.5)', () => {
  it('cellIs rules produce style patches', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[5], [50]] }] });
    const ws = wb.activeWorksheet;
    ws.conditionalFormats.add({
      range: 'A1:A2',
      type: 'cellIs',
      operator: 'gt',
      value: 10,
      style: { background: 'red' },
      priority: 1,
    });
    expect(ws.conditionalFormats.evaluate(ws, 0, 0)).toEqual({});
    expect(ws.conditionalFormats.evaluate(ws, 1, 0)).toEqual({ background: 'red' });
  });

  it('containsText and expression rules', () => {
    const wb = createGrid(null, {
      worksheets: [{ data: [['error: bad'], ['ok']] }],
    });
    const ws = wb.activeWorksheet;
    ws.conditionalFormats.add({
      range: 'A1:A2',
      type: 'containsText',
      text: 'error',
      style: { color: 'red' },
      priority: 1,
    });
    expect(ws.conditionalFormats.evaluate(ws, 0, 0)).toEqual({ color: 'red' });
    expect(ws.conditionalFormats.evaluate(ws, 1, 0)).toEqual({});
    ws.conditionalFormats.add({
      range: 'A1:A2',
      type: 'expression',
      predicate: (v) => v === 'ok',
      style: { bold: true },
      priority: 1,
    });
    expect(ws.conditionalFormats.evaluate(ws, 1, 0)).toEqual({ bold: true });
  });

  it('priority and stopIfTrue are honored', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[100]] }] });
    const ws = wb.activeWorksheet;
    ws.conditionalFormats.add({
      range: 'A1',
      type: 'cellIs',
      operator: 'gt',
      value: 0,
      style: { background: 'red' },
      priority: 1,
      stopIfTrue: true,
    });
    ws.conditionalFormats.add({
      range: 'A1',
      type: 'expression',
      predicate: () => true,
      style: { color: 'blue' },
      priority: 2,
    });
    expect(ws.conditionalFormats.evaluate(ws, 0, 0)).toEqual({ background: 'red' });
  });

  it('duplicates rule flags repeated values', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['x'], ['y'], ['x']] }] });
    const ws = wb.activeWorksheet;
    ws.conditionalFormats.add({
      range: 'A1:A3',
      type: 'duplicates',
      style: { background: 'yellow' },
      priority: 1,
    });
    expect(ws.conditionalFormats.evaluate(ws, 0, 0)).toEqual({ background: 'yellow' });
    expect(ws.conditionalFormats.evaluate(ws, 1, 0)).toEqual({});
    expect(ws.conditionalFormats.evaluate(ws, 2, 0)).toEqual({ background: 'yellow' });
  });

  it('topN rule highlights the largest values', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[10], [99], [20]] }] });
    const ws = wb.activeWorksheet;
    ws.conditionalFormats.add({
      range: 'A1:A3',
      type: 'topN',
      n: 1,
      style: { bold: true },
      priority: 1,
    });
    expect(ws.conditionalFormats.evaluate(ws, 1, 0)).toEqual({ bold: true });
    expect(ws.conditionalFormats.evaluate(ws, 0, 0)).toEqual({});
  });
});
