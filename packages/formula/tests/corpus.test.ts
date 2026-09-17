import { describe, it, expect } from 'vitest';
import { evaluateStandalone, FUNCTIONS, formulaRegistry } from '../src/index.js';

function run(expression: string, values: Record<string, unknown> = {}): unknown {
  const result = evaluateStandalone(expression, values as never);
  if (result && typeof result === 'object' && (result as { kind: string }).kind === 'matrix') {
    return (result as { values: unknown[][] }).values;
  }
  return result instanceof Error ? result.value : result;
}

/**
 * Formula compatibility corpus (§52.5): per-function cases with expected
 * results. Extended each release; pass rate is tracked in CI.
 */
const CORPUS: [string, Record<string, unknown>, unknown][] = [
  // Math
  ['SUM(1,2,3)', {}, 6],
  ['SUM(A1:A3)', { '0,0': 1, '1,0': 2, '2,0': 3 }, 6],
  ['AVERAGE(2,4,6)', {}, 4],
  ['MIN(3,1,2)', {}, 1],
  ['MAX(3,1,2)', {}, 3],
  ['COUNT(1,"a",2)', {}, 2],
  ['SUMSQ(3,4)', {}, 25],
  ['PRODUCT(2,3,4)', {}, 24],
  ['SUMPRODUCT(A1:B1,A2:B2)', { '0,0': 1, '0,1': 2, '1,0': 3, '1,1': 4 }, 11],
  ['INT(2.9)', {}, 2],
  ['INT(-2.1)', {}, -3],
  ['TRUNC(2.9)', {}, 2],
  ['SIGN(-5)', {}, -1],
  ['EXP(0)', {}, 1],
  ['LN(1)', {}, 0],
  ['LOG(100)', {}, 2],
  ['LOG(8,2)', {}, 3],
  ['LOG10(1000)', {}, 3],
  ['CEILING(4.3,1)', {}, 5],
  ['FLOOR(4.7,1)', {}, 4],
  ['PI()', {}, Math.PI],
  ['DEGREES(PI())', {}, 180],
  ['RADIANS(180)', {}, Math.PI],
  ['SQRT(16)', {}, 4],
  ['POWER(2,10)', {}, 1024],
  ['MOD(7,3)', {}, 1],
  ['ABS(-3)', {}, 3],
  ['ROUND(2.345,2)', {}, 2.35],
  ['ROUNDUP(2.301,1)', {}, 2.4],
  ['ROUNDDOWN(2.399,1)', {}, 2.3],
  ['SIN(0)', {}, 0],
  ['COS(0)', {}, 1],
  ['ATAN2(1,1)', {}, Math.PI / 4],
  // Statistical
  ['MEDIAN(1,2,3,4)', {}, 2.5],
  ['STDEV(2,4,4,4,5,5,7,9)', {}, 2.138089935299395],
  ['STDEVP(2,4,4,4,5,5,7,9)', {}, 2.0],
  ['VAR(2,4,6)', {}, 4],
  ['VARP(2,4,6)', {}, 2.6666666666666665],
  ['LARGE(SEQUENCE(5,1,1,1),2)', {}, 4],
  ['SMALL(SEQUENCE(5,1,1,1),2)', {}, 2],
  ['MODE(1,2,2,3)', {}, 2],
  ['COUNTIF(A1:A3,">1")', { '0,0': 1, '1,0': 2, '2,0': 3 }, 2],
  ['SUMIF(A1:A3,">1")', { '0,0': 1, '1,0': 2, '2,0': 3 }, 5],
  ['RANK(2,SEQUENCE(3,1,1,1))', {}, 2],
  ['COUNTBLANK(A1:B2)', { '0,0': 1 }, 3],
  // Logical
  ['IF(1>0,"yes","no")', {}, 'yes'],
  ['IFS(FALSE,1,TRUE,2)', {}, 2],
  ['AND(TRUE,1)', {}, true],
  ['OR(FALSE,0)', {}, false],
  ['NOT(FALSE)', {}, true],
  ['XOR(TRUE,FALSE,TRUE)', {}, false],
  ['XOR(TRUE,TRUE,TRUE)', {}, true],
  ['SWITCH("b","a",1,"b",2,0)', {}, 2],
  ['IFERROR(1/0,"err")', {}, 'err'],
  ['TRUE()', {}, true],
  // Text
  ['CONCAT("a","b","c")', {}, 'abc'],
  ['TEXTJOIN("-",TRUE,"a","","b")', {}, 'a-b'],
  ['LEFT("hello",2)', {}, 'he'],
  ['RIGHT("hello",2)', {}, 'lo'],
  ['MID("hello",2,3)', {}, 'ell'],
  ['LEN("hello")', {}, 5],
  ['TRIM("  a   b ")', {}, 'a b'],
  ['UPPER("aBc")', {}, 'ABC'],
  ['LOWER("aBc")', {}, 'abc'],
  ['PROPER("hello world")', {}, 'Hello World'],
  ['FIND("l","hello")', {}, 3],
  ['SEARCH("L","hello")', {}, 3],
  ['SUBSTITUTE("a-b-c","-","+")', {}, 'a+b+c'],
  ['REPLACE("abcdef",2,3,"XY")', {}, 'aXYef'],
  ['REPT("ab",3)', {}, 'ababab'],
  ['EXACT("a","a")', {}, true],
  ['VALUE("42")', {}, 42],
  ['CHAR(65)', {}, 'A'],
  ['CODE("A")', {}, 65],
  // Lookup
  ['VLOOKUP(2,A1:B2,2)', { '0,0': 1, '0,1': 'one', '1,0': 2, '1,1': 'two' }, 'two'],
  ['HLOOKUP(2,A1:B2,2)', { '0,0': 1, '0,1': 2, '1,0': 'one', '1,1': 'two' }, 'two'],
  ['INDEX(A1:A3,2)', { '0,0': 1, '1,0': 2, '2,0': 3 }, 2],
  ['MATCH(2,A1:A3,0)', { '0,0': 1, '1,0': 2, '2,0': 3 }, 2],
  ['CHOOSE(2,"a","b","c")', {}, 'b'],
  ['XLOOKUP("b",A1:A3,B1:B3)', { '0,0': 'a', '0,1': 1, '1,0': 'b', '1,1': 2, '2,0': 'c', '2,1': 3 }, 2],
  ['XMATCH("b",A1:A3)', { '0,0': 'a', '1,0': 'b', '2,0': 'c' }, 2],
  ['ROWS(SEQUENCE(4,3))', {}, 4],
  ['COLUMNS(SEQUENCE(4,3))', {}, 3],
  // Date
  ['DATE(2026,1,15)', {}, 46037],
  ['YEAR(DATE(2026,1,15))', {}, 2026],
  ['MONTH(DATE(2026,1,15))', {}, 1],
  ['DAY(DATE(2026,1,15))', {}, 15],
  ['DAYS(DATE(2026,1,15),DATE(2026,1,1))', {}, 14],
  ['WEEKDAY(DATE(2026,1,15))', {}, 5],
  ['EDATE(DATE(2026,1,15),1)', {}, 46068],
  ['EOMONTH(DATE(2026,1,15),0)', {}, 46053],
  ['TIME(6,0,0)', {}, 0.25],
  ['HOUR(0.5)', {}, 12],
  ['MINUTE(TIME(1,30,0))', {}, 30],
  // Financial
  ['PMT(0.01,12,1000)', {}, -88.84878867834169],
  ['FV(0.01,12,-100,-1000)', {}, 2395.0753314516674],
  ['PV(0.01,12,-100)', {}, 1125.5077473545102],
  ['NPV(0.1,-100,100,100)', {}, 66.8670172802404],
  // Information
  ['ISBLANK(A1)', {}, true],
  ['ISNUMBER(5)', {}, true],
  ['ISTEXT("x")', {}, true],
  ['ISERROR(1/0)', {}, true],
  ['ISNA(NA())', {}, true],
  ['ISERR(1/0)', {}, true],
  ['N(5)', {}, 5],
  ['N("x")', {}, 0],
  // Dynamic arrays
  ['SEQUENCE(3,1,1,1)', {}, [[1], [2], [3]]],
  ['SEQUENCE(2,2,10,10)', {}, [[10, 20], [30, 40]]],
  ['TRANSPOSE(SEQUENCE(2,2,1,1))', {}, [[1, 3], [2, 4]]],
  ['UNIQUE(SEQUENCE(3,1,1,1))', {}, [[1], [2], [3]]],
  ['SORT(SEQUENCE(3,1,1,1),1,-1)', {}, [[3], [2], [1]]],
  ['FILTER(SEQUENCE(3,1,1,1),SEQUENCE(3,1,0,1))', {}, [[2], [3]]],
  ['SUM(SEQUENCE(4,1,1,1))', {}, 10],
  ['AVERAGE(SEQUENCE(4,1,2,2))', {}, 5],
  // Errors
  ['1/0', {}, '#DIV/0!'],
  ['SQRT(-1)', {}, '#NUM!'],
  ['NOSUCH(1)', {}, '#NAME?'],
  ['#N/A', {}, '#N/A'],
];

describe('Formula compatibility corpus (§52.5)', () => {
  it('library exposes at least 100 functions', () => {
    const registryNames = formulaRegistry.all().map((m) => m.name);
    const implemented = new Set([...Object.keys(FUNCTIONS), ...registryNames]);
    expect(implemented.size).toBeGreaterThanOrEqual(100);
  });

  it('all error literals are supported', () => {
    for (const literal of ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#SPILL!', '#CALC!']) {
      const result = evaluateStandalone(literal, {});
      expect(result instanceof Error ? result.value : result).toBe(literal);
    }
  });

  for (const [expression, values, expected] of CORPUS) {
    it(`corpus: ${expression}`, () => {
      const actual = run(expression, values);
      if (typeof expected === 'number' && typeof actual === 'number') {
        expect(actual).toBeCloseTo(expected, 6);
      } else {
        expect(actual).toEqual(expected);
      }
    });
  }
});

