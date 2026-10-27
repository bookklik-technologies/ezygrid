import type { EditorShell } from './editor-shell.js';
import { button, node } from './dom.js';
import { createSelect, type SelectControl } from './select.js';
import { columnIndex, columnName, commitLayout, readHeaderGroups, writeHeaderGroups } from './layout-actions.js';
import type { RibbonControls } from './layout-ribbon.js';

export function mountHeadersRibbon(host: EditorShell, ribbon: HTMLElement): RibbonControls {
  const { doc, renderer } = host;
  let sheet = host.sheet; let levels = readHeaderGroups(sheet.nestedHeaders); let original = JSON.stringify(levels);
  let saved = JSON.stringify(sheet.nestedHeaders); let levelIndex = 0; let groupIndex = 0;
  let disposed = false; let busy = false; let previewStart = 0; let popup: HTMLElement | undefined;
  const group = node(doc, 'section', 'ezg-group ezg-headers-ribbon-group'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Grouped headers');
  const controls = node(doc, 'div', 'ezg-layout-ribbon-controls');
  const firstRow = node(doc, 'div', 'ezg-layout-ribbon-actions'); const secondRow = node(doc, 'div', 'ezg-layout-ribbon-actions');
  const levelSelect: SelectControl = createSelect(doc, { label: 'Header level', popupHost: controls });
  levelSelect.title = 'Header level';
  const groupSelect: SelectControl = createSelect(doc, { label: 'Header group', popupHost: controls });
  groupSelect.title = 'Header group';
  const status = node(doc, 'p', 'ezg-ribbon-error'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const caption = node(doc, 'span', 'ezg-group-label'); caption.setAttribute('aria-live', 'polite');
  const label = node(doc, 'input'); label.setAttribute('aria-label', 'Header label'); label.title = 'Header label'; label.placeholder = 'Header label'; label.className = 'ezg-header-label-input';
  const from = node(doc, 'input'); from.setAttribute('aria-label', 'From column'); from.title = 'From column'; from.placeholder = 'From'; from.className = 'ezg-header-column-input';
  const to = node(doc, 'input'); to.setAttribute('aria-label', 'To column'); to.title = 'To column'; to.placeholder = 'To'; to.className = 'ezg-header-column-input';
  const current = () => levels[levelIndex]?.[groupIndex];
  const focusLabel = () => label.focus();
  function addGroup() {
    const level = levels[levelIndex]; if (!level) return;
    const selected = renderer.selection.primary;
    const occupied = (start: number, end: number) => level.some(item => columnIndex(item.from) <= end && columnIndex(item.to) >= start);
    let start = selected.left; let end = selected.right;
    if (occupied(start, end)) { start = 0; while (start < sheet.columnCount && occupied(start, start)) start++; end = start; }
    if (start >= sheet.columnCount) { status.textContent = 'This level covers every column. Edit or remove a group first.'; return; }
    level.push({ label: `Group ${level.length + 1}`, from: columnName(start), to: columnName(end) }); groupIndex = level.length - 1;
    previewStart = Math.floor(start / 8) * 8; refresh(true); focusLabel();
  }
  const addLevel = button(doc, 'Add header level', () => { levels.push([]); levelIndex = levels.length - 1; groupIndex = 0; addGroup(); }, 'rowInsertAbove');
  const removeLevel = button(doc, 'Remove header level', () => { levels.splice(levelIndex, 1); groupIndex = 0; refresh(true); }, 'rowDelete');
  const move = (delta: number) => {
    const next = levelIndex + delta; if (next < 0 || next >= levels.length) return;
    [levels[levelIndex], levels[next]] = [levels[next]!, levels[levelIndex]!]; levelIndex = next; refresh(true);
  };
  const up = button(doc, 'Move header level up', () => move(-1), 'collapse'); const down = button(doc, 'Move header level down', () => move(1), 'chevronDown');
  const add = button(doc, 'Add header group', addGroup, 'columnInsertRight');
  const remove = button(doc, 'Remove header group', () => { levels[levelIndex]?.splice(groupIndex, 1); refresh(true); }, 'columnDelete');
  const previewButton = button(doc, 'Preview grouped headers', () => popup ? closePreview(true) : openPreview(), 'eye'); previewButton.setAttribute('aria-expanded', 'false'); previewButton.setAttribute('aria-haspopup', 'dialog');
  const cancel = button(doc, 'Cancel header changes', () => { reset(); closePreview(); refresh(true); addLevel.focus(); }, 'close');
  const save = button(doc, 'Save headers', () => {
    try {
      const configuration = writeHeaderGroups(levels, sheet.columnCount);
      if (JSON.stringify(levels) === original) return;
      busy = true; commitLayout(host, () => sheet.setNestedHeaders(configuration));
      saved = JSON.stringify(sheet.nestedHeaders); original = JSON.stringify(levels); status.textContent = '';
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    finally { busy = false; refresh(); }
  }, 'check');
  save.classList.add('ezg-primary');
  firstRow.append(levelSelect, addLevel, removeLevel, up, down, groupSelect, add, remove);
  secondRow.append(label, from, node(doc, 'span', 'ezg-header-range-dash', '–'), to, previewButton, save, cancel);
  controls.append(firstRow, secondRow); group.append(controls, status, caption); ribbon.append(group);
  const preview = node(doc, 'div', 'ezg-headers-preview'); preview.setAttribute('role', 'img');
  const paging = node(doc, 'div', 'ezg-headers-paging'); const pageLabel = node(doc, 'span'); pageLabel.setAttribute('aria-live', 'polite');
  const previous = button(doc, 'Previous columns', () => { previewStart -= 8; renderPreview(); }, 'chevronDown');
  const next = button(doc, 'Next columns', () => { previewStart += 8; renderPreview(); }, 'chevronDown');
  paging.append(previous, pageLabel, next);
  function renderPreview() {
    previewStart = Math.max(0, Math.min(previewStart, Math.floor((sheet.columnCount - 1) / 8) * 8));
    const end = Math.min(sheet.columnCount - 1, previewStart + 7); const count = end - previewStart + 1;
    pageLabel.textContent = `${columnName(previewStart)}–${columnName(end)}`;
    previous.disabled = previewStart === 0; next.disabled = end === sheet.columnCount - 1;
    preview.replaceChildren(); preview.style.setProperty('--ezg-preview-columns', String(count));
    preview.setAttribute('aria-label', `Grouped headers preview, columns ${pageLabel.textContent}. ${levels.map((level, index) => `Level ${index + 1}: ${level.map(item => `${item.label || 'Blank'}, ${item.from} to ${item.to}`).join('; ')}`).join('. ')}`);
    levels.forEach(level => {
      const row = node(doc, 'div', 'ezg-header-preview-row');
      for (const item of level) {
        const start = columnIndex(item.from); const last = columnIndex(item.to);
        if (start < 0 || last < start || start > end || last < previewStart) continue;
        const cell = node(doc, 'span', '', item.label); cell.title = `${item.label || 'Blank'} · ${item.from}:${item.to}`;
        cell.style.gridColumn = `${Math.max(start, previewStart) - previewStart + 1} / ${Math.min(last, end) - previewStart + 2}`; row.append(cell);
      }
      preview.append(row);
    });
    const letters = node(doc, 'div', 'ezg-header-preview-row ezg-header-preview-letters');
    for (let c = previewStart; c <= end; c++) letters.append(node(doc, 'span', '', columnName(c)));
    preview.append(letters);
    positionPreview();
  }
  function reset() { sheet = host.sheet; levels = readHeaderGroups(sheet.nestedHeaders); original = JSON.stringify(levels); saved = JSON.stringify(sheet.nestedHeaders); levelIndex = groupIndex = 0; }
  function refresh(force = false) {
    if (disposed || busy) return;
    if (sheet !== host.sheet || saved !== JSON.stringify(host.sheet.nestedHeaders)) { closePreview(); reset(); force = true; }
    levelIndex = Math.max(0, Math.min(levelIndex, levels.length - 1)); groupIndex = Math.max(0, Math.min(groupIndex, (levels[levelIndex]?.length ?? 0) - 1));
    levelSelect.setOptions(levels.length
      ? levels.map((_, index) => ({ value: String(index), label: `Level ${index + 1}` }))
      : [{ value: '0', label: 'No levels' }]);
    levelSelect.value = String(levelIndex); levelSelect.disabled = !levels.length;
    const levelGroups = levels[levelIndex] ?? [];
    groupSelect.setOptions(levelGroups.length
      ? levelGroups.map((item, index) => ({ value: String(index), label: `${item.label || 'Blank'} (${item.from}:${item.to})` }))
      : [{ value: '0', label: 'No groups' }]);
    groupSelect.value = String(groupIndex); groupSelect.disabled = !levelGroups.length;
    const item = current();
    for (const [input, value] of [[label, item?.label ?? ''], [from, item?.from ?? ''], [to, item?.to ?? '']] as const) { input.disabled = !item; if (force || doc.activeElement !== input) input.value = value; }
    remove.disabled = !item; add.disabled = removeLevel.disabled = !levels.length;
    up.disabled = !levels.length || levelIndex === 0; down.disabled = !levels.length || levelIndex === levels.length - 1;
    const dirty = JSON.stringify(levels) !== original; cancel.disabled = !dirty;
    try { writeHeaderGroups(levels, sheet.columnCount); status.textContent = ''; save.disabled = !dirty; }
    catch (error) { status.textContent = error instanceof Error ? error.message : String(error); save.disabled = true; }
    caption.textContent = dirty ? 'Grouped headers · Unsaved changes' : 'Grouped headers';
    renderPreview();
  }
  levelSelect.addEventListener('change', () => { levelIndex = Number(levelSelect.value); groupIndex = 0; refresh(true); });
  groupSelect.addEventListener('change', () => { groupIndex = Number(groupSelect.value); const start = columnIndex(current()?.from ?? ''); if (start >= 0) previewStart = Math.floor(start / 8) * 8; refresh(true); });
  for (const [input, key] of [[label, 'label'], [from, 'from'], [to, 'to']] as const) input.addEventListener('input', () => {
    const item = current(); if (!item) return; item[key] = input.value;
    const start = columnIndex(item.from); if (start >= 0 && start < sheet.columnCount) previewStart = Math.floor(start / 8) * 8;
    refresh();
  });
  function positionPreview() {
    if (!popup) return;
    const win = doc.defaultView!; const anchor = previewButton.getBoundingClientRect();
    popup.style.maxWidth = `${Math.max(0, win.innerWidth - 16)}px`; popup.style.maxHeight = `${Math.max(80, win.innerHeight - 16)}px`;
    const size = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(anchor.right - size.width, win.innerWidth - size.width - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, win.innerHeight - size.height - 8))}px`;
  }
  const outside = (event: Event) => { if (!popup?.contains(event.target as Node) && !group.contains(event.target as Node)) closePreview(); };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePreview(true); } };
  function openPreview() {
    popup = node(doc, 'div', 'ezg-ribbon-preview-popup'); popup.setAttribute('popover', 'manual'); popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', 'Grouped headers preview');
    popup.append(preview, paging); host.root.append(popup); if (popup.showPopover) popup.showPopover();
    popup.addEventListener('keydown', escape); previewButton.setAttribute('aria-expanded', 'true');
    doc.addEventListener('pointerdown', outside, true); doc.addEventListener('scroll', positionPreview, true); doc.defaultView!.addEventListener('resize', positionPreview);
    renderPreview(); (previous.disabled ? next.disabled ? previewButton : next : previous).focus();
  }
  function closePreview(restore = false) {
    if (!popup) return;
    popup.remove(); popup = undefined; previewButton.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('scroll', positionPreview, true); doc.defaultView!.removeEventListener('resize', positionPreview);
    if (restore) previewButton.focus();
  }
  group.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); reset(); closePreview(); refresh(true); addLevel.focus(); }
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); if (!save.disabled) save.click(); }
  });
  refresh(true);
  return { refresh: () => refresh(), destroy() { disposed = true; closePreview(); levelSelect.destroy(); groupSelect.destroy(); group.remove(); } };
}
