import { describe, it, expect } from 'vitest';
import { createGrid } from '@ezygrid/core';
import { workbookToXlsx, workbookFromXlsx, readZip } from '../src/index.js';

function fixtureWorkbook() {
  return createGrid(null, {
    id: 'wb-test',
    worksheets: [
      {
        name: 'Sales',
        rows: 50,
        columns: 10,
        data: [
          ['Month', 'Revenue', 'Profit'],
          ['Jan', 1200, '=B2*0.2'],
          ['Feb', 1500, '=B3*0.2'],
        ],
      },
      {
        name: 'Notes',
        rows: 20,
        columns: 5,
        data: [['hello world'], ['=1+1']],
      },
    ],
  });
}

describe('XLSX export (§35.3)', () => {
  it('produces a valid ZIP with OOXML parts', async () => {
    const bytes = workbookToXlsx(fixtureWorkbook());
    const files = await readZip(bytes);
    expect(files.has('[Content_Types].xml')).toBe(true);
    expect(files.has('xl/workbook.xml')).toBe(true);
    expect(files.has('xl/worksheets/sheet1.xml')).toBe(true);
    expect(files.has('xl/worksheets/sheet2.xml')).toBe(true);
    expect(files.has('xl/sharedStrings.xml')).toBe(true);
    const workbookXml = new TextDecoder().decode(files.get('xl/workbook.xml')!);
    expect(workbookXml).toContain('name="Sales"');
    expect(workbookXml).toContain('name="Notes"');
  });

  it('exports formulas and shared strings', async () => {
    const bytes = workbookToXlsx(fixtureWorkbook());
    const files = await readZip(bytes);
    const sheet1 = new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml')!);
    expect(sheet1).toContain('<f>B2*0.2</f>');
    expect(sheet1).toContain('t="s"');
    const shared = new TextDecoder().decode(files.get('xl/sharedStrings.xml')!);
    expect(shared).toContain('Month');
  });

  it('exports merges and number formats', async () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 20, columns: 10, data: [['title'], [1234.5]] }],
    });
    const ws = wb.activeWorksheet;
    ws.merge('A1:B1');
    ws.setNumberFormat('A2', '#,##0.00');
    const bytes = workbookToXlsx(wb);
    const files = await readZip(bytes);
    const sheet = new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml')!);
    expect(sheet).toContain('<mergeCell ref="A1:B1"/>');
    expect(sheet).toContain('s="1"');
    const styles = new TextDecoder().decode(files.get('xl/styles.xml')!);
    expect(styles).toContain('#,##0.00');
  });
});

describe('XLSX import (§35.2)', () => {
  it('reads multi-sheet values and formulas', async () => {
    const bytes = workbookToXlsx(fixtureWorkbook());
    const imported = await workbookFromXlsx(bytes);
    expect(imported.getWorksheet('Sales')).toBeDefined();
    expect(imported.getWorksheet('Notes')).toBeDefined();
    const sales = imported.getWorksheet('Sales')!;
    expect(sales.getValue(1, 1)).toBe(1200);
    expect(sales.cells.getCell(1, 2)?.formula).toBe('=B2*0.2');
    const notes = imported.getWorksheet('Notes')!;
    expect(notes.getValue(0, 0)).toBe('hello world');
    expect(notes.getValue(1, 0)).toBe(2);
  });

  it('imports merges and number formats', async () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 20, columns: 10, data: [['title'], [1234.5]] }],
    });
    const ws = wb.activeWorksheet;
    ws.merge('A1:B1');
    ws.setNumberFormat('A2', '#,##0.00');
    const bytes = workbookToXlsx(wb);
    const imported = await workbookFromXlsx(bytes);
    const importedSheet = imported.activeWorksheet;
    expect(importedSheet.merges.all).toHaveLength(1);
    expect(importedSheet.getNumberFormat(1, 0)).toBe('#,##0.00');
    expect(importedSheet.getValue(1, 0)).toBe(1234.5);
  });

  it('imports booleans and numbers typed correctly', async () => {
    const wb = createGrid(null, {
      worksheets: [{ rows: 5, columns: 5, data: [[true, 42, 'text']] }],
    });
    const bytes = workbookToXlsx(wb);
    const imported = await workbookFromXlsx(bytes);
    const sheet = imported.activeWorksheet;
    expect(sheet.getValue(0, 0)).toBe(true);
    expect(sheet.getValue(0, 1)).toBe(42);
    expect(sheet.getValue(0, 2)).toBe('text');
  });
});

describe('XLSX round-trip (§35.5)', () => {
  it('survives export → import → export semantically', async () => {
    const wb = fixtureWorkbook();
    const bytes1 = workbookToXlsx(wb);
    const imported = await workbookFromXlsx(bytes1);
    const bytes2 = workbookToXlsx(imported);
    const reimported = await workbookFromXlsx(bytes2);

    for (const original of wb.worksheets) {
      const sheet = reimported.getWorksheet(original.name)!;
      expect(sheet).toBeDefined();
      const used = original.cells.usedRange;
      const used2 = sheet.cells.usedRange;
      expect(used2?.bottom).toBe(used?.bottom);
      for (let r = 0; r <= (used?.bottom ?? 0); r++) {
        for (let c = 0; c <= (used?.right ?? 0); c++) {
          const record = original.cells.getCell(r, c);
          if (!record) continue;
          const expectedFormula = record.formula;
          const expectedRaw = record.raw;
          if (expectedFormula !== undefined) {
            expect(sheet.cells.getCell(r, c)?.formula).toBe(expectedFormula);
          } else {
            expect(sheet.cells.getCell(r, c)?.raw).toBe(expectedRaw);
          }
        }
      }
    }
  });

  it('evaluates imported formulas identically', async () => {
    const bytes = workbookToXlsx(fixtureWorkbook());
    const imported = await workbookFromXlsx(bytes);
    const sales = imported.getWorksheet('Sales')!;
    expect(sales.getValue(1, 2)).toBe(240);
    expect(sales.getValue(2, 2)).toBe(300);
  });

  it('empty workbook round-trips', async () => {
    const wb = createGrid(null, { worksheets: [{ rows: 10, columns: 5 }] });
    const bytes = workbookToXlsx(wb);
    const imported = await workbookFromXlsx(bytes);
    expect(imported.getWorksheet('Sheet1')).toBeDefined();
    expect(imported.activeWorksheet.cells.usedRange).toBeUndefined();
  });
});

