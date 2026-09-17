# Standalone browser script

The browser distribution lets you use Ezygrid with **no bundler, no import map, and no npm install** — a script tag plus static files.

## Setup

1. Build the distribution in the repository: `pnpm build` (or `pnpm examples:build`).
2. Copy the **entire** `packages/core/dist/browser/` directory to your static assets, preserving layout (e.g. to `/ezygrid/`).

```html
<div id="editor" style="height: 460px"></div>
<script src="/ezygrid/ezygrid.js"></script>
<script>
  Ezygrid.ready.then(() => {
    const editor = new Ezygrid({ target: '#editor' });
  }).catch(console.error);
</script>
```

## How it works

- The loader exposes `window.Ezygrid` immediately and loads its dependency files **relative to its own URL**.
- `Ezygrid.ready` resolves with the constructor after files and DOM are ready and declarative startup has completed.
- Construction before readiness throws a descriptive error — always wait for `ready`.
- Failed file requests or module initialization **reject** the promise; handle the rejection.
- Repeated loader tags reuse the same constructor and readiness promise (no double-loading).
- Declarative hosts (`<div data-ezg-editor>`) are initialized automatically during startup.

## TypeScript

```ts
/// <reference types="@ezygrid/core/browser" />
// or add "@ezygrid/core/browser" to compilerOptions.types
```

## Notes

- There is no consumer bundling step, import map, runtime package manager, or CDN dependency.
- `@ezygrid/core/browser` exports typings for the browser global and its readiness promise.
- Use either the script loader **or** package imports on a page — not both — to keep one instance registry.
