import type { EditorShell } from './editor-shell.js';
import { node, button, form, type Field, type Values } from './dom.js';
import { parseRange, rectToRange, toA1 } from '@ezygrid/model';
import type { CellStyle, FilterCriteria } from '../workbook.js';
import { SearchService } from '../search.js';
import { replaceAll, replace as findAndReplace } from '../replace.js';
import { SortService, type SortSpec } from '../sort.js';
import { FillService } from '../fill.js';
import { formulaRegistry } from '@ezygrid/formula';
import type { ChartSpec, ChartType } from '../charts.js';
import type { PivotAggregation, PivotSpec } from '../pivot.js';
import type { ValidationType, ValidationAction } from '../validation.js';
import type { ConditionalFormatType, ConditionalFormatRule } from '../conditional-format.js';
import type { ShapeKind, MediaObject } from '../media.js';

export function openPanel(host: EditorShell, name: string): void {
  const { doc, renderer } = host;
  const sheet = host.sheet;
  const selection = renderer.selection.primary;
  const active = renderer.selection.state.active;
  const text = (key: string, label: string, value = '', required = false): Field => ({ key, label, value, required });
  const num = (key: string, label: string, value = 0, min = 0, max?: number): Field => ({ key, label, value, type: 'number', min, max, required: true });
  const check = (key: string, label: string, value = false): Field => ({ key, label, value, type: 'checkbox' });
  const pick = (key: string, label: string, options: string[], value = options[0]): Field => ({ key, label, options, value });
  const range = (value = host.range): Field => text('range', 'Cell range', value, true);
  const validateRange = (value: string) => {
    const rect = parseRange(value);
    if (rect.top < 0 || rect.left < 0 || rect.bottom >= sheet.rowCount || rect.right >= sheet.columnCount) throw new Error('Range is outside this worksheet.');
    return rect;
  };
  const attach = (panel: HTMLElement, fields: Field[], apply: (v: Values) => void, label = 'Apply') => {
    const content = form(doc, fields, (v) => {
      try {
        if (v.range) validateRange(v.range);
        apply(v);
      } catch (error) { host.message(error); }
    }, label);
    panel.append(content);
    return content;
  };
  const list = (panel: HTMLElement, entries: { label: string; run: () => void }[]) => {
    const element = node(doc, 'div', 'ezg-list');
    for (const entry of entries) element.append(button(doc, entry.label, entry.run));
    panel.append(element);
  };
  const addFields = (target: HTMLFormElement, fields: Field[]) => {
    const extra = form(doc, fields, () => {});
    extra.lastElementChild?.remove();
    for (const child of Array.from(extra.children)) target.insertBefore(child, target.querySelector('[type=submit]'));
  };

  if (name === 'format') {
    const style = sheet.getStyle(active.row, active.column) ?? {};
    const panel = host.panel('Cell format');
    attach(panel, [range(), pick('vertical', 'Vertical alignment', ['top', 'middle', 'bottom'], style.verticalAlign ?? 'top'),
      pick('number', 'Number format', ['General', '0', '0.00', '#,##0.00', '0%', '0.00%', '$#,##0.00', 'yyyy-mm-dd', 'Custom'], sheet.getNumberFormat(active.row, active.column) ?? 'General'),
      text('mask', 'Custom number format'), pick('border', 'Borders', ['Keep existing', 'All', 'Outside', 'Top', 'Right', 'Bottom', 'Left', 'None']),
      { key: 'color', label: 'Border color', type: 'color', value: '#64748b' }, num('width', 'Border width', 1, 1, 8),
      pick('line', 'Border style', ['solid', 'dashed', 'dotted']),
    ], (v) => host.mutate(() => {
      const rect = validateRange(v.range!);
      sheet.setStyle(v.range!, { verticalAlign: v.vertical as CellStyle['verticalAlign'] });
      sheet.setNumberFormat(v.range!, v.number === 'Custom' ? v.mask! : v.number!);
      if (v.border !== 'Keep existing') {
        for (let row = rect.top; row <= rect.bottom; row++) for (let column = rect.left; column <= rect.right; column++) {
          const borders = { ...sheet.getStyle(row, column)?.borders };
          for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
            const outside = edge === 'top' ? row === rect.top : edge === 'bottom' ? row === rect.bottom : edge === 'left' ? column === rect.left : column === rect.right;
            if (v.border === 'None') borders[edge] = null;
            else if (v.border === 'All' || (v.border === 'Outside' && outside) || v.border!.toLowerCase() === edge) {
              borders[edge] = { width: Number(v.width), style: v.line as 'solid' | 'dashed' | 'dotted', color: v.color! };
            }
          }
          sheet.setStyle(toA1(row, column), { borders });
        }
      }
    }));
  } else if (name === 'find') {
    const panel = host.panel('Find and replace');
    let nextIndex = 0;
    const fields = [text('query', 'Find', '', true), text('replacement', 'Replace with'), check('matchCase', 'Match case'), check('wholeCell', 'Match entire cell'), check('searchFormulas', 'Search formula text'), pick('action', 'Action', ['Find next', 'Replace next', 'Replace all'])];
    attach(panel, fields, (v) => {
      const options = { matchCase: v.matchCase === 'true', wholeCell: v.wholeCell === 'true', searchFormulas: v.searchFormulas === 'true' };
      if (v.action === 'Find next') {
        const hits = new SearchService().find(sheet, v.query!, options);
        const hit = hits[nextIndex++ % hits.length];
        if (hit) renderer.navigateToAddress(toA1(hit.row, hit.column));
        host.message(hits.length ? `${hits.length} matching cells` : 'No matches found.');
      } else host.mutate(() => {
        if (v.action === 'Replace all') host.message(`${replaceAll(sheet, v.query!, v.replacement!, options)} cells replaced.`);
        else {
          const hit = findAndReplace(sheet, v.query!, v.replacement!, renderer.selection.state.active, options);
          if (hit) renderer.navigateToAddress(toA1(hit.row, hit.column));
          else host.message('No replacement made.');
        }
      });
    }, 'Run');
  } else if (name === 'layout') {
    const panel = host.panel('Rows and columns');
    attach(panel, [pick('axis', 'Apply to', ['Rows', 'Columns']), pick('action', 'Action', ['Insert before', 'Delete', 'Resize', 'Auto-fit', 'Hide', 'Show']), num('start', 'Starting index (1-based)', active.row + 1, 1), num('count', 'Count', 1, 1), num('size', 'Size in pixels', 24, 1, 2000)], (v) => host.mutate(() => {
      const rows = v.axis === 'Rows'; const index = Number(v.start) - 1; const count = Number(v.count);
      const limit = rows ? sheet.rowCount : sheet.columnCount;
      if (index + count > limit) throw new Error('The requested rows or columns exceed the worksheet.');
      if (v.action === 'Insert before') { if (rows) sheet.insertRows(index, count); else sheet.insertColumns(index, count); }
      else if (v.action === 'Delete') { if (rows) sheet.deleteRows(index, count); else sheet.deleteColumns(index, count); }
      else if (v.action === 'Hide') { if (rows) sheet.hideRows(index, count); else sheet.hideColumns(index, count); }
      else if (v.action === 'Show') { if (rows) sheet.showRows(index, count); else sheet.showColumns(index, count); }
      else {
        const canvas = doc.createElement('canvas'); const context = canvas.getContext('2d');
        for (let i = index; i < index + count; i++) {
          let size = Number(v.size);
          if (v.action === 'Auto-fit') {
            size = rows ? 24 : 40;
            sheet.cells.forEach((row, column) => {
              if ((rows ? row : column) !== i) return;
              const style = sheet.getStyle(row, column) ?? {};
              const fontSize = style.fontSize ?? 13;
              if (context) context.font = `${style.bold ? 'bold ' : ''}${fontSize}px ${style.fontFamily ?? 'Outfit'}`;
              const value = String(sheet.getValue(row, column) ?? '');
              const lines = value.split('\n');
              const width = Math.max(...lines.map((line) => context?.measureText(line).width ?? line.length * fontSize * .6));
              size = Math.max(size, rows ? Math.max(lines.length, style.wrap ? Math.ceil(width / Math.max(1, sheet.columnSizes.sizeOf(column) - 12)) : 1) * fontSize * 1.45 + 4 : width + 16);
            });
          }
          (rows ? sheet.rowSizes : sheet.columnSizes).setSize(i, Math.min(2000, Math.ceil(size)));
        }
      }
    }));
  } else if (name === 'headers') {
    const panel = host.panel('Nested headers');
    panel.append(node(doc, 'p', 'ezg-hint', 'One header level per line. Separate labels with commas. Add :2 after a label to span two columns. Leave blank to remove.'));
    attach(panel, [{ key: 'levels', label: 'Header levels', type: 'textarea', value: sheet.nestedHeaders.map((level) => level.map((item) => typeof item === 'string' ? item : `${item.title}:${item.span}`).join(', ')).join('\n') }], (v) => host.mutate(() => {
      const levels = v.levels!.trim() ? v.levels!.split('\n').map((line) => line.split(',').map((item) => {
        const match = /^(.*):(\d+)$/.exec(item.trim());
        if (!match) return item.trim();
        const span = Number(match[2]); if (span < 1) throw new Error('Header spans must be positive.');
        return { title: match[1]!, span };
      })) : [];
      sheet.setNestedHeaders(levels);
    }));
  } else if (name === 'sort') {
    const panel = host.panel('Sort');
    const columns = Array.from({ length: sheet.columnCount }, (_, i) => toA1(0, i).replace(/1$/, ''));
    const fields: Field[] = [range(), check('header', 'First row is a header', true)];
    let sortCount = 1;
    const sortFields = (i: number) => [pick(`column${i}`, i ? `Then by ${i + 1}` : 'Sort by', ['None', ...columns], i ? 'None' : columns[selection.left]), pick(`direction${i}`, 'Direction', ['Ascending', 'Descending'])];
    fields.push(...sortFields(0));
    const sortForm = attach(panel, fields, (v) => host.mutate(() => {
      const rect = validateRange(v.range!); if (v.header === 'true') rect.top++;
      const specs: SortSpec[] = [];
      for (let i = 0; i < sortCount; i++) if (v[`column${i}`] !== 'None') {
        const column = columns.indexOf(v[`column${i}`]!);
        if (column < rect.left || column > rect.right) throw new Error('Sort columns must be inside the selected range.');
        specs.push({ column, direction: v[`direction${i}`] === 'Ascending' ? 'asc' : 'desc' });
      }
      new SortService().sort(sheet, rect, specs);
    }), 'Sort');
    panel.append(button(doc, 'Add sort level', () => addFields(sortForm, sortFields(sortCount++))));
  } else if (name === 'filters') {
    const panel = host.panel('Filters');
    list(panel, [...sheet.filters.keys()].map((column) => ({ label: `Remove filter: ${toA1(0, column).replace(/1$/, '')}`, run: () => { host.mutate(() => sheet.clearFilter(column)); openPanel(host, name); } })));
    attach(panel, [num('column', 'Column number', active.column + 1, 1, sheet.columnCount), pick('operator', 'Condition', ['equals', 'contains', 'gt', 'lt', 'notEmpty']), text('value', 'Value')], (v) => {
      host.mutate(() => sheet.setFilterCriteria(Number(v.column) - 1, { operator: v.operator as FilterCriteria['operator'], value: v.value })); openPanel(host, name);
    });
  } else if (name === 'groups') {
    const panel = host.panel('Row groups');
    list(panel, sheet.getGroups().flatMap((group) => [
      { label: `${group.collapsed ? 'Expand' : 'Collapse'} rows ${group.start + 1}–${group.end + 1}`, run: () => { host.mutate(() => group.collapsed ? sheet.expandGroup(group.start) : sheet.collapseGroup(group.start)); openPanel(host, name); } },
      { label: `Ungroup rows ${group.start + 1}–${group.end + 1}`, run: () => { host.mutate(() => sheet.ungroupRows(group.start)); openPanel(host, name); } },
    ]));
    attach(panel, [num('start', 'First row', selection.top + 1, 1, sheet.rowCount), num('end', 'Last row', selection.bottom + 1, 1, sheet.rowCount)], (v) => {
      if (Number(v.end) < Number(v.start)) throw new Error('Last row must follow first row.');
      host.mutate(() => sheet.groupRows(Number(v.start) - 1, Number(v.end) - 1)); openPanel(host, name);
    }, 'Group rows');
  } else if (name === 'notes') {
    const panel = host.panel('Cell note');
    attach(panel, [range(), { key: 'note', label: 'Note', type: 'textarea', value: sheet.getNote(active.row, active.column) ?? '' }], (v) => host.mutate(() => v.note ? sheet.setNote(v.range!, v.note) : sheet.clearNote(v.range!)));
  } else if (name === 'freeze') {
    const panel = host.panel('Freeze panes');
    attach(panel, [num('rows', 'Leading rows', sheet.freezeRows, 0, sheet.rowCount), num('columns', 'Leading columns', sheet.freezeColumns, 0, sheet.columnCount)], (v) => {
      sheet.freezeRows = Number(v.rows); sheet.freezeColumns = Number(v.columns); renderer.render();
    });
  } else if (name === 'pagination') {
    const panel = host.panel('Pagination');
    attach(panel, [check('enabled', 'Enable pagination', renderer.getPageCount() > 1), num('size', 'Rows per page', 50, 1, sheet.rowCount), num('page', 'Page', renderer.getPage() + 1, 1)], (v) => {
      if (v.enabled === 'true') { renderer.enablePagination(Number(v.size)); renderer.setPage(Number(v.page) - 1); }
      else renderer.disablePagination();
    });
    const actions = node(doc, 'div', 'ezg-actions');
    actions.append(button(doc, 'Previous page', () => renderer.setPage(renderer.getPage() - 1)), button(doc, 'Next page', () => renderer.setPage(renderer.getPage() + 1)));
    panel.append(actions);
  } else if (name === 'fill') {
    const panel = host.panel('Fill series');
    attach(panel, [text('source', 'Seed range', host.range, true), text('target', 'Fill range (including seed)', host.range, true)], (v) => host.mutate(() => new FillService().fillRange(sheet, validateRange(v.source!), validateRange(v.target!))));
  } else if (name === 'functions') {
    const panel = host.panel('Insert function');
    const search = node(doc, 'input'); search.placeholder = 'Search functions'; search.setAttribute('aria-label', 'Search functions');
    const entries = node(doc, 'div', 'ezg-list'); panel.append(search, entries);
    const render = () => {
      entries.replaceChildren();
      for (const meta of formulaRegistry.all().filter((fn) => `${fn.name} ${fn.description}`.toLowerCase().includes(search.value.toLowerCase()))) {
        const item = button(doc, meta.name, () => { host.closePanel(); renderer.insertFormula(`=${meta.name}(`); });
        item.title = meta.description ?? meta.name; entries.append(item);
      }
    };
    search.addEventListener('input', render); render();
  } else if (name === 'names') {
    const panel = host.panel('Defined names');
    list(panel, [...host.workbook.definedNames].map(([key]) => ({ label: `Remove ${key}`, run: () => { host.mutate(() => host.workbook.removeDefinedName(key)); openPanel(host, name); } })));
    attach(panel, [text('name', 'Name', '', true), pick('kind', 'Type', ['Range', 'Value']), text('value', 'Range reference or constant', host.range, true)], (v) => {
      host.mutate(() => host.workbook.setDefinedName(v.name!, v.kind === 'Range' ? { type: 'range', ref: v.value! } : { type: 'value', value: v.value !== '' && Number.isFinite(Number(v.value)) ? Number(v.value) : v.value })); openPanel(host, name);
    }, 'Save name');
  } else if (name === 'tables') {
    const panel = host.panel('Tables');
    const edit = (table?: import('../tables.js').TableDefinition) => {
      const target = host.panel(table ? 'Edit table' : 'Create table');
      attach(target, [text('name', 'Table name', table?.name ?? `Table${sheet.tables.all().length + 1}`, true), range(table ? rectToRange(table.range) : undefined), check('header', 'Header row', table?.headerRow ?? true), check('total', 'Total row', table?.totalRow)], (v) => {
        host.mutate(() => { if (table) sheet.tables.remove(table.name); sheet.addTable({ name: v.name!, range: v.range!, headerRow: v.header === 'true', totalRow: v.total === 'true' }); }); openPanel(host, name);
      }, table ? 'Update table' : 'Create table');
    };
    list(panel, sheet.tables.all().flatMap((table) => [
      { label: `${table.name} (${rectToRange(table.range)})`, run: () => edit(table) },
      { label: `Remove ${table.name}`, run: () => { host.mutate(() => sheet.tables.remove(table.name)); openPanel(host, name); } },
    ])); panel.append(button(doc, 'Create table', () => edit()));
  } else if (name === 'validation') {
    const panel = host.panel('Validation');
    const edit = (id?: string) => {
      const rule = sheet.validations.all().find((item) => item.id === id);
      if (rule?.predicate) { host.message('This custom validator is supplied by the host application.'); return; }
      const target = host.panel(rule ? 'Edit validation' : 'Validation');
      attach(target, [range(rule?.range), pick('type', 'Rule', ['number', 'list', 'textLength'], rule?.type ?? 'number'),
        pick('action', 'Invalid values', ['reject', 'warning', 'mark'], rule?.action ?? 'reject'),
        text('min', 'Minimum (optional)', rule?.min?.toString()), text('max', 'Maximum (optional)', rule?.max?.toString()),
        num('length', 'Exact text length', rule?.length ?? 10), text('values', 'Allowed values (comma separated)', rule?.values?.join(', ')), text('message', 'Validation message', rule?.message),
        pick('editor', 'Cell editor', ['Keep existing', 'text', 'number', 'date', 'checkbox', 'dropdown']),
      ], (v) => {
        const values = v.values!.split(',').map((value) => value.trim());
        if ((v.min && !Number.isFinite(Number(v.min))) || (v.max && !Number.isFinite(Number(v.max)))) throw new Error('Minimum and maximum must be numbers.');
        host.mutate(() => {
          if (id) sheet.removeValidation(id);
          sheet.addValidation({ range: v.range!, type: v.type as ValidationType, action: v.action as ValidationAction, min: v.min ? Number(v.min) : undefined, max: v.max ? Number(v.max) : undefined, length: Number(v.length), values, message: v.message });
          if (v.editor !== 'Keep existing') sheet.setCellEditor(v.range!, v.editor!, { values });
        }); openPanel(host, name);
      });
    };
    list(panel, sheet.validations.all().flatMap((rule) => [
      { label: `${rule.range}: ${rule.type}${rule.predicate ? ' (host supplied)' : ''}`, run: () => edit(rule.id) },
      { label: `Remove rule for ${rule.range}`, run: () => { host.mutate(() => sheet.removeValidation(rule.id)); openPanel(host, name); } },
    ]));
    panel.append(button(doc, 'Add validation', () => edit()));
    const editors = new Set([...sheet.cellEditors.values()].map((editor) => editor.type));
    if (editors.size) panel.append(node(doc, 'p', 'ezg-hint', `Cell editors in this sheet: ${[...editors].join(', ')}`));
  } else if (name === 'conditional') {
    const panel = host.panel('Conditional formatting');
    const edit = (rule?: ConditionalFormatRule) => {
      if (rule?.predicate) { host.message('This expression rule is supplied by the host application.'); return; }
      const target = host.panel(rule ? 'Edit conditional format' : 'Conditional format');
      attach(target, [range(rule?.range), pick('type', 'Condition', ['cellIs', 'containsText', 'topN', 'duplicates'], rule?.type ?? 'cellIs'), pick('operator', 'Comparison', ['gt', 'lt', 'gte', 'lte', 'eq', 'neq'], rule?.operator ?? 'gt'), text('value', 'Value or text', String(rule?.text ?? rule?.value ?? '')), num('n', 'Top count', rule?.n ?? 10, 1), num('priority', 'Priority (lower first)', rule?.priority ?? 0), check('stop', 'Stop if true', rule?.stopIfTrue), { key: 'color', label: 'Text color', type: 'color', value: rule?.style.color ?? '#00674a' }, { key: 'background', label: 'Fill color', type: 'color', value: rule?.style.background ?? '#e6fff4' }, check('bold', 'Bold', rule?.style.bold)], (v) => {
        host.mutate(() => {
          if (rule) sheet.conditionalFormats.remove(rule.id);
          sheet.conditionalFormats.add({ range: v.range!, type: v.type as ConditionalFormatType, operator: v.operator as ConditionalFormatRule['operator'], value: v.value, text: v.value, n: Number(v.n), priority: Number(v.priority), stopIfTrue: v.stop === 'true', style: { ...rule?.style, color: v.color, background: v.background, bold: v.bold === 'true' } });
        }); openPanel(host, name);
      });
    };
    list(panel, sheet.conditionalFormats.all().flatMap((rule) => [
      { label: `${rule.range}: ${rule.type}${rule.predicate ? ' (host supplied)' : ''}`, run: () => edit(rule) },
      { label: `Remove ${rule.type} rule`, run: () => { host.mutate(() => sheet.conditionalFormats.remove(rule.id)); openPanel(host, name); } },
    ])); panel.append(button(doc, 'Add rule', () => edit()));
  } else if (name === 'charts') {
    const panel = host.panel('Charts');
    const edit = (chart?: ChartSpec) => {
      const target = host.panel(chart ? 'Edit chart' : 'Insert chart');
      attach(target, [range(chart?.source), pick('type', 'Chart type', ['column', 'bar', 'line', 'pie', 'doughnut'], chart?.type ?? 'column'), text('title', 'Title', chart?.title), check('header', 'First row contains headers', chart?.firstRowIsHeader !== false), text('colors', 'Colors (comma separated)', chart?.colors?.join(', ')), ...positionFields(chart)], (v) => {
        host.mutate(() => {
          const spec = { type: v.type as ChartType, source: v.range!, title: v.title, firstRowIsHeader: v.header === 'true', colors: v.colors ? v.colors.split(',').map((color) => color.trim()) : undefined, ...position(v) };
          if (chart) Object.assign(chart, spec); else sheet.addChart(spec);
        }); openPanel(host, name);
      }, chart ? 'Update chart' : 'Insert chart');
    };
    list(panel, sheet.charts.all().flatMap((chart) => [
      { label: `${chart.title || chart.type} — ${chart.source}`, run: () => edit(chart) },
      { label: `Remove ${chart.title || chart.type}`, run: () => { host.mutate(() => sheet.charts.remove(chart.id)); openPanel(host, name); } },
    ])); panel.append(button(doc, 'Insert chart', () => edit()));
  } else if (name === 'pivots') {
    const panel = host.panel('Pivot tables');
    const edit = (pivot?: PivotSpec) => {
      const target = host.panel(pivot ? 'Edit pivot' : 'Create pivot');
      const fields: Field[] = [range(pivot?.source), text('anchor', 'Output cell', pivot?.anchor ?? toA1(selection.bottom + 2, selection.left), true), text('rows', 'Group by columns (relative numbers, e.g. 1, 2)', pivot?.rows.map((column) => column + 1).join(', ') ?? '1', true)];
      let count = Math.max(1, pivot?.values.length ?? 0);
      const valueFields = (i: number) => [num(`column${i}`, `Value column ${i + 1} (0 to skip)`, (pivot?.values[i]?.column ?? (i ? -1 : 1)) + 1), pick(`agg${i}`, 'Aggregation', ['SUM', 'COUNT', 'COUNTA', 'AVG', 'MIN', 'MAX'], pivot?.values[i]?.agg ?? 'SUM'), text(`label${i}`, 'Output label', pivot?.values[i]?.label)];
      for (let i = 0; i < count; i++) fields.push(...valueFields(i));
      const pivotForm = attach(target, fields, (v) => {
        const source = validateRange(v.range!); validateRange(v.anchor!);
        const rows = v.rows!.split(',').map((value) => Number(value.trim()) - 1);
        const values = Array.from({ length: count }, (_, i) => ({ column: Number(v[`column${i}`]) - 1, agg: v[`agg${i}`] as PivotAggregation, label: v[`label${i}`] || undefined })).filter((value) => value.column >= 0);
        if (!values.length || [...rows, ...values.map((value) => value.column)].some((column) => !Number.isInteger(column) || column < 0 || column > source.right - source.left)) throw new Error('Choose group and value columns inside the source range.');
        const spec = { source: v.range!, anchor: v.anchor!, rows, values };
        const anchor = parseRange(spec.anchor);
        const output = sheet.pivots.compute(sheet, { ...spec, id: pivot?.id ?? 'preview' });
        const endRow = anchor.top + output.rows.length + 1; const endColumn = anchor.left + output.header.length - 1;
        if (endRow >= sheet.rowCount || endColumn >= sheet.columnCount) throw new Error('Pivot output exceeds worksheet size.');
        if (!(endRow < source.top || anchor.top > source.bottom || endColumn < source.left || anchor.left > source.right)) throw new Error('Pivot output must not overlap its source.');
        host.confirm('Write pivot results to the output range?', () => {
          host.mutate(() => { if (pivot) { Object.assign(pivot, spec); sheet.pivots.refresh(sheet, pivot); } else sheet.addPivot(spec); }); openPanel(host, name);
        });
      });
      target.append(button(doc, 'Add value field', () => addFields(pivotForm, valueFields(count++))));
    };
    list(panel, sheet.pivotSpecs.flatMap((pivot) => [
      { label: `${pivot.source} → ${pivot.anchor}`, run: () => edit(pivot) },
      { label: `Refresh pivot at ${pivot.anchor}`, run: () => host.mutate(() => sheet.pivots.refresh(sheet, pivot)) },
      { label: `Remove pivot definition at ${pivot.anchor}`, run: () => { host.mutate(() => sheet.pivotSpecs.splice(sheet.pivotSpecs.indexOf(pivot), 1)); openPanel(host, name); } },
    ])); panel.append(button(doc, 'Create pivot', () => edit()));
  } else if (name === 'images' || name === 'shapes') {
    const panel = host.panel(name === 'images' ? 'Images' : 'Shapes');
    const edit = (object?: MediaObject, uploaded?: string) => {
      const image = name === 'images';
      const target = host.panel(object ? 'Edit object' : image ? 'Insert image' : 'Insert shape');
      const fields: Field[] = image ? [text('src', 'Image URL', object?.kind === 'image' ? object.src : uploaded, true), text('alt', 'Alternative text', object?.kind === 'image' ? object.alt : '')] : [pick('shape', 'Shape', ['rect', 'ellipse', 'textbox'], object?.kind === 'shape' ? object.shape : 'rect'), text('text', 'Text', object?.kind === 'shape' ? object.text : ''), { key: 'fill', label: 'Fill', type: 'color', value: object?.kind === 'shape' ? object.fill ?? '#e6fff4' : '#e6fff4' }, { key: 'stroke', label: 'Stroke', type: 'color', value: object?.kind === 'shape' ? object.stroke ?? '#00c47a' : '#00c47a' }, { key: 'textColor', label: 'Text color', type: 'color', value: object?.kind === 'shape' ? object.textColor ?? '#0f172a' : '#0f172a' }];
      attach(target, [...fields, ...positionFields(object), num('zIndex', 'Stack order', object?.zIndex ?? 1)], (v) => {
        if (image && !/^(https?:|data:image\/(png|jpeg|gif|webp);base64,|blob:)/i.test(v.src!)) throw new Error('Use an HTTP(S) image URL or upload a PNG, JPEG, GIF, or WebP.');
        host.mutate(() => {
          const placement = { ...position(v), zIndex: Number(v.zIndex) };
          if (image) {
            const spec = { src: v.src!, alt: v.alt, ...placement };
            if (object) Object.assign(object, spec); else sheet.addImage(spec);
          } else {
            const spec = { shape: v.shape as ShapeKind, text: v.text, fill: v.fill, stroke: v.stroke, textColor: v.textColor, ...placement };
            if (object) Object.assign(object, spec); else sheet.addShape(spec);
          }
        }); openPanel(host, name);
      });
    };
    list(panel, sheet.media.all().filter((object) => name === 'images' ? object.kind === 'image' : object.kind === 'shape').flatMap((object) => [
      { label: object.kind === 'image' ? object.alt || 'Image' : object.text || object.shape, run: () => edit(object) },
      { label: 'Remove object', run: () => { host.mutate(() => sheet.media.remove(object.id)); openPanel(host, name); } },
    ])); panel.append(button(doc, name === 'images' ? 'Insert image URL' : 'Insert shape', () => edit()));
    if (name === 'images') {
      const upload = node(doc, 'input'); upload.type = 'file'; upload.accept = 'image/png,image/jpeg,image/gif,image/webp'; upload.setAttribute('aria-label', 'Upload image');
      upload.addEventListener('change', () => {
        const file = upload.files?.[0]; if (!file) return;
        const reader = new FileReader(); reader.onload = () => edit(undefined, String(reader.result)); reader.onerror = () => host.message('Image could not be read.'); reader.readAsDataURL(file);
      }); panel.append(upload);
    }
  }

  function positionFields(object?: { anchor: { row: number; column: number }; offsetX?: number; offsetY?: number; width?: number; height?: number }): Field[] {
    return [text('anchor', 'Anchor cell', object ? toA1(object.anchor.row, object.anchor.column) : toA1(active.row, active.column), true), num('width', 'Width (px)', object?.width ?? 400, 20, 4000), num('height', 'Height (px)', object?.height ?? 240, 20, 4000), num('offsetX', 'Horizontal offset', object?.offsetX ?? 0), num('offsetY', 'Vertical offset', object?.offsetY ?? 0)];
  }
  function position(v: Values) {
    const anchor = validateRange(v.anchor!);
    return { anchor: { row: anchor.top, column: anchor.left }, width: Number(v.width), height: Number(v.height), offsetX: Number(v.offsetX), offsetY: Number(v.offsetY) };
  }
}
