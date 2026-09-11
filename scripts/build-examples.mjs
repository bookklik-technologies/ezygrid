import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const esbuildBin = path.join(root, 'node_modules', '.pnpm', 'esbuild@0.21.5', 'node_modules', 'esbuild', 'bin', 'esbuild');

const aliases = [
  '--alias:@ezygrid/model=./packages/model/src/index.ts',
  '--alias:@ezygrid/formula=./packages/formula/src/index.ts',
  '--alias:@ezygrid/csv=./packages/csv/src/index.ts',
  '--alias:@ezygrid/core=./packages/core/src/index.ts',
  '--alias:@ezygrid/react=./packages/react/src/index.tsx',
];

const targets = [
  { entry: 'examples/src/basic.ts', outfile: 'examples/basic.bundle.js' },
  { entry: 'examples/src/full.ts', outfile: 'examples/full.bundle.js' },
  { entry: 'examples/src/react.tsx', outfile: 'examples/react.bundle.js' },
];

for (const target of targets) {
  execFileSync(
    process.execPath,
    [
      esbuildBin,
      path.join(root, target.entry),
      '--bundle',
      '--format=iife',
      '--platform=browser',
      `--outfile=${path.join(root, target.outfile)}`,
      ...aliases,
    ],
    { stdio: 'inherit', cwd: root },
  );
}

console.log('examples built');
