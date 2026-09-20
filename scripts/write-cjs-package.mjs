/**
 * Marks a CommonJS output directory as CommonJS so Node resolves it under
 * a parent package with "type": "module". Called from package build scripts:
 *   node ../../scripts/write-cjs-package.mjs dist/cjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'dist/cjs');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  `${outDir}/package.json`,
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
);
