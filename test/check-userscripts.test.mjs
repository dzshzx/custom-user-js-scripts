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

async function createWorkspace(files) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'check-userscripts-'));
  const srcDir = path.join(workspace, 'src');
  await mkdir(srcDir);

  await Promise.all(Object.entries(files).map(([name, content]) => (
    writeFile(path.join(srcDir, name), content, 'utf8')
  )));

  return workspace;
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
