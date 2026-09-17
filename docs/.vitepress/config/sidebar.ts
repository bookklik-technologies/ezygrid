import type { DefaultTheme } from 'vitepress';

// Guide sidebar begins with "Getting started", followed by topic groups in learning order.
export const guideSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Getting started',
    items: [
      { text: 'Introduction', link: '/guide/introduction' },
      { text: 'Installation', link: '/guide/installation' },
      { text: 'Walkthrough', link: '/getting-started' },
    ],
  },
  {
    text: 'Core concepts',
    items: [
      { text: 'Workbook & worksheets', link: '/guide/workbook' },
      { text: 'Cells & values', link: '/guide/cells' },
      { text: 'Formulas', link: '/guide/formulas' },
      { text: 'Styling & number formats', link: '/guide/styling' },
      { text: 'Structure', link: '/guide/structure' },
      { text: 'Undo & redo', link: '/guide/undo' },
      { text: 'Events', link: '/guide/events' },
    ],
  },
  {
    text: 'Interactions',
    items: [
      { text: 'Selection & keyboard', link: '/guide/selection' },
      { text: 'Editing cells', link: '/guide/editing' },
      { text: 'Clipboard', link: '/guide/clipboard' },
      { text: 'Fill & series', link: '/guide/fill' },
    ],
  },
  {
    text: 'Data features',
    items: [
      { text: 'Sorting, filtering & search', link: '/guide/data' },
      { text: 'Validation', link: '/guide/validation' },
      { text: 'Tables & defined names', link: '/guide/tables' },
    ],
  },
  {
    text: 'Rich content',
    items: [
      { text: 'Charts', link: '/guide/charts' },
      { text: 'Pivot tables', link: '/guide/pivot' },
      { text: 'Images & shapes', link: '/guide/media' },
      { text: 'Printing & PDF', link: '/guide/printing' },
    ],
  },
  {
    text: 'Extending',
    items: [
      { text: 'Plugins', link: '/guide/plugins' },
      { text: 'Theming', link: '/guide/theming' },
    ],
  },
  {
    text: 'Going further',
    items: [
      { text: 'Persistence', link: '/guide/persistence' },
      { text: 'Import & export', link: '/guide/import-export' },
      { text: 'Accessibility', link: '/guide/accessibility' },
      { text: 'Performance', link: '/guide/performance' },
    ],
  },
];

const integrationsSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Integrations',
    items: [
      { text: 'React', link: '/integrations/react' },
      { text: 'Vue 3', link: '/integrations/vue' },
      { text: 'Angular', link: '/integrations/angular' },
      { text: 'Web component', link: '/integrations/web-component' },
      { text: 'Standalone browser script', link: '/integrations/browser' },
    ],
  },
];

const apiSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'API reference',
    items: [
      { text: 'Ezygrid', link: '/api/ezygrid' },
      { text: 'Workbook', link: '/api/workbook' },
      { text: 'Worksheet', link: '/api/worksheet' },
      { text: 'GridRenderer', link: '/api/renderer' },
    ],
  },
  {
    text: 'Support packages',
    items: [
      { text: '@ezygrid/model', link: '/api/model' },
      { text: '@ezygrid/formula', link: '/api/formula' },
      { text: 'Utilities', link: '/api/utilities' },
    ],
  },
];

// Sidebar context for standalone pages (walkthrough, examples gallery,
// and the /plugins compatibility redirect).
const standaloneSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Getting started',
    items: [
      { text: 'Introduction', link: '/guide/introduction' },
      { text: 'Installation', link: '/guide/installation' },
      { text: 'Walkthrough', link: '/getting-started' },
    ],
  },
  {
    text: 'Resources',
    items: [{ text: 'Examples', link: '/examples' }],
  },
];

export const sidebar: DefaultTheme.Sidebar = {
  '/guide/': guideSidebar,
  '/integrations/': integrationsSidebar,
  '/api/': apiSidebar,
  '/getting-started': standaloneSidebar,
  '/examples': standaloneSidebar,
  '/plugins': standaloneSidebar,
};
