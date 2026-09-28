document.currentScript.__ezygridRegister("core/theme", function(require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.highContrastThemeTokens = exports.darkThemeTokens = exports.defaultThemeTokens = void 0;
exports.buildThemeCss = buildThemeCss;
exports.defaultThemeTokens = {
    fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", sans-serif',
    fontSize: '13px',
    bg: '#ffffff',
    text: '#0f172a',
    gridline: '#e2e8f0',
    selection: '#00c47a',
    selectionSoft: 'rgba(0, 196, 122, 0.12)',
    headerBg: '#f1f5f9',
    headerText: '#334155',
    tableBand: 'rgba(0, 196, 122, 0.06)',
};
const VARIABLE_MAP = {
    fontFamily: '--ezygrid-font-family',
    fontSize: '--ezygrid-font-size',
    bg: '--ezygrid-bg',
    text: '--ezygrid-text',
    gridline: '--ezygrid-gridline',
    selection: '--ezygrid-selection',
    selectionSoft: '--ezygrid-selection-soft',
    headerBg: '--ezygrid-header-bg',
    headerText: '--ezygrid-header-text',
    tableBand: '--ezygrid-table-band',
};
/**
 * Theme builder (§49): emits a CSS block declaring `.ezygrid` custom
 * properties from tokens. Pass only overrides; defaults fill the rest.
 */
function buildThemeCss(overrides = {}) {
    const tokens = { ...exports.defaultThemeTokens, ...overrides };
    const lines = Object.entries(VARIABLE_MAP)
        .map(([key, variable]) => `  ${variable}: ${tokens[key]};`)
        .join('\n');
    return `.ezygrid, .ezygrid-suite {\n${lines}\n}`;
}
exports.darkThemeTokens = {
    // Neutral base matches Ezyreka; selection retains Ezygrid's brand accent.
    bg: '#17181d',
    text: '#e8e9ee',
    gridline: '#383a41',
    selection: '#00ff99',
    selectionSoft: 'rgba(0, 255, 153, 0.16)',
    headerBg: '#23252b',
    headerText: '#9a9da8',
    tableBand: 'rgba(0, 255, 153, 0.06)',
};
exports.highContrastThemeTokens = {
    bg: '#ffffff',
    text: '#000000',
    gridline: '#000000',
    selection: '#00875a',
    selectionSoft: 'rgba(0, 135, 90, 0.2)',
    headerBg: '#e5e5e5',
    headerText: '#000000',
};

});
