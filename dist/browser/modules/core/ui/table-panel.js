document.currentScript.__ezygridRegister("core/ui/table-panel", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openTablePanel = openTablePanel;
const model_1 = require("@ezygrid/model");
const format_js_1 = require("../format.js");
const dom_js_1 = require("./dom.js");
/** Suggest the connected data block without changing the worksheet selection. */
function dataRegion(sheet, selection) {
    const bounds = { ...selection };
    if (bounds.top !== bounds.bottom || bounds.left !== bounds.right)
        return bounds;
    const used = sheet.cells.usedRange;
    const filled = (row, column) => {
        const value = sheet.getValue(row, column);
        return value !== null && value !== undefined && value !== '';
    };
    if (!used || !filled(bounds.top, bounds.left))
        return bounds;
    const rowHasData = (row) => {
        for (let c = bounds.left; c <= bounds.right; c++)
            if (filled(row, c))
                return true;
        return false;
    };
    const columnHasData = (column) => {
        for (let r = bounds.top; r <= bounds.bottom; r++)
            if (filled(r, column))
                return true;
        return false;
    };
    let changed;
    do {
        const before = (0, model_1.rectToRange)(bounds);
        while (bounds.left > used.left && columnHasData(bounds.left - 1))
            bounds.left--;
        while (bounds.right < Math.min(used.right, sheet.columnCount - 1) && columnHasData(bounds.right + 1))
            bounds.right++;
        while (bounds.top > used.top && rowHasData(bounds.top - 1))
            bounds.top--;
        while (bounds.bottom < Math.min(used.bottom, sheet.rowCount - 1) && rowHasData(bounds.bottom + 1))
            bounds.bottom++;
        changed = before !== (0, model_1.rectToRange)(bounds);
    } while (changed);
    return bounds;
}
function openTablePanel(host, tableId) {
    const { doc, renderer } = host;
    const sheet = host.sheet;
    const selected = renderer.selection.primary;
    const table = tableId ? sheet.tables.all().find(item => item.id === tableId)
        : sheet.tables.all().find(item => selected.top >= item.range.top && selected.left >= item.range.left && selected.bottom <= item.range.bottom && selected.right <= item.range.right);
    const opener = doc.activeElement;
    const panel = host.toolDialog(table ? 'Table options' : 'Format as table', () => !table || sheet.tables.all().some(item => item.id === table.id));
    panel.classList.add('ezg-object-dialog', 'ezg-table-dialog');
    const body = (0, dom_js_1.node)(doc, 'form', 'ezg-object-body ezg-table-body');
    body.id = `ezg-table-${Math.random().toString(36).slice(2)}`;
    body.noValidate = true;
    body.append((0, dom_js_1.node)(doc, 'p', 'ezg-hint', 'Add alternating row shading to your data. Your values stay in the same cells.'));
    const selectionCard = (0, dom_js_1.node)(doc, 'div', 'ezg-table-selection');
    const selectionTitle = (0, dom_js_1.node)(doc, 'strong');
    const selectionAddress = (0, dom_js_1.node)(doc, 'span', 'ezg-hint');
    const useSelection = (0, dom_js_1.button)(doc, 'Use selected cells', () => {
        rangeInput.value = (0, model_1.rectToRange)(renderer.selection.primary);
        renderPreview();
    });
    selectionCard.append(selectionTitle, selectionAddress, useSelection);
    body.append(selectionCard);
    const input = (name, label, value, parent) => {
        const wrapper = (0, dom_js_1.node)(doc, 'label', 'ezg-field', label);
        const control = (0, dom_js_1.node)(doc, 'input');
        control.name = name;
        control.value = value;
        control.setAttribute('aria-label', label);
        wrapper.append(control);
        parent.append(wrapper);
        return control;
    };
    const checkbox = (name, label, checked, parent) => {
        const wrapper = (0, dom_js_1.node)(doc, 'label', 'ezg-table-check');
        const control = (0, dom_js_1.node)(doc, 'input');
        control.type = 'checkbox';
        control.name = name;
        control.checked = checked;
        control.setAttribute('aria-label', label);
        wrapper.append(control, (0, dom_js_1.node)(doc, 'span', '', label));
        parent.append(wrapper);
        return control;
    };
    const headers = checkbox('header', 'First row contains column titles', table?.headerRow ?? true, body);
    const previewLabel = (0, dom_js_1.node)(doc, 'span', 'ezg-table-preview-label', 'Preview');
    const preview = (0, dom_js_1.node)(doc, 'div', 'ezg-table-preview');
    const status = (0, dom_js_1.node)(doc, 'p', 'ezg-object-error');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    body.append(previewLabel, preview, status);
    const advanced = (0, dom_js_1.node)(doc, 'details', 'ezg-object-advanced');
    advanced.append((0, dom_js_1.node)(doc, 'summary', '', 'Advanced'));
    const advancedFields = (0, dom_js_1.node)(doc, 'div', 'ezg-form');
    advanced.append(advancedFields);
    const rangeInput = input('range', 'Cell addresses', (0, model_1.rectToRange)(table?.range ?? dataRegion(sheet, selected)), advancedFields);
    const allNames = new Set(host.workbook.worksheets.flatMap(ws => ws.tables.all().map(item => item.name.toLowerCase())));
    for (const name of host.workbook.definedNames.keys())
        allNames.add(name.toLowerCase());
    let index = 1;
    while (allNames.has(`table${index}`))
        index++;
    const generatedName = `Table${index}`;
    const nameInput = input('name', 'Name used in formulas', table?.name ?? generatedName, advancedFields);
    nameInput.placeholder = generatedName;
    advancedFields.append((0, dom_js_1.node)(doc, 'p', 'ezg-hint', 'A name is assigned automatically. Change it only if you want a specific name for formulas.'));
    const lastRow = checkbox('total', 'Make the last row bold', table?.totalRow ?? false, advancedFields);
    advancedFields.append((0, dom_js_1.node)(doc, 'p', 'ezg-hint', 'Formatting only. This does not add totals or calculate sums.'));
    body.append(advanced);
    const existing = (0, dom_js_1.node)(doc, 'details', 'ezg-object-list');
    existing.append((0, dom_js_1.node)(doc, 'summary', '', 'Other tables on this sheet'));
    for (const item of sheet.tables.all().filter(item => item.id !== table?.id)) {
        const title = item.columns.slice(0, 2).map(column => column.name).join(', ') || item.name;
        existing.append((0, dom_js_1.button)(doc, `Edit table at ${(0, model_1.rectToRange)(item.range)}`, () => openTablePanel(host, item.id)));
        const description = (0, dom_js_1.node)(doc, 'p', 'ezg-hint', `${title} · ${(0, model_1.rectToRange)(item.range)}`);
        existing.append(description);
    }
    if (existing.children.length > 1)
        body.append(existing);
    const footer = (0, dom_js_1.node)(doc, 'div', 'ezg-object-footer ezg-table-footer');
    const close = () => {
        host.closeToolDialog();
        if (opener?.isConnected)
            opener.focus({ preventScroll: true });
        else
            renderer.focus();
    };
    if (table)
        footer.append((0, dom_js_1.button)(doc, 'Remove table', () => {
            host.mutate(() => {
                const current = sheet.tables.all().find(item => item.id === table.id);
                if (current)
                    sheet.tables.remove(current.name);
            });
            host.closeToolDialog();
            renderer.focus();
            host.message('Table removed. Your cell data is unchanged.');
        }));
    const apply = (0, dom_js_1.button)(doc, table ? 'Save changes' : 'Create table', () => { });
    apply.className = 'ezg-primary';
    apply.type = 'submit';
    apply.setAttribute('form', body.id);
    footer.append((0, dom_js_1.button)(doc, 'Cancel', close), apply);
    panel.append(body, footer);
    let disposed = false;
    host.setToolCleanup(() => { disposed = true; });
    function validate() {
        const bounds = (0, model_1.parseRange)(rangeInput.value.trim());
        if (bounds.top < 0 || bounds.left < 0 || bounds.bottom >= sheet.rowCount || bounds.right >= sheet.columnCount)
            throw new Error('Select cells inside this worksheet.');
        if (headers.checked && bounds.top === bounds.bottom)
            throw new Error('Include at least one row of data below the column titles, or turn off column titles.');
        let hasData = false;
        sheet.cells.forEach((row, column, cell) => {
            if (row >= bounds.top && row <= bounds.bottom && column >= bounds.left && column <= bounds.right && (cell.formula !== undefined || (cell.raw !== null && cell.raw !== undefined && cell.raw !== '')))
                hasData = true;
        });
        if (!hasData)
            throw new Error('Select cells containing data, then choose Use selected cells.');
        const overlap = sheet.tables.all().find(item => item.id !== table?.id && !(item.range.bottom < bounds.top || item.range.top > bounds.bottom || item.range.right < bounds.left || item.range.left > bounds.right));
        if (overlap)
            throw new Error(`These cells already belong to ${overlap.name}. Select a different area or edit that table.`);
        const name = nameInput.value.trim() || table?.name || generatedName;
        if (host.workbook.worksheets.some(ws => ws.tables.all().some(item => item.id !== table?.id && item.name.toLowerCase() === name.toLowerCase())))
            throw new Error('That formula name is already used. Choose another name under Advanced.');
        if (name !== table?.name && [...host.workbook.definedNames.keys()].some(item => item.toLowerCase() === name.toLowerCase()))
            throw new Error('That formula name is already used. Choose another name under Advanced.');
        return { bounds, name };
    }
    function renderPreview() {
        if (disposed || !panel.isConnected || host.sheet.id !== sheet.id)
            return;
        preview.replaceChildren();
        try {
            const { bounds } = validate();
            const rows = bounds.bottom - bounds.top + 1;
            const columns = bounds.right - bounds.left + 1;
            selectionTitle.textContent = `${rows} ${rows === 1 ? 'row' : 'rows'} × ${columns} ${columns === 1 ? 'column' : 'columns'}`;
            selectionAddress.textContent = (0, model_1.rectToRange)(bounds);
            previewLabel.textContent = rows > 6 || columns > 4 ? 'Preview · first 6 rows and 4 columns' : 'Preview';
            const sample = (0, dom_js_1.node)(doc, 'table');
            sample.setAttribute('aria-label', 'Table formatting preview');
            const head = (0, dom_js_1.node)(doc, 'thead');
            const data = (0, dom_js_1.node)(doc, 'tbody');
            for (let row = bounds.top; row <= Math.min(bounds.bottom, bounds.top + 5); row++) {
                const tr = (0, dom_js_1.node)(doc, 'tr');
                const heading = headers.checked && row === bounds.top;
                if (lastRow.checked && row === bounds.bottom)
                    tr.classList.add('ezg-table-last-row');
                const bandIndex = row - bounds.top - (headers.checked ? 1 : 0);
                if (!heading && !(lastRow.checked && row === bounds.bottom) && bandIndex % 2 === 1)
                    tr.classList.add('ezg-table-band');
                for (let column = bounds.left; column <= Math.min(bounds.right, bounds.left + 3); column++) {
                    const cell = (0, dom_js_1.node)(doc, heading ? 'th' : 'td');
                    if (heading)
                        cell.setAttribute('scope', 'col');
                    cell.textContent = (0, format_js_1.formatValue)(sheet.getValue(row, column), sheet.getNumberFormat(row, column));
                    cell.title = cell.textContent;
                    const style = { ...sheet.getStyle(row, column), ...sheet.conditionalFormats.evaluate(sheet, row, column) };
                    if (style.background)
                        cell.style.background = style.background;
                    if (style.color)
                        cell.style.color = style.color;
                    if (style.bold !== undefined && !(lastRow.checked && row === bounds.bottom))
                        cell.style.fontWeight = style.bold ? 'bold' : 'normal';
                    tr.append(cell);
                }
                (heading ? head : data).append(tr);
            }
            sample.append(head, data);
            preview.append(sample);
            status.textContent = '';
            apply.disabled = false;
        }
        catch (error) {
            selectionTitle.textContent = 'Choose the data to format';
            selectionAddress.textContent = rangeInput.value;
            status.textContent = error instanceof Error ? error.message : 'Select a valid group of cells.';
            preview.append((0, dom_js_1.node)(doc, 'p', 'ezg-hint', 'Your selected data will appear here before you apply changes.'));
            apply.disabled = true;
        }
    }
    body.addEventListener('input', renderPreview);
    body.addEventListener('change', renderPreview);
    body.addEventListener('keydown', event => { if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
    } });
    body.addEventListener('submit', event => {
        event.preventDefault();
        try {
            const { bounds, name } = validate();
            const current = table ? sheet.tables.all().find(item => item.id === table.id) : undefined;
            const changed = !current || current.name !== name || (0, model_1.rectToRange)(current.range) !== (0, model_1.rectToRange)(bounds) || current.headerRow !== headers.checked || current.totalRow !== lastRow.checked;
            if (changed)
                host.mutate(() => {
                    if (current)
                        sheet.tables.remove(current.name);
                    sheet.addTable({ name, range: (0, model_1.rectToRange)(bounds), headerRow: headers.checked, totalRow: lastRow.checked });
                    const saved = sheet.getTable(name);
                    if (current)
                        saved.id = current.id;
                });
            host.closeToolDialog();
            renderer.selection.setActive(bounds.top, bounds.left);
            renderer.focus();
            if (changed)
                host.message(table ? 'Table updated.' : 'Table created. Select cells in it to use Table tools.');
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
            apply.disabled = true;
        }
    });
    renderPreview();
    headers.focus({ preventScroll: true });
}

});
