# Formulas

Ezygrid ships an Excel-compatible formula engine in `@ezygrid/formula`: tokenizer → recursive-descent parser → AST → dependency graph → incremental evaluator. No `eval()` anywhere.

## Writing formulas

Any string starting with `=` written to a cell becomes a formula:

```ts
sheet.setValue(3, 3, '=B4-C4');
sheet.setValue(4, 3, '=SUM(B2:B4)*0.2');
sheet.setValue(5, 3, '=Targets!B2');        // cross-sheet reference
sheet.setValue(6, 3, '=SalesData');         // defined name (range or value)
sheet.setValue(7, 3, '=Sales[@Price]*C8');  // structured table reference
```

Values recalculate automatically as precedents change. `sheet.refreshFormulas()` forces a full recalculation pass.

## Grammar highlights

Precedence (low → high): comparison, `&`, `+ -`, `* /`, `^`, unary, `%`. Supported node kinds:

- Literals: numbers, strings (`"..."`), booleans (`TRUE`/`FALSE`), errors (`#DIV/0!`)
- References: `A1`, `$A$1`, `Sheet1!B2`, `'My Sheet'!B2`, ranges `A1:B3`
- Structured references: `Table`, `Table[Column]`, `Table[@Column]`
- Function calls, unary operators, percent postfix, `LET` bindings

Reference cycling while editing: press **F4** to cycle `A1 → $A$1 → A$1 → $A1`. Clicking cells while editing a formula inserts their A1 references.

## Dynamic arrays

`FILTER`, `SORT`, `SORTBY`, `UNIQUE`, `SEQUENCE` and `TRANSPOSE` produce matrices that **spill** into neighboring cells. Spill respects blocking rules — results are refused (`#SPILL!`) when destination cells are occupied, merged, or cross the sheet bounds.

## Built-in functions (99)

**Math & trig:** `SUM` `SUMSQ` `SUMPRODUCT` `PRODUCT` `ABS` `MOD` `POWER` `SQRT` `INT` `TRUNC` `SIGN` `EXP` `LN` `LOG` `LOG10` `CEILING` `FLOOR` `PI` `DEGREES` `RADIANS` `SIN` `COS` `TAN` `ASIN` `ACOS` `ATAN` `ATAN2` `RAND` `RANDBETWEEN`

**Statistical:** `AVERAGE` `MIN` `MAX` `COUNT` `COUNTA` `COUNTBLANK` `MEDIAN` `MODE` `STDEV` `STDEVP` `VAR` `VARP` `LARGE` `SMALL` `RANK` `COUNTIF` `COUNTIFS` `AVERAGEIF`

**Conditional math:** `SUMIF` `SUMIFS`

**Logical:** `IF` `IFS` `AND` `OR` `XOR` `NOT` `SWITCH` `TRUE` `FALSE` `IFERROR` `IFNA` `LET`

**Text:** `CONCAT` `CONCATENATE` `TEXTJOIN` `LEFT` `RIGHT` `MID` `LEN` `TRIM` `UPPER` `LOWER` `PROPER` `FIND` `SEARCH` `SUBSTITUTE` `REPLACE` `REPT` `EXACT` `VALUE` `CHAR` `CODE`

**Date & time:** `TODAY` `NOW` `DATE` `YEAR` `MONTH` `DAY` `HOUR` `MINUTE` `SECOND` `TIME` `WEEKDAY` `WEEKNUM` `EDATE` `EOMONTH` `DAYS` (Excel serial dates)

**Lookup & reference:** `VLOOKUP` `HLOOKUP` `INDEX` `MATCH` `XLOOKUP` `XMATCH` `CHOOSE` `ROWS` `COLUMNS`

**Dynamic arrays:** `FILTER` `SORT` `SORTBY` `UNIQUE` `SEQUENCE` `TRANSPOSE`

**Financial:** `PMT` `FV` `PV` `NPV`

**Information:** `ISBLANK` `ISNUMBER` `ISTEXT` `ISERROR` `ISERR` `ISNA` `NA` `N`

## Error values

Errors propagate through formulas like Excel:

```text
#NULL!  #DIV/0!  #VALUE!  #REF!  #NAME?  #NUM!  #N/A  #SPILL!  #CALC!  #CIRCULAR!
```

Circular references are detected during evaluation and surface as `#CIRCULAR!`.

## Custom functions

Register functions through the global registry:

```ts
import { formulaRegistry } from '@ezygrid/formula';

formulaRegistry.register({
  name: 'CELSIUS',
  category: 'engineering',
  description: 'Convert Fahrenheit to Celsius',
  signature: 'CELSIUS(fahrenheit)',
  evaluate: (args) => ((args[0] as number) - 32) * 5 / 9,
});
```

- `formulaRegistry.suggest(prefix, limit)` powers the in-editor autocomplete (press **Tab** to accept the top suggestion).
- `formulaRegistry.all()` lists registered metadata (`name`, `category`, `description`, `signature`, `volatile`).
- Registry functions override built-ins with the same name; use `unregister(name)` to restore.

## Dependency graph

`DependencyGraph` tracks cell and range dependencies as rectangles (never per-cell expansions), recalculates only dirty cells per pass, memoizes results, and enforces budgets (`maxRangeCells` 2,000,000, `maxDepth` 1000):

```ts
workbook.formulaGraph;             // DependencyGraph instance
workbook.refreshFormulaGraph();    // full rebuild
```

## Async / standalone evaluation

`@ezygrid/formula/worker-main` runs the evaluator in a Web Worker with the request/response protocol `{ id, expression, values } → { id, result, matrix? }`. `evaluateStandalone(expression, values)` evaluates an expression against a plain values map — useful for computing outside the grid.
