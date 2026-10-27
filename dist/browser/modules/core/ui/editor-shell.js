document.currentScript.__ezygridRegister("core/ui/editor-shell", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditorShell = void 0;
const workbook_js_1 = require("../workbook.js");
const model_1 = require("@ezygrid/model");
const dom_js_1 = require("./dom.js");
const select_js_1 = require("./select.js");
const styles_js_1 = require("./styles.js");
const panels_js_1 = require("./panels.js");
const layout_ribbon_js_1 = require("./layout-ribbon.js");
const headers_ribbon_js_1 = require("./headers-ribbon.js");
const tools_ribbon_js_1 = require("./tools-ribbon.js");
const index_js_1 = require("../xlsx/index.js");
const print_js_1 = require("../print.js");
const theme_js_1 = require("../theme.js");
const suite_topbar_js_1 = require("./suite-topbar.js");
// Official Ezygrid brand mark — keep in sync with the repository's icon.svg
// (viewBox normalized and gradient id namespaced so multiple editors on one
// page never share an id).
const brandLogo = '<svg viewBox="0 0 455 455" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient cx="4314825" cy="0" r="6102084" gradientUnits="userSpaceOnUse" spreadMethod="pad" id="ezg-logo-fill" gradientTransform="matrix(0.000104987 0 0 0.000104987 794 2268)"><stop offset="0" stop-color="#00FF99"/><stop offset="0.2" stop-color="#00FF99"/><stop offset="1" stop-color="#2563EB"/></radialGradient></defs><g transform="translate(-793 -2267)"><rect x="794" y="2268" width="453" height="453" fill="url(#ezg-logo-fill)"/><path d="M1065.98 2343C1124.53 2343 1172 2390.47 1172 2449.02 1172 2500.26 1135.66 2543 1087.34 2552.89L1080.08 2554 1080.58 2550.74C1080.94 2547.17 1081.12 2543.56 1081.12 2539.9 1081.12 2481.34 1033.66 2433.88 975.101 2433.88 971.441 2433.88 967.825 2434.06 964.261 2434.42L961 2434.92 962.109 2427.66C971.995 2379.34 1014.74 2343 1065.98 2343Z" fill="#FFFFFF" fill-rule="evenodd"/><path d="M960.921 2435 960.424 2438.26C960.062 2441.82 959.876 2445.44 959.876 2449.1 959.876 2507.66 1007.34 2555.12 1065.9 2555.12 1069.56 2555.12 1073.17 2554.94 1076.74 2554.58L1080 2554.08 1078.89 2561.34C1069 2609.66 1026.26 2646 975.023 2646 916.468 2646 869 2598.53 869 2539.98 869 2488.74 905.343 2446 953.655 2436.11L960.921 2435Z" fill="#FFFFFF" fill-rule="evenodd"/></g></svg>';
// Lucide icon names per command id (see dom.ts for the icon data).
const commandIcons = {
    'file.new': 'newDoc',
    'file.open': 'open',
    'file.save': 'json',
    'file.csvImport': 'import',
    'file.csvExport': 'export',
    'file.xlsxExport': 'xlsx',
    'file.print': 'print',
    'clipboard.cut': 'cut',
    'clipboard.copy': 'copy',
    'clipboard.paste': 'paste',
    'edit.undo': 'undo',
    'edit.redo': 'redo',
    'format.bold': 'bold',
    'format.italic': 'italic',
    'format.underline': 'underline',
    'format.left': 'alignLeft',
    'format.center': 'alignCenter',
    'format.right': 'alignRight',
    'format.wrap': 'wrap',
    'format.clear': 'formatClear',
    'panel.format': 'paintRoller',
    'cells.merge': 'merge',
    'cells.unmerge': 'unmerge',
    'cells.fillDown': 'fillDown',
    'cells.fill': 'fill',
    'cells.clear': 'cellsClear',
    'panel.find': 'find',
    'panel.tables': 'tables',
    'panel.charts': 'charts',
    'panel.images': 'images',
    'panel.shapes': 'shapes',
    'panel.layout': 'layout',
    'panel.headers': 'headers',
    'panel.functions': 'functions',
    'panel.names': 'names',
    'formula.recalculate': 'recalc',
    'panel.sort': 'sort',
    'panel.filters': 'filters',
    'filter.clear': 'filterClear',
    'panel.groups': 'groups',
    'panel.validation': 'validation',
    'panel.conditional': 'conditional',
    'panel.pivots': 'pivots',
    'panel.notes': 'notes',
    'notes.clear': 'notesClear',
    'panel.freeze': 'freeze',
    'panel.pagination': 'pagination',
    'view.formula': 'formula',
    'view.ribbon': 'collapse',
    'view.theme': 'theme',
    'view.fullscreen': 'expand',
};
let shellSequence = 0;
const THEME_LABELS = { light: 'Light', dark: 'Dark', system: 'System' };
const ribbons = {
    File: [['Workbook', ['file.new', 'file.open', 'file.save']], ['Import / export', ['file.csvImport', 'file.csvExport', 'file.xlsxExport']], ['Print', ['file.print']]],
    Home: [['Clipboard', ['clipboard.cut', 'clipboard.copy', 'clipboard.paste']], ['History', ['edit.undo', 'edit.redo']], ['Font', ['format.bold', 'format.italic', 'format.underline']], ['Alignment', ['format.left', 'format.center', 'format.right', 'format.wrap']], ['Cells', ['cells.merge', 'cells.unmerge', 'cells.fillDown', 'cells.fill', 'cells.clear', 'format.clear']]],
    Insert: [],
    Layout: [],
    Formulas: [],
    Data: [],
    Review: [],
    View: [],
};
class EditorShell {
    workbook;
    renderer;
    id = ++shellSequence;
    doc;
    root;
    main;
    ribbon;
    ribbonToggle;
    tabBar;
    tabs;
    stats;
    filename;
    zoom;
    toolElement;
    toolCleanup;
    toolValid;
    dialogs = new Set();
    toolControls;
    ribbonContext = '';
    lastStandardTab = 'Home';
    objectKey = '';
    paginationState = { enabled: false, size: 50 };
    layoutControls;
    headerControls;
    status;
    disposed = false;
    unlisten;
    activeTab = 'Home';
    savedDocument;
    fileInput;
    fileKind = 'document';
    sheetSignature = '';
    formulaVisible;
    exportButton;
    exportCleanup;
    topbarCleanup;
    themeMenu;
    themeMenuCleanup;
    fullscreenButton;
    themeChoice = 'light';
    themeMedia;
    themeMediaListener;
    onFullscreenChange;
    constructor(container, grid, workbook, renderer, options) {
        this.workbook = workbook;
        this.renderer = renderer;
        this.doc = container.ownerDocument;
        (0, styles_js_1.installEditorStyles)(this.doc);
        this.root = (0, dom_js_1.node)(this.doc, 'div', 'ezygrid-suite');
        this.root.dir = options.direction;
        this.formulaVisible = options.formulaBar;
        this.savedDocument = JSON.stringify(workbook.toJSON());
        this.registerCommands();
        const top = (0, dom_js_1.node)(this.doc, 'div', 'ezg-topbar');
        top.hidden = !options.topbar;
        const brand = (0, dom_js_1.node)(this.doc, 'div', 'ezg-brand');
        const mark = (0, dom_js_1.node)(this.doc, 'span', 'ezg-mark');
        mark.innerHTML = brandLogo; // static, code-owned brand asset (mirrors icon.svg)
        brand.append(mark, (0, dom_js_1.node)(this.doc, 'span', '', 'Ezygrid'));
        this.filename = (0, dom_js_1.node)(this.doc, 'input', 'ezg-title');
        this.filename.setAttribute('aria-label', 'Workbook filename');
        this.filename.spellcheck = false;
        this.filename.addEventListener('keydown', event => { if (event.key === 'Enter')
            this.filename.blur(); });
        this.filename.addEventListener('change', () => this.mutate(() => { workbook.filename = this.filename.value.trim() || 'Untitled workbook'; }));
        const history = (0, dom_js_1.node)(this.doc, 'div');
        history.setAttribute('aria-label', 'Edit history');
        history.append(this.commandButton('edit.undo'), this.commandButton('edit.redo'));
        const view = (0, dom_js_1.node)(this.doc, 'div');
        view.setAttribute('aria-label', 'View');
        this.themeMenu = (0, dom_js_1.node)(this.doc, 'details', 'ez-theme-menu');
        const themeSummary = (0, dom_js_1.node)(this.doc, 'summary');
        themeSummary.setAttribute('aria-label', 'Theme');
        themeSummary.title = 'Theme';
        const themePanel = (0, dom_js_1.node)(this.doc, 'div', 'ez-theme-panel');
        themePanel.setAttribute('aria-label', 'Color scheme');
        for (const theme of ['light', 'dark', 'system']) {
            const item = (0, dom_js_1.button)(this.doc, THEME_LABELS[theme], () => {
                if (this.themeMenu?.contains(this.doc.activeElement))
                    this.themeMenu.querySelector('summary')?.focus();
                this.setThemeChoice(theme);
                if (this.themeMenu)
                    this.themeMenu.open = false;
            });
            item.dataset.ezThemeChoice = theme;
            item.setAttribute('aria-pressed', 'false');
            themePanel.append(item);
        }
        this.themeMenu.append(themeSummary, themePanel);
        this.themeMenuCleanup = (0, suite_topbar_js_1.bindSuiteMenu)(this.themeMenu, themePanel);
        this.fullscreenButton = (0, dom_js_1.button)(this.doc, 'Fullscreen', () => this.execute('view.fullscreen'), 'expand');
        view.append(this.themeMenu, this.fullscreenButton);
        const files = (0, dom_js_1.node)(this.doc, 'div');
        files.setAttribute('aria-label', 'Files');
        files.append(this.commandButton('file.open', 'open'), this.commandButton('file.save', 'save'));
        const chevron = (0, dom_js_1.node)(this.doc, 'span', 'ezg-chevron');
        chevron.append((0, dom_js_1.icon)(this.doc, 'chevronDown'));
        const download = (0, dom_js_1.button)(this.doc, 'Export', () => this.toggleExportMenu(), 'export');
        download.classList.add('ezg-primary', 'ezg-export');
        download.setAttribute('aria-haspopup', 'menu');
        download.setAttribute('aria-expanded', 'false');
        download.append((0, dom_js_1.node)(this.doc, 'span', '', 'Export'), chevron);
        this.exportButton = download;
        this.topbarCleanup = (0, suite_topbar_js_1.installSuiteTopbar)(this.root, top, { brand, title: this.filename, history, view, files, exportControl: download });
        this.refreshThemeMenu();
        this.tabBar = (0, dom_js_1.node)(this.doc, 'div', 'ezg-tabs');
        this.tabBar.setAttribute('role', 'tablist');
        this.tabBar.setAttribute('aria-label', 'Ribbon');
        this.ribbon = (0, dom_js_1.node)(this.doc, 'div', 'ezg-ribbon');
        this.ribbon.id = `ezg-ribbon-${this.id}`;
        this.ribbon.setAttribute('role', 'toolbar');
        this.ribbon.setAttribute('aria-label', 'Spreadsheet tools');
        this.ribbon.hidden = !options.toolbar;
        for (const title of [...Object.keys(ribbons), 'Chart', 'Image', 'Shape', 'Table'])
            this.addTab(title);
        this.ribbonToggle = (0, dom_js_1.button)(this.doc, 'Collapse ribbon', () => this.setRibbonVisible(this.ribbon.hidden), 'collapse');
        this.setRibbonVisible(options.toolbar);
        this.tabBar.append(this.ribbonToggle);
        this.main = (0, dom_js_1.node)(this.doc, 'div', 'ezg-main');
        const viewport = (0, dom_js_1.node)(this.doc, 'div', 'ezg-viewport');
        viewport.append(grid);
        this.main.append(viewport);
        const bottom = (0, dom_js_1.node)(this.doc, 'div', 'ezg-bottom');
        bottom.hidden = !options.sheetTabs && !options.statusBar;
        this.tabs = (0, dom_js_1.node)(this.doc, 'div', 'ezg-sheets');
        this.tabs.setAttribute('role', 'tablist');
        this.tabs.setAttribute('aria-label', 'Worksheets');
        this.tabs.hidden = !options.sheetTabs;
        this.stats = (0, dom_js_1.node)(this.doc, 'span', 'ezg-stats');
        this.stats.hidden = !options.statusBar;
        this.zoom = (0, select_js_1.createSelect)(this.doc, {
            label: 'Zoom',
            options: [25, 50, 75, 100, 125, 150, 175, 200].map((percent) => ({ value: String(percent), label: `${percent}%` })),
            popupHost: this.root,
        });
        this.zoom.hidden = !options.statusBar;
        this.zoom.addEventListener('change', () => renderer.setZoom(Number(this.zoom.value) / 100));
        bottom.append(this.tabs, this.stats, this.zoom);
        this.fileInput = (0, dom_js_1.node)(this.doc, 'input');
        this.fileInput.type = 'file';
        this.fileInput.hidden = true;
        this.fileInput.addEventListener('change', () => { void this.openFile(); });
        this.root.append(top, this.tabBar, this.ribbon, this.main, bottom, this.fileInput);
        this.ribbon.addEventListener('focusin', event => event.target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }));
        container.append(this.root);
        this.selectTab('Home');
        this.root.addEventListener('keydown', this.onKeyDown);
        this.onFullscreenChange = () => this.refreshFullscreen();
        this.doc.addEventListener('fullscreenchange', this.onFullscreenChange);
        this.refreshFullscreen();
        this.unlisten = workbook.onOperation((operation) => {
            if (operation.type === 'document.load')
                this.savedDocument = JSON.stringify(workbook.toJSON());
            if (['document.load', 'worksheet.activate', 'worksheet.remove', 'undo', 'redo'].includes(operation.type))
                this.closeTransientEditors();
            this.update();
        });
    }
    get sheet() { return this.workbook.activeWorksheet; }
    get range() { return (0, model_1.rectToRange)(this.renderer.selection.primary); }
    paginationChanged(state) {
        this.paginationState.enabled = state !== null;
        if (state)
            this.paginationState.size = state.pageSize;
    }
    setPagination(enabled, size) {
        if (enabled)
            this.renderer.enablePagination(size);
        else
            this.renderer.disablePagination();
        this.update();
    }
    commandButton(id, icon, labeled = false) {
        const command = this.renderer.commands.get(id);
        const element = (0, dom_js_1.button)(this.doc, command?.title ?? id, () => this.execute(id), icon ?? commandIcons[id]);
        element.dataset.command = id;
        if (labeled && element.querySelector('svg'))
            element.append((0, dom_js_1.node)(this.doc, 'span', '', command?.title ?? id));
        if (command?.shortcut)
            element.title += ` (${command.shortcut})`;
        return element;
    }
    execute(id) {
        try {
            this.renderer.commitEdits();
            this.renderer.commands.execute(id, { workbook: this.workbook, worksheet: this.sheet, selection: this.renderer.selection });
            this.renderer.render();
        }
        catch (error) {
            this.message(error);
        }
    }
    mutate(action) {
        try {
            this.renderer.commitEdits();
            this.workbook.transaction(action);
            this.renderer.render();
            return true;
        }
        catch (error) {
            this.message(error);
            return false;
        }
    }
    style(patch) { this.mutate(() => this.sheet.setStyle(this.range, patch)); }
    registerCommands() {
        const register = (id, title, run, shortcut) => this.renderer.commands.register({ id, title, shortcut, execute: run });
        this.renderer.commands.register({ id: 'edit.undo', title: 'Undo', shortcut: 'Mod+Z', isEnabled: () => this.workbook.canUndo, execute: () => this.workbook.undo() });
        this.renderer.commands.register({ id: 'edit.redo', title: 'Redo', shortcut: 'Mod+Y', isEnabled: () => this.workbook.canRedo, execute: () => this.workbook.redo() });
        for (const key of ['bold', 'italic', 'underline', 'wrap'])
            this.renderer.commands.register({
                id: `format.${key}`, title: key[0].toUpperCase() + key.slice(1),
                isSelected: () => Boolean(this.currentStyle()[key]),
                execute: () => this.style({ [key]: !this.currentStyle()[key] }),
            });
        for (const align of ['left', 'center', 'right'])
            register(`format.${align}`, align[0].toUpperCase() + align.slice(1), () => this.style({ align }));
        const panels = { format: 'Cell format', find: 'Find and replace', tables: 'Format as table', charts: 'Charts', images: 'Images', shapes: 'Shapes', layout: 'Rows and columns', headers: 'Grouped headers', functions: 'Insert function', names: 'Defined names', sort: 'Sort', filters: 'Filters', groups: 'Row groups', validation: 'Validation', conditional: 'Conditional formatting', pivots: 'Pivot tables', notes: 'Cell note', freeze: 'Freeze panes', pagination: 'Pagination' };
        for (const [key, title] of Object.entries(panels))
            register(`panel.${key}`, title, () => this.revealTool(key), key === 'find' ? 'Mod+F' : undefined);
        register('file.new', 'New workbook', () => { void this.replaceDocument(new workbook_js_1.Workbook().toJSON()); });
        register('file.open', 'Open workbook', () => this.chooseFile('document'), 'Mod+O');
        register('file.save', 'Save JSON', () => {
            this.download(JSON.stringify(this.workbook.toJSON(), null, 2), 'json', 'application/json');
            this.savedDocument = JSON.stringify(this.workbook.toJSON());
            this.message('Workbook downloaded.');
        }, 'Mod+S');
        register('file.csvImport', 'Import CSV', () => this.chooseFile('csv'));
        register('file.csvExport', 'Export CSV', () => this.download(this.sheet.toCsv(), 'csv', 'text/csv'));
        register('file.xlsxExport', 'Export Excel', () => this.download((0, index_js_1.workbookToXlsx)(this.workbook), 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
        register('file.print', 'Print', () => this.dialog('Print active worksheet', [
            { key: 'paper', label: 'Paper', options: ['A4', 'Letter'], value: 'A4' },
            { key: 'orientation', label: 'Orientation', options: ['portrait', 'landscape'], value: 'portrait' },
            { key: 'margin', label: 'Margin (mm)', type: 'number', value: 15, min: 0, max: 100 },
            { key: 'repeat', label: 'Repeat leading rows', type: 'number', value: 0, min: 0 },
            { key: 'grid', label: 'Print gridlines', type: 'checkbox', value: true },
        ], (v) => {
            if (!(0, print_js_1.printHtml)((0, print_js_1.buildPrintHtml)(this.workbook, this.sheet.name, { paperSize: v.paper, orientation: v.orientation, marginMm: Number(v.margin), repeatHeaderRows: Number(v.repeat), gridlines: v.grid === 'true' })))
                throw new Error('Allow popups to open the print preview.');
        }, 'Print'));
        register('cells.merge', 'Merge', () => this.mutate(() => this.sheet.merge(this.range)));
        register('cells.unmerge', 'Unmerge', () => this.mutate(() => this.sheet.unmerge(this.range)));
        register('cells.clear', 'Clear contents', () => this.mutate(() => {
            const range = this.renderer.selection.primary;
            this.sheet.cells.forEach((row, column) => {
                if (row >= range.top && row <= range.bottom && column >= range.left && column <= range.right)
                    this.sheet.setValue(row, column, null);
            });
        }));
        register('cells.fill', 'Fill series', () => (0, panels_js_1.openPanel)(this, 'fill'));
        register('filter.clear', 'Clear filters', () => this.mutate(() => this.sheet.clearFilter()));
        register('formula.recalculate', 'Recalculate', () => { this.workbook.refreshFormulaGraph(); this.renderer.render(); });
        register('notes.clear', 'Remove note', () => this.mutate(() => this.sheet.clearNote(this.range)));
        register('view.formula', 'Formula bar', () => { this.formulaVisible = !this.formulaVisible; this.renderer.setFormulaBarVisible(this.formulaVisible); });
        register('view.ribbon', 'Collapse ribbon', () => this.setRibbonVisible(this.ribbon.hidden));
        register('view.theme', 'Light / dark', () => {
            this.setThemeChoice(this.root.dataset.theme === 'dark' ? 'light' : 'dark');
        });
        register('view.fullscreen', 'Fullscreen', () => {
            const promise = this.doc.fullscreenElement === this.root ? this.doc.exitFullscreen() : this.root.requestFullscreen?.();
            if (!promise)
                this.message('Fullscreen is unavailable in this browser.');
            else
                void promise.catch((error) => this.message(error));
        });
    }
    currentStyle() { const { row, column } = this.renderer.selection.state.active; return this.sheet.getStyle(row, column) ?? {}; }
    /** Applies a raw theme selection; 'system' resolves through prefers-color-scheme and keeps following it. */
    setThemeChoice(choice) {
        this.themeChoice = choice;
        const dark = choice === 'system' ? this.resolveSystemTheme() : choice === 'dark';
        this.root.dataset.theme = dark ? 'dark' : 'light';
        const tokens = dark ? { ...theme_js_1.defaultThemeTokens, ...theme_js_1.darkThemeTokens } : theme_js_1.defaultThemeTokens;
        for (const target of [this.root, this.root.querySelector('[role=grid]')]) {
            for (const [key, value] of Object.entries(tokens))
                target.style.setProperty(`--ezygrid-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value);
        }
        this.refreshThemeMenu();
        this.syncThemeMedia();
    }
    resolveSystemTheme() {
        try {
            return this.doc.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false;
        }
        catch {
            return false;
        }
    }
    syncThemeMedia() {
        const win = this.doc.defaultView;
        if (!win || typeof win.matchMedia !== 'function')
            return;
        if (this.themeChoice === 'system') {
            if (this.themeMedia)
                return;
            this.themeMedia = win.matchMedia('(prefers-color-scheme: dark)');
            this.themeMediaListener = () => { if (this.themeChoice === 'system')
                this.setThemeChoice('system'); };
            this.themeMedia.addEventListener?.('change', this.themeMediaListener);
        }
        else if (this.themeMedia) {
            this.themeMedia.removeEventListener?.('change', this.themeMediaListener);
            this.themeMedia = undefined;
            this.themeMediaListener = undefined;
        }
    }
    refreshThemeMenu() {
        if (!this.themeMenu)
            return;
        const summary = this.themeMenu.querySelector('summary');
        if (summary)
            summary.replaceChildren((0, dom_js_1.icon)(this.doc, this.themeChoice === 'dark' ? 'moon' : this.themeChoice === 'light' ? 'sun' : 'monitor'));
        for (const item of this.themeMenu.querySelectorAll('[data-ez-theme-choice]')) {
            item.setAttribute('aria-pressed', String(item.dataset.ezThemeChoice === this.themeChoice));
        }
    }
    refreshFullscreen() {
        const active = this.doc.fullscreenElement === this.root;
        this.fullscreenButton.replaceChildren((0, dom_js_1.icon)(this.doc, active ? 'shrink' : 'expand'));
        this.fullscreenButton.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
        this.fullscreenButton.setAttribute('aria-label', this.fullscreenButton.title);
    }
    setRibbonVisible(visible) {
        this.ribbon.hidden = !visible;
        this.tabBar.dataset.ribbonExpanded = String(visible);
        const label = visible ? 'Collapse ribbon' : 'Expand ribbon';
        this.ribbonToggle.replaceChildren((0, dom_js_1.icon)(this.doc, visible ? 'collapse' : 'chevronDown'));
        this.ribbonToggle.title = label;
        this.ribbonToggle.setAttribute('aria-label', label);
        this.ribbonToggle.setAttribute('aria-expanded', String(visible));
    }
    addTab(title) {
        const tab = (0, dom_js_1.button)(this.doc, title, () => this.showRibbon(title));
        tab.setAttribute('role', 'tab');
        tab.id = `ezg-tab-${this.id}-${title.toLowerCase()}`;
        tab.setAttribute('aria-controls', this.ribbon.id);
        tab.dataset.tab = title;
        tab.hidden = !(title in ribbons);
        tab.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                return;
            event.preventDefault();
            const tabs = [...this.tabBar.querySelectorAll('[role=tab]')].filter(item => !item.hidden);
            const index = tabs.indexOf(tab);
            const forward = (event.key === 'ArrowRight') !== (this.root.dir === 'rtl');
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (forward ? 1 : -1) + tabs.length) % tabs.length;
            this.showRibbon(tabs[next].dataset.tab);
            tabs[next].focus();
        });
        tab.addEventListener('focus', () => tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }));
        this.tabBar.append(tab);
    }
    showRibbon(title, label) {
        this.setRibbonVisible(true);
        if (this.activeTab !== title)
            this.selectTab(title);
        const control = label ? [...this.ribbon.querySelectorAll('[aria-label]')].find(item => item.getAttribute('aria-label') === label) : undefined;
        const target = control?.matches(':disabled') ? control.closest('[role=group]') : control;
        if (target) {
            if (target.getAttribute('role') === 'group')
                target.tabIndex = -1;
            target.focus({ preventScroll: true });
        }
    }
    revealTool(name) {
        const routes = {
            layout: ['Layout', 'Insert above'], headers: ['Layout', 'Add header level'],
            find: ['Home', 'Find'], functions: ['Formulas', 'Search functions'],
            filters: ['Data', 'Filter condition'], groups: ['Data', 'Group rows'],
            notes: ['Review', 'Note'], freeze: ['View', 'Leading rows'], pagination: ['View', 'Enable pagination'],
        };
        const route = routes[name];
        if (route)
            this.showRibbon(...route);
        else
            (0, panels_js_1.openPanel)(this, name);
    }
    contextSignature() {
        const ref = this.renderer.objects.selected;
        return `${this.sheet.id}:${ref?.kind ?? ''}:${ref?.id ?? ''}:${(0, tools_ribbon_js_1.selectedTable)(this)?.id ?? ''}`;
    }
    selectTab(title) {
        this.layoutControls?.destroy();
        this.layoutControls = undefined;
        this.headerControls?.destroy();
        this.headerControls = undefined;
        this.toolControls?.destroy();
        this.toolControls = undefined;
        this.activeTab = title;
        if (title in ribbons)
            this.lastStandardTab = title;
        this.ribbonContext = this.contextSignature();
        for (const tab of this.tabBar.querySelectorAll('[role=tab]')) {
            tab.setAttribute('aria-selected', String(tab.textContent === title));
            tab.tabIndex = tab.textContent === title ? 0 : -1;
            if (tab.textContent === title)
                this.ribbon.setAttribute('aria-labelledby', tab.id);
        }
        this.ribbon.replaceChildren();
        if (title === 'Layout') {
            this.layoutControls = (0, layout_ribbon_js_1.mountLayoutRibbon)(this, this.ribbon);
            this.headerControls = (0, headers_ribbon_js_1.mountHeadersRibbon)(this, this.ribbon);
        }
        for (const [name, commands] of ribbons[title] ?? []) {
            const group = (0, dom_js_1.node)(this.doc, 'div', 'ezg-group');
            const controls = (0, dom_js_1.node)(this.doc, 'div', 'ezg-controls');
            if (title === 'Home' && name === 'Font') {
                const font = (0, select_js_1.createSelect)(this.doc, { label: 'Font family', options: ['Outfit', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana'], popupHost: controls });
                font.dataset.style = 'fontFamily';
                font.addEventListener('change', () => this.style({ fontFamily: font.value }));
                const size = (0, dom_js_1.node)(this.doc, 'input');
                size.type = 'number';
                size.min = '6';
                size.max = '200';
                size.value = '13';
                size.dataset.style = 'fontSize';
                size.setAttribute('aria-label', 'Font size');
                size.addEventListener('change', () => { if (size.reportValidity())
                    this.style({ fontSize: Number(size.value) }); });
                controls.append(font, size);
            }
            for (const id of commands)
                controls.append(this.commandButton(id, undefined, title === 'File'));
            if (title === 'Home' && name === 'Font') {
                for (const [key, label, value] of [['color', 'Text color', '#0f172a'], ['background', 'Fill color', '#ffffff']]) {
                    const color = (0, dom_js_1.node)(this.doc, 'input');
                    color.type = 'color';
                    color.value = value;
                    color.title = label;
                    color.setAttribute('aria-label', label);
                    color.dataset.style = key;
                    color.addEventListener('change', () => this.style({ [key]: color.value }));
                    controls.append(color);
                }
            }
            group.append(controls, (0, dom_js_1.node)(this.doc, 'span', 'ezg-group-label', name));
            this.ribbon.append(group);
        }
        this.toolControls = (0, tools_ribbon_js_1.mountToolsRibbon)(this, this.ribbon, title);
        this.ribbon.scrollLeft = 0;
        this.update();
        this.tabBar.querySelector('[aria-selected=true]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
    update() {
        if (this.disposed)
            return;
        const selected = this.renderer.objects.selected;
        if (selected && (selected.worksheetId !== this.sheet.id || !this.renderer.objects.get(selected))) {
            this.renderer.objects.select(null);
            return;
        }
        if (this.toolValid && !this.toolValid())
            this.closeToolDialog();
        const ref = this.renderer.objects.selected;
        const table = (0, tools_ribbon_js_1.selectedTable)(this);
        for (const tab of this.tabBar.querySelectorAll('[role=tab]')) {
            const title = tab.dataset.tab;
            tab.hidden = !(title in ribbons) && !(title === 'Table' ? table : ref?.kind === title.toLowerCase());
        }
        if (this.ribbonContext !== this.contextSignature()) {
            const active = this.tabBar.querySelector('[aria-selected=true]');
            const changedSheet = !this.ribbonContext.startsWith(`${this.sheet.id}:`);
            if (!(this.activeTab in ribbons) || changedSheet) {
                const focused = this.doc.activeElement;
                const restoreFocus = this.ribbon.contains(focused) || this.tabBar.contains(focused);
                this.selectTab(active?.hidden ? this.lastStandardTab : this.activeTab);
                if (restoreFocus && (active?.hidden || !focused?.isConnected))
                    this.tabBar.querySelector('[aria-selected=true]')?.focus({ preventScroll: true });
                return;
            }
            this.ribbonContext = this.contextSignature();
        }
        this.layoutControls?.refresh();
        this.headerControls?.refresh();
        this.toolControls?.refresh();
        if (this.doc.activeElement !== this.filename)
            this.filename.value = this.workbook.filename;
        const context = { workbook: this.workbook, worksheet: this.sheet, selection: this.renderer.selection };
        for (const element of this.root.querySelectorAll('[data-command]')) {
            const command = this.renderer.commands.get(element.dataset.command);
            element.disabled = !command || command.isEnabled?.(context) === false;
            if (command?.isSelected)
                element.setAttribute('aria-pressed', String(command.isSelected(context)));
        }
        const style = this.currentStyle();
        for (const input of this.ribbon.querySelectorAll('[data-style]')) {
            if (this.doc.activeElement === input)
                continue;
            const key = input.dataset.style;
            input.value = String(style[key] ?? (key === 'fontFamily' ? 'Outfit' : key === 'fontSize' ? 13 : key === 'color' ? '#0f172a' : '#ffffff'));
        }
        const signature = this.workbook.worksheets.map((sheet) => `${sheet.id}:${sheet.name}`).join('|') + this.sheet.id;
        if (signature !== this.sheetSignature) {
            this.sheetSignature = signature;
            this.tabs.replaceChildren();
            for (const sheet of this.workbook.worksheets) {
                const tab = (0, dom_js_1.button)(this.doc, sheet.name, () => { this.renderer.commitEdits(); this.workbook.setActiveWorksheet(sheet.id); this.renderer.focus(); });
                tab.setAttribute('role', 'tab');
                tab.setAttribute('aria-selected', String(sheet === this.sheet));
                tab.addEventListener('dblclick', () => this.sheetSettings(sheet.id));
                tab.addEventListener('contextmenu', (event) => { event.preventDefault(); this.sheetSettings(sheet.id); });
                this.tabs.append(tab);
            }
            this.tabs.append((0, dom_js_1.button)(this.doc, 'Add worksheet', () => this.mutate(() => { const sheet = this.workbook.addWorksheet(); this.workbook.setActiveWorksheet(sheet.id); }), 'plus'));
            this.tabs.append((0, dom_js_1.button)(this.doc, 'Sheet settings', () => this.sheetSettings(this.sheet.id)));
        }
        let count = 0;
        let sum = 0;
        let numeric = 0;
        const range = this.renderer.selection.primary;
        this.sheet.cells.forEach((row, column) => {
            if (row < range.top || row > range.bottom || column < range.left || column > range.right)
                return;
            const value = this.sheet.getValue(row, column);
            if (value !== null && value !== undefined && value !== '')
                count++;
            if (typeof value === 'number' && Number.isFinite(value)) {
                numeric++;
                sum += value;
            }
        });
        this.stats.textContent = `Count ${count}${numeric ? `   Sum ${Number(sum.toPrecision(10))}   Average ${Number((sum / numeric).toPrecision(10))}` : ''}`;
        this.zoom.value = String(Math.round(this.renderer.getZoom() * 100));
    }
    sheetSettings(id) {
        const sheet = this.workbook.getWorksheet(id);
        this.dialog('Worksheet settings', [
            { key: 'name', label: 'Name', value: sheet.name, required: true },
            { key: 'position', label: 'Position', type: 'number', min: 1, max: this.workbook.worksheets.length, value: this.workbook.worksheets.indexOf(sheet) + 1 },
            { key: 'remove', label: 'Delete this worksheet', type: 'checkbox', value: false },
        ], (v) => {
            if (v.remove === 'true') {
                if (this.workbook.worksheets.length === 1)
                    throw new Error('The last worksheet cannot be deleted.');
                void this.confirm(`Delete “${sheet.name}”?`, () => this.mutate(() => this.workbook.removeWorksheet(id)));
            }
            else
                this.mutate(() => { sheet.name = v.name; this.workbook.moveWorksheet(id, Number(v.position) - 1); });
        });
    }
    showLayoutControls(headers = false) {
        this.setRibbonVisible(true);
        if (this.activeTab !== 'Layout')
            this.selectTab('Layout');
        const control = headers ? this.ribbon.querySelector('[aria-label="Add header level"]') : this.ribbon.querySelector('[aria-label="Insert above"]');
        control?.focus({ preventScroll: true });
    }
    toolDialog(title, valid = () => true) {
        const opener = this.doc.activeElement;
        this.closeToolDialog();
        const sheetId = this.sheet.id;
        const panel = (0, dom_js_1.node)(this.doc, 'dialog', 'ezg-dialog ezg-tool-dialog');
        panel.setAttribute('aria-label', title);
        const header = (0, dom_js_1.node)(this.doc, 'header');
        header.append((0, dom_js_1.node)(this.doc, 'h2', '', title), (0, dom_js_1.button)(this.doc, 'Close dialog', () => this.closeToolDialog(), 'close'));
        panel.append(header);
        this.root.append(panel);
        this.toolElement = panel;
        this.toolValid = () => this.sheet.id === sheetId && valid();
        panel.addEventListener('cancel', event => { event.preventDefault(); this.closeToolDialog(); });
        panel.addEventListener('close', () => {
            if (this.toolElement === panel)
                this.closeToolDialog();
        });
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
                event.preventDefault();
                event.stopPropagation();
                this.closeToolDialog();
            }
        });
        panel.showModal();
        queueMicrotask(() => {
            if (this.toolElement === panel && panel.querySelector('header')?.contains(this.doc.activeElement)) {
                panel.querySelector(':scope > :not(header) input:not([type=hidden]), :scope > :not(header) select, :scope > :not(header) textarea, :scope > :not(header) [role=combobox], :scope > :not(header) button')?.focus({ preventScroll: true });
            }
        });
        this.toolCleanup = () => { if (!this.disposed && opener?.isConnected)
            opener.focus({ preventScroll: true }); };
        return panel;
    }
    setToolCleanup(cleanup) {
        const previous = this.toolCleanup;
        this.toolCleanup = () => { cleanup(); previous?.(); };
    }
    inspectObject(ref) {
        const key = ref ? `${ref.worksheetId}:${ref.kind}:${ref.id}` : '';
        const changed = key !== this.objectKey;
        this.objectKey = key;
        if (changed && ref) {
            this.closeToolDialog();
            this.setRibbonVisible(true);
            this.selectTab(ref.kind[0].toUpperCase() + ref.kind.slice(1));
        }
        else
            this.update();
    }
    closeToolDialog() {
        const cleanup = this.toolCleanup;
        this.toolCleanup = undefined;
        const panel = this.toolElement;
        this.toolElement = undefined;
        this.toolValid = undefined;
        if (panel?.open)
            panel.close();
        panel?.remove();
        cleanup?.();
    }
    closeTransientEditors() {
        this.closeToolDialog();
        for (const dialog of this.dialogs) {
            dialog.close();
            dialog.remove();
        }
        this.dialogs.clear();
    }
    dialog(title, fields, apply, label = 'Apply') {
        const dialog = (0, dom_js_1.node)(this.doc, 'dialog', 'ezg-dialog');
        dialog.setAttribute('aria-label', title);
        const content = (0, dom_js_1.form)(this.doc, fields, (values) => {
            try {
                apply(values);
                dialog.close();
            }
            catch (error) {
                this.message(error);
            }
        }, label);
        content.append((0, dom_js_1.button)(this.doc, 'Cancel', () => dialog.close()));
        dialog.append((0, dom_js_1.node)(this.doc, 'h2', '', title), content);
        this.root.append(dialog);
        const opener = this.doc.activeElement;
        this.dialogs.add(dialog);
        dialog.addEventListener('close', () => { this.dialogs.delete(dialog); dialog.remove(); if (!this.disposed) {
            if (opener?.isConnected)
                opener.focus({ preventScroll: true });
            else
                this.renderer.focus();
        } }, { once: true });
        dialog.showModal();
    }
    confirm(title, apply) { this.dialog(title, [], apply, 'Continue'); }
    toggleExportMenu() {
        const open = this.exportButton.getAttribute('aria-expanded') === 'true';
        this.closeExportMenu();
        if (open)
            return;
        this.exportCleanup = (0, suite_topbar_js_1.openSuiteMenu)(this.exportButton, [
            { label: 'Excel (.xlsx)', action: () => this.execute('file.xlsxExport') },
            { label: 'CSV (active sheet)', action: () => this.execute('file.csvExport') },
            { label: 'Ezygrid JSON', action: () => this.execute('file.save') },
        ]);
    }
    closeExportMenu() {
        this.exportCleanup?.();
        this.exportCleanup = undefined;
    }
    message(error) {
        if (this.disposed)
            return;
        this.status?.remove();
        this.status = (0, dom_js_1.node)(this.doc, 'div', 'ezg-message');
        this.status.setAttribute('role', 'status');
        this.status.append((0, dom_js_1.node)(this.doc, 'span', '', error instanceof Error ? error.message : String(error)), (0, dom_js_1.button)(this.doc, 'Dismiss', () => this.status?.remove(), 'close'));
        const dialog = [...this.dialogs].reverse().find(item => item.open) ?? (this.toolElement?.open ? this.toolElement : undefined);
        (dialog ?? this.root).append(this.status);
    }
    chooseFile(kind) {
        this.fileKind = kind;
        this.fileInput.accept = kind === 'csv' ? '.csv,text/csv' : '.json,.xlsx';
        this.fileInput.value = '';
        this.fileInput.click();
    }
    async openFile() {
        const file = this.fileInput.files?.[0];
        if (!file)
            return;
        try {
            if (this.fileKind === 'csv') {
                const text = await file.text();
                this.confirm('Import CSV into the active worksheet?', () => this.mutate(() => this.sheet.fromCsv(text)));
            }
            else {
                const data = /\.xlsx$/i.test(file.name) ? (await (0, index_js_1.workbookFromXlsx)(new Uint8Array(await file.arrayBuffer()))).toJSON() : JSON.parse(await file.text());
                const staged = workbook_js_1.Workbook.fromJSON(data);
                staged.filename = file.name.replace(/\.(json|xlsx)$/i, '');
                if (!this.disposed)
                    this.replaceDocument(staged.toJSON());
            }
        }
        catch (error) {
            this.message(error);
        }
    }
    replaceDocument(data) {
        const apply = () => this.workbook.loadJSON(data);
        if (JSON.stringify(this.workbook.toJSON()) !== this.savedDocument)
            this.confirm('Replace this workbook? Download a JSON copy first to keep unsaved changes.', apply);
        else
            apply();
    }
    download(data, extension, type) {
        const url = URL.createObjectURL(new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type }));
        const link = (0, dom_js_1.node)(this.doc, 'a');
        link.href = url;
        link.download = `${this.workbook.filename.replace(/[<>:"/\\|?*]/g, '_')}.${extension}`;
        this.root.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    onKeyDown = (event) => {
        if (event.target.closest('dialog'))
            return;
        if (event.target.closest('input,textarea,select,[contenteditable=true]'))
            return;
        if (event.defaultPrevented)
            return;
        const command = this.renderer.commands.matchShortcut(event);
        if (event.target.closest('[role=grid]') && command && ['edit.undo', 'edit.redo', 'clipboard.copy', 'clipboard.cut', 'clipboard.paste', 'cells.fillDown'].includes(command.id))
            return;
        if (command) {
            event.preventDefault();
            this.execute(command.id);
        }
    };
    destroy() {
        this.disposed = true;
        this.layoutControls?.destroy();
        this.headerControls?.destroy();
        this.toolControls?.destroy();
        this.closeTransientEditors();
        this.unlisten();
        this.topbarCleanup();
        this.themeMenuCleanup();
        this.doc.removeEventListener('fullscreenchange', this.onFullscreenChange);
        if (this.themeMedia) {
            this.themeMedia.removeEventListener?.('change', this.themeMediaListener);
            this.themeMedia = undefined;
            this.themeMediaListener = undefined;
        }
        this.closeExportMenu();
        this.root.removeEventListener('keydown', this.onKeyDown);
        this.root.remove();
    }
}
exports.EditorShell = EditorShell;

});
