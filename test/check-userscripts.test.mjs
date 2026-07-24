import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const lintScript = path.join(repoRoot, 'scripts/check-userscripts.mjs');

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
  const srcDir = path.join(workspace, 'src');
  await mkdir(srcDir);

  await Promise.all(Object.entries(files).map(([name, content]) => (
    writeFile(path.join(srcDir, name), content, 'utf8')
  )));

  if (Object.keys(distFiles).length) {
    const distDir = path.join(workspace, 'dist');
    await mkdir(distDir);
    await Promise.all(Object.entries(distFiles).map(([name, content]) => (
      writeFile(path.join(distDir, name), content, 'utf8')
    )));
  }

  return workspace;
}

function runLint(workspace) {
  return spawnSync(process.execPath, [lintScript], { cwd: workspace, encoding: 'utf8' });
}

function bridgePair(name) {
  const downloadURL = `https://raw.githubusercontent.com/example/repo/master/dist/${name}.user.js`;
  const metadata = userscriptMetadata({ name, downloadURL, updateURL: downloadURL });
  return { bridge: metadata, dist: `${metadata}\n// bundled body sentinel\n` };
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

test('check-userscripts accepts a bridge/dist pair sharing identity and URLs', async () => {
  const { bridge, dist } = bridgePair('paired');
  const workspace = await createWorkspace(
    { 'paired.user.js': bridge },
    { 'paired.user.js': dist },
  );

  const result = runLint(workspace);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked/);
});

test('check-userscripts rejects a bridge whose metadata differs from its dist file', async () => {
  const { bridge, dist } = bridgePair('paired');
  const workspace = await createWorkspace(
    { 'paired.user.js': bridge.replace('0.1.0', '0.1.1') },
    { 'paired.user.js': dist },
  );

  const result = runLint(workspace);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /bridge metadata does not match/);
});

test('check-userscripts rejects a dist file without a bridge stub', async () => {
  const { dist } = bridgePair('orphan-dist');
  const workspace = await createWorkspace(
    {},
    { 'orphan-dist.user.js': dist },
  );

  const result = runLint(workspace);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing bridge/);
});

test('check-userscripts rejects a bridge whose dist counterpart is missing', async () => {
  const { bridge } = bridgePair('lonely-bridge');
  const workspace = await createWorkspace({ 'lonely-bridge.user.js': bridge });

  const result = runLint(workspace);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /dist counterpart .* is missing/);
});
