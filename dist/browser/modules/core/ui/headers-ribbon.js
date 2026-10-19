document.currentScript.__ezygridRegister("core/ui/headers-ribbon", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountHeadersRibbon = mountHeadersRibbon;
const dom_js_1 = require("./dom.js");
const layout_actions_js_1 = require("./layout-actions.js");
function mountHeadersRibbon(host, ribbon) {
    const { doc, renderer } = host;
    let sheet = host.sheet;
    let levels = (0, layout_actions_js_1.readHeaderGroups)(sheet.nestedHeaders);
    let original = JSON.stringify(levels);
    let saved = JSON.stringify(sheet.nestedHeaders);
    let levelIndex = 0;
    let groupIndex = 0;
    let disposed = false;
    let busy = false;
    let previewStart = 0;
    let popup;
    const group = (0, dom_js_1.node)(doc, 'section', 'ezg-group ezg-headers-ribbon-group');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Grouped headers');
    const controls = (0, dom_js_1.node)(doc, 'div', 'ezg-layout-ribbon-controls');
    const firstRow = (0, dom_js_1.node)(doc, 'div', 'ezg-layout-ribbon-actions');
    const secondRow = (0, dom_js_1.node)(doc, 'div', 'ezg-layout-ribbon-actions');
    const levelSelect = (0, dom_js_1.node)(doc, 'select');
    levelSelect.setAttribute('aria-label', 'Header level');
    levelSelect.title = 'Header level';
    const groupSelect = (0, dom_js_1.node)(doc, 'select');
    groupSelect.setAttribute('aria-label', 'Header group');
    groupSelect.title = 'Header group';
    const status = (0, dom_js_1.node)(doc, 'p', 'ezg-ribbon-error');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const caption = (0, dom_js_1.node)(doc, 'span', 'ezg-group-label');
    caption.setAttribute('aria-live', 'polite');
    const label = (0, dom_js_1.node)(doc, 'input');
    label.setAttribute('aria-label', 'Header label');
    label.title = 'Header label';
    label.placeholder = 'Header label';
    label.className = 'ezg-header-label-input';
    const from = (0, dom_js_1.node)(doc, 'input');
    from.setAttribute('aria-label', 'From column');
    from.title = 'From column';
    from.placeholder = 'From';
    from.className = 'ezg-header-column-input';
    const to = (0, dom_js_1.node)(doc, 'input');
    to.setAttribute('aria-label', 'To column');
    to.title = 'To column';
    to.placeholder = 'To';
    to.className = 'ezg-header-column-input';
    const current = () => levels[levelIndex]?.[groupIndex];
    const focusLabel = () => label.focus();
    function addGroup() {
        const level = levels[levelIndex];
        if (!level)
            return;
        const selected = renderer.selection.primary;
        const occupied = (start, end) => level.some(item => (0, layout_actions_js_1.columnIndex)(item.from) <= end && (0, layout_actions_js_1.columnIndex)(item.to) >= start);
        let start = selected.left;
        let end = selected.right;
        if (occupied(start, end)) {
            start = 0;
            while (start < sheet.columnCount && occupied(start, start))
                start++;
            end = start;
        }
        if (start >= sheet.columnCount) {
            status.textContent = 'This level covers every column. Edit or remove a group first.';
            return;
        }
        level.push({ label: `Group ${level.length + 1}`, from: (0, layout_actions_js_1.columnName)(start), to: (0, layout_actions_js_1.columnName)(end) });
        groupIndex = level.length - 1;
        previewStart = Math.floor(start / 8) * 8;
        refresh(true);
        focusLabel();
    }
    const addLevel = (0, dom_js_1.button)(doc, 'Add header level', () => { levels.push([]); levelIndex = levels.length - 1; groupIndex = 0; addGroup(); }, 'rowInsertAbove');
    const removeLevel = (0, dom_js_1.button)(doc, 'Remove header level', () => { levels.splice(levelIndex, 1); groupIndex = 0; refresh(true); }, 'rowDelete');
    const move = (delta) => {
        const next = levelIndex + delta;
        if (next < 0 || next >= levels.length)
            return;
        [levels[levelIndex], levels[next]] = [levels[next], levels[levelIndex]];
        levelIndex = next;
        refresh(true);
    };
    const up = (0, dom_js_1.button)(doc, 'Move header level up', () => move(-1), 'collapse');
    const down = (0, dom_js_1.button)(doc, 'Move header level down', () => move(1), 'chevronDown');
    const add = (0, dom_js_1.button)(doc, 'Add header group', addGroup, 'columnInsertRight');
    const remove = (0, dom_js_1.button)(doc, 'Remove header group', () => { levels[levelIndex]?.splice(groupIndex, 1); refresh(true); }, 'columnDelete');
    const previewButton = (0, dom_js_1.button)(doc, 'Preview grouped headers', () => popup ? closePreview(true) : openPreview(), 'eye');
    previewButton.setAttribute('aria-expanded', 'false');
    previewButton.setAttribute('aria-haspopup', 'dialog');
    const cancel = (0, dom_js_1.button)(doc, 'Cancel header changes', () => { reset(); closePreview(); refresh(true); addLevel.focus(); }, 'close');
    const save = (0, dom_js_1.button)(doc, 'Save headers', () => {
        try {
            const configuration = (0, layout_actions_js_1.writeHeaderGroups)(levels, sheet.columnCount);
            if (JSON.stringify(levels) === original)
                return;
            busy = true;
            (0, layout_actions_js_1.commitLayout)(host, () => sheet.setNestedHeaders(configuration));
            saved = JSON.stringify(sheet.nestedHeaders);
            original = JSON.stringify(levels);
            status.textContent = '';
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
        }
        finally {
            busy = false;
            refresh();
        }
    }, 'check');
    save.classList.add('ezg-primary');
    firstRow.append(levelSelect, addLevel, removeLevel, up, down, groupSelect, add, remove);
    secondRow.append(label, from, (0, dom_js_1.node)(doc, 'span', 'ezg-header-range-dash', '–'), to, previewButton, save, cancel);
    controls.append(firstRow, secondRow);
    group.append(controls, status, caption);
    ribbon.append(group);
    const preview = (0, dom_js_1.node)(doc, 'div', 'ezg-headers-preview');
    preview.setAttribute('role', 'img');
    const paging = (0, dom_js_1.node)(doc, 'div', 'ezg-headers-paging');
    const pageLabel = (0, dom_js_1.node)(doc, 'span');
    pageLabel.setAttribute('aria-live', 'polite');
    const previous = (0, dom_js_1.button)(doc, 'Previous columns', () => { previewStart -= 8; renderPreview(); }, 'chevronDown');
    const next = (0, dom_js_1.button)(doc, 'Next columns', () => { previewStart += 8; renderPreview(); }, 'chevronDown');
    paging.append(previous, pageLabel, next);
    function renderPreview() {
        previewStart = Math.max(0, Math.min(previewStart, Math.floor((sheet.columnCount - 1) / 8) * 8));
        const end = Math.min(sheet.columnCount - 1, previewStart + 7);
        const count = end - previewStart + 1;
        pageLabel.textContent = `${(0, layout_actions_js_1.columnName)(previewStart)}–${(0, layout_actions_js_1.columnName)(end)}`;
        previous.disabled = previewStart === 0;
        next.disabled = end === sheet.columnCount - 1;
        preview.replaceChildren();
        preview.style.setProperty('--ezg-preview-columns', String(count));
        preview.setAttribute('aria-label', `Grouped headers preview, columns ${pageLabel.textContent}. ${levels.map((level, index) => `Level ${index + 1}: ${level.map(item => `${item.label || 'Blank'}, ${item.from} to ${item.to}`).join('; ')}`).join('. ')}`);
        levels.forEach(level => {
            const row = (0, dom_js_1.node)(doc, 'div', 'ezg-header-preview-row');
            for (const item of level) {
                const start = (0, layout_actions_js_1.columnIndex)(item.from);
                const last = (0, layout_actions_js_1.columnIndex)(item.to);
                if (start < 0 || last < start || start > end || last < previewStart)
                    continue;
                const cell = (0, dom_js_1.node)(doc, 'span', '', item.label);
                cell.title = `${item.label || 'Blank'} · ${item.from}:${item.to}`;
                cell.style.gridColumn = `${Math.max(start, previewStart) - previewStart + 1} / ${Math.min(last, end) - previewStart + 2}`;
                row.append(cell);
            }
            preview.append(row);
        });
        const letters = (0, dom_js_1.node)(doc, 'div', 'ezg-header-preview-row ezg-header-preview-letters');
        for (let c = previewStart; c <= end; c++)
            letters.append((0, dom_js_1.node)(doc, 'span', '', (0, layout_actions_js_1.columnName)(c)));
        preview.append(letters);
        positionPreview();
    }
    function reset() { sheet = host.sheet; levels = (0, layout_actions_js_1.readHeaderGroups)(sheet.nestedHeaders); original = JSON.stringify(levels); saved = JSON.stringify(sheet.nestedHeaders); levelIndex = groupIndex = 0; }
    function refresh(force = false) {
        if (disposed || busy)
            return;
        if (sheet !== host.sheet || saved !== JSON.stringify(host.sheet.nestedHeaders)) {
            closePreview();
            reset();
            force = true;
        }
        levelIndex = Math.max(0, Math.min(levelIndex, levels.length - 1));
        groupIndex = Math.max(0, Math.min(groupIndex, (levels[levelIndex]?.length ?? 0) - 1));
        levelSelect.replaceChildren();
        for (let i = 0; i < levels.length; i++) {
            const option = (0, dom_js_1.node)(doc, 'option', '', `Level ${i + 1}`);
            option.value = String(i);
            levelSelect.append(option);
        }
        if (!levels.length) {
            const option = (0, dom_js_1.node)(doc, 'option', '', 'No levels');
            option.value = '0';
            levelSelect.append(option);
        }
        levelSelect.value = String(levelIndex);
        levelSelect.disabled = !levels.length;
        groupSelect.replaceChildren();
        for (const [index, item] of (levels[levelIndex] ?? []).entries()) {
            const option = (0, dom_js_1.node)(doc, 'option', '', `${item.label || 'Blank'} (${item.from}:${item.to})`);
            option.value = String(index);
            groupSelect.append(option);
        }
        if (!levels[levelIndex]?.length) {
            const option = (0, dom_js_1.node)(doc, 'option', '', 'No groups');
            option.value = '0';
            groupSelect.append(option);
        }
        groupSelect.value = String(groupIndex);
        groupSelect.disabled = !levels[levelIndex]?.length;
        const item = current();
        for (const [input, value] of [[label, item?.label ?? ''], [from, item?.from ?? ''], [to, item?.to ?? '']]) {
            input.disabled = !item;
            if (force || doc.activeElement !== input)
                input.value = value;
        }
        remove.disabled = !item;
        add.disabled = removeLevel.disabled = !levels.length;
        up.disabled = !levels.length || levelIndex === 0;
        down.disabled = !levels.length || levelIndex === levels.length - 1;
        const dirty = JSON.stringify(levels) !== original;
        cancel.disabled = !dirty;
        try {
            (0, layout_actions_js_1.writeHeaderGroups)(levels, sheet.columnCount);
            status.textContent = '';
            save.disabled = !dirty;
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
            save.disabled = true;
        }
        caption.textContent = dirty ? 'Grouped headers · Unsaved changes' : 'Grouped headers';
        renderPreview();
    }
    levelSelect.addEventListener('change', () => { levelIndex = Number(levelSelect.value); groupIndex = 0; refresh(true); });
    groupSelect.addEventListener('change', () => { groupIndex = Number(groupSelect.value); const start = (0, layout_actions_js_1.columnIndex)(current()?.from ?? ''); if (start >= 0)
        previewStart = Math.floor(start / 8) * 8; refresh(true); });
    for (const [input, key] of [[label, 'label'], [from, 'from'], [to, 'to']])
        input.addEventListener('input', () => {
            const item = current();
            if (!item)
                return;
            item[key] = input.value;
            const start = (0, layout_actions_js_1.columnIndex)(item.from);
            if (start >= 0 && start < sheet.columnCount)
                previewStart = Math.floor(start / 8) * 8;
            refresh();
        });
    function positionPreview() {
        if (!popup)
            return;
        const win = doc.defaultView;
        const anchor = previewButton.getBoundingClientRect();
        popup.style.maxWidth = `${Math.max(0, win.innerWidth - 16)}px`;
        popup.style.maxHeight = `${Math.max(80, win.innerHeight - 16)}px`;
        const size = popup.getBoundingClientRect();
        popup.style.left = `${Math.max(8, Math.min(anchor.right - size.width, win.innerWidth - size.width - 8))}px`;
        popup.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, win.innerHeight - size.height - 8))}px`;
    }
    const outside = (event) => { if (!popup?.contains(event.target) && !group.contains(event.target))
        closePreview(); };
    const escape = (event) => { if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePreview(true);
    } };
    function openPreview() {
        popup = (0, dom_js_1.node)(doc, 'div', 'ezg-ribbon-preview-popup');
        popup.setAttribute('popover', 'manual');
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', 'Grouped headers preview');
        popup.append(preview, paging);
        host.root.append(popup);
        if (popup.showPopover)
            popup.showPopover();
        popup.addEventListener('keydown', escape);
        previewButton.setAttribute('aria-expanded', 'true');
        doc.addEventListener('pointerdown', outside, true);
        doc.addEventListener('scroll', positionPreview, true);
        doc.defaultView.addEventListener('resize', positionPreview);
        renderPreview();
        (previous.disabled ? next.disabled ? previewButton : next : previous).focus();
    }
    function closePreview(restore = false) {
        if (!popup)
            return;
        popup.remove();
        popup = undefined;
        previewButton.setAttribute('aria-expanded', 'false');
        doc.removeEventListener('pointerdown', outside, true);
        doc.removeEventListener('scroll', positionPreview, true);
        doc.defaultView.removeEventListener('resize', positionPreview);
        if (restore)
            previewButton.focus();
    }
    group.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            reset();
            closePreview();
            refresh(true);
            addLevel.focus();
        }
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
            event.preventDefault();
            if (!save.disabled)
                save.click();
        }
    });
    refresh(true);
    return { refresh: () => refresh(), destroy() { disposed = true; closePreview(); group.remove(); } };
}

});
