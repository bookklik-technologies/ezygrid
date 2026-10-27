document.currentScript.__ezygridRegister("core/ui/tools-ribbon", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectedTable = selectedTable;
exports.mountToolsRibbon = mountToolsRibbon;
exports.openObjectManager = openObjectManager;
const model_1 = require("@ezygrid/model");
const formula_1 = require("@ezygrid/formula");
const dom_js_1 = require("./dom.js");
const select_js_1 = require("./select.js");
const panels_js_1 = require("./panels.js");
const object_panel_js_1 = require("./object-panel.js");
const table_panel_js_1 = require("./table-panel.js");
const ribbon_actions_js_1 = require("./ribbon-actions.js");
const search_js_1 = require("../search.js");
const sort_js_1 = require("../sort.js");
const suite_topbar_js_1 = require("./suite-topbar.js");
function selectedTable(host) {
    if (host.renderer.objects.selected)
        return undefined;
    return host.sheet.tables.all().find(table => host.renderer.selection.state.ranges.every(range => range.top >= table.range.top && range.left >= table.range.left && range.bottom <= table.range.bottom && range.right <= table.range.right));
}
/** Each mounted tab owns its controls, refresh callbacks, and transient menus. */
function mountToolsRibbon(host, ribbon, tab) {
    const { doc, renderer } = host;
    const groups = [];
    const selects = [];
    const updates = [];
    let closeMenu;
    let disposed = false;
    let refreshing = false;
    const guard = (run) => () => {
        try {
            renderer.commitEdits();
            run();
            refresh();
        }
        catch (error) {
            host.message(error);
        }
    };
    const group = (label) => {
        const section = (0, dom_js_1.node)(doc, 'section', 'ezg-group ezg-tools-group');
        section.setAttribute('role', 'group');
        section.setAttribute('aria-label', label);
        const controls = (0, dom_js_1.node)(doc, 'div', 'ezg-tools-controls');
        section.append(controls, (0, dom_js_1.node)(doc, 'span', 'ezg-group-label', label));
        ribbon.append(section);
        groups.push(section);
        return controls;
    };
    const action = (target, label, run, icon, enabled) => {
        const control = (0, dom_js_1.button)(doc, label, guard(run), icon);
        if (icon)
            control.append((0, dom_js_1.node)(doc, 'span', '', label));
        target.append(control);
        if (enabled)
            updates.push(() => { control.disabled = !enabled(); });
        return control;
    };
    const command = (target, id) => target.append(host.commandButton(id, undefined, true));
    const field = (target, label, initial = '', type = 'text') => {
        const wrapper = (0, dom_js_1.node)(doc, 'label', 'ezg-ribbon-field');
        wrapper.append((0, dom_js_1.node)(doc, 'span', '', label));
        const input = (0, dom_js_1.node)(doc, 'input');
        input.type = type;
        input.value = initial;
        input.setAttribute('aria-label', label);
        input.name = label.toLowerCase().replaceAll(' ', '-');
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && type !== 'checkbox') {
                event.preventDefault();
                input.blur();
            }
        });
        wrapper.append(input);
        target.append(wrapper);
        return input;
    };
    const number = (target, label, value, min, max) => {
        const input = field(target, label, String(value), 'number');
        input.min = String(min);
        input.max = String(max);
        input.step = '1';
        input.required = true;
        return input;
    };
    const pick = (target, label, choices) => {
        const wrapper = (0, dom_js_1.node)(doc, 'label', 'ezg-ribbon-field');
        wrapper.append((0, dom_js_1.node)(doc, 'span', '', label));
        const input = (0, select_js_1.createSelect)(doc, { label, options: choices, popupHost: host.root });
        selects.push(input);
        wrapper.append(input);
        target.append(wrapper);
        return input;
    };
    const check = (target, label, checked) => {
        const input = field(target, label, '', 'checkbox');
        input.checked = checked;
        return input;
    };
    const sync = (input, value) => {
        updates.push(() => {
            if (doc.activeElement === input)
                return;
            if (input instanceof doc.defaultView.HTMLInputElement && input.type === 'checkbox')
                input.checked = Boolean(value());
            else
                input.value = String(value());
        });
    };
    const change = (input, apply) => input.addEventListener('change', guard(() => {
        if (input.reportValidity())
            apply();
    }));
    const menu = (target, label, entries) => {
        const control = action(target, label, () => {
            closeMenu?.();
            closeMenu = (0, suite_topbar_js_1.openSuiteMenu)(control, entries().map(entry => ({ ...entry, action: guard(entry.action) })));
        });
        control.setAttribute('aria-haspopup', 'menu');
        return control;
    };
    const continuous = () => renderer.selection.state.ranges.length === 1;
    if (tab === 'Home') {
        const alignment = group('Cell format');
        const vertical = pick(alignment, 'Vertical alignment', ['top', 'middle', 'bottom']);
        change(vertical, () => host.style({ verticalAlign: vertical.value }));
        sync(vertical, () => host.sheet.getStyle(renderer.selection.state.active.row, renderer.selection.state.active.column)?.verticalAlign ?? 'top');
        const formats = ['General', '0', '0.00', '#,##0.00', '0%', '0.00%', '$#,##0.00', 'yyyy-mm-dd', 'Custom'];
        const format = pick(alignment, 'Number format', formats);
        change(format, () => {
            if (format.value === 'Custom') {
                const range = host.range;
                const sheet = host.sheet;
                const active = renderer.selection.state.active;
                host.dialog('Custom number format', [{ key: 'mask', label: 'Number format', value: sheet.getNumberFormat(active.row, active.column) ?? 'General', required: true }], values => host.mutate(() => sheet.setNumberFormat(range, values.mask)));
            }
            else
                host.mutate(() => host.sheet.setNumberFormat(host.range, format.value));
        });
        sync(format, () => { const active = renderer.selection.state.active; const value = host.sheet.getNumberFormat(active.row, active.column) ?? 'General'; return formats.includes(value) ? value : 'Custom'; });
        menu(alignment, 'Borders', () => ['All', 'Outside', 'Top', 'Right', 'Bottom', 'Left', 'None'].map(preset => ({ label: `${preset} borders`, action: () => host.mutate(() => (0, ribbon_actions_js_1.applyBorders)(host.sheet, host.range, preset)) })));
        action(alignment, 'Border options', () => (0, panels_js_1.openPanel)(host, 'borders'));
        const find = group('Find and replace');
        const query = field(find, 'Find');
        query.name = 'query';
        let index = 0;
        let signature = '';
        const next = guard(() => {
            if (!query.value) {
                query.focus();
                return;
            }
            const key = `${host.sheet.id}:${query.value}`;
            if (key !== signature) {
                index = 0;
                signature = key;
            }
            const hits = new search_js_1.SearchService().find(host.sheet, query.value);
            const hit = hits[index++ % hits.length];
            if (hit)
                renderer.navigateToAddress((0, model_1.toA1)(hit.row, hit.column));
            host.message(hits.length ? `${hits.length} matching cells` : 'No matches found.');
        });
        action(find, 'Find next', next, 'find');
        query.addEventListener('keydown', event => { if (event.key === 'Enter') {
            event.preventDefault();
            next();
        } });
        action(find, 'Replace options', () => (0, panels_js_1.openPanel)(host, 'find'));
    }
    else if (tab === 'Insert') {
        const charts = group('Charts');
        const type = pick(charts, 'Chart type', ['column', 'bar', 'line', 'pie', 'doughnut']);
        action(charts, 'Charts', () => (0, object_panel_js_1.openObjectPanel)(host, 'chart', undefined, type.value), 'charts');
        const images = group('Images');
        action(images, 'Upload image', () => (0, object_panel_js_1.openObjectPanel)(host, 'image', undefined, 'upload'), 'images');
        action(images, 'Images', () => (0, object_panel_js_1.openObjectPanel)(host, 'image', undefined, 'url'), 'images');
        const shapes = group('Shapes');
        for (const [value, label] of [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['textbox', 'Text box']])
            action(shapes, label, () => {
                const active = renderer.selection.state.active;
                let id = '';
                host.mutate(() => { id = host.sheet.addShape({ shape: value, anchor: { ...active }, width: value === 'textbox' ? 240 : 160, height: value === 'textbox' ? 80 : 100, text: '', fill: '#e6fff4', stroke: '#00c47a', textColor: '#0f172a' }); });
                if (id)
                    renderer.objects.select({ worksheetId: host.sheet.id, kind: 'shape', id }, true);
            }, 'shapes');
        action(shapes, 'Shapes', () => (0, object_panel_js_1.openObjectPanel)(host, 'shape'));
        action(group('Manage'), 'Objects on this sheet', () => openObjectManager(host));
    }
    else if (tab === 'Formulas') {
        const functions = group('Functions');
        const search = field(functions, 'Search functions');
        const choices = pick(functions, 'Function', []);
        const populate = () => {
            choices.setOptions(formula_1.formulaRegistry.all()
                .filter(fn => `${fn.name} ${fn.description}`.toLowerCase().includes(search.value.toLowerCase()))
                .map(meta => ({ value: meta.name, title: meta.description ?? meta.name })));
        };
        search.addEventListener('input', populate);
        populate();
        action(functions, 'Insert function', () => { if (choices.value)
            renderer.insertFormula(`=${choices.value}(`); });
        command(functions, 'formula.recalculate');
        command(group('Names'), 'panel.names');
    }
    else if (tab === 'Data') {
        command(group('Tables'), 'panel.tables');
        const sort = group('Sort');
        const header = check(sort, 'First row is a header', true);
        for (const direction of ['asc', 'desc'])
            action(sort, direction === 'asc' ? 'Sort ascending' : 'Sort descending', () => host.mutate(() => {
                const range = { ...renderer.selection.primary };
                if (header.checked)
                    range.top++;
                if (range.top > range.bottom)
                    throw new Error('Select data rows to sort.');
                new sort_js_1.SortService().sort(host.sheet, range, [{ column: renderer.selection.state.active.column, direction }]);
            }), 'sort', continuous);
        command(sort, 'panel.sort');
        const filters = group('Filters');
        const condition = pick(filters, 'Filter condition', ['equals', 'contains', 'gt', 'lt', 'notEmpty']);
        const value = field(filters, 'Filter value');
        let filterTarget = '';
        updates.push(() => {
            const column = renderer.selection.state.active.column;
            const criteria = host.sheet.filterCriteria.get(column);
            const signature = `${host.sheet.id}:${column}:${JSON.stringify(criteria)}`;
            if (signature !== filterTarget) {
                filterTarget = signature;
                if (doc.activeElement !== condition)
                    condition.value = criteria?.operator ?? 'equals';
                if (doc.activeElement !== value)
                    value.value = String(criteria?.value ?? '');
            }
        });
        action(filters, 'Apply filter', () => host.mutate(() => host.sheet.setFilterCriteria(renderer.selection.state.active.column, { operator: condition.value, value: value.value })), 'filters', continuous);
        action(filters, 'Remove column filter', () => host.mutate(() => host.sheet.clearFilter(renderer.selection.state.active.column)));
        command(filters, 'filter.clear');
        const rows = group('Row groups');
        const currentGroups = () => host.sheet.getGroups().filter(item => item.start <= renderer.selection.primary.bottom && item.end >= renderer.selection.primary.top);
        action(rows, 'Group rows', () => host.mutate(() => host.sheet.groupRows(renderer.selection.primary.top, renderer.selection.primary.bottom)), 'groups', () => continuous() && renderer.selection.primary.bottom > renderer.selection.primary.top);
        action(rows, 'Ungroup rows', () => host.mutate(() => { for (const item of currentGroups())
            host.sheet.ungroupRows(item.start); }), undefined, () => continuous() && currentGroups().length > 0);
        for (const collapsed of [true, false])
            action(rows, collapsed ? 'Collapse groups' : 'Expand groups', () => host.mutate(() => {
                for (const item of currentGroups())
                    if (collapsed)
                        host.sheet.collapseGroup(item.start);
                    else
                        host.sheet.expandGroup(item.start);
            }), undefined, () => continuous() && currentGroups().some(item => item.collapsed !== collapsed));
        const rules = group('Rules and analysis');
        for (const id of ['panel.validation', 'panel.conditional', 'panel.pivots'])
            command(rules, id);
    }
    else if (tab === 'Review') {
        const notes = group('Cell note');
        const wrapper = (0, dom_js_1.node)(doc, 'label', 'ezg-ribbon-field ezg-ribbon-note');
        const note = (0, dom_js_1.node)(doc, 'textarea');
        note.rows = 2;
        note.name = 'note';
        note.setAttribute('aria-label', 'Note');
        wrapper.append((0, dom_js_1.node)(doc, 'span', '', 'Note'), note);
        notes.append(wrapper);
        sync(note, () => { const active = renderer.selection.state.active; return host.sheet.getNote(active.row, active.column) ?? ''; });
        action(notes, 'Save note', () => host.mutate(() => note.value ? host.sheet.setNote(host.range, note.value) : host.sheet.clearNote(host.range)), 'notes');
        command(notes, 'notes.clear');
    }
    else if (tab === 'View') {
        const freeze = group('Freeze panes');
        const rows = number(freeze, 'Leading rows', host.sheet.freezeRows, 0, host.sheet.rowCount);
        const columns = number(freeze, 'Leading columns', host.sheet.freezeColumns, 0, host.sheet.columnCount);
        sync(rows, () => host.sheet.freezeRows);
        sync(columns, () => host.sheet.freezeColumns);
        action(freeze, 'Apply freeze panes', () => {
            if (!rows.reportValidity() || !columns.reportValidity())
                return;
            const rowCount = Number(rows.value);
            const columnCount = Number(columns.value);
            if (host.sheet.freezeRows !== rowCount || host.sheet.freezeColumns !== columnCount)
                host.mutate(() => { host.sheet.freezeRows = rowCount; host.sheet.freezeColumns = columnCount; });
        }, 'freeze');
        action(freeze, 'Unfreeze panes', () => host.mutate(() => { host.sheet.freezeRows = 0; host.sheet.freezeColumns = 0; }));
        const pages = group('Pagination');
        const state = host.paginationState;
        const enabled = check(pages, 'Enable pagination', state.enabled);
        const size = number(pages, 'Rows per page', state.size, 1, Number.MAX_SAFE_INTEGER);
        sync(enabled, () => host.paginationState.enabled);
        sync(size, () => host.paginationState.size);
        const apply = () => { if (size.reportValidity())
            host.setPagination(enabled.checked, Number(size.value)); };
        change(enabled, apply);
        change(size, apply);
        const page = number(pages, 'Page', renderer.getPage() + 1, 1, renderer.getPageCount());
        sync(page, () => renderer.getPage() + 1);
        change(page, () => renderer.setPage(Number(page.value) - 1));
        updates.push(() => { page.max = String(renderer.getPageCount()); page.disabled = !host.paginationState.enabled; });
        action(pages, 'Previous page', () => renderer.setPage(renderer.getPage() - 1), undefined, () => renderer.getPage() > 0);
        action(pages, 'Next page', () => renderer.setPage(renderer.getPage() + 1), undefined, () => renderer.getPage() + 1 < renderer.getPageCount());
        command(group('Display'), 'view.formula');
    }
    else if (tab === 'Table') {
        const table = selectedTable(host);
        if (table) {
            const target = () => host.sheet.tables.all().find(item => item.id === table.id);
            const options = group('Table options');
            const name = field(options, 'Table name', table.name);
            sync(name, () => target()?.name ?? '');
            change(name, () => host.mutate(() => (0, ribbon_actions_js_1.updateTable)(host.sheet, target(), { name: name.value })));
            const header = check(options, 'Header row', table.headerRow);
            sync(header, () => target()?.headerRow ?? false);
            change(header, () => host.mutate(() => (0, ribbon_actions_js_1.updateTable)(host.sheet, target(), { headerRow: header.checked })));
            const total = check(options, 'Bold last row', table.totalRow);
            sync(total, () => target()?.totalRow ?? false);
            change(total, () => host.mutate(() => (0, ribbon_actions_js_1.updateTable)(host.sheet, target(), { totalRow: total.checked })));
            action(options, 'Resize table', () => (0, table_panel_js_1.openTablePanel)(host, table.id));
            action(options, 'Remove table', () => host.mutate(() => host.sheet.tables.remove(target().name)));
        }
    }
    else if (['Chart', 'Image', 'Shape'].includes(tab)) {
        const ref = renderer.objects.selected;
        const object = ref ? renderer.objects.get(ref) : undefined;
        if (ref && object) {
            const target = () => renderer.objects.get(ref);
            const patch = (value) => {
                if (ref.kind === 'chart')
                    (0, ribbon_actions_js_1.validateChart)(host.sheet, { ...target(), ...value });
                renderer.objects.update(ref, value);
            };
            const properties = group(`${tab} tools`);
            if (ref.kind === 'chart') {
                const chart = () => target();
                const type = pick(properties, 'Chart type', ['column', 'bar', 'line', 'pie', 'doughnut']);
                sync(type, () => chart().type);
                change(type, () => patch({ type: type.value }));
                const title = field(properties, 'Chart title', chart().title);
                sync(title, () => chart().title ?? '');
                change(title, () => patch({ title: title.value }));
                const source = field(properties, 'Data range', chart().source);
                sync(source, () => chart().source);
                change(source, () => patch({ source: source.value }));
                const header = check(properties, 'First row contains headers', chart().firstRowIsHeader !== false);
                sync(header, () => chart().firstRowIsHeader !== false);
                change(header, () => patch({ firstRowIsHeader: header.checked }));
                action(properties, 'Use selected cells', () => patch({ source: host.range }));
            }
            else if (ref.kind === 'image') {
                const alt = field(properties, 'Alternative text', 'alt' in object ? object.alt : '');
                sync(alt, () => { const current = target(); return 'alt' in current ? current.alt ?? '' : ''; });
                change(alt, () => patch({ alt: alt.value }));
                const ratio = check(properties, 'Lock aspect ratio', renderer.objects.ratioLocked(ref));
                sync(ratio, () => renderer.objects.ratioLocked(ref));
                change(ratio, () => renderer.objects.lockRatio(ref, ratio.checked));
                action(properties, 'Replace image', () => (0, object_panel_js_1.openObjectPanel)(host, 'image', ref, 'upload'));
            }
            else {
                const shape = pick(properties, 'Shape type', ['rect', 'ellipse', 'textbox']);
                sync(shape, () => 'shape' in target() ? target().shape : 'rect');
                change(shape, () => patch({ shape: shape.value }));
                const text = field(properties, 'Text');
                sync(text, () => 'text' in target() ? target().text ?? '' : '');
                change(text, () => patch({ text: text.value }));
                for (const [key, label] of [['fill', 'Fill'], ['stroke', 'Border'], ['textColor', 'Text color']]) {
                    const color = field(properties, label, '#000000', 'color');
                    sync(color, () => target()[key] ?? '#000000');
                    change(color, () => patch({ [key]: color.value }));
                }
            }
            const sizing = group('Size');
            for (const key of ['width', 'height']) {
                const input = number(sizing, key === 'width' ? 'Width (px)' : 'Height (px)', object[key] ?? (key === 'width' ? 320 : 240), 20, 4000);
                input.step = 'any';
                sync(input, () => target()[key] ?? (key === 'width' ? 320 : 240));
                change(input, () => {
                    const value = { [key]: Number(input.value) };
                    if (ref.kind === 'image' && renderer.objects.ratioLocked(ref)) {
                        const ratio = (target().width ?? 320) / (target().height ?? 240);
                        const paired = key === 'width' ? Number(input.value) / ratio : Number(input.value) * ratio;
                        if (paired < 20 || paired > 4000)
                            throw new Error('The proportional size must be between 20 and 4000 pixels.');
                        value[key === 'width' ? 'height' : 'width'] = paired;
                    }
                    patch(value);
                });
            }
            const manage = group('Manage');
            action(manage, 'Properties', () => (0, object_panel_js_1.openObjectPanel)(host, ref.kind, ref));
            action(manage, `Delete ${ref.kind}`, () => renderer.objects.remove(ref));
            action(manage, 'Objects on this sheet', () => openObjectManager(host));
        }
    }
    function refresh() {
        if (disposed || refreshing)
            return;
        refreshing = true;
        try {
            for (const update of updates)
                update();
        }
        finally {
            refreshing = false;
        }
    }
    refresh();
    return { refresh, destroy() { disposed = true; closeMenu?.(); for (const select of selects)
            select.destroy(); for (const section of groups)
            section.remove(); } };
}
function openObjectManager(host) {
    const dialog = host.toolDialog('Objects on this sheet');
    const entries = host.renderer.objects.list();
    if (!entries.length)
        dialog.append((0, dom_js_1.node)(host.doc, 'p', 'ezg-hint', 'No objects yet.'));
    for (const entry of entries) {
        const row = (0, dom_js_1.node)(host.doc, 'div', 'ezg-object-list-row');
        row.append((0, dom_js_1.node)(host.doc, 'span', '', entry.label), (0, dom_js_1.button)(host.doc, `Edit ${entry.label}`, () => {
            host.closeToolDialog();
            host.renderer.objects.select(entry.ref, true);
            host.inspectObject(entry.ref);
        }), (0, dom_js_1.button)(host.doc, `Delete ${entry.label}`, () => { host.renderer.objects.remove(entry.ref); openObjectManager(host); }));
        dialog.append(row);
    }
}

});
