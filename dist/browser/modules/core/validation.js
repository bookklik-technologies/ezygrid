document.currentScript.__ezygridRegister("core/validation", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationService = void 0;
const model_1 = require("@ezygrid/model");
/**
 * Validation service (§24): number/list/text-length/custom rules applied
 * during setValue with reject/warning/mark actions.
 */
class ValidationService {
    rules = [];
    add(rule) {
        const full = { ...rule, id: rule.id ?? (0, model_1.createId)('val') };
        this.rules.push(full);
        return full;
    }
    remove(id) {
        this.rules = this.rules.filter((r) => r.id !== id);
    }
    all() {
        return this.rules;
    }
    /** Rules applying to a cell. */
    forCell(worksheet, row, column) {
        return this.rules.filter((rule) => {
            const rect = (0, model_1.parseRange)(rule.range);
            return (row >= rect.top &&
                row <= rect.bottom &&
                column >= rect.left &&
                column <= rect.right);
        });
    }
    /** Validate a candidate value for a cell. */
    check(worksheet, row, column, value) {
        const rules = this.forCell(worksheet, row, column);
        for (const rule of rules) {
            if (value === null || value === undefined || value === '')
                continue; // blanks allowed
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
    validateRule(rule, value) {
        switch (rule.type) {
            case 'number': {
                const n = typeof value === 'number' ? value : Number(value);
                if (Number.isNaN(n))
                    return false;
                if (rule.min !== undefined && n < rule.min)
                    return false;
                if (rule.max !== undefined && n > rule.max)
                    return false;
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
exports.ValidationService = ValidationService;

});
