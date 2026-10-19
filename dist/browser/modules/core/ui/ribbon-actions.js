document.currentScript.__ezygridRegister("core/ui/ribbon-actions", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkedRange = checkedRange;
exports.applyBorders = applyBorders;
exports.validateChart = validateChart;
exports.updateTable = updateTable;
const model_1 = require("@ezygrid/model");
const charts_js_1 = require("../charts.js");
function checkedRange(sheet, value) {
    const range = (0, model_1.parseRange)(value);
    if (range.top < 0 || range.left < 0 || range.bottom >= sheet.rowCount || range.right >= sheet.columnCount)
        throw new Error('Range is outside this worksheet.');
    return range;
}
function applyBorders(sheet, range, preset, color = '#64748b', width = 1, line = 'solid') {
    const rect = checkedRange(sheet, range);
    for (let row = rect.top; row <= rect.bottom; row++)
        for (let column = rect.left; column <= rect.right; column++) {
            const borders = { ...sheet.getStyle(row, column)?.borders };
            for (const edge of ['top', 'right', 'bottom', 'left']) {
                const outside = edge === 'top' ? row === rect.top : edge === 'bottom' ? row === rect.bottom : edge === 'left' ? column === rect.left : column === rect.right;
                if (preset === 'None')
                    borders[edge] = null;
                else if (preset === 'All' || (preset === 'Outside' && outside) || preset.toLowerCase() === edge)
                    borders[edge] = { width, style: line, color };
            }
            sheet.setStyle((0, model_1.toA1)(row, column), { borders });
        }
}
function validateChart(sheet, spec) {
    const range = checkedRange(sheet, spec.source);
    if (range.right <= range.left || range.bottom - range.top + 1 <= (spec.firstRowIsHeader !== false ? 1 : 0))
        throw new Error('Select a category column and at least one numeric series, including data rows.');
    if (!(0, charts_js_1.readChartData)(sheet, spec).series.some(series => series.values.some(value => value !== null)))
        throw new Error('This range has no numeric series. Select cells containing numbers.');
}
function updateTable(sheet, table, changes) {
    const current = sheet.tables.all().find(item => item.id === table.id);
    if (!current)
        throw new Error('This table is no longer available.');
    const name = changes.name?.trim() ?? current.name;
    if (!name)
        throw new Error('Enter a table name.');
    if (sheet.workbook.worksheets.some(ws => ws.tables.all().some(item => item.id !== table.id && item.name.toLowerCase() === name.toLowerCase())) || (name.toLowerCase() !== current.name.toLowerCase() && [...sheet.workbook.definedNames.keys()].some(key => key.toLowerCase() === name.toLowerCase())))
        throw new Error('That formula name is already used.');
    const headerRow = changes.headerRow ?? current.headerRow;
    const totalRow = changes.totalRow ?? current.totalRow;
    if (headerRow && current.range.top === current.range.bottom)
        throw new Error('Include a data row below the column titles.');
    if (name === current.name && headerRow === current.headerRow && totalRow === current.totalRow)
        return;
    sheet.tables.remove(current.name);
    sheet.addTable({ name, range: (0, model_1.rectToRange)(current.range), headerRow, totalRow });
    sheet.getTable(name).id = current.id;
}

});
