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
  /**
   * Range-scan memo for topN/duplicates (H4): applyCellStyle runs for every
   * visible cell on every render pass, so a rule's range is scanned once per
   * workbook revision instead of once per painted cell. Keys are rule ids.
   */
  private scans = new Map<string, { revision: number; data: unknown }>();

  add(rule: Omit<ConditionalFormatRule, 'id'>): ConditionalFormatRule {
    const full: ConditionalFormatRule = { ...rule, id: (rule as Partial<ConditionalFormatRule>).id ?? createId('cf') };
    this.rules.push(full);
    return full;
  }

  remove(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
    this.scans.delete(id);
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
        const threshold = this.cachedScan(rule, worksheet, () => {
          const nums = this.rangeNumbers(rule.range, worksheet);
          return nums.sort((a, b) => b - a)[Math.min(n, nums.length) - 1];
        }) as number | undefined;
        return typeof value === 'number' && value >= (threshold ?? Infinity);
      }
      case 'duplicates': {
        const duplicated = this.cachedScan(rule, worksheet, () => {
          const counts = new Map<string, number>();
          for (const v of this.rangeValues(rule.range, worksheet)) {
            const key = String(v);
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          const out = new Set<string>();
          for (const [key, count] of counts) if (count > 1) out.add(key);
          return out;
        }) as Set<string>;
        const key = String(value);
        return key !== 'null' && duplicated.has(key);
      }
      default:
        return false;
    }
  }

  /** Range-scan memo keyed by rule id (+ rule-specific params), valid for one workbook revision. */
  private cachedScan(
    rule: ConditionalFormatRule,
    worksheet: Worksheet,
    compute: () => unknown,
  ): unknown {
    const revision = worksheet.workbook.revision;
    const key = rule.type === 'topN' ? `${rule.id}:n${rule.n ?? 10}` : rule.id;
    const cached = this.scans.get(key);
    if (cached && cached.revision === revision) return cached.data;
    const data = compute();
    this.scans.set(key, { revision, data });
    return data;
  }

  private rangeNumbers(range: string, worksheet: Worksheet): number[] {
    const rect = this.clampRange(range, worksheet);
    if (!rect) return [];
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
    const rect = this.clampRange(range, worksheet);
    if (!rect) return [];
    const out: unknown[] = [];
    for (let r = rect.top; r <= rect.bottom; r++) {
      for (let c = rect.left; c <= rect.right; c++) {
        const v = worksheet.getValue(r, c);
        if (v !== null) out.push(v);
      }
    }
    return out;
  }

  /** Clamp a rule range to the sheet dimensions (M2); null when outside. */
  private clampRange(range: string, worksheet: Worksheet) {
    const rect = parseRange(range);
    const top = Math.max(0, rect.top);
    const left = Math.max(0, rect.left);
    const bottom = Math.min(worksheet.rowCount - 1, rect.bottom);
    const right = Math.min(worksheet.columnCount - 1, rect.right);
    if (top > bottom || left > right) return null;
    return { top, left, bottom, right };
  }
}


