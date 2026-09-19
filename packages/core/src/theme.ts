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

export const defaultThemeTokens: ThemeTokens = {
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

const VARIABLE_MAP: Record<keyof ThemeTokens, string> = {
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
export function buildThemeCss(overrides: Partial<ThemeTokens> = {}): string {
  const tokens = { ...defaultThemeTokens, ...overrides };
  const lines = Object.entries(VARIABLE_MAP)
    .map(([key, variable]) => `  ${variable}: ${tokens[key as keyof ThemeTokens]};`)
    .join('\n');
  return `.ezygrid, .ezygrid-suite {\n${lines}\n}`;
}

export const darkThemeTokens: Partial<ThemeTokens> = {
  bg: '#0f172a',
  text: '#e2e8f0',
  gridline: '#1e293b',
  selection: '#00ff99',
  selectionSoft: 'rgba(0, 255, 153, 0.16)',
  headerBg: '#16223a',
  headerText: '#94a3b8',
  tableBand: 'rgba(0, 255, 153, 0.06)',
};

export const highContrastThemeTokens: Partial<ThemeTokens> = {
  bg: '#ffffff',
  text: '#000000',
  gridline: '#000000',
  selection: '#00875a',
  selectionSoft: 'rgba(0, 135, 90, 0.2)',
  headerBg: '#e5e5e5',
  headerText: '#000000',
};
