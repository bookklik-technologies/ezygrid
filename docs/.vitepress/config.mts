import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'en-US',
  title: 'Ezygrid',
  titleTemplate: '%s · Ezygrid',
  description:
    'Framework-agnostic JavaScript/TypeScript spreadsheet and data-grid library with an Excel-compatible formula engine.',
  base: '/ezygrid/',
  head: [
    ['meta', { name: 'theme-color', content: '#00ff99' }],
  ],
  cleanUrls: true,

  // https://vitepress.dev/reference/default-theme-config
  themeConfig: {
    siteTitle: 'Ezygrid',
    nav: [
      { text: 'Guide', link: '/guide/workbook', activeMatch: '/guide/' },
      { text: 'API', link: '/api/ezygrid', activeMatch: '/api/' },
      { text: 'Integrations', link: '/integrations/react', activeMatch: '/integrations/' },
      { text: 'Examples', link: '/examples' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/installation' },
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
      ],
      '/integrations/': [
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
      ],
      '/api/': [
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
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/bookklik-technologies/ezygrid' },
    ],
    outline: {
      label: 'On this page',
      level: [2, 3],
    },
    editLink: {
      pattern: 'https://github.com/bookklik-technologies/ezygrid/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Bookklik Technologies',
    },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Search docs', buttonAriaLabel: 'Search docs' },
        },
      },
    },
    docFooter: {
      prev: 'Previous page',
      next: 'Next page',
    },
  },
  markdown: {
    lineNumbers: false,
  },
});
