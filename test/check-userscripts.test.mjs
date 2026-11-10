import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const lintScript = path.join(repoRoot, 'scripts/check-userscripts.mjs');
const workspaces = [];
after(() => Promise.all(workspaces.map((workspace) => rm(workspace, { recursive: true, force: true }))));

function userscriptMetadata({ name, downloadURL, updateURL }) {
  return `// ==UserScript==
// @name         ${name}
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.1.0
// @description  Test script
// @match        https://example.com/*
${downloadURL ? `// @downloadURL  ${downloadURL}\n` : ''}${updateURL ? `// @updateURL    ${updateURL}\n` : ''}// ==/UserScript==

(function () {
  'use strict';
})();
`;
}

async function createWorkspace(files, distFiles = {}) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'check-userscripts-'));
  workspaces.push(workspace);
  const srcDir = path.join(workspace, 'src');
  await mkdir(srcDir);

  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      await mkdir(path.dirname(path.join(srcDir, name)), { recursive: true });
      await writeFile(path.join(srcDir, name), content, 'utf8');
    }),
  );

  if (Object.keys(distFiles).length) {
    const distDir = path.join(workspace, 'dist');
    await mkdir(distDir);
    await Promise.all(
      Object.entries(distFiles).map(([name, content]) => writeFile(path.join(distDir, name), content, 'utf8')),
    );
  }

  return workspace;
}

function runLint(workspace) {
  return spawnSync(process.execPath, [lintScript], { cwd: workspace, encoding: 'utf8' });
}

function selfHosted(name, extra = {}) {
  const url = `https://raw.githubusercontent.com/example/repo/master/src/${name}.user.js`;
  return userscriptMetadata({ name, downloadURL: url, updateURL: url, ...extra });
}

function bundled(name) {
  const downloadURL = `https://raw.githubusercontent.com/example/repo/master/dist/${name}.user.js`;
  const metadata = userscriptMetadata({ name, downloadURL, updateURL: downloadURL });
  return {
    entry: { path: `userscripts/${name}/${name}.entry.ts`, content: metadata },
    dist: `${metadata}\n// bundled body sentinel\n`,
  };
}

test('check-userscripts rejects duplicate userscript install identities', async () => {
  const workspace = await createWorkspace({
    'one.user.js': userscriptMetadata({ name: 'Duplicate Script' }),
    'two.user.js': userscriptMetadata({ name: 'Duplicate Script' }),
  });

  const result = spawnSync(process.execPath, [lintScript], {
    cwd: workspace,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate userscript install identity/);
});

test('check-userscripts rejects duplicate update URLs', async () => {
  const updateURL = 'https://raw.githubusercontent.com/example/repo/master/src/script.user.js';
  const workspace = await createWorkspace({
    'one.user.js': userscriptMetadata({ name: 'One', updateURL }),
    'two.user.js': userscriptMetadata({ name: 'Two', updateURL }),
  });

  const result = spawnSync(process.execPath, [lintScript], {
    cwd: workspace,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate @updateURL value/);
});

test('check-userscripts accepts an entry with its dist bundle', async () => {
  const { entry, dist } = bundled('paired');
  const workspace = await createWorkspace({ [entry.path]: entry.content }, { 'paired.user.js': dist });

  const result = runLint(workspace);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked/);
});

test('check-userscripts rejects an entry whose install URLs do not point at its own dist bundle', async () => {
  const { entry, dist } = bundled('paired');
  const elsewhere = (content) => content.replaceAll('/dist/paired.user.js', '/dist/other.user.js');
  const workspace = await createWorkspace(
    { [entry.path]: elsewhere(entry.content) },
    { 'paired.user.js': elsewhere(dist) },
  );

  const result = runLint(workspace);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must end with \/dist\/paired\.user\.js/);
});

test('check-userscripts rejects an entry whose dist bundle is missing', async () => {
  const { entry } = bundled('lonely');
  const workspace = await createWorkspace({ [entry.path]: entry.content });

  const result = runLint(workspace);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing dist bundle dist\/lonely\.user\.js/);
});

test('check-userscripts rejects a dist file without a source entry', async () => {
  const { dist } = bundled('orphan-dist');
  const workspace = await createWorkspace({}, { 'orphan-dist.user.js': dist });

  const result = runLint(workspace);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /orphan installable without a source entry owner/);
});

test('check-userscripts rejects a single-file script without self-pointing install URLs', async () => {
  const workspace = await createWorkspace({
    'plain.user.js': userscriptMetadata({ name: 'Plain Script' }),
  });
  const result = runLint(workspace);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /missing @downloadURL\/@updateURL/);
});

test('check-userscripts rejects a single-file script whose install URLs do not point at its own path', async () => {
  const wrong = 'https://raw.githubusercontent.com/example/repo/master/src/other.user.js';
  const workspace = await createWorkspace({
    'plain.user.js': userscriptMetadata({ name: 'Plain Script', downloadURL: wrong, updateURL: wrong }),
  });
  const result = runLint(workspace);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /must end with \/src\/plain\.user\.js/);
});

test('check-userscripts rejects a single-file script whose @downloadURL and @updateURL differ', async () => {
  const workspace = await createWorkspace({
    'plain.user.js': selfHosted('plain', {
      updateURL: 'https://mirror.example.invalid/example/repo/master/src/plain.user.js',
    }),
  });
  const result = runLint(workspace);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /@downloadURL and @updateURL differ/);
});

test('check-userscripts accepts a single-file script with self-pointing install URLs', async () => {
  const workspace = await createWorkspace({
    'plain.user.js': selfHosted('plain'),
  });
  const result = runLint(workspace);
  assert.equal(result.status, 0, result.stderr + result.stdout);
});
