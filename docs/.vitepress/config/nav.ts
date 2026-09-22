import type { DefaultTheme } from 'vitepress';

// Shared navigation order: Guide → API reference → project-specific sections → Resources.
export const nav: DefaultTheme.NavItem[] = [
  { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
  { text: 'API reference', link: '/api/ezygrid', activeMatch: '/api/' },
  { text: 'Integrations', link: '/integrations/react', activeMatch: '/integrations/' },
  { text: 'Examples', link: '/examples', activeMatch: '/examples' },
  {
    text: 'Resources',
    items: [
      { text: 'Development skills', link: '/guide/development-skills' },
      {
        text: 'Changelog (GitHub)',
        link: 'https://github.com/bookklik-technologies/ezygrid/releases',
      },
    ],
  },
];
