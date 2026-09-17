import type { DefaultTheme } from 'vitepress';

/**
 * Common presentation settings shared by all Ezy project documentation
 * sites. This module is local to the Ezygrid repository — there is no
 * cross-repository import or shared package.
 */
export const sharedThemeConfig: Partial<DefaultTheme.Config> = {
  outline: { level: [2, 3], label: 'On this page' },
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
  lastUpdated: {
    text: 'Last updated',
  },
};

export function editLinkConfig(repo: string): DefaultTheme.Config['editLink'] {
  return {
    pattern: `https://github.com/bookklik-technologies/${repo}/edit/main/docs/:path`,
    text: 'Edit this page on GitHub',
  };
}
