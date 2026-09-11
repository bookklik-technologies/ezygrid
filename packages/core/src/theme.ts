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
  fontFamily: 'system-ui, sans-serif',
  fontSize: '13px',
  bg: '#ffffff',
  text: '#111111',
  gridline: '#e4e4e7',
  selection: '#2563eb',
  selectionSoft: 'rgba(37, 99, 235, 0.08)',
  headerBg: '#f4f4f5',
  headerText: '#52525b',
  tableBand: 'rgba(0, 0, 0, 0.03)',
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
  return `.ezygrid {\n${lines}\n}`;
}

export const darkThemeTokens: Partial<ThemeTokens> = {
  bg: '#18181b',
  text: '#fafafa',
  gridline: '#3f3f46',
  selection: '#60a5fa',
  selectionSoft: 'rgba(96, 165, 250, 0.12)',
  headerBg: '#27272a',
  headerText: '#a1a1aa',
  tableBand: 'rgba(255, 255, 255, 0.04)',
};

export const highContrastThemeTokens: Partial<ThemeTokens> = {
  bg: '#ffffff',
  text: '#000000',
  gridline: '#000000',
  selection: '#0000ff',
  selectionSoft: 'rgba(0, 0, 255, 0.15)',
  headerBg: '#e5e5e5',
  headerText: '#000000',
};
