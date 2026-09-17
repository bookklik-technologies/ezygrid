import { defineConfig } from 'vitepress';
import { nav } from './config/nav';
import { sidebar } from './config/sidebar';
import { editLinkConfig, sharedThemeConfig } from './config/shared';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'en-US',
  title: 'Ezygrid',
  titleTemplate: false,
  description:
    'Framework-agnostic JavaScript/TypeScript spreadsheet and data-grid library with an Excel-compatible formula engine.',
  base: '/ezygrid/',
  head: [
    ['meta', { name: 'theme-color', content: '#00ff99' }],
    // Resolve beneath the deployment base path.
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/ezygrid/icon.svg' }],
  ],
  cleanUrls: true,
  lastUpdated: true,

  // https://vitepress.dev/reference/default-theme-config
  themeConfig: {
    siteTitle: 'Ezygrid',
    logo: '/logo.svg',
    nav,
    sidebar,
    socialLinks: [
      { icon: 'github', link: 'https://github.com/bookklik-technologies/ezygrid' },
    ],
    editLink: editLinkConfig('ezygrid'),
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Bookklik Technologies',
    },
    ...sharedThemeConfig,
  },
  markdown: {
    lineNumbers: false,
  },
});
