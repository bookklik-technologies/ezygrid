# AGENTS.md — Ezygrid documentation standard

Guidance for contributors and coding agents working on this repository's documentation (`docs/`).

## Build and validation

- Build the docs with `pnpm docs:build`. Dead-link checking stays enabled; fix broken links instead of suppressing them.
- Do not run unit tests without asking first.

## Formatting conventions

- One H1 per page, followed by a short introduction paragraph. Sections use H2/H3 only.
- Tag every code fence with a language (`ts`, `js`, `tsx`, `vue`, `html`, `bash`, `text`, …).
- Use standard GFM tables and lists; keep table pipes aligned per column, not padded.
- Use VitePress containers (`::: tip`, `::: warning`, `::: details`) for callouts.
- Sentence case for headings, nav labels, and sidebar labels.
- Preserve existing heading anchors. If a heading must change, keep an explicit legacy anchor so inbound links do not break.
- Usage-first organization for guides; signatures/options/member references for API pages.

## Navigation and structure

- Top navigation order: **Guide → API reference → project-specific sections (Integrations, Examples) → Resources**.
- Guide sidebar begins with **Getting started**, followed by the existing topic groups in learning order.
- Standalone pages (walkthrough, examples gallery, compatibility redirects) must have sidebar context.
- Configuration layout: `docs/.vitepress/config/nav.ts` (navigation), `docs/.vitepress/config/sidebar.ts` (sidebar), `docs/.vitepress/config/shared.ts` (common presentation settings), `docs/.vitepress/config.mts` (site config).
- Common presentation settings (outline 2–3 "On this page", local search labels, "Previous page"/"Next page" footer, "Last updated", edit links) match the other Ezy project docs sites — update all three repos together when they change.

## Branding boundaries

- Ezygrid brand styles (mint `#00FF99` / blue `#2563EB` palette, gradients, button colors) live only in `docs/.vitepress/theme/custom.css`. The official brand assets are `logo.svg` (navbar + home hero) and `icon.svg` (favicon), copied from the repository root into `docs/public/` and referenced as `/ezygrid/logo.svg` and `/ezygrid/icon.svg`.
- Never alter palette values, brand assets, or the deployment base path (`/ezygrid/`) during standardization. Favicon and logo links must resolve beneath the base path.

## Page templates

- Home page: frontmatter `layout: home` and `titleTemplate: false`; hero actions in order **Get started → API reference → View on GitHub**; the six existing feature cards.
- Guide pages: H1 title, short intro, runnable examples, cross-links to related API pages.
- API pages: member/signature reference grouped by area, with short intro up top.
