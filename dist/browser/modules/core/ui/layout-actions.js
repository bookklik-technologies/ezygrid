document.currentScript.__ezygridRegister("core/ui/layout-actions", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.columnName = columnName;
exports.columnIndex = columnIndex;
exports.readHeaderGroups = readHeaderGroups;
exports.writeHeaderGroups = writeHeaderGroups;
exports.shiftHeaderGroups = shiftHeaderGroups;
exports.commitLayout = commitLayout;
exports.fittedSizes = fittedSizes;
const workbook_js_1 = require("../workbook.js");
const format_js_1 = require("../format.js");
function columnName(index) {
    if (index < 0 || !Number.isInteger(index))
        return '?';
    let label = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
        label = String.fromCharCode(65 + (n - 1) % 26) + label;
    return label;
}
function columnIndex(label) {
    if (!/^[A-Z]+$/i.test(label.trim()))
        return -1;
    let index = 0;
    for (const character of label.trim().toUpperCase())
        index = index * 26 + character.charCodeAt(0) - 64;
    return index - 1;
}
function readHeaderGroups(levels) {
    return levels.map(level => {
        let column = 0;
        return level.map(group => {
            const span = typeof group === 'string' ? 1 : group.span;
            const item = { label: typeof group === 'string' ? group : group.title, from: columnName(column), to: columnName(column + span - 1) };
            column += span;
            return item;
        });
    });
}
function writeHeaderGroups(levels, columnCount) {
    return levels.map((level, levelIndex) => {
        const groups = level.map(group => ({ title: group.label, start: columnIndex(group.from), end: columnIndex(group.to) })).sort((a, b) => a.start - b.start);
        const result = [];
        let next = 0;
        for (const group of groups) {
            if (group.start < 0 || group.end < group.start || group.end >= columnCount)
                throw new Error(`Level ${levelIndex + 1}: choose valid first and last columns inside this worksheet.`);
            if (group.start < next)
                throw new Error(`Level ${levelIndex + 1}: header groups cannot overlap.`);
            if (group.start > next)
                result.push({ title: '', span: group.start - next });
            result.push({ title: group.title, span: group.end - group.start + 1 });
            next = group.end + 1;
        }
        return result;
    });
}
/** Update UI-managed header ranges alongside a column operation, in the same transaction. */
function shiftHeaderGroups(levels, at, count, insert) {
    return levels.map(level => {
        let column = 0;
        let next = 0;
        const result = [];
        for (const item of level) {
            const span = typeof item === 'string' ? 1 : item.span;
            const title = typeof item === 'string' ? item : item.title;
            let start = column;
            let end = column + span;
            column = end;
            if (insert) {
                if (start >= at)
                    start += count;
                if (end > at)
                    end += count;
            }
            else {
                const edge = (position) => position <= at ? position : position >= at + count ? position - count : at;
                start = edge(start);
                end = edge(end);
            }
            if (end <= start)
                continue;
            if (start > next)
                result.push({ title: '', span: start - next });
            result.push({ title, span: end - start });
            next = end;
        }
        return result;
    });
}
function commitLayout(host, action) {
    host.renderer.commitEdits();
    host.workbook.transaction(action);
    host.renderer.render();
}
/** Fit populated bands and reset empty custom-sized bands, without scanning an entire axis. */
function fittedSizes(sheet, axis, start, end, doc, fontFamily) {
    const context = doc.createElement('canvas').getContext('2d');
    const sizes = new Map();
    sheet.cells.forEach((row, column) => {
        const index = axis === 'row' ? row : column;
        if (index < start || index > end || sheet.merges.findAt(row, column))
            return;
        const text = (0, format_js_1.formatValue)(sheet.getValue(row, column), sheet.getNumberFormat(row, column));
        if (!text)
            return;
        const style = { ...sheet.getStyle(row, column), ...sheet.conditionalFormats.evaluate(sheet, row, column) };
        const table = sheet.tables.at(row, column);
        const bold = table?.totalRow && row === table.range.bottom ? true : style.bold ?? (table?.headerRow && row === table.range.top);
        const fontSize = style.fontSize ?? 13;
        if (context)
            context.font = `${style.italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${style.fontFamily ?? fontFamily}`;
        const lines = text.split(/\r?\n/);
        const widths = lines.map(line => context?.measureText(line).width ?? line.length * fontSize * .6);
        const lineCount = widths.reduce((sum, width) => sum + (style.wrap ? Math.max(1, Math.ceil(width / Math.max(1, sheet.columnSizes.sizeOf(column) - 12))) : 1), 0);
        const size = axis === 'row' ? lineCount * fontSize * 1.45 + 4 : Math.max(...widths) + 16;
        sizes.set(index, Math.max(sizes.get(index) ?? (axis === 'row' ? 16 : 24), Math.min(2000, Math.ceil(size))));
    });
    const current = axis === 'row' ? sheet.rowSizes : sheet.columnSizes;
    for (const index of current.getCustomSizes().keys())
        if (index >= start && index <= end && !sizes.has(index))
            sizes.set(index, axis === 'row' ? workbook_js_1.DEFAULT_ROW_HEIGHT : workbook_js_1.DEFAULT_COLUMN_WIDTH);
    return sizes;
}

});
