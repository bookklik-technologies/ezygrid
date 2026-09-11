import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await import('./build-browser.mjs');

const alias = {
  '@ezygrid/model': './packages/model/src/index.ts',
  '@ezygrid/formula': './packages/formula/src/index.ts',
  '@ezygrid/csv': './packages/csv/src/index.ts',
  '@ezygrid/core': './packages/core/src/index.ts',
  '@ezygrid/react': './packages/react/src/index.tsx',
};

const targets = [
  { entry: 'examples/src/react.tsx', outfile: 'examples/react.bundle.js' },
];

for (const target of targets) {
  await build({
    absWorkingDir: root,
    entryPoints: [target.entry],
    outfile: target.outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    alias,
    logLevel: 'info',
  });
}

console.log('examples built');
