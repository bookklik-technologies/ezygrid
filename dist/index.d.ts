export interface Rect {
	top: number;
	left: number;
	bottom: number;
	right: number;
}
/** Compact per-cell record. Only allocated for used cells. */
export interface CellRecord {
	raw?: unknown;
	formula?: string;
	styleId?: number;
}
declare class SparseCellStore {
	private pages;
	private used;
	getCell(row: number, column: number): CellRecord | undefined;
	setCell(row: number, column: number, record: CellRecord | undefined): void;
	get pageCount(): number;
	/** Iterate every stored cell (sparse: only used cells are visited). */
	forEach(visit: (row: number, column: number, record: CellRecord) => void): void;
	get usedRange(): Rect | undefined;
	private updateUsedRange;
	/** Shift every stored cell by a structural row change at `index`. */
	insertRows(index: number, count: number): void;
	deleteRows(index: number, count: number): void;
	insertColumns(index: number, count: number): void;
	deleteColumns(index: number, count: number): void;
	private rebuild;
	/** Drop every cell in a row band (used for structural undo prototype). */
	private recomputeUsedRange;
	private transformRows;
	private transformColumns;
}
declare class SizeIndex {
	private n;
	private tree;
	private defaultSize;
	/** Indexes whose size differs from `defaultSize` (sparse, for snapshotting). */
	private overrides;
	constructor(logicalSize: number, defaultSize: number);
	/** Total pixel size of the first `count` items. */
	prefixSum(count: number): number;
	totalSize(): number;
	/** Pixel offset of item `index` (0-based). */
	offsetOf(index: number): number;
	/** Update the size of item `index` (0-based) to `size`. */
	setSize(index: number, size: number): void;
	/** Custom sizes only: index -> size (sparse; excludes the default size). */
	getCustomSizes(): ReadonlyMap<number, number>;
	sizeOf(index: number): number;
	/** Largest index whose start offset is <= pixel, i.e. index containing `pixel`. */
	indexAt(pixel: number): number;
	private assertIndex;
}
/**
 * Serializable operation format (Phase 0 draft). All workbook mutations flow
 * through operations so history, persistence and collaboration share one path.
 */
export interface Operation<T = unknown> {
	id: string;
	actorId?: string;
	workbookId: string;
	worksheetId?: string;
	type: string;
	payload: T;
	timestamp: number;
}
/**
 * History service: undo/redo over inverse-producing operations.
 *
 * Entries are transactions: a batched group of operations is stored as one
 * entry so a single user action (paste, clear, fill) needs a single Undo.
 * Undo targets logical identities via the stored inverse, so it remains
 * correct after unrelated structural edits (collaboration-aware design).
 */
export interface HistoryEntry {
	/** Forward operations, applied in order on redo. */
	forward: Operation[];
	/** Inverse operations, applied in the stored order on undo. */
	inverse: Operation[];
}
export type CoordinateMapper = (row: number, column: number) => {
	row: number;
	column: number;
} | undefined;
/**
 * Rewrites formula strings stored inside history payloads after a
 * structural edit. Receives the formula (with leading "=") and the
 * operation's worksheet id so qualified refs can be resolved.
 */
export type HistoryFormulaRewriter = (formula: string, worksheetId: string | undefined) => string;
/** Maps a rectangle (e.g. a stored merge) through a structural change. */
export type RangeMapper = (rect: {
	top: number;
	left: number;
	bottom: number;
	right: number;
}) => {
	top: number;
	left: number;
	bottom: number;
	right: number;
} | undefined;
declare class HistoryService {
	private undoStack;
	private redoStack;
	private limit;
	private batching;
	private pending;
	/**
	 * The entry currently being replayed by undo/redo. Structural ops inside
	 * its own replay trigger transforms that must NOT touch it: its remaining
	 * payloads are expressed in the geometry its earlier ops just restored,
	 * and shifting them mid-replay corrupts the restore (F07).
	 */
	private excluded;
	constructor(limit?: number);
	/** Mark the entry being replayed so transforms skip it (F07). */
	setTransformExclusion(entry: HistoryEntry | null): void;
	push(operation: Operation, inverse?: Operation | Operation[]): void;
	private trimUndo;
	beginBatch(): void;
	endBatch(): void;
	get canUndo(): boolean;
	get canRedo(): boolean;
	popUndo(): HistoryEntry | undefined;
	popRedo(): HistoryEntry | undefined;
	/**
	 * Return a popped entry to its originating stack after a failed replay
	 * (L10): popUndo/popRedo move the entry immediately, so a replay that
	 * throws mid-application would otherwise leave the workbook half-restored
	 * with the entry stranded on the opposite stack.
	 */
	restoreUndo(entry: HistoryEntry): void;
	restoreRedo(entry: HistoryEntry): void;
	clear(): void;
	/**
	 * Transform stored operations after a structural edit (row/column
	 * insert/delete). Cell coordinates of entries targeting `sheetId` are
	 * remapped (dropped when deleted), and every stored formula is rewritten
	 * through `rewriter` when its references point at the changed sheet,
	 * across both stacks and both forward/inverse payloads.
	 */
	transformCells(sheetId: string, mapper: CoordinateMapper, rewriter?: HistoryFormulaRewriter, rangeMapper?: RangeMapper, axisMapper?: (axis: "row" | "column", index: number) => number | undefined): void;
	private rewriteFormulas;
	/** Remap coordinates of a single operation. Returns true when it must be dropped. */
	private mapOperationCells;
	/** Remap stored merge ranges after a structural edit (F08). */
	private mapOperationRanges;
}
/**
 * Reference Transform Engine (Phase 0 prototype).
 *
 * Transforms A1 references inside formula text after structural edits.
 * Operates on parsed reference tokens via a formula scanner, never regex
 * replacement over raw text.
 */
export interface RowShift {
	kind: "row";
	/** Insert/delete position. */
	at: number;
	/** Positive = insert, negative = delete magnitude. */
	delta: number;
}
export interface ColumnShift {
	kind: "column";
	at: number;
	delta: number;
}
export type RefTransform = RowShift | ColumnShift;
export type FormulaErrorValue = "#NULL!" | "#DIV/0!" | "#VALUE!" | "#REF!" | "#NAME?" | "#NUM!" | "#N/A" | "#SPILL!" | "#CALC!" | "#CIRCULAR!";
declare class FormulaError extends Error {
	readonly value: FormulaErrorValue;
	constructor(value: FormulaErrorValue, message?: string);
}
export type AstNode = {
	kind: "number";
	value: number;
} | {
	kind: "string";
	value: string;
} | {
	kind: "boolean";
	value: boolean;
} | {
	kind: "error";
	value: string;
} | {
	kind: "ref";
	sheet?: string;
	row: number;
	column: number;
} | {
	kind: "range";
	sheet?: string;
	start: {
		row: number;
		column: number;
	};
	end: {
		row: number;
		column: number;
	};
} | {
	kind: "name";
	name: string;
} | {
	kind: "structured";
	table: string;
	column?: string;
	item?: boolean;
} | {
	kind: "call";
	name: string;
	args: AstNode[];
} | {
	kind: "unary";
	op: "-" | "+";
	operand: AstNode;
} | {
	kind: "binary";
	op: string;
	left: AstNode;
	right: AstNode;
} | {
	kind: "percent";
	operand: AstNode;
};
/** Matrix value produced by dynamic-array functions and named ranges. */
export interface MatrixValue {
	kind: "matrix";
	rows: number;
	columns: number;
	values: RuntimeValue[][];
}
export type RuntimeValue = number | string | boolean | FormulaError | null | MatrixValue;
export interface EvalContext {
	/** Get a raw cell value by coordinates on the given sheet (default = current). */
	getCellValue(sheet: string | undefined, row: number, column: number): RuntimeValue;
	/** Resolve a defined name to a value. */
	resolveName?(name: string): RuntimeValue;
	/** Resolve a structured table reference (§25). */
	resolveTable?(table: string, column: string | undefined, item: boolean | undefined, context: {
		sheet: string;
		row: number;
		column: number;
	}): RuntimeValue;
	/** Current sheet for unqualified refs. */
	currentSheet?: string;
	/** Coordinates of the cell being evaluated (for current-row table refs, §25). */
	currentRow?: number;
	currentColumn?: number;
}
/** Resolves defined names (ranges/constants) for the workbook (§26). */
export type NamesResolver = (name: string) => RuntimeValue;
/** Resolves structured table references: TableName, TableName[Column], Table[@Column] (§25). */
export interface TableResolutionContext {
	/** Sheet key the formula lives on (workbook-unique). */
	sheet: string;
	/** Row/column of the formula cell (for current-row item references). */
	row: number;
	column: number;
}
export type TableResolver = (table: string, column: string | undefined, item: boolean | undefined, context: TableResolutionContext) => RuntimeValue;
export type RawValueResolver = (sheet: string | undefined, row: number, column: number) => RuntimeValue;
/** Resource budgets so hostile or accidental inputs fail predictably (F02). */
export interface GraphBudgets {
	/** Maximum cells materialized from a single range argument. */
	maxRangeCells?: number;
	/** Maximum expression evaluation depth. */
	maxDepth?: number;
}
declare class DependencyGraph {
	private formulas;
	/** sheet -> formulaKey -> range dependencies registered by that formula. */
	private rangesBySheet;
	private currentSheet;
	private namesResolver;
	private tableResolver;
	private letScopes;
	private depth;
	private maxRangeCells;
	private maxDepth;
	/**
	 * Cells whose cached value is stale (F02): the entry itself or one of its
	 * transitive precedents changed. Evaluation recomputes exactly these.
	 */
	private dirty;
	/** Formulas with opaque (name/table) dependencies, workbook-wide. */
	private opaqueFormulas;
	constructor(budgets?: GraphBudgets);
	setCurrentSheet(sheet: string): void;
	setNamesResolver(resolver: NamesResolver | undefined): void;
	setTableResolver(resolver: TableResolver | undefined): void;
	/** Public evaluation context for ad-hoc evaluation (named formulas, worker). */
	createContext(sheet: string, getRaw: RawValueResolver): EvalContext;
	/** Register or update a formula at the given cell. */
	setFormula(sheet: string, row: number, column: number, formula: string, ast: AstNode): void;
	removeFormula(sheet: string, row: number, column: number): void;
	/** Remove every registration of a removed worksheet so its formulas can never evaluate again (F11). */
	removeSheet(sheet: string): void;
	private unregisterRanges;
	/**
	 * Recalculate the formula at k and all transitive dependents. The `done`
	 * set memoizes every formula computed during this pass so shared
	 * dependency branches evaluate exactly once (F02).
	 */
	private evaluate;
	/**
	 * Mark the entry at `k` and its whole transitive dependent subgraph dirty
	 * (F02): any of them may read the changed value on their next evaluation.
	 * The visited set is separate from `dirty`: placeholder entries never
	 * evaluate (so never clear their dirty flag) and must not stop the walk.
	 */
	private markDirty;
	/**
	 * Invalidate every formula with opaque (name/table) dependencies (F02):
	 * defined names and table definitions are resolved dynamically, so their
	 * add/remove/redefinition can change any of these formulas' results.
	 */
	invalidateOpaqueFormulas(): void;
	/**
	 * Notify the graph that a raw (non-formula) value changed at the cell, so
	 * dependents and range/structured readers recompute (F02). Formulas whose
	 * dependencies are opaque (names/tables) are invalidated workbook-wide.
	 */
	notifyCellChange(sheet: string, row: number, column: number): void;
	/** Recalculate the formula at the cell, resolving refs through `getRaw` and registered formulas. */
	recalculate(sheet: string, row: number, column: number, getRaw: RawValueResolver): RuntimeValue;
	private buildContext;
	private evaluateWithDependents;
	/** Evaluate an AST node in a context. */
	evaluateNode(node: AstNode, ctx: EvalContext): RuntimeValue;
	private evaluateNodeInner;
	/** Error-tolerant functions receive FormulaError args instead of propagating. */
	private static ERROR_TOLERANT;
	/** Short-circuit evaluation for branch functions (IF, IFS, SWITCH, CHOOSE). */
	private evaluateLazyCall;
	private matrixFromRangeNode;
	/** LET(name1, value1, ..., calculation) with scoped name bindings (§26). */
	private evaluateLet;
	private evaluateBinary;
	/** Cached value of a formula cell (without recalculation). */
	/** Remove all formula registrations (used before bulk re-registration). */
	clear(): void;
	cachedValue(sheet: string, row: number, column: number): RuntimeValue;
	get formulaCount(): number;
}
export interface MergeRect extends Rect {
	id: string;
}
/**
 * Merge store (§16): only the anchor cell (top-left) stores a value; all
 * covered cells are merge-membership only. Overlapping merges are rejected.
 */
export declare class MergeStore {
	private merges;
	merge(rect: Rect): MergeRect | undefined;
	unmergeAt(row: number, column: number): boolean;
	/** The merge covering a cell (anchor or covered), if any. */
	findAt(row: number, column: number): MergeRect | undefined;
	isCovered(row: number, column: number): boolean;
	get all(): readonly MergeRect[];
	clear(): void;
	/**
	 * Shift merge bounds after a structural row/column change. `mapper` maps an
	 * axis position to its new position (or undefined when the whole merge
	 * collapses). Merges whose bounds invert are removed.
	 */
	transform(mapper: (pos: number, isStart: boolean) => number | undefined, axis: "row" | "column"): void;
}
export interface TableColumn {
	name: string;
	index: number;
}
export interface TableDefinition {
	id: string;
	name: string;
	range: Rect;
	headerRow: boolean;
	totalRow: boolean;
	/** Computed column names from the header row. */
	columns: TableColumn[];
}
/**
 * Structured worksheet tables (§25): named ranges with header rows, banded
 * styling and structured references (TableName, TableName[Column]).
 */
export declare class TableStore {
	private tables;
	/** Owning worksheet (set by the Worksheet field initializer). */
	private owner?;
	constructor(owner?: Worksheet);
	private invalidateOpaqueReaders;
	add(worksheet: Worksheet, options: {
		name: string;
		range: string;
		headerRow?: boolean;
		totalRow?: boolean;
	}): TableDefinition;
	get(name: string): TableDefinition | undefined;
	at(row: number, column: number): TableDefinition | undefined;
	all(): readonly TableDefinition[];
	remove(name: string): void;
	/**
	 * Shift table bounds after a structural row/column change. `mapper` maps an
	 * axis position to its new position; undefined removes the position. Tables
	 * whose range collapses are dropped; affected column definitions follow.
	 */
	transform(mapper: (pos: number, isStart: boolean) => number | undefined, axis: "row" | "column"): void;
}
export type ValidationType = "number" | "list" | "textLength" | "custom";
export type ValidationAction = "reject" | "warning" | "mark";
export interface ValidationRule {
	id: string;
	range: string;
	type: ValidationType;
	action: ValidationAction;
	/** Numeric criteria. */
	min?: number;
	max?: number;
	/** Allowed values for list validation. */
	values?: unknown[];
	/** Exact text length (textLength). */
	length?: number;
	/** Custom predicate (custom). */
	predicate?: (value: unknown) => boolean;
	message?: string;
}
export interface ValidationResult {
	allowed: boolean;
	action: ValidationAction;
	message?: string;
}
/**
 * Validation service (§24): number/list/text-length/custom rules applied
 * during setValue with reject/warning/mark actions.
 */
export declare class ValidationService {
	private rules;
	add(rule: Omit<ValidationRule, "id">): ValidationRule;
	remove(id: string): void;
	all(): readonly ValidationRule[];
	/** Rules applying to a cell. */
	forCell(worksheet: Worksheet, row: number, column: number): ValidationRule[];
	/** Validate a candidate value for a cell. */
	check(worksheet: Worksheet, row: number, column: number, value: unknown): ValidationResult;
	private validateRule;
}
export type ConditionalFormatType = "cellIs" | "containsText" | "expression" | "topN" | "duplicates";
export interface ConditionalFormatRule {
	id: string;
	range: string;
	type: ConditionalFormatType;
	/** Comparison operator for cellIs. */
	operator?: "gt" | "lt" | "gte" | "lte" | "eq" | "neq";
	/** Operand(s) for cellIs / threshold for topN. */
	value?: number | string;
	/** Text for containsText. */
	text?: string;
	/** Custom predicate for expression rules. */
	predicate?: (value: unknown) => boolean;
	/** N for topN. */
	n?: number;
	/** Style patch applied when the rule matches. */
	style: CellStyle;
	/** Lower priority wins. */
	priority: number;
	stopIfTrue?: boolean;
}
/**
 * Conditional formatting (§24.5): range-based rules evaluated at render time,
 * with priorities and stop-if-true behavior.
 */
export declare class ConditionalFormatEngine {
	private rules;
	/**
	 * Range-scan memo for topN/duplicates (H4): applyCellStyle runs for every
	 * visible cell on every render pass, so a rule's range is scanned once per
	 * workbook revision instead of once per painted cell. Keys are rule ids.
	 */
	private scans;
	add(rule: Omit<ConditionalFormatRule, "id">): ConditionalFormatRule;
	remove(id: string): void;
	all(): readonly ConditionalFormatRule[];
	/** Evaluate all matching rules for a cell; returns the merged style patch. */
	evaluate(worksheet: Worksheet, row: number, column: number): CellStyle;
	private matches;
	/** Range-scan memo keyed by rule id (+ rule-specific params), valid for one workbook revision. */
	private cachedScan;
	private rangeNumbers;
	private rangeValues;
	/** Clamp a rule range to the sheet dimensions (M2); null when outside. */
	private clampRange;
}
export type ChartType = "column" | "bar" | "line" | "pie" | "doughnut";
export interface ChartSeries {
	name?: string;
	/** Column index in the source range for this series. */
	column: number;
}
export interface ChartSpec extends FloatingPosition {
	id: string;
	type: ChartType;
	source: string;
	/** Whether the first row holds series names / categories. */
	firstRowIsHeader?: boolean;
	title?: string;
	colors?: string[];
}
export interface FloatingPosition {
	anchor: {
		row: number;
		column: number;
	};
	offsetX?: number;
	offsetY?: number;
	width?: number;
	height?: number;
}
export declare const DEFAULT_CHART_COLORS: string[];
/**
 * Validate a chart color at the public boundary (F01): only plain CSS color
 * values are accepted, so a string like `red" onpointerover="alert(1)`
 * can never reach an SVG attribute.
 */
export declare function sanitizeChartColor(value: string): string | null;
/**
 * Charts v1 (§31): provider-neutral ChartSpec bound to worksheet ranges,
 * rendered by an internal SVG engine into the media overlay.
 */
export declare class ChartEngine {
	private charts;
	add(spec: Omit<ChartSpec, "id">): ChartSpec;
	remove(id: string): void;
	all(): readonly ChartSpec[];
}
export interface ChartData {
	categories: string[];
	/** One value slot per category; null = missing/nonnumeric (F22). */
	series: {
		name: string;
		values: (number | null)[];
	}[];
}
/** Read a rectangular range as chart data (first row = headers). */
export declare function readChartData(worksheet: Worksheet, spec: ChartSpec): ChartData;
export type PivotAggregation = "SUM" | "COUNT" | "COUNTA" | "AVG" | "MIN" | "MAX";
export interface PivotValueField {
	column: number;
	agg: PivotAggregation;
	label?: string;
}
export interface PivotSpec {
	id: string;
	source: string;
	anchor: string;
	/** Column indexes (relative to source left) used as row groups. */
	rows: number[];
	values: PivotValueField[];
}
export interface PivotOutput {
	header: string[];
	rows: unknown[][];
	grandTotals: unknown[];
}
/**
 * Pivot tables v1 (§33): row-grouped aggregation over a source range,
 * written as raw values anchored at the pivot position.
 */
export declare class PivotEngine {
	compute(worksheet: Worksheet, spec: PivotSpec): {
		header: string[];
		rows: unknown[][];
		grandTotals: unknown[];
	};
	/** Compute and write the pivot at its anchor. */
	refresh(worksheet: Worksheet, spec: PivotSpec): void;
}
/** Convenience: build a pivot spec id. */
export declare function newPivotSpec(partial: Omit<PivotSpec, "id">): PivotSpec;
export interface FloatingObject extends FloatingPosition {
	id: string;
	zIndex?: number;
}
export interface ImageMedia extends FloatingObject {
	kind: "image";
	src: string;
	alt?: string;
}
export type ShapeKind = "rect" | "ellipse" | "textbox";
export interface ShapeMedia extends FloatingObject {
	kind: "shape";
	shape: ShapeKind;
	text?: string;
	fill?: string;
	stroke?: string;
	textColor?: string;
}
export type MediaObject = ImageMedia | ShapeMedia;
/** Floating media layer (§30/§32): images and shapes above the grid. */
export declare class MediaStore {
	private objects;
	addImage(image: Omit<ImageMedia, "id" | "kind">): ImageMedia;
	addShape(shape: Omit<ShapeMedia, "id" | "kind">): ShapeMedia;
	remove(id: string): void;
	all(): readonly MediaObject[];
}
export interface ParseCsvOptions {
	/** Explicit delimiter; omit for auto-detection. */
	delimiter?: string;
	/** First row becomes headers; data rows exclude it. */
	headers?: boolean;
	/** Trim BOM (default: true). */
	bom?: boolean;
	/** Parse numeric-looking fields into numbers (default: true). */
	numbers?: boolean;
}
export interface StringifyCsvOptions {
	delimiter?: string;
	/**
	 * Prefix =, +, -, @ with an apostrophe so spreadsheet apps treat data as
	 * text (§50.3). Defaults to true: exported CSV must be safe to open in
	 * Excel/LibreOffice by default. Pass false to write raw values.
	 */
	escapeFormulas?: boolean;
}
export interface ToCsvOptions extends StringifyCsvOptions {
	range?: string;
}
export interface FromCsvOptions extends ParseCsvOptions {
	/** Start cell for the imported block (default A1). */
	anchor?: string;
	/** Treat values starting with "=" as formulas (default: false). */
	formulas?: boolean;
}
/** Cursor model: active cell, anchor, and selected ranges are separate concerns (§11.2). */
export interface SelectionState {
	active: {
		row: number;
		column: number;
	};
	anchor: {
		row: number;
		column: number;
	};
	ranges: Rect[];
}
export interface NavigationKey {
	key: string;
	shift?: boolean;
	ctrl?: boolean;
}
export declare class SelectionService {
	state: SelectionState;
	private rowCount;
	private columnCount;
	private listeners;
	constructor(rowCount: number, columnCount: number);
	onChange(listener: (s: SelectionState) => void): () => void;
	private emit;
	private clamp;
	setActive(row: number, column: number): void;
	beginRangeExpand(row: number, column: number): void;
	extendTo(row: number, column: number): void;
	addRange(row: number, column: number): void;
	selectAll(): void;
	selectRow(row: number): void;
	selectColumn(column: number): void;
	/** Update dimension counts after structural changes; state is clamped (F15). */
	resize(rowCount: number, columnCount: number): void;
	/**
	 * Shift every stored coordinate through a structural insert/delete so
	 * active cell, anchor and ranges follow the data they described (F15).
	 */
	transformAxis(axis: "row" | "column", at: number, delta: number): void;
	/** Clamp every stored coordinate inside the current dimensions. */
	private clampState;
	get primary(): Rect;
	isActive(row: number, column: number): boolean;
	isWithin(row: number, column: number): boolean;
	/** Expand to the data-region boundary (Ctrl+Arrow) using a filled-cell predicate. */
	move(direction: "up" | "down" | "left" | "right", shift: boolean, ctrl: boolean, isFilled: (row: number, column: number) => boolean): void;
	/** Ctrl+Arrow jumps to the edge of the contiguous data region. */
	private dataBoundary;
	describe(): string;
}
export interface CommandContext {
	workbook: Workbook;
	worksheet: Worksheet;
	selection: SelectionService;
}
export interface Command {
	id: string;
	title: string;
	shortcut?: string;
	isEnabled?(ctx: CommandContext): boolean;
	isSelected?(ctx: CommandContext): boolean;
	execute(ctx: CommandContext): void;
}
/**
 * Command registry (§34.4): toolbars, menus and keyboard bindings all
 * consume the same command definitions.
 */
export declare class CommandRegistry {
	private commands;
	register(command: Command): void;
	get(id: string): Command | undefined;
	all(): Command[];
	execute(id: string, ctx: CommandContext): boolean;
	/** Match a keyboard event against registered shortcuts ("Mod+C" style). */
	matchShortcut(event: KeyboardEvent): Command | undefined;
}
/** Phase 2 default command set; extensions may register more. */
export declare function createDefaultCommands(hooks: {
	copy: (ctx: CommandContext) => void;
	cut: (ctx: CommandContext) => void;
	paste: (ctx: CommandContext) => void;
	fillDown: (ctx: CommandContext) => void;
}): Command[];
/**
 * Edit lifecycle (§13.1): idle → activate → beginEdit → validate → commit | cancel.
 * Phase 1 implements the text/number editor contract; overlay rendering arrives
 * with the DOM viewport, but the state machine and events are final now.
 */
export type EditMode = "idle" | "editing";
export interface EditSession {
	row: number;
	column: number;
	initial: string;
	mode: "replace" | "edit";
}
export interface EditEvents {
	onEditStart?: (session: EditSession) => void;
	onEditCancel?: (session: EditSession) => void;
	onCommit?: (session: EditSession, value: string) => void;
}
export declare class EditService {
	private mode;
	private events;
	constructor(events?: EditEvents);
	get editing(): boolean;
	get session(): EditSession | null;
	private session_;
	beginEdit(sheet: Worksheet, row: number, column: number, initial?: string): EditSession;
	/** Commit the pending text; returns true when a value was written. */
	commit(sheet: Worksheet, text?: string): boolean;
	cancel(): boolean;
	private end;
}
/** Typed-value parsing used when committing editor text into the model. */
export declare function parseEditorValue(text: string): unknown;
export type FloatingKind = "chart" | "image" | "shape";
export interface FloatingRef {
	worksheetId: string;
	kind: FloatingKind;
	id: string;
}
export type FloatingItem = ChartSpec | MediaObject;
export type FloatingPatch = Partial<ChartSpec> & Partial<Omit<MediaObject, "kind">> & {
	src?: string;
	alt?: string;
	shape?: "rect" | "ellipse" | "textbox";
	text?: string;
	fill?: string;
	stroke?: string;
	textColor?: string;
	zIndex?: number;
};
export interface Context {
	workbook: Workbook;
	sheet: () => Worksheet;
	layer: HTMLElement;
	scroll: HTMLElement;
	zoom: () => number;
	offset: (axis: "row" | "column", index: number) => number;
	index: (axis: "row" | "column", pixel: number) => number;
	changed: (ref: FloatingRef | null) => void;
	commitEdits: () => void;
	focusGrid: () => void;
}
declare class FloatingObjects {
	private context;
	selected: FloatingRef | null;
	private elements;
	private preview;
	private gesture;
	private ratios;
	private sheetId;
	private unlisten;
	private disposed;
	constructor(context: Context);
	get(ref: FloatingRef): FloatingItem | undefined;
	list(): {
		ref: FloatingRef;
		label: string;
	}[];
	private same;
	select(ref: FloatingRef | null, reveal?: boolean): void;
	ratioLocked(ref: FloatingRef): boolean;
	lockRatio(ref: FloatingRef, locked: boolean): void;
	showPreview(ref: FloatingRef, patch: FloatingPatch | null): void;
	update(ref: FloatingRef, patch: FloatingPatch): void;
	remove(ref: FloatingRef): void;
	private key;
	private geometry;
	private placement;
	render(): void;
	private refAt;
	private preventDrag;
	private onFocus;
	private onPointerDown;
	private onMove;
	private onUp;
	private finishGesture;
	cancel(): void;
	private renderAfterCancel;
	private onCancel;
	private onGestureKey;
	private onKeyDown;
	destroy(): void;
}
export interface GridRendererOptions {
	mode?: "editor" | "grid";
	topbar?: boolean;
	sheetTabs?: boolean;
	statusBar?: boolean;
	/** Extra rows/columns rendered beyond the viewport edges. */
	overscanRows?: number;
	overscanColumns?: number;
	headerHeight?: number;
	headerWidth?: number;
	/** Show the formula bar (name box + input) above the grid. */
	formulaBar?: boolean;
	/** Show the default toolbar shell above the formula bar. */
	toolbar?: boolean;
	/** Right-click context menu. */
	contextMenu?: boolean;
	/** UI direction (RTL baseline). */
	direction?: "ltr" | "rtl";
}
/**
 * DOM viewport renderer (Phase 0 prototype).
 *
 * Renders only visible cells in real DOM elements with a recycled pool,
 * projects selection state as an overlay, mounts the text editor over the
 * active cell, and supports frozen rows/columns via dedicated layers.
 */
export declare class GridRenderer {
	readonly selection: SelectionService;
	readonly editing: EditService;
	/** @internal Floating object interactions shared with the editor shell. */
	readonly objects: FloatingObjects;
	private container;
	private worksheet;
	private workbook;
	private options;
	private root;
	private scrollEl;
	private spacerEl;
	private cellLayer;
	private selectionOverlay;
	private colHeaderEl;
	private rowHeaderEl;
	private cornerEl;
	private frozenTopEl;
	private frozenLeftEl;
	private editorInput;
	private fillHandle;
	private fillPreview;
	private fillRangeLabel;
	private mediaLayer;
	private cellPool;
	private activeCells;
	private activeRows;
	private domId;
	private disposePlugins;
	private unlistenOperations;
	private unlistenSelection;
	private selectionVisible;
	private scrollRow;
	private scrollCol;
	private destroyed;
	private shell?;
	private resizeObserver?;
	private headerResize;
	private sheetViews;
	constructor(container: HTMLElement, workbook: Workbook, options?: GridRendererOptions);
	private get topInset();
	private formulaBarEl;
	private nameBox;
	private formulaInput;
	private formulaBarEdit;
	private contextMenuEl;
	private zoom;
	/** Pagination view state (§22). */
	private pagination;
	/** Enable a paginated view (database-grid mode). */
	enablePagination(pageSize: number): void;
	disablePagination(): void;
	setPage(page: number): void;
	getPage(): number;
	getPageCount(): number;
	setZoom(zoom: number): void;
	getZoom(): number;
	private axisOffset;
	private axisSize;
	private axisIndex;
	private zOffsetX;
	private zOffsetY;
	private zSizeX;
	private zSizeY;
	private zIndexRow;
	private zIndexColumn;
	private build;
	private bind;
	private onHeaderSelect;
	private onHeaderResizeStart;
	private updateHeaderResize;
	private onHeaderResizeMove;
	private onHeaderResizeEnd;
	private onHeaderResizeCancel;
	private onHeaderResizeKeyDown;
	private cancelHeaderResize;
	private clearHeaderResize;
	private onFocusIn;
	private onFocusOut;
	private onFillHandleDown;
	private onFillDragMove;
	private onFillDragKeyDown;
	private cancelFillDrag;
	private onContextMenu;
	private onGlobalMouseDown;
	private showContextMenu;
	private renderContextMenu;
	private onHeaderContextMenu;
	private promptAxisSize;
	private onFillDragEnd;
	private onScroll;
	private scrollFrame;
	private lastScrollRender;
	private requestFrame;
	private cancelScrollFrame;
	private onMouseDown;
	private onDoubleClick;
	private onKeyDown;
	private clipboard;
	readonly commands: CommandRegistry;
	private fill;
	private fillDragging;
	private autofillDragging;
	private fillSource;
	private fillTarget;
	private fillPointer;
	/** Share one destination calculation between the preview and the actual fill. */
	private getFillPlan;
	private renderFillPreview;
	/** Group a multi-cell user action into one history entry (F09). */
	private batchHistory;
	private clearSelectedContents;
	private commandContext;
	private registerDefaultCommands;
	private registerStyleCommands;
	private isTextControl;
	private onCopy;
	private onCut;
	private onPaste;
	private pasteText;
	private pasteSelection;
	private showClipboardHint;
	private copySelection;
	private copyTextFallback;
	private commitEditor;
	private isFilled;
	private beginEditAt;
	private mountEditor;
	private suggestionEl;
	/** Autocomplete dropdown while editing formulas (§14.7). */
	private updateSuggestions;
	private applyTopSuggestion;
	private removeSuggestions;
	private positionEditor;
	private unmountEditor;
	private ensureActiveVisible;
	private scrollLeft;
	private scrollTop;
	private viewportHeight;
	private viewportWidth;
	/** Programmatic scroll to make a cell the top-left of the viewport. */
	scrollTo(row: number, column: number): void;
	navigateToAddress(address: string): void;
	refresh(): void;
	/** Commit drafts before an editor command changes sheet or selection. */
	commitEdits(): void;
	focus(): void;
	insertFormula(formula: string): void;
	setFormulaBarVisible(visible: boolean): void;
	private syncWorksheet;
	private acquireCell;
	private placeCell;
	/** Create or reuse the accessibility row container for a visible row (F24). */
	private rowElementFor;
	/** Fill a (new or recycled) cell element with current content and state. */
	private paintCell;
	private applyCellStyle;
	/**
	 * Assign the background through the property API: the shorthand setter
	 * cannot reliably replace an existing var() value in some DOM
	 * implementations (happy-dom), and a stale selection tint must never
	 * survive a restore.
	 */
	private setCellBackground;
	private renderFrozen;
	private visibleRowStart;
	private visibleRowEnd;
	private visibleColumnEnd;
	private renderHeaders;
	private createResizeHandle;
	private nestedLevelCount;
	/** Render each nested header level with colspan-style spans. */
	private renderNestedHeaders;
	/** Outline complete merged cells without changing the logical selection. */
	private selectionVisualBounds;
	private renderSelection;
	private formulaBarText;
	private beginFormulaBarEdit;
	private commitFormulaBarEdit;
	private updateFormulaBar;
	/** Re-render the visible projection. Recycles cell elements between frames. */
	render(): void;
	/** Floating charts, images and shapes with stable interaction nodes. */
	private renderMedia;
	get renderedCellCount(): number;
	getCellElement(row: number, column: number): HTMLElement | undefined;
	getEditorInput(): HTMLInputElement | null;
	destroy(): void;
}
/** F4-style reference cycling: A1 → $A$1 → A$1 → $A1 → A1 (§11.4). */
export declare function cycleReference(input: HTMLInputElement): void;
/** Replace the trailing partial function token with a completed name. */
export declare function replaceFunctionToken(value: string, name: string): string;
/** Context handed to plugins (§44.3): public surfaces only, no internals. */
export interface PluginContext {
	workbook: Workbook;
	worksheet: Worksheet;
	/** Renderer command registry (available once a renderer attaches). */
	commands?: CommandRegistry;
	/** The renderer that triggered setup, when run from the grid. */
	renderer?: GridRenderer;
}
export interface EzygridPlugin {
	name: string;
	version: string;
	setup(ctx: PluginContext): void | (() => void);
}
/** Identity helper giving plugin authors a typed authoring surface (§44). */
export declare function definePlugin(plugin: EzygridPlugin): EzygridPlugin;
export declare class PluginManager {
	private plugins;
	constructor(plugins?: EzygridPlugin[]);
	get names(): string[];
	/**
	 * Run all plugin setups and return a disposer owning THIS attachment.
	 * Renderer replacement on the same workbook no longer accumulates
	 * disposers: each attachment disposes exactly what it created (F17).
	 * If a plugin fails mid-run, already-set-up plugins are disposed first.
	 */
	run(context: PluginContext): () => void;
	/** Dispose every live attachment (workbook-lifetime teardown, F17). */
	private attachments;
	/**
	 * Register an attachment so workbook teardown can dispose all of them.
	 * Returns the attachment's own disposer.
	 */
	attach(context: PluginContext): () => void;
	destroy(): void;
}
export interface CellInput {
	/** Literal stored value (never reinterpreted as a formula). */
	value?: unknown;
	/** Explicit formula string (leading "=" optional). */
	formula?: string;
	/** Force value to be stored as literal text even if it starts with "=" (§F04). */
	literal?: boolean;
}
export declare function isCellInput(value: unknown): value is CellInput;
/** Supported sheet dimension limits (XLSX-compatible). */
export declare const MAX_WORKSHEET_ROWS = 1048576;
export declare const MAX_WORKSHEET_COLUMNS = 16384;
export interface WorksheetConfig {
	id?: string;
	name?: string;
	rows?: number;
	columns?: number;
	/** 2D matrix of literals, CellInput records, or formula strings. */
	data?: unknown[][];
}
/** Cell-level style properties (§23.2 subset for Phase 2). */
export interface CellStyle {
	fontFamily?: string;
	fontSize?: number;
	wrap?: boolean;
	verticalAlign?: "top" | "middle" | "bottom";
	borders?: Partial<Record<"top" | "right" | "bottom" | "left", {
		color: string;
		width: number;
		style: "solid" | "dashed" | "dotted";
	} | null>>;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	color?: string;
	background?: string;
	align?: "left" | "center" | "right";
}
export interface FilterCriteria {
	operator: "equals" | "contains" | "gt" | "lt" | "notEmpty";
	value?: string;
}
export declare const DEFAULT_ROW_HEIGHT = 24;
export declare const DEFAULT_COLUMN_WIDTH = 100;
/**
 * Worksheet: sparse store + size indexes + formula graph wiring.
 * Model is authoritative; rendering is a projection.
 */
export declare class Worksheet {
	readonly id: string;
	workbook: Workbook;
	/** Frozen leading rows (0 = none); assigning repaints via a view marker. */
	get freezeRows(): number;
	set freezeRows(value: number);
	/** Frozen leading columns (0 = none); assigning repaints via a view marker. */
	get freezeColumns(): number;
	set freezeColumns(value: number);
	/**
	 * Repaint marker for mutations that carry no history record: listeners
	 * (the attached renderer) repaint, but the operation is emitted without
	 * an inverse so undo history is not polluted (F08).
	 */
	private emitViewMarker;
	private freezeRows_;
	private freezeColumns_;
	readonly pivotSpecs: PivotSpec[];
	readonly filterCriteria: Map<number, FilterCriteria>;
	readonly cells: SparseCellStore;
	readonly rowSizes: SizeIndex;
	readonly columnSizes: SizeIndex;
	rowCount: number;
	columnCount: number;
	/** Per-row overrides by row id (structural identity placeholder for Phase 0). */
	readonly rowIds: Map<number, string>;
	/** Merged ranges (§16): anchor-only data rule. */
	readonly merges: MergeStore;
	/** Structured tables (§25). */
	readonly tables: TableStore;
	/** Number format masks keyed by "row,column". */
	readonly numberFormats: Map<string, string>;
	/** Validation rules (§24). */
	readonly validations: ValidationService;
	/** Conditional formatting rules (§24.5). */
	readonly conditionalFormats: ConditionalFormatEngine;
	/** Charts (§31). */
	readonly charts: ChartEngine;
	/** Pivot engine (§33). */
	readonly pivots: PivotEngine;
	/** Floating media: images and shapes (§30/§32). */
	readonly media: MediaStore;
	/** Merge a range (A1 notation). Data lives on the anchor cell. */
	merge(range: string): void;
	/** Create a structured table from a range. */
	addTable(options: {
		name: string;
		range: string;
		headerRow?: boolean;
		totalRow?: boolean;
	}): void;
	getTable(name: string): ReturnType<TableStore["get"]>;
	addValidation(rule: Omit<ValidationRule, "id">): ValidationRule;
	removeValidation(id: string): void;
	addChart(spec: Parameters<ChartEngine["add"]>[0]): string;
	addPivot(spec: Omit<PivotSpec, "id">): string;
	addImage(image: Parameters<MediaStore["addImage"]>[0]): string;
	addShape(shape: Parameters<MediaStore["addShape"]>[0]): string;
	toCsv(options?: ToCsvOptions): string;
	fromCsv(text: string, options?: FromCsvOptions): void;
	unmerge(range: string): void;
	/** Apply a number format mask to a range (A1 notation). */
	setNumberFormat(range: string, mask: string): void;
	getNumberFormat(row: number, column: number): string | undefined;
	/** Re-register all formulas after direct record manipulation (sort, paste). */
	refreshFormulas(): void;
	/** Set the height of a zero-based row in unscaled pixels, with undo/redo. */
	setRowHeight(index: number, height: number): void;
	/** Set the width of a zero-based column in unscaled pixels, with undo/redo. */
	setColumnWidth(index: number, width: number): void;
	private setAxisSize;
	readonly hiddenRows: Set<number>;
	readonly hiddenColumns: Set<number>;
	hideRows(index: number, count?: number): void;
	showRows(index: number, count?: number): void;
	hideColumns(index: number, count?: number): void;
	showColumns(index: number, count?: number): void;
	isColumnHidden(column: number): boolean;
	readonly filters: Map<number, (value: unknown) => boolean>;
	/** Rows hidden exclusively by filters — separate from manual hides (F19). */
	private filterHiddenRows;
	setFilter(column: number, predicate: (value: unknown) => boolean): void;
	clearFilter(column?: number): void;
	setFilterCriteria(column: number, criteria: FilterCriteria): void;
	/** Re-evaluate filters after data or formula changes (F19). */
	refreshFilters(): void;
	private applyFilters;
	readonly cellEditors: Map<string, {
		type: string;
		options?: unknown;
	}>;
	setCellEditor(range: string, type: string, options?: unknown): void;
	getEditorFor(row: number, column: number): {
		type: string;
		options?: unknown;
	} | undefined;
	readonly styles: Map<string, CellStyle>;
	setStyle(range: string, style: CellStyle): void;
	clearStyle(range: string): void;
	getStyle(row: number, column: number): CellStyle | undefined;
	readonly notes: Map<string, string>;
	setNote(range: string, text: string): void;
	getNote(row: number, column: number): string | undefined;
	clearNote(range: string): void;
	/**
	 * Apply a metadata mutation across a range with a reversible history
	 * record: forward op carries the new per-cell values, inverse carries
	 * the previous ones (F08). Unchanged cells are omitted from both.
	 * Ranges are clamped to the sheet dimensions (M2): parsed A1 ranges are
	 * unbounded, and iterating `A1:ZZZ9999999` raw would hang the tab.
	 */
	private recordMetaChange;
	/** Complete per-cell metadata snapshot (null = absent). */
	private metaSnapshotFor;
	/** Clamp a parsed rect to the sheet dimensions; null when entirely outside (M2). */
	private clampRect;
	private nestedHeadersConfig;
	setNestedHeaders(levels: (string | {
		title: string;
		span: number;
	})[][]): void;
	get nestedHeaders(): readonly (readonly (string | {
		title: string;
		span: number;
	})[])[];
	private rowGroupsConfig;
	private groupHiddenRows;
	groupRows(start: number, end: number): void;
	ungroupRows(start: number): void;
	collapseGroup(start: number): void;
	expandGroup(start: number): void;
	getGroups(): readonly {
		start: number;
		end: number;
		collapsed: boolean;
	}[];
	isRowHidden(row: number): boolean;
	constructor(workbook: Workbook, config?: WorksheetConfig);
	private name_;
	get name(): string;
	/** Controlled rename: keeps the formula graph and cross-sheet refs in sync (F11). */
	set name(value: string);
	private load2DArray;
	private setCellRaw;
	/** Direct formula-cell registration used by snapshot loading (F13). */
	loadFormulaCell(row: number, column: number, formula: string): void;
	/** Get the calculated display value of a cell (formulas evaluated via dependency graph). */
	getValue(row: number, column: number): unknown;
	/** Evaluate an anchor formula, registering or clearing its spill. */
	private evaluateAnchor;
	/**
	 * Remove the spill occupying a cell: the cell's own spill if it is an
	 * anchor, otherwise the anchor that covers it. Undo/redo replay and
	 * overwrites use this so ownership never goes stale (F10).
	 */
	releaseSpillAt(row: number, column: number): void;
	/** Spills keyed by anchor "row,column". */
	private spills;
	private spillCover;
	private spillError;
	isSpilled(row: number, column: number): boolean;
	hasSpillError(row: number, column: number): boolean;
	private isSpillBlocked;
	private registerSpill;
	private clearSpill;
	private clearAllSpills;
	/**
	 * Evaluated value of a cell for formula readers: raw records resolve
	 * directly; formula cells and spill-covered cells resolve through the
	 * graph (with spill support and cycle protection via the graph's
	 * evaluating flags). Named ranges, tables and cross-sheet refs therefore
	 * see formula-valued cells.
	 */
	readRawValue(sheetName: string, row: number, column: number): RuntimeValue;
	/**
	 * Runtime value used by formula readers: formulas evaluate through the
	 * graph, spill-covered cells resolve via their anchor's matrix, and raw
	 * records pass through.
	 */
	resolveEvaluatedValue(row: number, column: number): RuntimeValue;
	/**
	 * Set a cell value; strings starting with "=" become formulas. Emits an
	 * operation. Pass `{ literal: true }` to store text verbatim (CSV import
	 * with formulas disabled).
	 */
	setValue(row: number, column: number, value: unknown, options?: {
		literal?: boolean;
	}): Operation | null;
	getAddress(row: number, column: number): string;
	/**
	 * Register every formula cell of EVERY worksheet with the dependency
	 * graph. The graph is workbook-wide, so clearing it and re-registering
	 * only this sheet would orphan other sheets' formulas.
	 */
	private registerAllFormulas;
	/** Rewrite formulas that reference this sheet after a structural change, then re-register. */
	private rewriteFormulas;
	insertRows(index: number, count?: number): void;
	deleteRows(index: number, count?: number): void;
	insertColumns(index: number, count?: number): void;
	deleteColumns(index: number, count?: number): void;
	/**
	 * Raw structural application used by undo/redo replay: identical to the
	 * public operations but emits nothing and records no history.
	 */
	applyRowsInsert(index: number, count: number): void;
	applyRowsDelete(index: number, count: number): void;
	applyColumnsInsert(index: number, count: number): void;
	applyColumnsDelete(index: number, count: number): void;
	private validateInsert;
	private validateDelete;
	/**
	 * Shift every coordinate-keyed and range-anchored metadata structure so
	 * data stays attached to its styles, formats, notes, editors, validation
	 * rules, merges, tables, visibility and floating objects.
	 */
	private transformMetadata;
	/** Preserve custom sizes across structural changes (no reset to defaults). */
	private transformSizes;
	/** Snapshot a row band (cells, metadata, visibility) for undo restore (F08). */
	private captureRowBand;
	/** Snapshot a column band for undo restore (F08). */
	private captureColumnBand;
}
export interface WorkbookOptions {
	filename?: string;
	id?: string;
	worksheets?: WorksheetConfig[];
	/** Plugins (§44) run when a grid renderer attaches. */
	extensions?: EzygridPlugin[];
}
export type DefinedNameDefinition = {
	type: "range";
	ref: string;
} | {
	type: "value";
	value: unknown;
};
/** Workbook: owns worksheets, formula graph, history and operation events. */
export declare class Workbook {
	filename: string;
	private activeSheetId?;
	private transactionDepth;
	readonly id: string;
	readonly worksheets: Worksheet[];
	readonly formulaGraph: DependencyGraph;
	readonly history: HistoryService;
	/** Defined names (26): named ranges, constants and formulas. */
	readonly definedNames: Map<string, DefinedNameDefinition>;
	readonly pluginManager: PluginManager;
	private listeners;
	/** Monotonic mutation counter; caches (e.g. conditional-format scans) key on it. */
	revision: number;
	/** Update-transaction state for batched notifications (F02). */
	private updateDepth;
	private suppressedOps;
	private pendingOperations;
	constructor(options?: WorkbookOptions);
	/** Find a table by name: the formula's sheet first, then any sheet (F21). */
	private findTableSheet;
	/** Build a matrix value from a worksheet rectangle. */
	private matrixFromRange;
	setDefinedName(name: string, definition: DefinedNameDefinition): void;
	removeDefinedName(name: string): void;
	/** Resolve a defined name to a runtime value (constant) or matrix (range). */
	private resolveNameValue;
	getWorksheet(idOrName: string): Worksheet | undefined;
	get activeWorksheet(): Worksheet;
	setActiveWorksheet(id: string): void;
	moveWorksheet(id: string, index: number): void;
	/**
	 * One reversible editor action, including feature metadata; failures roll
	 * back. Reversible operations emitted by the action are coalesced into a
	 * single history entry (undo reverts the whole action) instead of storing
	 * two full-document snapshots per action (H1). A full-document snapshot
	 * pair is only used when the action contains mutations history cannot
	 * reverse, and for rollback when the action throws.
	 */
	transaction(action: () => void): void;
	/**
	 * History record of the in-flight transaction (H1): every reversible op
	 * the action emitted with its inverse. Falls back to document snapshots
	 * when any recorded op is not reversible.
	 */
	private transactionOps;
	private recordTransactionOps;
	private captureDocument;
	/** Replace a validated document while retaining this workbook and its listeners. */
	loadJSON(data: unknown): void;
	private restoreDocument;
	private adoptDocument;
	/**
	 * Resolve a workbook-unique worksheet display name. Duplicate or empty
	 * requests get a deterministic suffix (F11).
	 */
	uniqueSheetName(desired: string | undefined, exclude?: Worksheet): string;
	/** Sync formula text and the graph after a controlled rename (F11). */
	onWorksheetRenamed(sheet: Worksheet, previous: string, next: string): void;
	addWorksheet(config?: WorksheetConfig): Worksheet;
	removeWorksheet(id: string): void;
	onOperation(listener: (op: Operation) => void): () => void;
	/**
	 * Batch model notifications: during an update, operations are recorded
	 * (history) but listeners receive ONE aggregated `workbook.update` event
	 * at the end, so bulk actions (paste, fill, CSV import) produce one
	 * render pass instead of one per cell (F02). Synchronous: the final
	 * notification happens inside endUpdate.
	 */
	beginUpdate(): void;
	endUpdate(): void;
	emitOperation(operation: Operation, inverse?: Operation[]): void;
	/** Reversible ops enter history; inverse computation shared with transaction coalescing. */
	private inverseFor;
	private recordWithInverse;
	/** Apply a cell.set operation without re-recording history. */
	private applyCellSet;
	/**
	 * Apply a bulk cell snapshot (cells + per-cell metadata) used by the
	 * inverse of deletes and sorts (F08).
	 */
	private applyCellsReplace;
	/** Replay per-cell metadata (style/note/format/editor) snapshots (F08). */
	private applyMetaSet;
	/** Replay merge/unmerge state: removals first, then creations (F08). */
	private applyMergesSet;
	/** Replay a stored history operation (cell, bulk or structural). */
	private applyHistoryOperation;
	/** Rebuild the workbook-wide formula graph from every worksheet's records. */
	refreshFormulaGraph(): void;
	/**
	 * Rewrite formulas on EVERY sheet whose references point at the sheet
	 * whose rows/columns moved, then rebuild the graph.
	 */
	transformFormulasForStructuralChange(sheetName: string, shift: RefTransform): void;
	/**
	 * Keep undo/redo targets aligned with structural row/column changes.
	 * Coordinates of entries on the edited sheet are remapped, and every
	 * stored formula (forward, inverse and snapshot) is rewritten when its
	 * references point at the changed sheet (F07).
	 */
	transformHistory(sheetId: string, kind: "row" | "column", at: number, delta: number): void;
	undo(): void;
	redo(): void;
	private emitMarker;
	get canUndo(): boolean;
	get canRedo(): boolean;
	/**
	 * Versioned, sparse document snapshot (format v2, F13). Serializes every
	 * serializable feature with explicit cell typing: a cell is a formula
	 * only when `formula` is present, so literal "="-prefixed text survives
	 * round-trips. Non-serializable state (custom predicates in validation /
	 * conditional-format rules, pivot caches) is omitted rather than silently
	 * degraded.
	 */
	toJSON(): Record<string, unknown>;
	/** Load a snapshot produced by toJSON (F13); throws on unknown formats. */
	static fromJSON(data: unknown): Workbook;
}
export interface CreateGridOptions extends WorkbookOptions {
	/** Target element for future rendering phase. */
	element?: HTMLElement | null;
}
/**
 * Phase 0 entry point. Rendering is not attached yet; this creates the
 * workbook model that the DOM renderer will project.
 */
export declare function createGrid(_element?: HTMLElement | null, options?: CreateGridOptions): Workbook;
/**
 * Serialized cell snapshot used by undo/redo replay and document snapshots
 * (F08/F13): explicit typing so raw "="-strings never re-enter as formulas.
 */
export interface CellSnapshot {
	row: number;
	column: number;
	raw?: unknown;
	formula?: string;
	style?: CellStyle | null;
	note?: string | null;
	format?: string | null;
	editor?: {
		type: string;
		options?: unknown;
	} | null;
}
export interface ClipboardCell {
	raw?: unknown;
	formula?: string;
	style?: CellStyle;
	/** Keep raw text verbatim on paste (never reinterpreted as a formula). */
	literal?: boolean;
}
export interface ClipboardRange {
	rows: number;
	columns: number;
	/** Source anchor in the originating sheet. */
	origin: {
		row: number;
		column: number;
	};
	/** 2D matrix of raw cell payloads (formula preserved). */
	cells: ClipboardCell[][];
}
/**
 * Clipboard service (Phase 1 slice): TSV copy/paste with formula-aware
 * internal payload. The private MIME payload carries formulas so internal
 * transfers keep full fidelity; external paste reads TSV.
 */
export declare class ClipboardService {
	private buffer;
	/** Build the internal payload from a worksheet range. */
	copyFrom(worksheet: Worksheet, top: number, left: number, bottom: number, right: number, options?: {
		valuesOnly?: boolean;
	}): ClipboardRange;
	getBuffer(): ClipboardRange | null;
	/** Load text copied from another application without translating its formulas. */
	loadTSV(text: string): void;
	/**
	 * TSV text with doubled-quote escaping for quoted fields. Literal
	 * formula-looking text is quoted to retain its interpretation on paste.
	 */
	toTSV(): string;
	/**
	 * Parse external TSV into a clipboard payload. The parser is quote-aware
	 * over the WHOLE stream: quoted multiline cells stay one field and blank
	 * lines are preserved as rows (F16).
	 */
	static fromTSV(text: string): ClipboardRange;
	/**
	 * Paste the buffer at a target anchor. Relative formula references move
	 * with the paste offset; absolute parts stay fixed (§12.3). The whole
	 * paste is one history transaction (F09).
	 */
	pasteTo(workbook: Workbook, worksheet: Worksheet, anchorRow: number, anchorColumn: number): void;
}
/**
 * Shift relative A1 references in a formula by (dRow, dCol).
 * Scans parsed reference tokens so quoted strings and function names are
 * never touched; references translated off the sheet become #REF!.
 */
export declare function translateFormula(formula: string, dRow: number, dCol: number): string;
export type FillDirection = "down" | "up" | "right" | "left";
/**
 * Fill engine (§12.4): copy values, translate formulas, and infer series.
 * Series rules per seed column/row:
 * - numbers (>=2 seeds): arithmetic progression with observed step
 * - single number seed: copy
 * - text ending in digits: increment the numeric suffix
 * - otherwise: copy
 */
export declare class FillService {
	/** Extend a seed rectangle along both axes, without overwriting its cells.
	 * Rows are extended first; columns then extend the resulting row patterns.
	 * The whole fill is one history transaction (F09).
	 */
	fillRange(worksheet: Worksheet, source: Rect, target: Rect): void;
	fill(worksheet: Worksheet, direction: FillDirection, rect: {
		top: number;
		bottom: number;
		left: number;
		right: number;
	}, targetEnd: number): void;
	private inferValue;
}
/**
 * Number format engine (§23.3 prototype): a pragmatic mask subset.
 * Supported masks:
 *   #,##0            grouped integer
 *   #,##0.00         grouped with decimals
 *   0.00%            percent (value * 100)
 *   $#,##0.00        currency prefix
 *   yyyy-mm-dd, dd/mm/yyyy, mm/dd/yyyy   Excel serial dates
 * Values are stored raw; formatting happens only at display time.
 */
export declare function formatValue(value: unknown, mask?: string): string;
export interface SortSpec {
	column: number;
	direction: "asc" | "desc";
}
/**
 * Sort service (§19): stable, multi-column sorting over EVALUATED values.
 * One atomic permutation moves cell records, relative formulas (translated
 * by the row delta), styles, notes, number formats and cell editors, and
 * records a reversible history entry so Undo restores the permutation (F12/F08).
 * Merged or spilled ranges are rejected until their sort behavior is defined.
 */
export declare class SortService {
	sort(worksheet: Worksheet, rect: Rect, specs: SortSpec[]): void;
	private capture;
	/** Write the permuted layout: rows move with their formulas and metadata. */
	private writePermutation;
}
export interface SearchOptions {
	matchCase?: boolean;
	wholeCell?: boolean;
	/** Include formula text in the haystack (default: displayed values only). */
	searchFormulas?: boolean;
}
export interface SearchResult {
	row: number;
	column: number;
	text: string;
}
/**
 * Search service (§21): scans the used range of a worksheet in row-major
 * order against displayed values.
 */
export declare class SearchService {
	find(worksheet: Worksheet, query: string, options?: SearchOptions): SearchResult[];
	/** Next match at or after the given cell, wrapping around. */
	findNext(worksheet: Worksheet, query: string, from: {
		row: number;
		column: number;
	}, options?: SearchOptions): SearchResult | undefined;
}
/** Replace helpers extending the search service (§21). */
export declare function replace(worksheet: Worksheet, query: string, replacement: string, from: {
	row: number;
	column: number;
}, options?: SearchOptions): SearchResult | undefined;
export declare function replaceAll(worksheet: Worksheet, query: string, replacement: string, options?: SearchOptions): number;
/**
 * Internal SVG chart engine (§31.3). Pure function: ChartSpec + data in,
 * SVG markup out. Chart data stays provider-neutral.
 *
 * Every interpolated value is validated or escaped at this boundary (F01):
 * colors go through sanitizeChartColor, geometry is clamped to finite
 * numbers, and text is XML-escaped — configuration strings can never
 * become markup.
 */
export declare function renderChartSVG(spec: ChartSpec, data: ChartData): string;
export type PaperSize = "A4" | "Letter";
export interface PrintOptions {
	orientation?: "portrait" | "landscape";
	paperSize?: PaperSize;
	/** Page margins in millimetres. */
	marginMm?: number;
	/** Number of leading rows repeated on every page (thead). */
	repeatHeaderRows?: number;
	/** Print gridlines (default true). */
	gridlines?: boolean;
	/** Include row/column headers (default false). */
	includeHeaders?: boolean;
}
/**
 * Print layout (§36): builds a self-contained HTML document with @page rules
 * for paper size, orientation and margins. Browsers print or save it as PDF.
 */
export declare function buildPrintHtml(workbook: Workbook, sheetName: string, options?: PrintOptions): string;
/** Renderer convenience: open a print window (browser environments only). */
export declare function printHtml(html: string): boolean;
export interface ThemeTokens {
	fontFamily: string;
	fontSize: string;
	bg: string;
	text: string;
	gridline: string;
	selection: string;
	selectionSoft: string;
	headerBg: string;
	headerText: string;
	tableBand: string;
}
export declare const defaultThemeTokens: ThemeTokens;
/**
 * Theme builder (§49): emits a CSS block declaring `.ezygrid` custom
 * properties from tokens. Pass only overrides; defaults fill the rest.
 */
export declare function buildThemeCss(overrides?: Partial<ThemeTokens>): string;
export declare const darkThemeTokens: Partial<ThemeTokens>;
export declare const highContrastThemeTokens: Partial<ThemeTokens>;
export interface EzygridOptions extends WorkbookOptions {
	/** An existing HTML element, or a selector resolved in the current document. */
	target: string | HTMLElement;
	renderer?: GridRendererOptions;
}
/** A mounted spreadsheet, owning one workbook and its renderer. */
declare class Ezygrid$1 {
	readonly target: HTMLElement;
	readonly workbook: Workbook;
	readonly renderer: GridRenderer;
	private destroyed;
	constructor(options: EzygridOptions);
	/** Returns undefined for an existing host that has no live Ezygrid instance. */
	static getInstance(target: string | HTMLElement): Ezygrid$1 | undefined;
	/** Mount marked hosts, including root itself. Existing instances retain their data. */
	static initAll(root?: Document | Element | DocumentFragment): Ezygrid$1[];
	/** Dispose before removing an ordinary div from the page. Safe to call twice. */
	destroy(): void;
}

export {
	Ezygrid$1 as Ezygrid,
};

export {};
