import { MAX_WORKSHEET_COLUMNS, MAX_WORKSHEET_ROWS } from '../workbook.js';
import type { EditorShell } from './editor-shell.js';
import { button, node } from './dom.js';
import { openSuiteMenu } from './suite-topbar.js';
import { columnName, commitLayout, fittedSizes, shiftHeaderGroups } from './layout-actions.js';

export interface RibbonControls { refresh(): void; destroy(): void }

export function mountLayoutRibbon(host: EditorShell, ribbon: HTMLElement): RibbonControls {
  const { doc, renderer } = host;
  let disposed = false; let busy = false; let sheet = host.sheet;
  let closeMenu: (() => void) | undefined;
  const updates: (() => void)[] = [];
  const groups = (['row', 'column'] as const).map(axis => {
    const rows = axis === 'row'; const noun = rows ? 'rows' : 'columns';
    const group = node(doc, 'section', 'ezg-group ezg-layout-ribbon-group'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', rows ? 'Rows' : 'Columns');
    const controls = node(doc, 'div', 'ezg-layout-ribbon-controls');
    const actions = node(doc, 'div', 'ezg-layout-ribbon-actions');
    const sizing = node(doc, 'form', 'ezg-layout-ribbon-size'); sizing.noValidate = true;
    const status = node(doc, 'p', 'ezg-ribbon-error'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const caption = node(doc, 'span', 'ezg-group-label ezg-layout-target'); caption.setAttribute('aria-live', 'polite');
    const label = (start: number, end: number) => `${rows ? start + 1 : columnName(start)}${start === end ? '' : `–${rows ? end + 1 : columnName(end)}`}`;
    const bounds = () => {
      const range = renderer.selection.primary;
      const limit = rows ? host.sheet.rowCount : host.sheet.columnCount;
      const start = Math.max(0, Math.min(limit - 1, rows ? range.top : range.left));
      const end = Math.max(start, Math.min(limit - 1, rows ? range.bottom : range.right));
      return { start, end, count: end - start + 1, limit };
    };
    const perform = (action: () => void) => {
      if (disposed) return;
      try { busy = true; commitLayout(host, action); status.textContent = ''; }
      catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      finally { busy = false; refresh(); }
    };
    const run = (action: 'before' | 'after' | 'delete' | 'hide' | 'fit') => {
      if (renderer.selection.state.ranges.length !== 1) return;
      try {
        renderer.commitEdits();
        const current = host.sheet; const { start, end, count, limit } = bounds();
        if (action === 'delete' && count >= limit) return;
        if (action === 'fit') {
          const font = doc.defaultView?.getComputedStyle(host.root).fontFamily || 'Outfit';
          const sizes = rows ? current.rowSizes : current.columnSizes;
          const changes = [...fittedSizes(current, axis, start, end, doc, font)].filter(([index, value]) => (sizes.getCustomSizes().get(index) ?? sizes.sizeOf(index)) !== value);
          if (changes.length) perform(() => { for (const [index, value] of changes) if (rows) current.setRowHeight(index, value); else current.setColumnWidth(index, value); });
          return;
        }
        perform(() => {
          if (action === 'hide') { if (rows) current.hideRows(start, count); else current.hideColumns(start, count); return; }
          const insert = action !== 'delete'; const index = action === 'after' ? end + 1 : start;
          const headers = !rows && current.nestedHeaders.length ? shiftHeaderGroups(current.nestedHeaders, index, count, insert) : undefined;
          if (rows) { if (insert) current.insertRows(index, count); else current.deleteRows(index, count); }
          else { if (insert) current.insertColumns(index, count); else current.deleteColumns(index, count); }
          if (headers) current.setNestedHeaders(headers);
        });
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    };
    const before = button(doc, rows ? 'Insert above' : 'Insert left', () => run('before'), rows ? 'rowInsertAbove' : 'columnInsertLeft');
    const after = button(doc, rows ? 'Insert below' : 'Insert right', () => run('after'), rows ? 'rowInsertBelow' : 'columnInsertRight');
    const remove = button(doc, `Delete ${noun}`, () => run('delete'), rows ? 'rowDelete' : 'columnDelete');
    const hide = button(doc, `Hide ${noun}`, () => run('hide'), 'eyeOff');
    const show = button(doc, `Show hidden ${noun}`, () => {
      closeMenu?.();
      const current = host.sheet; const limit = rows ? current.rowCount : current.columnCount;
      const indices = [...(rows ? current.hiddenRows : current.hiddenColumns)].filter(i => i >= 0 && i < limit).sort((a, b) => a - b);
      const ranges: [number, number][] = [];
      for (const index of indices) { const last = ranges[ranges.length - 1]; if (last && last[1] + 1 === index) last[1] = index; else ranges.push([index, index]); }
      const reveal = (selected: [number, number][]) => {
        if (host.sheet !== current || !selected.some(([start, end]) => indices.some(index => index >= start && index <= end && (rows ? current.hiddenRows : current.hiddenColumns).has(index)))) return;
        perform(() => { for (const [start, end] of selected) if (rows) current.showRows(start, end - start + 1); else current.showColumns(start, end - start + 1); });
      };
      closeMenu = openSuiteMenu(show, [
        ...ranges.map(([start, end]) => ({ label: `Show ${noun} ${label(start, end)}`, action: () => reveal([[start, end]]) })),
        { label: `Show all hidden ${noun}`, action: () => reveal(ranges), disabled: !ranges.length },
      ]);
    }, 'eye');
    show.setAttribute('aria-haspopup', 'menu'); show.setAttribute('aria-expanded', 'false');
    const fit = button(doc, rows ? 'Auto-fit height' : 'Auto-fit width', () => run('fit'), rows ? 'rowFit' : 'columnFit');
    actions.append(before, after, remove, hide, show, fit);
    const sizeLabel = node(doc, 'label', '', rows ? 'Height (px)' : 'Width (px)');
    const input = node(doc, 'input'); input.type = 'number'; input.min = rows ? '16' : '24'; input.max = '2000'; input.step = 'any';
    input.setAttribute('aria-label', rows ? 'Row height (px)' : 'Column width (px)'); input.title = input.getAttribute('aria-label')!;
    sizeLabel.append(input);
    const apply = button(doc, rows ? 'Apply row height' : 'Apply column width', () => {}, 'check'); apply.type = 'submit';
    sizing.append(sizeLabel, apply); controls.append(actions, sizing); group.append(controls, status, caption); ribbon.append(group);
    sizing.addEventListener('submit', event => {
      event.preventDefault(); const value = Number(input.value); const minimum = rows ? 16 : 24;
      if (!input.value || !Number.isFinite(value) || value < minimum || value > 2000) { status.textContent = `Enter a size from ${minimum} to 2000 pixels.`; return; }
      if (renderer.selection.state.ranges.length !== 1) return;
      const current = host.sheet; const { start, end } = bounds(); const sizes = rows ? current.rowSizes : current.columnSizes;
      const custom = sizes.getCustomSizes(); const changes: number[] = [];
      for (let i = start; i <= end; i++) if ((custom.get(i) ?? sizes.sizeOf(i)) !== value) changes.push(i);
      if (changes.length) perform(() => { for (const index of changes) if (rows) current.setRowHeight(index, value); else current.setColumnWidth(index, value); });
    });
    let target = '';
    updates.push(() => {
      const current = host.sheet; const { start, end, count, limit } = bounds();
      const signature = `${current.id}:${start}:${end}:${renderer.selection.state.ranges.length}`;
      const targetChanged = target !== signature; if (targetChanged) status.textContent = '';
      target = signature;
      caption.textContent = `${rows ? 'Rows' : 'Columns'} ${label(start, end)} · ${count} ${count === 1 ? (rows ? 'row' : 'column') : noun}`;
      const contiguous = renderer.selection.state.ranges.length === 1;
      before.disabled = after.disabled = !contiguous || count + limit > (rows ? MAX_WORKSHEET_ROWS : MAX_WORKSHEET_COLUMNS);
      remove.disabled = !contiguous || count >= limit;
      let visibleOutside = false;
      for (let index = 0; index < limit; index++) { if (index === start) index = end + 1; if (index < limit && !(rows ? current.isRowHidden(index) : current.isColumnHidden(index))) { visibleOutside = true; break; } }
      const hidden = rows ? current.hiddenRows : current.hiddenColumns;
      let anyToHide = false; for (let i = start; i <= end; i++) if (!hidden.has(i)) { anyToHide = true; break; }
      hide.disabled = !contiguous || !visibleOutside || !anyToHide;
      show.disabled = !hidden.size; fit.disabled = input.disabled = apply.disabled = !contiguous;
      if (!contiguous) status.textContent = 'Select one continuous range.';
      const sizes = rows ? current.rowSizes : current.columnSizes; const custom = sizes.getCustomSizes(); const first = custom.get(start) ?? sizes.sizeOf(start);
      let mixed = false; let customCount = 0;
      for (const [index, value] of custom) if (index >= start && index <= end) { customCount++; if (value !== first) mixed = true; }
      if (custom.has(start) && customCount < count) mixed = true;
      if (targetChanged || doc.activeElement !== input) { input.value = mixed ? '' : String(first); input.placeholder = mixed ? 'Mixed' : ''; }
    });
    return group;
  });
  function refresh() {
    if (disposed || busy) return;
    if (sheet !== host.sheet) { closeMenu?.(); closeMenu = undefined; sheet = host.sheet; }
    for (const update of updates) update();
  }
  refresh();
  return { refresh, destroy() { disposed = true; closeMenu?.(); for (const group of groups) group.remove(); } };
}
