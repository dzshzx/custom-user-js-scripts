import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readUserscriptInventory } from '../scripts/lib/userscript-inventory.mjs';
import { worktreeSource, refSource } from '../scripts/lib/userscript-sources.mjs';

const entry = 'src/userscripts/demo/demo.entry.ts';
const srcScript = 'src/userscripts/demo/demo.user.js';
const dist = 'dist/demo.user.js';
const metadata = (name = 'Demo', url = 'dist/demo.user.js') => `// ==UserScript==
// @name ${name}
// @namespace https://example.test
// @version 1.2.3
// @description Fixture
// @match https://example.test/*
// @downloadURL https://example.test/${url}
// @updateURL https://example.test/${url}
// ==/UserScript==
`;
const inventory = (documents) =>
  readUserscriptInventory({ files: Object.keys(documents), readText: (file) => documents[file] });

test('inventory reads sorted normalized paths once and never executes checked text', async () => {
  const reads = [];
  const result = await readUserscriptInventory({
    files: [dist, entry.replaceAll('/', '\\'), entry, 'src/userscripts/demo/util.lib.js'],
    readText(file) {
      reads.push(file);
      return `${metadata()}throw new Error('must not execute');\n`;
    },
  });
  assert.deepEqual(reads, [dist, entry]);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].ownership, 'entry');
  assert.equal(result.records[0].identity, 'https://example.test :: Demo');
  assert.deepEqual(result.issues, []);
});

test('entry owns its dist bundle, missing before the first build and stale after an edit', async () => {
  const first = await inventory({ [entry]: metadata() });
  assert.equal(first.records.length, 1);
  assert.equal(first.records[0].dist.exists, false);
  assert.deepEqual(
    first.issues.map((issue) => issue.type),
    ['missing-dist'],
  );
  const stale = await inventory({ [entry]: metadata(), [dist]: metadata('Old') });
  assert.equal(stale.records.length, 1);
  assert.equal(stale.records[0].identity, 'https://example.test :: Demo');
  assert.deepEqual(
    stale.issues.map((issue) => issue.type),
    ['metadata-mismatch'],
  );
});

test('a src script pointing at dist owns only itself; the dist file stays an orphan', async () => {
  const result = await inventory({
    [srcScript]: metadata(),
    [dist]: metadata(),
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].ownership, 'single');
  assert.deepEqual(
    result.issues.map((issue) => issue.type),
    ['orphan-dist'],
  );
});

test('inventory identifies duplicates, path conflicts and invalid metadata', async () => {
  const result = await inventory({
    [entry]: metadata(),
    [dist]: metadata(),
    'src/userscripts/other/demo.entry.ts': metadata(),
    'src/broken.user.js': 'not metadata',
  });
  const types = new Set(result.issues.map((issue) => issue.type));
  for (const type of [
    'ownership-conflict',
    'invalid-entry-path',
    'duplicate-identity',
    'duplicate-url',
    'invalid-metadata',
  ]) {
    assert.ok(types.has(type), type);
  }
});

test('only ENOENT denotes an absent entry; permission and other read errors remain explicit', async () => {
  for (const code of ['ENOENT', 'EACCES', 'EIO']) {
    const result = await readUserscriptInventory({
      files: [entry],
      readText() {
        throw Object.assign(new Error(code), { code });
      },
    });
    assert.equal(result.files[0].exists, code !== 'ENOENT');
    assert.ok(result.issues.some((issue) => issue.type === (code === 'ENOENT' ? 'missing-file' : 'read-failed')));
  }
});

test('worktree and Git adapters preserve identical text and inventories including trailing newlines', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inventory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    [entry]: metadata(),
    [dist]: `${metadata()}\n\n`,
    'src/userscripts/example/example.user.js': metadata('Example', 'src/userscripts/example/example.user.js'),
  };
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-b', 'master');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'fixture');
  assert.deepEqual(
    await readUserscriptInventory(await worktreeSource(root)),
    await readUserscriptInventory(refSource(root, 'HEAD')),
  );
});
