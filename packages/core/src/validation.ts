import { createId, parseRange } from '@ezygrid/model';
import type { Worksheet } from './workbook.js';

export type ValidationType = 'number' | 'list' | 'textLength' | 'custom';
export type ValidationAction = 'reject' | 'warning' | 'mark';

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
export class ValidationService {
  private rules: ValidationRule[] = [];

  add(rule: Omit<ValidationRule, 'id'>): ValidationRule {
    const full: ValidationRule = { ...rule, id: (rule as Partial<ValidationRule>).id ?? createId('val') };
    this.rules.push(full);
    return full;
  }

  remove(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  all(): readonly ValidationRule[] {
    return this.rules;
  }

  /** Rules applying to a cell. */
  forCell(worksheet: Worksheet, row: number, column: number): ValidationRule[] {
    return this.rules.filter((rule) => {
      const rect = parseRange(rule.range);
      return (
        row >= rect.top &&
        row <= rect.bottom &&
        column >= rect.left &&
        column <= rect.right
      );
    });
  }

  /** Validate a candidate value for a cell. */
  check(worksheet: Worksheet, row: number, column: number, value: unknown): ValidationResult {
    const rules = this.forCell(worksheet, row, column);
    for (const rule of rules) {
      if (value === null || value === undefined || value === '') continue; // blanks allowed
      if (!this.validateRule(rule, value)) {
        return {
          allowed: rule.action !== 'reject',
          action: rule.action,
          message: rule.message ?? `Value rejected by ${rule.type} validation`,
        };
      }
    }
    return { allowed: true, action: 'warning' };
  }

  private validateRule(rule: ValidationRule, value: unknown): boolean {
    switch (rule.type) {
      case 'number': {
        const n = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(n)) return false;
        if (rule.min !== undefined && n < rule.min) return false;
        if (rule.max !== undefined && n > rule.max) return false;
        return true;
      }
      case 'list':
        return (rule.values ?? []).some((v) => v === value || String(v) === String(value));
      case 'textLength':
        return String(value).length === (rule.length ?? String(value).length);
      case 'custom':
        return rule.predicate ? rule.predicate(value) : true;
      default:
        return true;
    }
  }
}
