document.currentScript.__ezygridRegister("core/charts", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChartEngine = exports.DEFAULT_CHART_COLORS = void 0;
exports.sanitizeChartColor = sanitizeChartColor;
exports.readChartData = readChartData;
const model_1 = require("@ezygrid/model");
const model_2 = require("@ezygrid/model");
exports.DEFAULT_CHART_COLORS = ['#2563eb', '#00b374', '#0ea5e9', '#00ff99', '#1e40af', '#00875a'];
/**
 * Validate a chart color at the public boundary (F01): only plain CSS color
 * values are accepted, so a string like `red" onpointerover="alert(1)`
 * can never reach an SVG attribute.
 */
function sanitizeChartColor(value) {
    if (typeof value !== 'string')
        return null;
    const text = value.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(text))
        return text;
    if (/^[a-z]{1,32}$/i.test(text))
        return text.toLowerCase();
    if (/^(rgb|rgba|hsl|hsla)\(\s*[\d\s.,%/]+\)$/i.test(text))
        return text.replace(/\s+/g, ' ');
    return null;
}
/**
 * Charts v1 (§31): provider-neutral ChartSpec bound to worksheet ranges,
 * rendered by an internal SVG engine into the media overlay.
 */
class ChartEngine {
    charts = [];
    add(spec) {
        const colors = Array.isArray(spec.colors)
            ? spec.colors
                .map((color) => sanitizeChartColor(String(color)))
                .filter((color) => color !== null)
            : undefined;
        const full = {
            ...spec,
            colors: colors && colors.length > 0 ? colors : undefined,
            id: spec.id ?? (0, model_1.createId)('chart'),
        };
        this.charts.push(full);
        return full;
    }
    remove(id) {
        this.charts = this.charts.filter((c) => c.id !== id);
    }
    all() {
        return this.charts;
    }
}
exports.ChartEngine = ChartEngine;
/** Read a rectangular range as chart data (first row = headers). */
function readChartData(worksheet, spec) {
    const rect = (0, model_2.parseRange)(spec.source);
    const headerOffset = spec.firstRowIsHeader === false ? 0 : 1;
    const categories = [];
    for (let r = rect.top + headerOffset; r <= rect.bottom; r++) {
        const v = worksheet.getValue(r, rect.left);
        categories.push(v === null || v === undefined ? '' : String(v));
    }
    const series = [];
    for (let c = rect.left + 1; c <= rect.right; c++) {
        const name = headerOffset && worksheet.getValue(rect.top, c);
        const values = [];
        for (let r = rect.top + headerOffset; r <= rect.bottom; r++) {
            const v = worksheet.getValue(r, c);
            // Preserve the slot so values never shift onto the wrong category (F22).
            values.push(typeof v === 'number' && Number.isFinite(v) ? v : null);
        }
        series.push({ name: name === null || name === undefined ? `Series ${c - rect.left}` : String(name), values });
    }
    return { categories, series };
}

});
