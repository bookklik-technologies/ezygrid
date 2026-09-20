/**
 * Verifies every publishable workspace package packs a valid tarball:
 * - `files` must include the package `main`/`exports` targets.
 * - `src/`, `tests/`, tsconfig files must not ship.
 *
 * Run after `pnpm build` (dist must exist), e.g. in CI:
 *   node scripts/check-pack.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const packagesDir = 'packages';
let failures = 0;

function exportedTargets(pkg) {
  const targets = [];
  const collect = (value) => {
    if (typeof value === 'string') {
      if (value.endsWith('.js') || value.endsWith('.css')) targets.push(value);
    } else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) collect(child);
    }
  };
  if (pkg.main) targets.push(pkg.main);
  if (pkg.exports) collect(pkg.exports);
  return targets;
}

for (const name of readdirSync(packagesDir)) {
  const dir = join(packagesDir, name);
  const pkgFile = join(dir, 'package.json');
  if (!existsSync(pkgFile)) continue;
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  if (pkg.private) continue;

  const json = execSync('npm pack --dry-run --json', { cwd: dir, encoding: 'utf8' });
  const packed = JSON.parse(json)[0];
  const paths = new Set(packed.files.map((f) => f.path.replace(/\\/g, '/')));

  const problems = [];
  for (const target of exportedTargets(pkg)) {
    const rel = target.replace(/^\.\//, '');
    if (rel.includes('*')) {
      // Wildcard subpath: verify the literal prefix directory ships files.
      const prefix = rel.slice(0, rel.indexOf('*'));
      if (![...paths].some((file) => file.startsWith(prefix))) {
        problems.push(`no tarball files match exported pattern: ${rel}`);
      }
      continue;
    }
    if (!paths.has(rel)) problems.push(`missing exported target in tarball: ${rel}`);
  }
  for (const file of paths) {
    if (/^(src|tests)\//.test(file) || file.startsWith('tsconfig')) {
      problems.push(`internal file shipped: ${file}`);
    }
  }
  if (problems.length === 0) {
    console.log(`${pkg.name}: ok (${packed.files.length} files)`);
  } else {
    failures++;
    console.error(`${pkg.name}: FAILED`);
    for (const problem of problems) console.error(`  - ${problem}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} package(s) would publish a broken tarball.`);
  process.exit(1);
}
console.log('\nAll publishable packages pack cleanly.');
