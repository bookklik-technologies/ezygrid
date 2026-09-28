/**
 * Builds the publishable root package dist/ for @bookklik/ezygrid
 * (mirroring the @bookklik/ezyreka layout):
 *
 * - dist/ezygrid.esm.js   ESM bundle (no side effects, for bundlers)
 * - dist/ezygrid.cjs      CommonJS bundle (no side effects)
 * - dist/ezygrid.umd.js   IIFE bundle exposing the `Ezygrid` global,
 *                         with declarative `data-ezg-editor` auto-init
 * - dist/index.d.ts       self-contained type declarations (the
 *                         @ezygrid/* workspace packages are not published)
 * - dist/browser.d.ts     types for the ./browser export
 * - dist/browser/         the classic browser loader (copied from the
 *                         core package build)
 * - dist/themes/*.css     the official theme stylesheets
 *
 * Run after `pnpm build` has produced the workspace package dists
 * (the root `build` script chains both).
 */
import { build } from 'esbuild';
import { generateDtsBundle } from 'dts-bundle-generator';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const src = (relative) => path.join(root, 'packages/core/src', relative);

/** Resolve @ezygrid/* workspace imports directly from package sources. */
const workspacePlugin = {
  name: 'ezygrid-workspace',
  setup(config) {
    config.onResolve({ filter: /^@ezygrid\/(core|model|formula|csv)$/ }, (args) => ({
      path: path.join(root, 'packages', args.path.slice('@ezygrid/'.length), 'src', 'index.ts'),
    }));
  },
};

const shared = {
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'es2020',
  logLevel: 'info',
  plugins: [workspacePlugin],
};

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function bundle(outfile, entry, extra = {}) {
  const result = await build({
    ...shared,
    entryPoints: [entry],
    outfile,
    ...extra,
  });
  const raw = readFileSync(outfile);
  const gzip = gzipSync(raw).length;
  console.log(`${path.relative(root, outfile)}: ${kb(raw.length)} raw, ${kb(gzip)} gzip`);
  return result;
}

mkdirSync(dist, { recursive: true });

// ESM + CJS from the plain library entry (no auto-init side effects).
await bundle(path.join(dist, 'ezygrid.esm.js'), src('index.ts'), { format: 'esm' });
await bundle(path.join(dist, 'ezygrid.cjs'), src('index.ts'), { format: 'cjs' });

// IIFE for <script> tags: auto-mounts [data-ezg-editor] hosts like the
// browser loader does. The entry exports the Ezygrid class as its default,
// and the footer unwraps it so the global `Ezygrid` is the class itself
// (new Ezygrid(...), Ezygrid.initAll(), Ezygrid.getInstance(...)).
await bundle(path.join(dist, 'ezygrid.umd.js'), path.join(root, 'scripts/umd-entry.ts'), {
  format: 'iife',
  globalName: 'Ezygrid',
  footer: { js: 'Ezygrid = Ezygrid.default;' },
});

// Self-contained declarations: @ezygrid/* is not published on npm, so the
// workspace package types must be inlined into one file.
const [mainTypes, browserTypes] = generateDtsBundle(
  [
    {
      filePath: src('index.ts'),
      libraries: { inlinedLibraries: ['@ezygrid/model', '@ezygrid/formula', '@ezygrid/csv'] },
      output: { noBanner: true },
    },
    {
      filePath: src('browser.ts'),
      output: { noBanner: true },
    },
  ],
  { preferredConfigPath: path.join(root, 'packages/core/tsconfig.json') }
);
writeFileSync(path.join(dist, 'index.d.ts'), mainTypes);
writeFileSync(path.join(dist, 'browser.d.ts'), browserTypes);

// Classic loader (multi-file, resolves modules relative to itself).
cpSync(path.join(root, 'packages/core/dist/browser'), path.join(dist, 'browser'), { recursive: true });

// Official themes.
mkdirSync(path.join(dist, 'themes'), { recursive: true });
cpSync(path.join(root, 'packages/theme-default/index.css'), path.join(dist, 'themes', 'default.css'));
cpSync(path.join(root, 'packages/theme-dark/index.css'), path.join(dist, 'themes', 'dark.css'));

console.log('Root dist written to dist/');
