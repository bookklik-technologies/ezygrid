import ts from 'typescript';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'packages/core/dist/browser');
const entries = { constructor: 'core/ezy-grid', auto: 'core/auto' };
const modules = Object.create(null);
const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  esModuleInterop: true,
};

function resolveModule(id, request) {
  const resolved = request.startsWith('.')
    ? path.posix.normalize(path.posix.join(path.posix.dirname(id), request)).replace(/\.js$/, '')
    : /^@ezygrid\/(core|model|formula|csv)$/.test(request)
      ? `${request.slice('@ezygrid/'.length)}/index`
      : undefined;
  if (!resolved || !/^(core|model|formula|csv)\/[\w/-]+$/.test(resolved)) {
    throw new Error(`Unsupported browser dependency ${JSON.stringify(request)} in ${id}`);
  }
  return resolved;
}

async function compile(id) {
  if (modules[id]) return;
  const [pkg, ...parts] = id.split('/');
  const filename = path.join(root, 'packages', pkg, 'src', `${parts.join('/')}.ts`);
  const source = await readFile(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions, fileName: filename });
  const dependencies = Object.create(null);
  const parsed = ts.createSourceFile(`${id}.js`, outputText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      const request = node.arguments[0];
      if (node.arguments.length !== 1 || !ts.isStringLiteral(request)) {
        throw new Error(`Browser modules require static dependencies: ${id}`);
      }
      dependencies[request.text] = resolveModule(id, request.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const file = `modules/${id}.js`;
  modules[id] = { file, dependencies };
  const destination = path.join(output, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination,
    `document.currentScript.__ezygridRegister(${JSON.stringify(id)}, function(require, module, exports) {\n${outputText}\n});\n`);
  for (const dependency of Object.values(dependencies)) await compile(dependency);
}

for (const id of Object.values(entries)) await compile(id);
const loaderSource = await readFile(path.join(root, 'packages/core/src/browser-loader.ts'), 'utf8');
const loader = ts.transpileModule(loaderSource, { compilerOptions }).outputText;
const manifest = { entries, modules };
await writeFile(path.join(output, 'ezygrid.js'),
  `(function() {\n"use strict";\nvar exports = {};\n${loader}\nexports.startBrowserLoader(${JSON.stringify(manifest, null, 2)});\n})();\n`);
await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Browser loader and ${Object.keys(modules).length} separate modules written to packages/core/dist/browser`);
