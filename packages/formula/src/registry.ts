import type { AstNode } from './parser.js';
import type { EvalContext, RuntimeValue, FunctionImpl } from './functions.js';
import { FUNCTIONS } from './functions.js';

export interface FunctionMeta {
  name: string;
  category: string;
  description?: string;
  signature?: string;
  volatile?: boolean;
}

/** Category map for the built-in library (drives suggestions). */
export const FUNCTION_CATEGORIES: Record<string, string> = {
  SUM: 'Math', AVERAGE: 'Statistical', MIN: 'Statistical', MAX: 'Statistical',
  COUNT: 'Statistical', COUNTA: 'Statistical', COUNTBLANK: 'Statistical',
  IF: 'Logical', IFS: 'Logical', AND: 'Logical', OR: 'Logical', XOR: 'Logical',
  NOT: 'Logical', SWITCH: 'Logical', TRUE: 'Logical', FALSE: 'Logical', IFERROR: 'Logical', IFNA: 'Logical',
  ROUND: 'Math', ROUNDUP: 'Math', ROUNDDOWN: 'Math', ABS: 'Math', MOD: 'Math',
  POWER: 'Math', SQRT: 'Math', INT: 'Math', TRUNC: 'Math', SIGN: 'Math', EXP: 'Math',
  LN: 'Math', LOG: 'Math', LOG10: 'Math', CEILING: 'Math', FLOOR: 'Math', PI: 'Math',
  DEGREES: 'Math', RADIANS: 'Math', SIN: 'Math', COS: 'Math', TAN: 'Math', ASIN: 'Math',
  ACOS: 'Math', ATAN: 'Math', ATAN2: 'Math', RAND: 'Math', RANDBETWEEN: 'Math',
  SUMSQ: 'Math', PRODUCT: 'Math', SUMPRODUCT: 'Math',
  MEDIAN: 'Statistical', MODE: 'Statistical', STDEV: 'Statistical', STDEVP: 'Statistical',
  VAR: 'Statistical', VARP: 'Statistical', LARGE: 'Statistical', SMALL: 'Statistical', RANK: 'Statistical',
  CONCAT: 'Text', CONCATENATE: 'Text', TEXTJOIN: 'Text', LEFT: 'Text', RIGHT: 'Text', MID: 'Text',
  LEN: 'Text', TRIM: 'Text', UPPER: 'Text', LOWER: 'Text', PROPER: 'Text', FIND: 'Text',
  SEARCH: 'Text', SUBSTITUTE: 'Text', REPLACE: 'Text', REPT: 'Text', EXACT: 'Text',
  VALUE: 'Text', CHAR: 'Text', CODE: 'Text',
  TODAY: 'Date', NOW: 'Date', DATE: 'Date', YEAR: 'Date', MONTH: 'Date', DAY: 'Date',
  HOUR: 'Date', MINUTE: 'Date', SECOND: 'Date', TIME: 'Date', WEEKDAY: 'Date',
  WEEKNUM: 'Date', EDATE: 'Date', EOMONTH: 'Date', DAYS: 'Date',
  VLOOKUP: 'Lookup', HLOOKUP: 'Lookup', INDEX: 'Lookup', MATCH: 'Lookup',
  XLOOKUP: 'Lookup', XMATCH: 'Lookup', CHOOSE: 'Lookup', ROWS: 'Lookup', COLUMNS: 'Lookup',
  COUNTIF: 'Statistical', COUNTIFS: 'Statistical', SUMIF: 'Math', SUMIFS: 'Math', AVERAGEIF: 'Statistical',
  ISBLANK: 'Information', ISNUMBER: 'Information', ISTEXT: 'Information', ISERROR: 'Information',
  ISNA: 'Information', ISERR: 'Information', NA: 'Information', N: 'Information',
  FILTER: 'Dynamic array', SORT: 'Dynamic array', SORTBY: 'Dynamic array', UNIQUE: 'Dynamic array',
  SEQUENCE: 'Dynamic array', TRANSPOSE: 'Dynamic array', LET: 'Logical',
  PMT: 'Financial', FV: 'Financial', PV: 'Financial', NPV: 'Financial',
};

const metadata = new Map<string, FunctionMeta>();

for (const [name, category] of Object.entries(FUNCTION_CATEGORIES)) {
  metadata.set(name, { name, category });
}

/**
 * Public formula registry (§14.7): custom function registration plus the
 * suggestion API used by the formula bar autocomplete.
 */
export const formulaRegistry = {
  register(def: {
    name: string;
    evaluate: FunctionImpl;
    category?: string;
    description?: string;
    signature?: string;
    volatile?: boolean;
  }): void {
    const name = def.name.toUpperCase();
    FUNCTIONS[name] = def.evaluate;
    metadata.set(name, {
      name,
      category: def.category ?? 'Custom',
      description: def.description,
      signature: def.signature,
      volatile: def.volatile,
    });
  },

  unregister(name: string): void {
    const key = name.toUpperCase();
    delete FUNCTIONS[key];
    metadata.delete(key);
  },

  get(name: string): FunctionMeta | undefined {
    return metadata.get(name.toUpperCase());
  },

  all(): FunctionMeta[] {
    return [...metadata.values()];
  },

  /** Autocomplete suggestions for a partial function name (§14.7). */
  suggest(prefix: string, limit = 10): FunctionMeta[] {
    const key = prefix.toUpperCase();
    if (key === '') return [];
    const starts: FunctionMeta[] = [];
    const contains: FunctionMeta[] = [];
    for (const meta of metadata.values()) {
      if (meta.name.startsWith(key)) starts.push(meta);
      else if (meta.name.includes(key)) contains.push(meta);
    }
    return [...starts, ...contains].slice(0, limit);
  },
};
