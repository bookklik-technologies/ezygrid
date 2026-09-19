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

## Suite topbar contract

The `suite-topbar` helper/styles in this repository implement the shared Ezy suite topbar contract. Keep the implementation and this contract aligned across Ezygrid, Ezynota, and Ezyreka. Each library builds independently; no sibling repository is a runtime dependency.

### Layout

Brand, editable title, flexible space, history, specialist tools, view controls, More, file actions, Export. Actions align right. Omit unsupported capabilities. Keep logos, app accents, file semantics, and existing shortcuts.

56px border-box height; 12px horizontal padding; 28px logos; 36px controls; 18px icons with 1.8px strokes; 6px control radii; 8px between action groups; 2px inside groups. Outfit: 15px/700 brand, 14px/600 title, 14px/500 actions, 14px/600 Export. Title basis 190px, compact 110px, minimum 40px.

Shared light neutrals: surface #ffffff, text #1e2130, border #e4e4ea, hover #f0f0f3. Dark: #191d27, #e5e7eb, #343b49, #292f3c. Focus uses the app accent. Disabled actions use 40% opacity. Export retains the app color and appropriate foreground.

### Container behavior

Observe the editor container, not the viewport. Below 1100px move specialist controls to More. Below 800px hide brand text, reduce the title, and move view/file controls to More. Below 480px move history to More and show icon-only Export. Move actual controls, retaining handlers, state, and accessible names. Keep Ezyreka's 720px editor minimum. More is hidden when it has no actions.

### Interaction and ownership

Use folder-open for Open/Import and save for Save/Backup with precise accessible labels. Ezynota means Import file and Download workspace backup. Canvas fit uses a distinct frame icon, never fullscreen. Menus support arrows, Home/End, Escape, outside dismissal, focus return and viewport clamping. Top-layer popovers avoid clipping in embedded editors. Clean up observers and document listeners on destroy.

Scope styling beneath the editor root and suite topbar classes. Preserve public APIs, document formats, content layout, and independently maintained branding.

### Validation

Check light/dark, long names, disabled history, resize thresholds, embedded containers, and Ezynota/Ezyreka on one page. Verify existing actions manually and run builds/static checks. Ask before running unit tests.

## Examples standard

The `examples/` folder follows the shared Ezy examples standard:

- One self-contained HTML file per concept: `declarative.html` (zero-JS embed via data-attributes), `programmatic.html` (constructor via the local bundle), `events.html` (core lifecycle/data events), and `advanced.html` (one library-specific showcase — for Ezygrid: toolbar, validation, conditional formats, CSV export).
- `examples/README.md` lists the four examples and the build command. No `index.html`, no shared CSS/JS, no gallery chrome, no framework bundles (framework integrations are documented under `docs/` instead).
- Per-file rules: identical skeleton (`<!doctype html>`, `lang="en"`, charset, viewport, title `<Library> - <Feature>`); inline `<style>` limited to host sizing; host `<div id="app">` or attribute-marked host; local build loaded via relative path at the end of `<body>`; inline `<script>` using only the public API (2-space indent, semicolons); `window.editor = editor` debug export in programmatic examples; at most one or two clarifying comments.
- Keep examples minimal: one library feature per file. Do not reintroduce shared demo helpers, copy buttons or a landing page.

## Page templates

- Home page: frontmatter `layout: home` and `titleTemplate: false`; hero actions in order **Get started → API reference → View on GitHub**; the six existing feature cards.
- Guide pages: H1 title, short intro, runnable examples, cross-links to related API pages.
- API pages: member/signature reference grouped by area, with short intro up top.
