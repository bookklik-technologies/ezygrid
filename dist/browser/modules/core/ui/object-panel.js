document.currentScript.__ezygridRegister("core/ui/object-panel", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openObjectPanel = openObjectPanel;
const model_1 = require("@ezygrid/model");
const dom_js_1 = require("./dom.js");
const charts_js_1 = require("../charts.js");
const chart_svg_js_1 = require("../chart-svg.js");
const ribbon_actions_js_1 = require("./ribbon-actions.js");
const chartTypes = [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie'], ['doughnut', 'Doughnut']];
const shapeTypes = [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['textbox', 'Text box']];
const imageSource = /^(https:|data:image\/(png|jpeg|gif|webp);base64,|blob:)/i;
/** Creation and property drafts commit only on Apply. */
function openObjectPanel(host, kind, ref, preset) {
    const { doc, renderer } = host;
    const controller = renderer.objects;
    const sheet = host.sheet;
    const worksheetId = sheet.id;
    const object = ref ? controller.get(ref) : undefined;
    if (ref && !object)
        return;
    if (!ref)
        controller.select(null);
    const noun = kind === 'chart' ? 'chart' : kind === 'image' ? 'image' : 'shape';
    const opener = doc.activeElement;
    const panel = host.toolDialog(`${ref ? 'Edit' : 'Insert'} ${noun}`, () => !ref || !!controller.get(ref));
    panel.classList.add('ezg-object-dialog');
    panel.dataset.objectInspector = ref ? 'true' : 'false';
    const body = (0, dom_js_1.node)(doc, 'form', 'ezg-object-body');
    body.id = `ezg-object-${Math.random().toString(36).slice(2)}`;
    body.noValidate = true;
    const preview = (0, dom_js_1.node)(doc, 'div', 'ezg-object-preview');
    preview.setAttribute('role', 'img');
    preview.setAttribute('aria-label', `${noun} preview`);
    const message = (0, dom_js_1.node)(doc, 'p', 'ezg-object-error');
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    const fields = new Map();
    const content = (0, dom_js_1.node)(doc, 'div', 'ezg-form');
    const advanced = (0, dom_js_1.node)(doc, 'details', 'ezg-object-advanced');
    advanced.append((0, dom_js_1.node)(doc, 'summary', '', 'Advanced'));
    const advancedFields = (0, dom_js_1.node)(doc, 'div', 'ezg-form');
    advanced.append(advancedFields);
    const footer = (0, dom_js_1.node)(doc, 'div', 'ezg-object-footer');
    const insert = (0, dom_js_1.button)(doc, ref ? 'Apply changes' : `Insert ${noun}`, () => { });
    insert.className = 'ezg-primary';
    insert.type = 'submit';
    insert.setAttribute('form', body.id);
    const close = () => {
        if (ref)
            controller.showPreview(ref, null);
        host.closeToolDialog();
        if (opener?.isConnected)
            opener.focus({ preventScroll: true });
        else
            renderer.focus();
    };
    const cancel = (0, dom_js_1.button)(doc, 'Cancel', close);
    if (ref)
        footer.append((0, dom_js_1.button)(doc, `Delete ${noun}`, () => controller.remove(ref)), cancel, insert);
    else
        footer.append(cancel, insert);
    body.append(preview, message, content);
    panel.append(body, footer);
    let disposed = false;
    let generation = 0;
    let imageReady = kind !== 'image';
    let imageError = '';
    let imageLoading = false;
    let imageName = '';
    let loadedSource = '';
    let pendingSource = '';
    let naturalRatio = object ? (object.width ?? 400) / (object.height ?? 240) : 1;
    let draftImage = null;
    let reader = null;
    const alive = () => !disposed && panel.isConnected && host.sheet.id === worksheetId;
    host.setToolCleanup(() => {
        disposed = true;
        generation++;
        if (reader?.readyState === 1)
            reader.abort();
        if (draftImage) {
            draftImage.onload = null;
            draftImage.onerror = null;
        }
        if (ref)
            controller.showPreview(ref, null);
    });
    const add = (field, parent = content) => {
        const built = (0, dom_js_1.form)(doc, [field], () => { });
        const wrapper = built.firstElementChild;
        const input = wrapper.querySelector('input,select,textarea');
        fields.set(field.key, input);
        parent.append(wrapper);
        return input;
    };
    const text = (key, label, value = '', required = false, parent = content) => add({ key, label, value, required }, parent);
    const number = (key, label, value, min, max = 4000) => {
        const input = add({ key, label, value, type: 'number', min, max, required: true }, advancedFields);
        input.step = 'any';
        return input;
    };
    const value = (key) => fields.get(key)?.value ?? '';
    const set = (key, v) => { const input = fields.get(key); if (input)
        input.value = String(v); };
    const check = (key) => fields.get(key)?.checked;
    const choices = (key, label, options, initial) => {
        const input = (0, dom_js_1.node)(doc, 'input');
        input.type = 'hidden';
        input.name = key;
        input.value = initial;
        fields.set(key, input);
        const group = (0, dom_js_1.node)(doc, 'div', 'ezg-object-choices');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', label);
        for (const [id, title] of options) {
            const choice = (0, dom_js_1.button)(doc, title, () => {
                input.value = id;
                for (const item of group.querySelectorAll('button'))
                    item.setAttribute('aria-pressed', String(item.dataset.value === id));
                if (!ref && key === 'shape') {
                    set('width', id === 'textbox' ? 240 : 160);
                    set('height', id === 'textbox' ? 80 : 100);
                }
                refresh();
            });
            choice.dataset.value = id;
            choice.setAttribute('aria-pressed', String(id === initial));
            if (key === 'type') {
                const sample = (0, dom_js_1.node)(doc, 'span', 'ezg-chart-sample');
                sample.setAttribute('aria-hidden', 'true');
                sample.innerHTML = (0, chart_svg_js_1.renderChartSVG)({ id: 'sample', type: id, source: 'A1:B3', anchor: { row: 0, column: 0 }, width: 160, height: 100 }, { categories: ['A', 'B', 'C'], series: [{ name: 'Example', values: [2, 5, 3] }] });
                choice.prepend(sample);
            }
            else {
                const sample = (0, dom_js_1.node)(doc, 'span', `ezg-shape-sample ezg-shape-${id}`, id === 'textbox' ? 'Text' : '');
                sample.setAttribute('aria-hidden', 'true');
                choice.prepend(sample);
            }
            group.append(choice);
        }
        content.append(input, group);
    };
    const chart = kind === 'chart' ? object : undefined;
    const image = kind === 'image' ? object : undefined;
    if (image && !/^https:/i.test(image.src))
        imageName = 'Embedded image';
    const shape = kind === 'shape' ? object : undefined;
    let imageTabs;
    let uploadSection;
    let urlSection;
    if (kind === 'chart') {
        text('range', 'Data range', chart?.source ?? host.range, true);
        content.append((0, dom_js_1.button)(doc, 'Use selected cells', () => { set('range', (0, model_1.rectToRange)(renderer.selection.primary)); refresh(); }));
        content.append((0, dom_js_1.node)(doc, 'p', 'ezg-hint', 'The first column supplies categories; remaining columns supply numeric series.'));
        choices('type', 'Chart type', chartTypes, chart?.type ?? preset ?? 'column');
        add({ key: 'header', label: 'First row contains headers', type: 'checkbox', value: chart?.firstRowIsHeader !== false });
        text('title', 'Chart title', chart?.title ?? '');
        text('colors', 'Custom colors (comma separated)', chart?.colors?.join(', ') ?? '', false, advancedFields);
    }
    else if (kind === 'image') {
        imageTabs = (0, dom_js_1.node)(doc, 'div', 'ezg-actions');
        imageTabs.setAttribute('role', 'group');
        imageTabs.setAttribute('aria-label', 'Image source');
        uploadSection = (0, dom_js_1.node)(doc, 'div', 'ezg-image-upload');
        urlSection = (0, dom_js_1.node)(doc, 'div', 'ezg-form');
        const upload = (0, dom_js_1.node)(doc, 'input');
        upload.type = 'file';
        upload.accept = 'image/png,image/jpeg,image/gif,image/webp';
        upload.hidden = true;
        upload.setAttribute('aria-label', 'Choose image file');
        uploadSection.append((0, dom_js_1.button)(doc, 'Choose image file', () => upload.click()), (0, dom_js_1.node)(doc, 'p', 'ezg-hint', 'PNG, JPEG, GIF or WebP. Image proportions are preserved.'), upload);
        const useUpload = (0, dom_js_1.button)(doc, 'Upload', () => sourceTab(false));
        const useUrl = (0, dom_js_1.button)(doc, 'From URL', () => sourceTab(true));
        imageTabs.append(useUpload, useUrl);
        content.append(imageTabs, uploadSection, urlSection);
        text('src', 'Image URL', image?.src ?? '', true, urlSection);
        urlSection.append((0, dom_js_1.node)(doc, 'p', 'ezg-hint', 'Use an HTTPS image URL.'));
        text('alt', 'Alternative text', image?.alt ?? '');
        function sourceTab(url) {
            uploadSection.hidden = url;
            urlSection.hidden = !url;
            useUpload.setAttribute('aria-pressed', String(!url));
            useUrl.setAttribute('aria-pressed', String(url));
            if (url && value('src') && !/^https:/i.test(value('src'))) {
                set('src', '');
                imageReady = false;
                loadedSource = '';
                refresh();
            }
        }
        sourceTab(preset === 'url' || (preset !== 'upload' && !!image && /^https:/i.test(image.src)));
        upload.addEventListener('change', () => {
            const file = upload.files?.[0];
            if (!file)
                return;
            if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
                imageError = 'Choose a PNG, JPEG, GIF or WebP image.';
                imageReady = false;
                refresh();
                return;
            }
            generation++;
            if (reader?.readyState === 1)
                reader.abort();
            imageName = file.name;
            imageReady = false;
            imageLoading = true;
            imageError = '';
            refresh();
            const token = generation;
            reader = new doc.defaultView.FileReader();
            reader.onload = () => { if (alive() && token === generation) {
                set('src', String(reader.result));
                loadImage(true);
            } };
            reader.onerror = () => { if (alive() && token === generation) {
                imageLoading = false;
                imageError = 'The image could not be read. Choose another file.';
                refresh();
            } };
            reader.readAsDataURL(file);
        });
    }
    else {
        choices('shape', 'Shape type', shapeTypes, shape?.shape ?? preset ?? 'rect');
        text('text', 'Text', shape?.text ?? '');
        const colors = (0, dom_js_1.node)(doc, 'div', 'ezg-object-colors');
        content.append(colors);
        add({ key: 'fill', label: 'Fill', type: 'color', value: shape?.fill ?? '#e6fff4' }, colors);
        add({ key: 'stroke', label: 'Border', type: 'color', value: shape?.stroke ?? '#00c47a' }, colors);
        add({ key: 'textColor', label: 'Text color', type: 'color', value: shape?.textColor ?? '#0f172a' }, colors);
    }
    const active = renderer.selection.state.active;
    text('anchor', 'Anchor cell', object ? (0, model_1.toA1)(object.anchor.row, object.anchor.column) : (0, model_1.toA1)(active.row, active.column), true, advancedFields);
    number('width', 'Width (px)', object ? object.width ?? 320 : kind === 'shape' ? 160 : 400, 20);
    number('height', 'Height (px)', object?.height ?? (kind === 'shape' ? 100 : 240), 20);
    number('offsetX', 'Horizontal offset', object?.offsetX ?? 0, 0, 1000000);
    number('offsetY', 'Vertical offset', object?.offsetY ?? 0, 0, 1000000);
    if (kind !== 'chart')
        number('zIndex', 'Stack order', object && 'zIndex' in object ? object.zIndex ?? 1 : 1, 0, 1000000);
    if (kind === 'image')
        add({ key: 'ratio', label: 'Lock aspect ratio', type: 'checkbox', value: ref ? controller.ratioLocked(ref) : true });
    content.append(advanced);
    const controlValue = (key) => key === 'header' || key === 'ratio' ? String(check(key)) : value(key);
    const committedValues = new Map([...fields.keys()].map(key => [key, controlValue(key)]));
    function changedPatch(patch) {
        const changed = [...fields.keys()].filter(key => controlValue(key) !== committedValues.get(key));
        const result = {};
        const keys = { range: 'source', header: 'firstRowIsHeader' };
        for (const key of changed) {
            if (key === 'ratio')
                continue;
            const property = keys[key] ?? key;
            Object.assign(result, { [property]: patch[property] });
        }
        return result;
    }
    const objects = (0, dom_js_1.node)(doc, 'details', 'ezg-object-list');
    objects.append((0, dom_js_1.node)(doc, 'summary', '', 'Objects on this sheet'));
    const entries = controller.list();
    if (!entries.length)
        objects.append((0, dom_js_1.node)(doc, 'p', 'ezg-hint', 'No objects yet.'));
    for (const entry of entries) {
        const row = (0, dom_js_1.node)(doc, 'div', 'ezg-object-list-row');
        row.append((0, dom_js_1.node)(doc, 'span', '', entry.label), (0, dom_js_1.button)(doc, `Edit ${entry.label}`, () => { controller.select(entry.ref, true); host.inspectObject(entry.ref); }), (0, dom_js_1.button)(doc, `Delete ${entry.label}`, () => { controller.remove(entry.ref); openObjectPanel(host, kind); }));
        objects.append(row);
    }
    body.append(objects);
    function rangeBounds(raw) {
        const bounds = (0, model_1.parseRange)(raw);
        if (bounds.top < 0 || bounds.left < 0 || bounds.bottom >= sheet.rowCount || bounds.right >= sheet.columnCount)
            throw new Error('Choose cells inside this worksheet.');
        return bounds;
    }
    function gather() {
        if (kind === 'image' && !(ref && value('src') === image?.src)) {
            if (imageLoading)
                throw new Error('Loading image…');
            if (!imageReady)
                throw new Error(imageError || 'Choose an image file or enter an HTTPS image URL.');
        }
        for (const input of fields.values()) {
            if (input.type !== 'hidden' && !input.checkValidity())
                throw new Error(`${input.getAttribute('aria-label')} needs a valid value.`);
        }
        const anchor = rangeBounds(value('anchor'));
        const patch = {
            anchor: { row: anchor.top, column: anchor.left }, width: Number(value('width')), height: Number(value('height')),
            offsetX: Number(value('offsetX')), offsetY: Number(value('offsetY')),
        };
        if (kind === 'chart') {
            Object.assign(patch, { source: value('range'), type: value('type'), title: value('title'), firstRowIsHeader: check('header') });
            (0, ribbon_actions_js_1.validateChart)(sheet, { ...patch, id: 'preview' });
            const colors = value('colors').split(',').map(color => color.trim()).filter(Boolean);
            if (colors.some(color => !(0, charts_js_1.sanitizeChartColor)(color)))
                throw new Error('Use valid CSS colors, for example #2563eb, #00b374.');
            patch.colors = colors.length ? colors.map(color => (0, charts_js_1.sanitizeChartColor)(color)) : undefined;
        }
        else if (kind === 'image') {
            patch.src = value('src');
            patch.alt = value('alt');
            patch.zIndex = Number(value('zIndex'));
        }
        else
            Object.assign(patch, { shape: value('shape'), text: value('text'), fill: value('fill'), stroke: value('stroke'), textColor: value('textColor'), zIndex: Number(value('zIndex')) });
        return patch;
    }
    function refresh() {
        if (!alive())
            return null;
        try {
            const patch = gather();
            message.textContent = kind === 'image' ? imageError || (imageLoading ? 'Loading image…' : imageName) : '';
            insert.disabled = false;
            preview.replaceChildren();
            if (kind === 'chart') {
                const spec = { ...patch, id: 'preview', width: 400, height: 240 };
                preview.innerHTML = (0, chart_svg_js_1.renderChartSVG)(spec, (0, charts_js_1.readChartData)(sheet, spec));
            }
            else if (kind === 'image') {
                const img = (0, dom_js_1.node)(doc, 'img');
                img.src = patch.src;
                img.alt = patch.alt || imageName || 'Image preview';
                preview.append(img);
            }
            else {
                const sample = (0, dom_js_1.node)(doc, 'div', 'ezg-shape-preview', patch.text ?? '');
                const scale = Math.min(220 / patch.width, 100 / patch.height);
                Object.assign(sample.style, { background: patch.fill, color: patch.textColor, border: `1px solid ${patch.stroke}`, borderRadius: patch.shape === 'ellipse' ? '50%' : '0', aspectRatio: `${patch.width} / ${patch.height}`, width: `min(100%, ${patch.width * scale}px)` });
                preview.append(sample);
            }
            if (ref)
                controller.showPreview(ref, changedPatch(patch));
            return patch;
        }
        catch (error) {
            insert.disabled = true;
            message.textContent = error instanceof Error ? error.message : String(error);
            if (!ref)
                preview.replaceChildren((0, dom_js_1.node)(doc, 'p', 'ezg-hint', `Your ${noun} preview will appear here.`));
            if (ref)
                controller.showPreview(ref, null);
            return null;
        }
    }
    function loadImage(resize) {
        const source = value('src').trim();
        set('src', source);
        if (imageLoading && source === pendingSource)
            return;
        pendingSource = source;
        generation++;
        const token = generation;
        if (draftImage) {
            draftImage.onload = null;
            draftImage.onerror = null;
        }
        imageReady = false;
        imageError = '';
        imageLoading = false;
        if (!source) {
            refresh();
            return;
        }
        if (!imageSource.test(source)) {
            imageError = 'Use an HTTPS URL or upload a PNG, JPEG, GIF or WebP image.';
            refresh();
            return;
        }
        imageLoading = true;
        refresh();
        const img = new doc.defaultView.Image();
        draftImage = img;
        img.onload = () => {
            if (!alive() || token !== generation)
                return;
            imageLoading = false;
            if (!img.naturalWidth || !img.naturalHeight) {
                imageError = 'This image has no usable dimensions.';
                refresh();
                return;
            }
            imageReady = true;
            loadedSource = source;
            naturalRatio = ref && source === image?.src ? (image.width ?? img.naturalWidth) / (image.height ?? img.naturalHeight) : img.naturalWidth / img.naturalHeight;
            if (resize) {
                const scale = Math.min(1, 400 / img.naturalWidth, 300 / img.naturalHeight);
                set('width', Math.max(20, img.naturalWidth * scale));
                set('height', Math.max(20, img.naturalHeight * scale));
            }
            refresh();
        };
        img.onerror = () => { if (alive() && token === generation) {
            imageLoading = false;
            imageError = 'The image could not be loaded. Check the URL or choose another file.';
            refresh();
        } };
        img.src = source;
    }
    function edited(event) {
        const input = event.target;
        if (!fields.has(input.name))
            return;
        if (kind === 'image' && input.name === 'src' && value('src').trim() !== loadedSource) {
            loadImage(!ref);
            return;
        }
        if (kind === 'image' && input.name === 'ratio') {
            refresh();
            return;
        }
        if (kind === 'image' && check('ratio') && (input.name === 'width' || input.name === 'height') && input.checkValidity()) {
            if (input.name === 'width')
                set('height', Number(value('width')) / naturalRatio);
            else
                set('width', Number(value('height')) * naturalRatio);
        }
        refresh();
    }
    body.addEventListener('input', edited);
    body.addEventListener('change', edited);
    body.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    });
    body.addEventListener('submit', event => {
        event.preventDefault();
        const patch = refresh();
        if (!patch)
            return;
        if (ref) {
            try {
                controller.update(ref, changedPatch(patch));
                if (kind === 'image')
                    controller.lockRatio(ref, check('ratio'));
                host.closeToolDialog();
            }
            catch (error) {
                host.message(error);
            }
            return;
        }
        if (kind === 'chart' && value('anchor') === (0, model_1.toA1)(active.row, active.column) && !Number(value('offsetX')) && !Number(value('offsetY'))) {
            const range = rangeBounds(value('range'));
            const right = sheet.columnSizes.prefixSum(range.right + 1);
            const room = sheet.columnSizes.prefixSum(sheet.columnCount) - right;
            if (room >= patch.width + 16) {
                patch.anchor = { row: range.top, column: range.right + 1 };
                patch.offsetX = 16;
            }
            else {
                patch.anchor = { row: Math.min(sheet.rowCount - 1, range.bottom + 1), column: range.left };
                patch.offsetY = 16;
            }
        }
        let id = '';
        host.mutate(() => {
            if (kind === 'chart')
                id = sheet.addChart(patch);
            else if (kind === 'image')
                id = sheet.addImage(patch);
            else
                id = sheet.addShape(patch);
        });
        if (id) {
            const inserted = { worksheetId, kind, id };
            host.closeToolDialog();
            controller.select(inserted, true);
        }
    });
    if (kind === 'image' && image)
        loadImage(false);
    else
        refresh();
    if (!ref)
        content.querySelector('button,input:not([type=hidden])')?.focus({ preventScroll: true });
    if (preset === 'upload')
        uploadSection?.querySelector('input[type=file]')?.click();
}

});
