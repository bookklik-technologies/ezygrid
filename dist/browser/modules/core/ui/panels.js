document.currentScript.__ezygridRegister("core/ui/panels", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openPanel = openPanel;
const dom_js_1 = require("./dom.js");
const model_1 = require("@ezygrid/model");
const search_js_1 = require("../search.js");
const replace_js_1 = require("../replace.js");
const sort_js_1 = require("../sort.js");
const fill_js_1 = require("../fill.js");
const object_panel_js_1 = require("./object-panel.js");
const table_panel_js_1 = require("./table-panel.js");
const ribbon_actions_js_1 = require("./ribbon-actions.js");
function openPanel(host, name) {
    if (name === 'layout' || name === 'headers') {
        host.showLayoutControls(name === 'headers');
        return;
    }
    if (name === 'tables') {
        (0, table_panel_js_1.openTablePanel)(host);
        return;
    }
    if (name === 'charts' || name === 'images' || name === 'shapes') {
        (0, object_panel_js_1.openObjectPanel)(host, name === 'charts' ? 'chart' : name === 'images' ? 'image' : 'shape');
        return;
    }
    const { doc, renderer } = host;
    const sheet = host.sheet;
    const selection = renderer.selection.primary;
    const active = renderer.selection.state.active;
    const text = (key, label, value = '', required = false) => ({ key, label, value, required });
    const num = (key, label, value = 0, min = 0, max) => ({ key, label, value, type: 'number', min, max, required: true });
    const check = (key, label, value = false) => ({ key, label, value, type: 'checkbox' });
    const pick = (key, label, options, value = options[0]) => ({ key, label, options, value });
    const range = (value = host.range) => text('range', 'Cell range', value, true);
    const validateRange = (value) => (0, ribbon_actions_js_1.checkedRange)(sheet, value);
    const attach = (panel, fields, apply, label = 'Apply') => {
        const content = (0, dom_js_1.form)(doc, fields, (v) => {
            try {
                if (v.range)
                    validateRange(v.range);
                apply(v);
            }
            catch (error) {
                host.message(error);
            }
        }, label);
        panel.append(content);
        return content;
    };
    const list = (panel, entries) => {
        const element = (0, dom_js_1.node)(doc, 'div', 'ezg-list');
        for (const entry of entries)
            element.append((0, dom_js_1.button)(doc, entry.label, entry.run));
        panel.append(element);
    };
    const addFields = (target, fields) => {
        const extra = (0, dom_js_1.form)(doc, fields, () => { });
        extra.lastElementChild?.remove();
        for (const child of Array.from(extra.children))
            target.insertBefore(child, target.querySelector('[type=submit]'));
    };
    if (name === 'format' || name === 'borders') {
        const bordersOnly = name === 'borders';
        const style = sheet.getStyle(active.row, active.column) ?? {};
        const panel = host.toolDialog(bordersOnly ? 'Border options' : 'Cell format');
        const formats = bordersOnly ? [] : [pick('vertical', 'Vertical alignment', ['top', 'middle', 'bottom'], style.verticalAlign ?? 'top'),
            pick('number', 'Number format', ['General', '0', '0.00', '#,##0.00', '0%', '0.00%', '$#,##0.00', 'yyyy-mm-dd', 'Custom'], sheet.getNumberFormat(active.row, active.column) ?? 'General'),
            text('mask', 'Custom number format')];
        attach(panel, [range(), ...formats, pick('border', 'Borders', ['Keep existing', 'All', 'Outside', 'Top', 'Right', 'Bottom', 'Left', 'None'], bordersOnly ? 'All' : 'Keep existing'),
            { key: 'color', label: 'Border color', type: 'color', value: '#64748b' }, num('width', 'Border width', 1, 1, 8),
            pick('line', 'Border style', ['solid', 'dashed', 'dotted']),
        ], (v) => host.mutate(() => {
            if (!bordersOnly) {
                sheet.setStyle(v.range, { verticalAlign: v.vertical });
                sheet.setNumberFormat(v.range, v.number === 'Custom' ? v.mask : v.number);
            }
            if (v.border !== 'Keep existing')
                (0, ribbon_actions_js_1.applyBorders)(sheet, v.range, v.border, v.color, Number(v.width), v.line);
        }));
    }
    else if (name === 'find') {
        const panel = host.toolDialog('Find and replace');
        let nextIndex = 0;
        const fields = [text('query', 'Find', '', true), text('replacement', 'Replace with'), check('matchCase', 'Match case'), check('wholeCell', 'Match entire cell'), check('searchFormulas', 'Search formula text'), pick('action', 'Action', ['Find next', 'Replace next', 'Replace all'])];
        attach(panel, fields, (v) => {
            const options = { matchCase: v.matchCase === 'true', wholeCell: v.wholeCell === 'true', searchFormulas: v.searchFormulas === 'true' };
            if (v.action === 'Find next') {
                const hits = new search_js_1.SearchService().find(sheet, v.query, options);
                const hit = hits[nextIndex++ % hits.length];
                if (hit)
                    renderer.navigateToAddress((0, model_1.toA1)(hit.row, hit.column));
                host.message(hits.length ? `${hits.length} matching cells` : 'No matches found.');
            }
            else
                host.mutate(() => {
                    if (v.action === 'Replace all')
                        host.message(`${(0, replace_js_1.replaceAll)(sheet, v.query, v.replacement, options)} cells replaced.`);
                    else {
                        const hit = (0, replace_js_1.replace)(sheet, v.query, v.replacement, renderer.selection.state.active, options);
                        if (hit)
                            renderer.navigateToAddress((0, model_1.toA1)(hit.row, hit.column));
                        else
                            host.message('No replacement made.');
                    }
                });
        }, 'Run');
    }
    else if (name === 'sort') {
        const panel = host.toolDialog('Sort');
        const columns = Array.from({ length: sheet.columnCount }, (_, i) => (0, model_1.toA1)(0, i).replace(/1$/, ''));
        const fields = [range(), check('header', 'First row is a header', true)];
        let sortCount = 1;
        const sortFields = (i) => [pick(`column${i}`, i ? `Then by ${i + 1}` : 'Sort by', ['None', ...columns], i ? 'None' : columns[selection.left]), pick(`direction${i}`, 'Direction', ['Ascending', 'Descending'])];
        fields.push(...sortFields(0));
        const sortForm = attach(panel, fields, (v) => host.mutate(() => {
            const rect = validateRange(v.range);
            if (v.header === 'true')
                rect.top++;
            const specs = [];
            for (let i = 0; i < sortCount; i++)
                if (v[`column${i}`] !== 'None') {
                    const column = columns.indexOf(v[`column${i}`]);
                    if (column < rect.left || column > rect.right)
                        throw new Error('Sort columns must be inside the selected range.');
                    specs.push({ column, direction: v[`direction${i}`] === 'Ascending' ? 'asc' : 'desc' });
                }
            new sort_js_1.SortService().sort(sheet, rect, specs);
        }), 'Sort');
        panel.append((0, dom_js_1.button)(doc, 'Add sort level', () => addFields(sortForm, sortFields(sortCount++))));
    }
    else if (name === 'fill') {
        const panel = host.toolDialog('Fill series');
        attach(panel, [text('source', 'Seed range', host.range, true), text('target', 'Fill range (including seed)', host.range, true)], (v) => host.mutate(() => new fill_js_1.FillService().fillRange(sheet, validateRange(v.source), validateRange(v.target))));
    }
    else if (name === 'names') {
        const panel = host.toolDialog('Defined names');
        list(panel, [...host.workbook.definedNames].map(([key]) => ({ label: `Remove ${key}`, run: () => { host.mutate(() => host.workbook.removeDefinedName(key)); openPanel(host, name); } })));
        attach(panel, [text('name', 'Name', '', true), pick('kind', 'Type', ['Range', 'Value']), text('value', 'Range reference or constant', host.range, true)], (v) => {
            host.mutate(() => host.workbook.setDefinedName(v.name, v.kind === 'Range' ? { type: 'range', ref: v.value } : { type: 'value', value: v.value !== '' && Number.isFinite(Number(v.value)) ? Number(v.value) : v.value }));
            openPanel(host, name);
        }, 'Save name');
    }
    else if (name === 'validation') {
        const panel = host.toolDialog('Validation');
        const edit = (id) => {
            const rule = sheet.validations.all().find((item) => item.id === id);
            if (rule?.predicate) {
                host.message('This custom validator is supplied by the host application.');
                return;
            }
            const target = host.toolDialog(rule ? 'Edit validation' : 'Validation', () => !id || sheet.validations.all().some(item => item.id === id));
            attach(target, [range(rule?.range), pick('type', 'Rule', ['number', 'list', 'textLength'], rule?.type ?? 'number'),
                pick('action', 'Invalid values', ['reject', 'warning', 'mark'], rule?.action ?? 'reject'),
                text('min', 'Minimum (optional)', rule?.min?.toString()), text('max', 'Maximum (optional)', rule?.max?.toString()),
                num('length', 'Exact text length', rule?.length ?? 10), text('values', 'Allowed values (comma separated)', rule?.values?.join(', ')), text('message', 'Validation message', rule?.message),
                pick('editor', 'Cell editor', ['Keep existing', 'text', 'number', 'date', 'checkbox', 'dropdown']),
            ], (v) => {
                const values = v.values.split(',').map((value) => value.trim());
                if ((v.min && !Number.isFinite(Number(v.min))) || (v.max && !Number.isFinite(Number(v.max))))
                    throw new Error('Minimum and maximum must be numbers.');
                host.mutate(() => {
                    if (id)
                        sheet.removeValidation(id);
                    sheet.addValidation({ range: v.range, type: v.type, action: v.action, min: v.min ? Number(v.min) : undefined, max: v.max ? Number(v.max) : undefined, length: Number(v.length), values, message: v.message });
                    if (v.editor !== 'Keep existing')
                        sheet.setCellEditor(v.range, v.editor, { values });
                });
                openPanel(host, name);
            });
        };
        list(panel, sheet.validations.all().flatMap((rule) => [
            { label: `${rule.range}: ${rule.type}${rule.predicate ? ' (host supplied)' : ''}`, run: () => edit(rule.id) },
            { label: `Remove rule for ${rule.range}`, run: () => { host.mutate(() => sheet.removeValidation(rule.id)); openPanel(host, name); } },
        ]));
        panel.append((0, dom_js_1.button)(doc, 'Add validation', () => edit()));
        const editors = new Set([...sheet.cellEditors.values()].map((editor) => editor.type));
        if (editors.size)
            panel.append((0, dom_js_1.node)(doc, 'p', 'ezg-hint', `Cell editors in this sheet: ${[...editors].join(', ')}`));
    }
    else if (name === 'conditional') {
        const panel = host.toolDialog('Conditional formatting');
        const edit = (rule) => {
            if (rule?.predicate) {
                host.message('This expression rule is supplied by the host application.');
                return;
            }
            const target = host.toolDialog(rule ? 'Edit conditional format' : 'Conditional format', () => !rule || sheet.conditionalFormats.all().some(item => item.id === rule.id));
            attach(target, [range(rule?.range), pick('type', 'Condition', ['cellIs', 'containsText', 'topN', 'duplicates'], rule?.type ?? 'cellIs'), pick('operator', 'Comparison', ['gt', 'lt', 'gte', 'lte', 'eq', 'neq'], rule?.operator ?? 'gt'), text('value', 'Value or text', String(rule?.text ?? rule?.value ?? '')), num('n', 'Top count', rule?.n ?? 10, 1), num('priority', 'Priority (lower first)', rule?.priority ?? 0), check('stop', 'Stop if true', rule?.stopIfTrue), { key: 'color', label: 'Text color', type: 'color', value: rule?.style.color ?? '#00674a' }, { key: 'background', label: 'Fill color', type: 'color', value: rule?.style.background ?? '#e6fff4' }, check('bold', 'Bold', rule?.style.bold)], (v) => {
                host.mutate(() => {
                    if (rule)
                        sheet.conditionalFormats.remove(rule.id);
                    sheet.conditionalFormats.add({ range: v.range, type: v.type, operator: v.operator, value: v.value, text: v.value, n: Number(v.n), priority: Number(v.priority), stopIfTrue: v.stop === 'true', style: { ...rule?.style, color: v.color, background: v.background, bold: v.bold === 'true' } });
                });
                openPanel(host, name);
            });
        };
        list(panel, sheet.conditionalFormats.all().flatMap((rule) => [
            { label: `${rule.range}: ${rule.type}${rule.predicate ? ' (host supplied)' : ''}`, run: () => edit(rule) },
            { label: `Remove ${rule.type} rule`, run: () => { host.mutate(() => sheet.conditionalFormats.remove(rule.id)); openPanel(host, name); } },
        ]));
        panel.append((0, dom_js_1.button)(doc, 'Add rule', () => edit()));
    }
    else if (name === 'pivots') {
        const panel = host.toolDialog('Pivot tables');
        const edit = (pivot) => {
            const target = host.toolDialog(pivot ? 'Edit pivot' : 'Create pivot', () => !pivot || sheet.pivotSpecs.some(item => item.id === pivot.id));
            const fields = [range(pivot?.source), text('anchor', 'Output cell', pivot?.anchor ?? (0, model_1.toA1)(selection.bottom + 2, selection.left), true), text('rows', 'Group by columns (relative numbers, e.g. 1, 2)', pivot?.rows.map((column) => column + 1).join(', ') ?? '1', true)];
            let count = Math.max(1, pivot?.values.length ?? 0);
            const valueFields = (i) => [num(`column${i}`, `Value column ${i + 1} (0 to skip)`, (pivot?.values[i]?.column ?? (i ? -1 : 1)) + 1), pick(`agg${i}`, 'Aggregation', ['SUM', 'COUNT', 'COUNTA', 'AVG', 'MIN', 'MAX'], pivot?.values[i]?.agg ?? 'SUM'), text(`label${i}`, 'Output label', pivot?.values[i]?.label)];
            for (let i = 0; i < count; i++)
                fields.push(...valueFields(i));
            const pivotForm = attach(target, fields, (v) => {
                const source = validateRange(v.range);
                validateRange(v.anchor);
                const rows = v.rows.split(',').map((value) => Number(value.trim()) - 1);
                const values = Array.from({ length: count }, (_, i) => ({ column: Number(v[`column${i}`]) - 1, agg: v[`agg${i}`], label: v[`label${i}`] || undefined })).filter((value) => value.column >= 0);
                if (!values.length || [...rows, ...values.map((value) => value.column)].some((column) => !Number.isInteger(column) || column < 0 || column > source.right - source.left))
                    throw new Error('Choose group and value columns inside the source range.');
                const spec = { source: v.range, anchor: v.anchor, rows, values };
                const anchor = (0, model_1.parseRange)(spec.anchor);
                const output = sheet.pivots.compute(sheet, { ...spec, id: pivot?.id ?? 'preview' });
                const endRow = anchor.top + output.rows.length + 1;
                const endColumn = anchor.left + output.header.length - 1;
                if (endRow >= sheet.rowCount || endColumn >= sheet.columnCount)
                    throw new Error('Pivot output exceeds worksheet size.');
                if (!(endRow < source.top || anchor.top > source.bottom || endColumn < source.left || anchor.left > source.right))
                    throw new Error('Pivot output must not overlap its source.');
                host.confirm('Write pivot results to the output range?', () => {
                    host.mutate(() => { if (pivot) {
                        Object.assign(pivot, spec);
                        sheet.pivots.refresh(sheet, pivot);
                    }
                    else
                        sheet.addPivot(spec); });
                    openPanel(host, name);
                });
            });
            target.append((0, dom_js_1.button)(doc, 'Add value field', () => addFields(pivotForm, valueFields(count++))));
        };
        list(panel, sheet.pivotSpecs.flatMap((pivot) => [
            { label: `${pivot.source} → ${pivot.anchor}`, run: () => edit(pivot) },
            { label: `Refresh pivot at ${pivot.anchor}`, run: () => host.mutate(() => sheet.pivots.refresh(sheet, pivot)) },
            { label: `Remove pivot definition at ${pivot.anchor}`, run: () => { host.mutate(() => sheet.pivotSpecs.splice(sheet.pivotSpecs.indexOf(pivot), 1)); openPanel(host, name); } },
        ]));
        panel.append((0, dom_js_1.button)(doc, 'Create pivot', () => edit()));
    }
}

});
