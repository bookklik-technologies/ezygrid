import { describe, it, expect } from 'vitest';
import { EditService, parseEditorValue, createGrid } from '../src/index.js';
import { createId } from '@ezygrid/model';

describe('EditService', () => {
  it('begins editing with current cell text', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['hello']] }] });
    const sheet = wb.worksheets[0]!;
    const editor = new EditService();
    const session = editor.beginEdit(sheet, 0, 0);
    expect(session.initial).toBe('hello');
    expect(session.mode).toBe('replace');
  });

  it('begins editing with formula text preserved', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['=A2+1']] }] });
    const sheet = wb.worksheets[0]!;
    const editor = new EditService();
    const session = editor.beginEdit(sheet, 0, 0);
    expect(session.initial).toBe('=A2+1');
  });

  it('commit writes typed values and ends the session', () => {
    const wb = createGrid(null);
    const sheet = wb.worksheets[0]!;
    const editor = new EditService();
    editor.beginEdit(sheet, 0, 0, '42');
    expect(editor.commit(sheet, '42')).toBe(true);
    expect(sheet.getValue(0, 0)).toBe(42);
    expect(editor.editing).toBe(false);
  });

  it('commit keeps formulas intact', () => {
    const wb = createGrid(null, { worksheets: [{ data: [[10]] }] });
    const sheet = wb.worksheets[0]!;
    const editor = new EditService();
    editor.beginEdit(sheet, 1, 0, '');
    editor.commit(sheet, '=A1*2');
    expect(sheet.getValue(1, 0)).toBe(20);
  });

  it('commit with empty text clears the cell', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['x']] }] });
    const sheet = wb.worksheets[0]!;
    const editor = new EditService();
    editor.beginEdit(sheet, 0, 0);
    editor.commit(sheet, '');
    expect(sheet.getValue(0, 0)).toBeNull();
  });

  it('cancel discards without writing', () => {
    const wb = createGrid(null, { worksheets: [{ data: [['x']] }] });
    const sheet = wb.worksheets[0]!;
    const editor = new EditService();
    editor.beginEdit(sheet, 0, 0, 'changed');
    editor.cancel();
    expect(sheet.getValue(0, 0)).toBe('x');
    expect(editor.editing).toBe(false);
  });

  it('parseEditorValue types numbers and booleans', () => {
    expect(parseEditorValue('42')).toBe(42);
    expect(parseEditorValue('-3.5')).toBe(-3.5);
    expect(parseEditorValue('true')).toBe(true);
    expect(parseEditorValue('False')).toBe(false);
    expect(parseEditorValue('hi')).toBe('hi');
    expect(parseEditorValue('')).toBeNull();
  });

  it('worksheet ids are stable', () => {
    const id = createId('sheet');
    expect(id.startsWith('sheet-')).toBe(true);
    expect(createId('sheet')).not.toBe(id);
  });
});
