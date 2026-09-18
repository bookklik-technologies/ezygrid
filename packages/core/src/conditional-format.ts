import { createId, parseRange } from '@ezygrid/model';
import type { CellStyle } from './workbook.js';
import type { Worksheet } from './workbook.js';

export type ConditionalFormatType =
  | 'cellIs'
  | 'containsText'
  | 'expression'
  | 'topN'
  | 'duplicates';

export interface ConditionalFormatRule {
  id: string;
  range: string;
  type: ConditionalFormatType;
  /** Comparison operator for cellIs. */
  operator?: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
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
export class ConditionalFormatEngine {
  private rules: ConditionalFormatRule[] = [];

  add(rule: Omit<ConditionalFormatRule, 'id'>): ConditionalFormatRule {
    const full: ConditionalFormatRule = { ...rule, id: (rule as Partial<ConditionalFormatRule>).id ?? createId('cf') };
    this.rules.push(full);
    return full;
  }

  remove(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  all(): readonly ConditionalFormatRule[] {
    return [...this.rules].sort((a, b) => a.priority - b.priority);
  }

  /** Evaluate all matching rules for a cell; returns the merged style patch. */
  evaluate(worksheet: Worksheet, row: number, column: number): CellStyle {
    let patch: CellStyle | undefined;
    for (const rule of this.all()) {
      const rect = parseRange(rule.range);
      if (row < rect.top || row > rect.bottom || column < rect.left || column > rect.right) {
        continue;
      }
      const record = worksheet.cells.getCell(row, column);
      const value = record?.formula !== undefined ? worksheet.getValue(row, column) : record?.raw ?? null;
      if (this.matches(rule, value, worksheet)) {
        patch = { ...patch, ...rule.style };
        if (rule.stopIfTrue) break;
      }
    }
    return patch ?? {};
  }

  private matches(rule: ConditionalFormatRule, value: unknown, worksheet: Worksheet): boolean {
    switch (rule.type) {
      case 'cellIs': {
        const n = typeof value === 'number' ? value : Number(value);
        const target = typeof rule.value === 'number' ? rule.value : Number(rule.value);
        if (Number.isNaN(n) || Number.isNaN(target)) {
          return String(value) === String(rule.value) && rule.operator === 'eq';
        }
        switch (rule.operator) {
          case 'gt': return n > target;
          case 'lt': return n < target;
          case 'gte': return n >= target;
          case 'lte': return n <= target;
          case 'eq': return n === target;
          case 'neq': return n !== target;
          default: return false;
        }
      }
      case 'containsText':
        return String(value ?? '').includes(rule.text ?? '');
      case 'expression':
        return rule.predicate ? rule.predicate(value) : false;
      case 'topN': {
        const n = rule.n ?? 10;
        const nums = this.rangeNumbers(rule.range, worksheet);
        const threshold = nums.sort((a, b) => b - a)[Math.min(n, nums.length) - 1];
        return typeof value === 'number' && value >= (threshold ?? Infinity);
      }
      case 'duplicates': {
        const nums = this.rangeValues(rule.range, worksheet);
        const key = String(value);
        return key !== 'null' && nums.filter((v) => String(v) === key).length > 1;
      }
      default:
        return false;
    }
  }

  private rangeNumbers(range: string, worksheet: Worksheet): number[] {
    const rect = parseRange(range);
    const out: number[] = [];
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        const v = worksheet.getValue(r, c);
        if (typeof v === 'number') out.push(v);
      }
    }
    return out;
  }

  private rangeValues(range: string, worksheet: Worksheet): unknown[] {
    const rect = parseRange(range);
    const out: unknown[] = [];
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        const v = worksheet.getValue(r, c);
        if (v !== null) out.push(v);
      }
    }
    return out;
  }
}


