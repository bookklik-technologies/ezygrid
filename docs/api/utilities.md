# Utilities

Standalone services and helpers exported from `@ezygrid/core` (and small dedicated packages).

## Clipboard

```ts
interface ClipboardCell { raw?; formula?; style?; literal? }
interface ClipboardRange { rows: number; columns: number; origin: { row; column }; cells: ClipboardCell[][] }

class ClipboardService {
  copyFrom(worksheet, top, left, bottom, right, options?: { valuesOnly?: boolean }): ClipboardRange;
  getBuffer(): ClipboardRange | null;
  loadTSV(text: string): void;
  toTSV(): string;
  static fromTSV(text: string): ClipboardRange;
  pasteTo(workbook, worksheet, anchorRow, anchorColumn): void;
}

function translateFormula(formula: string, dRow: number, dCol: number): string;
```

See [Clipboard](/guide/clipboard).

## Fill

```ts
type FillDirection = 'down' | 'up' | 'right' | 'left';

class FillService {
  fillRange(worksheet, source: Rect, target: Rect): void;
  fill(worksheet, direction: FillDirection, rect: Rect, targetEnd: ...): void;
}
```

See [Fill & series](/guide/fill).

## Merges

```ts
interface MergeRect extends Rect { id: string }

class MergeStore {
  merge(rect: Rect): MergeRect;        // rejects overlaps/degenerate rects
  unmergeAt(row: number, column: number): void;
  findAt(row: number, column: number): MergeRect | undefined;
  isCovered(row: number, column: number): boolean;
  get all(): MergeRect[];
  clear(): void;
  transform(mapper: ..., axis: 'row' | 'column'): void;
}
```

## Sorting

```ts
interface SortSpec { column: number; direction: 'asc' | 'desc' }

class SortService {
  sort(worksheet, rect: Rect, specs: SortSpec[]): void;
}
```

## Search & replace

```ts
interface SearchOptions { matchCase?: boolean; wholeCell?: boolean; searchFormulas?: boolean }
interface SearchResult { row: number; column: number; text: string }

class SearchService {
  find(worksheet, query: string, options?): SearchResult[];
  findNext(worksheet, query: string, from: { row; column }, options?): SearchResult | undefined;
}

function replace(worksheet, query: string, replacement: string, from: { row; column }, options?): SearchResult | undefined;
function replaceAll(worksheet, query: string, replacement: string, options?): number;
```

## Number formats

```ts
function formatValue(value: unknown, mask?: string): string;
```

Supported masks: `#,##0`, `#,##0.00`, `0.00%`, `$#,##0.00`, `yyyy-mm-dd`, `dd/mm/yyyy`, `mm/dd/yyyy`, `General`.

## Tables

```ts
interface TableColumn { name: string; index: number }
interface TableDefinition { id: string; name: string; range: Rect; headerRow: boolean; totalRow: boolean; columns: TableColumn[] }

class TableStore {
  add(worksheet, definition: { name; range; headerRow?; totalRow? }): TableDefinition;
  get(name: string): TableDefinition | undefined;
  at(row: number, column: number): TableDefinition | undefined;
  all(): TableDefinition[];
  remove(name: string): void;
  transform(mapper: ..., axis: 'row' | 'column'): void;
}
```

## Validation

```ts
class ValidationService {
  add(rule: Omit<ValidationRule, 'id'>): ValidationRule;
  remove(id: string): void;
  all(): readonly ValidationRule[];
  forCell(worksheet, row: number, column: number): ValidationRule[];
  check(worksheet, row: number, column: number, value: unknown): { allowed: boolean; action: ValidationAction; message?: string };
}
```

## Conditional formatting

```ts
class ConditionalFormatEngine {
  add(rule: Omit<ConditionalFormatRule, 'id'>): ConditionalFormatRule;
  remove(id: string): void;
  all(): readonly ConditionalFormatRule[];   // sorted by priority
  evaluate(worksheet, row: number, column: number): CellStyle;
}
```

## Editing

```ts
type EditMode = 'idle' | 'editing';
interface EditSession { row: number; column: number; initial: string; mode: 'replace' | 'edit' }

class EditService {
  constructor(events?: { onEditStart?; onEditCancel?; onCommit?(session, value: string) });
  get editing(): boolean;
  get session(): EditSession | null;
  beginEdit(sheet, row, column, initial?): EditSession;
  commit(sheet, text?): boolean;
  cancel(): boolean;
}

function parseEditorValue(text: string): unknown;
```

## CSV (`@ezygrid/csv`)

```ts
detectDelimiter(text: string): string;
parseCsv(input: string, options?: { delimiter?; headers?; bom?; numbers? }): { headers?; rows: unknown[][] };
stringifyCsv(rows: unknown[][], options?: { delimiter?; escapeFormulas? }): string;
```

## Charts

```ts
type ChartType = 'column' | 'bar' | 'line' | 'pie' | 'doughnut';

interface ChartSpec {
  id: string; type: ChartType; source: string; firstRowIsHeader?: boolean;
  title?: string; colors?: string[]; anchor: { row; column };
  offsetX?: number; offsetY?: number; width?: number; height?: number;
}

class ChartEngine {
  add(spec: ChartSpec): ChartSpec;
  remove(id: string): void;
  all(): ChartSpec[];
}

function readChartData(worksheet, spec: ChartSpec): {
  categories: string[];
  series: { name: string; values: (number | null)[] }[];
};
function renderChartSVG(spec: ChartSpec, data: ChartData): string;
```

## Pivot

```ts
type PivotAggregation = 'SUM' | 'COUNT' | 'COUNTA' | 'AVG' | 'MIN' | 'MAX';
interface PivotValueField { column: number; agg: PivotAggregation; label?: string }
interface PivotSpec { id: string; source: string; anchor: string; rows: number[]; values: PivotValueField[] }

class PivotEngine {
  compute(worksheet, spec: PivotSpec): { header: string[]; rows: ...; grandTotals: ... };
  refresh(worksheet, spec: PivotSpec): void;
}
```

## Media

```ts
interface ImageMedia { kind: 'image'; src: string; alt?: string; id: string; zIndex?: number; anchor: { row; column }; offsetX?: number; offsetY?: number; width?: number; height?: number }
interface ShapeMedia { kind: 'shape'; shape: 'rect' | 'ellipse' | 'textbox'; text?: string; fill?: string; stroke?: string; textColor?: string; id: string; anchor: { row; column }; ... }

class MediaStore {
  addImage(image: ImageMediaInput): ImageMedia;
  addShape(shape: ShapeMediaInput): ShapeMedia;
  remove(id: string): void;
  all(): (ImageMedia | ShapeMedia)[];
}
```

## Print

```ts
type PaperSize = 'A4' | 'Letter';

interface PrintOptions {
  orientation?: 'portrait' | 'landscape';
  paperSize?: PaperSize;
  marginMm?: number;
  repeatHeaderRows?: number;
  gridlines?: boolean;
  includeHeaders?: boolean;
}

function buildPrintHtml(workbook: Workbook, sheetName: string, options?: PrintOptions): string;
```

## Plugins

```ts
interface PluginContext { workbook: Workbook; worksheet: Worksheet; commands?: CommandRegistry; renderer?: GridRenderer }
interface EzygridPlugin { name: string; version: string; setup(ctx: PluginContext): void | (() => void) }

function definePlugin(plugin: EzygridPlugin): EzygridPlugin;

class PluginManager {
  constructor(plugins: EzygridPlugin[]);
  get names(): string[];
  run(context: PluginContext): () => void;
  attach(context: PluginContext): () => void;
  destroy(): void;
}
```

## Theme

```ts
interface ThemeTokens {
  fontFamily: string; fontSize: string; bg: string; text: string; gridline: string;
  selection: string; selectionSoft: string; headerBg: string; headerText: string; tableBand: string;
}

const defaultThemeTokens: ThemeTokens;
const darkThemeTokens: Partial<ThemeTokens>;
const highContrastThemeTokens: Partial<ThemeTokens>;
function buildThemeCss(overrides?: Partial<ThemeTokens>): string;
```
