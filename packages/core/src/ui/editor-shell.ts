import { Workbook, type CellStyle } from '../workbook.js';
import type { GridRenderer, GridRendererOptions } from '../renderer.js';
import { rectToRange } from '@ezygrid/model';
import { node, button, icon, form, type Field, type Values } from './dom.js';
import { installEditorStyles } from './styles.js';
import { openPanel } from './panels.js';
import { workbookFromXlsx, workbookToXlsx } from '../xlsx/index.js';
import { buildPrintHtml, printHtml } from '../print.js';
import { darkThemeTokens, defaultThemeTokens } from '../theme.js';

// Official Ezygrid brand mark — keep in sync with the repository's icon.svg
// (viewBox normalized and gradient id namespaced so multiple editors on one
// page never share an id).
const brandLogo =
  '<svg viewBox="0 0 455 455" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient cx="4314825" cy="0" r="6102084" gradientUnits="userSpaceOnUse" spreadMethod="pad" id="ezg-logo-fill" gradientTransform="matrix(0.000104987 0 0 0.000104987 794 2268)"><stop offset="0" stop-color="#00FF99"/><stop offset="0.2" stop-color="#00FF99"/><stop offset="1" stop-color="#2563EB"/></radialGradient></defs><g transform="translate(-793 -2267)"><rect x="794" y="2268" width="453" height="453" fill="url(#ezg-logo-fill)"/><path d="M1065.98 2343C1124.53 2343 1172 2390.47 1172 2449.02 1172 2500.26 1135.66 2543 1087.34 2552.89L1080.08 2554 1080.58 2550.74C1080.94 2547.17 1081.12 2543.56 1081.12 2539.9 1081.12 2481.34 1033.66 2433.88 975.101 2433.88 971.441 2433.88 967.825 2434.06 964.261 2434.42L961 2434.92 962.109 2427.66C971.995 2379.34 1014.74 2343 1065.98 2343Z" fill="#FFFFFF" fill-rule="evenodd"/><path d="M960.921 2435 960.424 2438.26C960.062 2441.82 959.876 2445.44 959.876 2449.1 959.876 2507.66 1007.34 2555.12 1065.9 2555.12 1069.56 2555.12 1073.17 2554.94 1076.74 2554.58L1080 2554.08 1078.89 2561.34C1069 2609.66 1026.26 2646 975.023 2646 916.468 2646 869 2598.53 869 2539.98 869 2488.74 905.343 2446 953.655 2436.11L960.921 2435Z" fill="#FFFFFF" fill-rule="evenodd"/></g></svg>';

// Lucide icon names per command id (see dom.ts for the icon data).
const commandIcons: Record<string, string> = {
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

type Group = [string, string[]];
const ribbons: Record<string, Group[]> = {
  File: [['Workbook', ['file.new', 'file.open', 'file.save']], ['Import / export', ['file.csvImport', 'file.csvExport', 'file.xlsxExport']], ['Print', ['file.print']]],
  Home: [['Clipboard', ['clipboard.cut', 'clipboard.copy', 'clipboard.paste']], ['History', ['edit.undo', 'edit.redo']], ['Font', ['format.bold', 'format.italic', 'format.underline']], ['Alignment', ['format.left', 'format.center', 'format.right', 'format.wrap', 'panel.format']], ['Cells', ['cells.merge', 'cells.unmerge', 'cells.fillDown', 'cells.fill', 'cells.clear', 'format.clear']], ['Find', ['panel.find']]],
  Insert: [['Data', ['panel.tables', 'panel.charts']], ['Objects', ['panel.images', 'panel.shapes']]],
  Layout: [['Rows and columns', ['panel.layout']], ['Headers', ['panel.headers']]],
  Formulas: [['Functions', ['panel.functions', 'panel.names', 'formula.recalculate']]],
  Data: [['Organize', ['panel.sort', 'panel.filters', 'filter.clear', 'panel.groups']], ['Rules', ['panel.validation', 'panel.conditional']], ['Analysis', ['panel.pivots']]],
  Review: [['Notes', ['panel.notes', 'notes.clear']]],
  View: [['Workbook view', ['panel.freeze', 'panel.pagination', 'view.formula', 'view.ribbon']], ['Appearance', ['view.theme', 'view.fullscreen']]],
};

export class EditorShell {
  readonly doc: Document;
  readonly root: HTMLElement;
  private main: HTMLElement;
  private ribbon: HTMLElement;
  private tabBar: HTMLElement;
  private tabs: HTMLElement;
  private stats: HTMLElement;
  private filename: HTMLInputElement;
  private zoom: HTMLSelectElement;
  private panelElement?: HTMLElement;
  private status?: HTMLElement;
  private disposed = false;
  private unlisten: () => void;
  private activeTab = 'Home';
  private savedDocument: string;
  private fileInput: HTMLInputElement;
  private fileKind: 'document' | 'csv' = 'document';
  private sheetSignature = '';
  private formulaVisible: boolean;
  private exportButton: HTMLButtonElement;
  private exportMenu?: HTMLElement;
  private exportDismiss?: (event: MouseEvent) => void;

  constructor(container: HTMLElement, grid: HTMLElement, readonly workbook: Workbook, readonly renderer: GridRenderer, options: Required<GridRendererOptions>) {
    this.doc = container.ownerDocument;
    installEditorStyles(this.doc);
    this.root = node(this.doc, 'div', 'ezygrid-suite');
    this.root.dir = options.direction;
    this.formulaVisible = options.formulaBar;
    this.savedDocument = JSON.stringify(workbook.toJSON());
    this.registerCommands();
    const top = node(this.doc, 'div', 'ezg-topbar');
    top.hidden = !options.topbar;
    const brand = node(this.doc, 'div', 'ezg-brand');
    const mark = node(this.doc, 'span', 'ezg-mark');
    mark.innerHTML = brandLogo; // static, code-owned brand asset (mirrors icon.svg)
    brand.append(mark, node(this.doc, 'span', '', 'Ezygrid'));
    this.filename = node(this.doc, 'input', 'ezg-title');
    this.filename.setAttribute('aria-label', 'Workbook filename');
    this.filename.addEventListener('change', () => this.mutate(() => { workbook.filename = this.filename.value.trim() || 'Untitled workbook'; }));
    top.append(brand, this.filename, this.commandButton('edit.undo'), this.commandButton('edit.redo'), node(this.doc, 'div', 'ezg-spacer'));
    for (const [id, icon] of [['file.open', 'open'], ['file.save', 'save'], ['view.fullscreen', 'expand']] as const) top.append(this.commandButton(id, icon));
    const chevron = node(this.doc, 'span', 'ezg-chevron');
    chevron.append(icon(this.doc, 'chevronDown'));
    const download = button(this.doc, 'Export', () => this.toggleExportMenu(), 'export');
    download.classList.add('ezg-primary', 'ezg-export');
    download.setAttribute('aria-haspopup', 'menu');
    download.setAttribute('aria-expanded', 'false');
    download.append(node(this.doc, 'span', '', 'Export'), chevron);
    this.exportButton = download;
    top.append(download);
    this.tabBar = node(this.doc, 'div', 'ezg-tabs');
    this.tabBar.setAttribute('role', 'tablist');
    this.tabBar.setAttribute('aria-label', 'Ribbon');
    this.ribbon = node(this.doc, 'div', 'ezg-ribbon');
    this.ribbon.setAttribute('role', 'toolbar');
    this.ribbon.setAttribute('aria-label', 'Spreadsheet tools');
    this.ribbon.hidden = !options.toolbar;
    for (const title of Object.keys(ribbons)) {
      const tab = button(this.doc, title, () => { this.ribbon.hidden = false; this.selectTab(title); });
      tab.setAttribute('role', 'tab');
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const titles = Object.keys(ribbons);
        const index = titles.indexOf(title);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? titles.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + titles.length) % titles.length;
        this.selectTab(titles[next]!);
        (this.tabBar.children[next] as HTMLElement).focus();
      });
      this.tabBar.append(tab);
    }
    this.tabBar.append(button(this.doc, 'Collapse ribbon', () => { this.ribbon.hidden = !this.ribbon.hidden; }, 'collapse'));
    this.main = node(this.doc, 'div', 'ezg-main');
    const viewport = node(this.doc, 'div', 'ezg-viewport');
    viewport.append(grid);
    this.main.append(viewport);
    const bottom = node(this.doc, 'div', 'ezg-bottom');
    bottom.hidden = !options.sheetTabs && !options.statusBar;
    this.tabs = node(this.doc, 'div', 'ezg-sheets');
    this.tabs.setAttribute('role', 'tablist');
    this.tabs.setAttribute('aria-label', 'Worksheets');
    this.tabs.hidden = !options.sheetTabs;
    this.stats = node(this.doc, 'span', 'ezg-stats');
    this.stats.hidden = !options.statusBar;
    this.zoom = node(this.doc, 'select');
    this.zoom.setAttribute('aria-label', 'Zoom');
    this.zoom.hidden = !options.statusBar;
    for (const percent of [25, 50, 75, 100, 125, 150, 175, 200]) {
      const option = node(this.doc, 'option', '', `${percent}%`);
      option.value = String(percent);
      this.zoom.append(option);
    }
    this.zoom.addEventListener('change', () => renderer.setZoom(Number(this.zoom.value) / 100));
    bottom.append(this.tabs, this.stats, this.zoom);
    this.fileInput = node(this.doc, 'input');
    this.fileInput.type = 'file';
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => { void this.openFile(); });
    this.root.append(top, this.tabBar, this.ribbon, this.main, bottom, this.fileInput);
    container.append(this.root);
    this.selectTab('Home');
    this.root.addEventListener('keydown', this.onKeyDown);
    this.unlisten = workbook.onOperation((operation) => {
      if (operation.type === 'document.load') this.savedDocument = JSON.stringify(workbook.toJSON());
      if (['document.load', 'worksheet.activate', 'worksheet.remove', 'undo', 'redo'].includes(operation.type)) this.closePanel();
      this.update();
    });
  }

  get sheet() { return this.workbook.activeWorksheet; }
  get range() { return rectToRange(this.renderer.selection.primary); }

  private commandButton(id: string, icon?: string): HTMLButtonElement {
    const command = this.renderer.commands.get(id);
    const element = button(this.doc, command?.title ?? id, () => this.execute(id), icon ?? commandIcons[id]);
    element.dataset.command = id;
    if (command?.shortcut) element.title += ` (${command.shortcut})`;
    return element;
  }

  execute(id: string): void {
    try {
      this.renderer.commitEdits();
      this.renderer.commands.execute(id, { workbook: this.workbook, worksheet: this.sheet, selection: this.renderer.selection });
      this.renderer.render();
    } catch (error) { this.message(error); }
  }

  mutate(action: () => void): void {
    try {
      this.renderer.commitEdits();
      this.workbook.transaction(action);
      this.renderer.render();
    } catch (error) { this.message(error); }
  }

  style(patch: CellStyle): void { this.mutate(() => this.sheet.setStyle(this.range, patch)); }

  private registerCommands(): void {
    const register = (id: string, title: string, run: () => void, shortcut?: string) => this.renderer.commands.register({ id, title, shortcut, execute: run });
    this.renderer.commands.register({ id: 'edit.undo', title: 'Undo', shortcut: 'Mod+Z', isEnabled: () => this.workbook.canUndo, execute: () => this.workbook.undo() });
    this.renderer.commands.register({ id: 'edit.redo', title: 'Redo', shortcut: 'Mod+Y', isEnabled: () => this.workbook.canRedo, execute: () => this.workbook.redo() });
    for (const key of ['bold', 'italic', 'underline', 'wrap'] as const) this.renderer.commands.register({
      id: `format.${key}`, title: key[0]!.toUpperCase() + key.slice(1),
      isSelected: () => Boolean(this.currentStyle()[key]),
      execute: () => this.style({ [key]: !this.currentStyle()[key] }),
    });
    for (const align of ['left', 'center', 'right'] as const) register(`format.${align}`, align[0]!.toUpperCase() + align.slice(1), () => this.style({ align }));
    const panels = { format: 'Cell format', find: 'Find and replace', tables: 'Tables', charts: 'Charts', images: 'Images', shapes: 'Shapes', layout: 'Rows and columns', headers: 'Nested headers', functions: 'Insert function', names: 'Defined names', sort: 'Sort', filters: 'Filters', groups: 'Row groups', validation: 'Validation', conditional: 'Conditional formatting', pivots: 'Pivot tables', notes: 'Cell note', freeze: 'Freeze panes', pagination: 'Pagination' };
    for (const [key, title] of Object.entries(panels)) register(`panel.${key}`, title, () => openPanel(this, key), key === 'find' ? 'Mod+F' : undefined);
    register('file.new', 'New workbook', () => { void this.replaceDocument(new Workbook().toJSON()); });
    register('file.open', 'Open workbook', () => this.chooseFile('document'), 'Mod+O');
    register('file.save', 'Save JSON', () => {
      this.download(JSON.stringify(this.workbook.toJSON(), null, 2), 'json', 'application/json');
      this.savedDocument = JSON.stringify(this.workbook.toJSON());
      this.message('Workbook downloaded.');
    }, 'Mod+S');
    register('file.csvImport', 'Import CSV', () => this.chooseFile('csv'));
    register('file.csvExport', 'Export CSV', () => this.download(this.sheet.toCsv(), 'csv', 'text/csv'));
    register('file.xlsxExport', 'Export Excel', () => this.download(workbookToXlsx(this.workbook), 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    register('file.print', 'Print', () => this.dialog('Print active worksheet', [
      { key: 'paper', label: 'Paper', options: ['A4', 'Letter'], value: 'A4' },
      { key: 'orientation', label: 'Orientation', options: ['portrait', 'landscape'], value: 'portrait' },
      { key: 'margin', label: 'Margin (mm)', type: 'number', value: 15, min: 0, max: 100 },
      { key: 'repeat', label: 'Repeat leading rows', type: 'number', value: 0, min: 0 },
      { key: 'grid', label: 'Print gridlines', type: 'checkbox', value: true },
    ], (v) => {
      if (!printHtml(buildPrintHtml(this.workbook, this.sheet.name, { paperSize: v.paper as 'A4' | 'Letter', orientation: v.orientation as 'portrait' | 'landscape', marginMm: Number(v.margin), repeatHeaderRows: Number(v.repeat), gridlines: v.grid === 'true' }))) throw new Error('Allow popups to open the print preview.');
    }, 'Print'));
    register('cells.merge', 'Merge', () => this.mutate(() => this.sheet.merge(this.range)));
    register('cells.unmerge', 'Unmerge', () => this.mutate(() => this.sheet.unmerge(this.range)));
    register('cells.clear', 'Clear contents', () => this.mutate(() => {
      const range = this.renderer.selection.primary;
      this.sheet.cells.forEach((row, column) => {
        if (row >= range.top && row <= range.bottom && column >= range.left && column <= range.right) this.sheet.setValue(row, column, null);
      });
    }));
    register('cells.fill', 'Fill series', () => openPanel(this, 'fill'));
    register('filter.clear', 'Clear filters', () => this.mutate(() => this.sheet.clearFilter()));
    register('formula.recalculate', 'Recalculate', () => { this.workbook.refreshFormulaGraph(); this.renderer.render(); });
    register('notes.clear', 'Remove note', () => this.mutate(() => this.sheet.clearNote(this.range)));
    register('view.formula', 'Formula bar', () => { this.formulaVisible = !this.formulaVisible; this.renderer.setFormulaBarVisible(this.formulaVisible); });
    register('view.ribbon', 'Collapse ribbon', () => { this.ribbon.hidden = !this.ribbon.hidden; });
    register('view.theme', 'Light / dark', () => {
      const dark = this.root.dataset.theme !== 'dark';
      this.root.dataset.theme = dark ? 'dark' : 'light';
      const tokens = dark ? { ...defaultThemeTokens, ...darkThemeTokens } : defaultThemeTokens;
      for (const target of [this.root, this.root.querySelector<HTMLElement>('[role=grid]')!]) {
        for (const [key, value] of Object.entries(tokens)) target.style.setProperty(`--ezygrid-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value);
      }
    });
    register('view.fullscreen', 'Fullscreen', () => {
      const promise = this.doc.fullscreenElement === this.root ? this.doc.exitFullscreen() : this.root.requestFullscreen?.();
      if (!promise) this.message('Fullscreen is unavailable in this browser.');
      else void promise.catch((error: unknown) => this.message(error));
    });
  }

  private currentStyle(): CellStyle { const { row, column } = this.renderer.selection.state.active; return this.sheet.getStyle(row, column) ?? {}; }

  private selectTab(title: string): void {
    this.activeTab = title;
    for (const tab of this.tabBar.querySelectorAll<HTMLButtonElement>('[role=tab]')) {
      tab.setAttribute('aria-selected', String(tab.textContent === title));
      tab.tabIndex = tab.textContent === title ? 0 : -1;
    }
    this.ribbon.replaceChildren();
    for (const [name, commands] of ribbons[title]!) {
      const group = node(this.doc, 'div', 'ezg-group');
      const controls = node(this.doc, 'div', 'ezg-controls');
      if (title === 'Home' && name === 'Font') {
        const font = node(this.doc, 'select');
        font.setAttribute('aria-label', 'Font family');
        for (const family of ['Outfit', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana']) font.append(node(this.doc, 'option', '', family));
        font.dataset.style = 'fontFamily';
        font.addEventListener('change', () => this.style({ fontFamily: font.value }));
        const size = node(this.doc, 'input');
        size.type = 'number'; size.min = '6'; size.max = '200'; size.value = '13'; size.dataset.style = 'fontSize';
        size.setAttribute('aria-label', 'Font size');
        size.addEventListener('change', () => { if (size.reportValidity()) this.style({ fontSize: Number(size.value) }); });
        controls.append(font, size);
      }
      for (const id of commands) controls.append(this.commandButton(id));
      if (title === 'Home' && name === 'Font') {
        for (const [key, label, value] of [['color', 'Text color', '#0f172a'], ['background', 'Fill color', '#ffffff']]) {
          const color = node(this.doc, 'input'); color.type = 'color'; color.value = value!;
          color.title = label!; color.setAttribute('aria-label', label!); color.dataset.style = key;
          color.addEventListener('change', () => this.style({ [key!]: color.value })); controls.append(color);
        }
      }
      group.append(controls, node(this.doc, 'span', 'ezg-group-label', name));
      this.ribbon.append(group);
    }
    this.update();
  }

  update(): void {
    if (this.disposed) return;
    if (this.doc.activeElement !== this.filename) this.filename.value = this.workbook.filename;
    const context = { workbook: this.workbook, worksheet: this.sheet, selection: this.renderer.selection };
    for (const element of this.root.querySelectorAll<HTMLButtonElement>('[data-command]')) {
      const command = this.renderer.commands.get(element.dataset.command!);
      element.disabled = !command || command.isEnabled?.(context) === false;
      if (command?.isSelected) element.setAttribute('aria-pressed', String(command.isSelected(context)));
    }
    const style = this.currentStyle();
    for (const input of this.ribbon.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-style]')) {
      if (this.doc.activeElement === input) continue;
      const key = input.dataset.style as keyof CellStyle;
      input.value = String(style[key] ?? (key === 'fontFamily' ? 'Outfit' : key === 'fontSize' ? 13 : key === 'color' ? '#0f172a' : '#ffffff'));
    }
    const signature = this.workbook.worksheets.map((sheet) => `${sheet.id}:${sheet.name}`).join('|') + this.sheet.id;
    if (signature !== this.sheetSignature) {
      this.sheetSignature = signature;
      this.tabs.replaceChildren();
      for (const sheet of this.workbook.worksheets) {
        const tab = button(this.doc, sheet.name, () => { this.renderer.commitEdits(); this.workbook.setActiveWorksheet(sheet.id); this.renderer.focus(); });
        tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(sheet === this.sheet));
        tab.addEventListener('dblclick', () => this.sheetSettings(sheet.id));
        tab.addEventListener('contextmenu', (event) => { event.preventDefault(); this.sheetSettings(sheet.id); });
        this.tabs.append(tab);
      }
      this.tabs.append(button(this.doc, 'Add worksheet', () => this.mutate(() => { const sheet = this.workbook.addWorksheet(); this.workbook.setActiveWorksheet(sheet.id); }), 'plus'));
      this.tabs.append(button(this.doc, 'Sheet settings', () => this.sheetSettings(this.sheet.id)));
    }
    let count = 0; let sum = 0; let numeric = 0;
    const range = this.renderer.selection.primary;
    this.sheet.cells.forEach((row, column) => {
      if (row < range.top || row > range.bottom || column < range.left || column > range.right) return;
      const value = this.sheet.getValue(row, column);
      if (value !== null && value !== undefined && value !== '') count++;
      if (typeof value === 'number' && Number.isFinite(value)) { numeric++; sum += value; }
    });
    this.stats.textContent = `Count ${count}${numeric ? `   Sum ${Number(sum.toPrecision(10))}   Average ${Number((sum / numeric).toPrecision(10))}` : ''}`;
    this.zoom.value = String(Math.round(this.renderer.getZoom() * 100));
  }

  private sheetSettings(id: string): void {
    const sheet = this.workbook.getWorksheet(id)!;
    this.dialog('Worksheet settings', [
      { key: 'name', label: 'Name', value: sheet.name, required: true },
      { key: 'position', label: 'Position', type: 'number', min: 1, max: this.workbook.worksheets.length, value: this.workbook.worksheets.indexOf(sheet) + 1 },
      { key: 'remove', label: 'Delete this worksheet', type: 'checkbox', value: false },
    ], (v) => {
      if (v.remove === 'true') {
        if (this.workbook.worksheets.length === 1) throw new Error('The last worksheet cannot be deleted.');
        void this.confirm(`Delete “${sheet.name}”?`, () => this.mutate(() => this.workbook.removeWorksheet(id)));
      } else this.mutate(() => { sheet.name = v.name!; this.workbook.moveWorksheet(id, Number(v.position) - 1); });
    });
  }

  panel(title: string): HTMLElement {
    this.closePanel();
    const panel = node(this.doc, 'aside', 'ezg-panel');
    panel.setAttribute('aria-label', title);
    const header = node(this.doc, 'header');
    header.append(node(this.doc, 'h2', '', title), button(this.doc, 'Close panel', () => this.closePanel(), 'close'));
    panel.append(header);
    this.main.append(panel);
    this.panelElement = panel;
    return panel;
  }

  closePanel(): void { this.panelElement?.remove(); this.panelElement = undefined; }

  dialog(title: string, fields: Field[], apply: (values: Values) => void, label = 'Apply'): void {
    const dialog = node(this.doc, 'dialog', 'ezg-dialog');
    dialog.setAttribute('aria-label', title);
    const content = form(this.doc, fields, (values) => {
      try { apply(values); dialog.close(); } catch (error) { this.message(error); }
    }, label);
    content.append(button(this.doc, 'Cancel', () => dialog.close()));
    dialog.append(node(this.doc, 'h2', '', title), content);
    this.root.append(dialog);
    dialog.addEventListener('close', () => { dialog.remove(); this.renderer.focus(); }, { once: true });
    dialog.showModal();
  }

  confirm(title: string, apply: () => void): void { this.dialog(title, [], apply, 'Continue'); }

  private toggleExportMenu(): void {
    if (this.exportMenu) this.closeExportMenu();
    else this.showExportMenu();
  }

  private showExportMenu(): void {
    this.closeExportMenu();
    this.exportButton.classList.add('ezg-menu-open');
    this.exportButton.setAttribute('aria-expanded', 'true');
    const menu = node(this.doc, 'div', 'ezygrid-contextmenu ezg-export-menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Export workbook');
    const items: { label: string; run: () => void }[] = [
      { label: 'Excel (.xlsx)', run: () => this.execute('file.xlsxExport') },
      { label: 'CSV (active sheet)', run: () => this.execute('file.csvExport') },
      { label: 'Ezygrid JSON', run: () => this.execute('file.save') },
    ];
    for (const item of items) {
      const row = node(this.doc, 'div', 'ezygrid-contextmenu-item', item.label);
      row.setAttribute('role', 'menuitem');
      row.tabIndex = 0;
      row.addEventListener('click', () => {
        this.closeExportMenu();
        item.run();
      });
      menu.append(row);
    }
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); this.closeExportMenu(); this.renderer.focus(); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const target = event.target as HTMLElement;
        const next = event.key === 'ArrowDown' ? target.nextElementSibling ?? menu.firstElementChild : target.previousElementSibling ?? menu.lastElementChild;
        (next as HTMLElement)?.focus();
      }
      event.stopPropagation();
    });
    const buttonRect = this.exportButton.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    if (this.root.dir === 'rtl') menu.style.left = `${buttonRect.left - rootRect.left}px`;
    else menu.style.right = `${Math.max(0, rootRect.right - buttonRect.right)}px`;
    menu.style.top = `${buttonRect.bottom - rootRect.top + 4}px`;
    this.exportMenu = menu;
    this.exportDismiss = (event: MouseEvent) => {
      const target = event.target as Node;
      if (this.exportButton.contains(target) || menu.contains(target)) return;
      this.closeExportMenu();
    };
    this.doc.addEventListener('mousedown', this.exportDismiss, true);
    this.root.append(menu);
    (menu.firstElementChild as HTMLElement)?.focus();
  }

  private closeExportMenu(): void {
    if (!this.exportMenu) return;
    this.exportMenu.remove();
    this.exportMenu = undefined;
    this.exportButton.classList.remove('ezg-menu-open');
    this.exportButton.setAttribute('aria-expanded', 'false');
    if (this.exportDismiss) {
      this.doc.removeEventListener('mousedown', this.exportDismiss, true);
      this.exportDismiss = undefined;
    }
  }

  message(error: unknown): void {
    if (this.disposed) return;
    this.status?.remove();
    this.status = node(this.doc, 'div', 'ezg-message');
    this.status.setAttribute('role', 'status');
    this.status.append(node(this.doc, 'span', '', error instanceof Error ? error.message : String(error)), button(this.doc, 'Dismiss', () => this.status?.remove(), 'close'));
    this.root.append(this.status);
  }

  private chooseFile(kind: 'document' | 'csv'): void {
    this.fileKind = kind;
    this.fileInput.accept = kind === 'csv' ? '.csv,text/csv' : '.json,.xlsx';
    this.fileInput.value = '';
    this.fileInput.click();
  }

  private async openFile(): Promise<void> {
    const file = this.fileInput.files?.[0];
    if (!file) return;
    try {
      if (this.fileKind === 'csv') {
        const text = await file.text();
        this.confirm('Import CSV into the active worksheet?', () => this.mutate(() => this.sheet.fromCsv(text)));
      } else {
        const data = /\.xlsx$/i.test(file.name) ? (await workbookFromXlsx(new Uint8Array(await file.arrayBuffer()))).toJSON() : JSON.parse(await file.text()) as unknown;
        const staged = Workbook.fromJSON(data);
        staged.filename = file.name.replace(/\.(json|xlsx)$/i, '');
        if (!this.disposed) this.replaceDocument(staged.toJSON());
      }
    } catch (error) { this.message(error); }
  }

  private replaceDocument(data: unknown): void {
    const apply = () => this.workbook.loadJSON(data);
    if (JSON.stringify(this.workbook.toJSON()) !== this.savedDocument) this.confirm('Replace this workbook? Download a JSON copy first to keep unsaved changes.', apply);
    else apply();
  }

  private download(data: string | Uint8Array, extension: string, type: string): void {
    const url = URL.createObjectURL(new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type }));
    const link = node(this.doc, 'a');
    link.href = url;
    link.download = `${this.workbook.filename.replace(/[<>:"/\\|?*]/g, '_')}.${extension}`;
    this.root.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.panelElement && !(event.target as HTMLElement).closest('dialog')) { this.closePanel(); this.renderer.focus(); return; }
    if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]')) return;
    if (event.defaultPrevented) return;
    const command = this.renderer.commands.matchShortcut(event);
    if ((event.target as HTMLElement).closest('[role=grid]') && command && ['edit.undo', 'edit.redo', 'clipboard.copy', 'clipboard.cut', 'clipboard.paste', 'cells.fillDown'].includes(command.id)) return;
    if (command) { event.preventDefault(); this.execute(command.id); }
  };

  destroy(): void {
    this.disposed = true;
    this.unlisten();
    this.closeExportMenu();
    this.root.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }
}
