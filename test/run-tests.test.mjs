import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const runnerScript = path.join(repoRoot, 'scripts/run-tests.mjs');
const workspaces = [];
after(() => Promise.all(workspaces.map((workspace) => rm(workspace, { recursive: true, force: true }))));

// Runs the full test entry in a directory holding only the given test files.
async function runSuite(files) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'run-tests-'));
  workspaces.push(workspace);
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(workspace, name), content)));
  // NODE_TEST_CONTEXT marks a node:test child process; the nested runner must report as a top-level run.
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  return spawnSync(process.execPath, [runnerScript], { cwd: workspace, encoding: 'utf8', env });
}

test('full test entry counts every result and reports each non-passing one with its reason', async () => {
  const result = await runSuite({
    'mixed.test.mjs': `import test from 'node:test';
test('passes', () => {});
test('fails', () => { throw new Error('boom'); });
test('skipped', { skip: 'not here' }, () => {});
test('pending', { todo: 'later' }, () => {});
`,
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)), { pass: 1, fail: 1, skip: 1, todo: 1 });
  const reported = result.stderr
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(reported, [
    { file: 'mixed.test.mjs', name: 'fails', status: 'fail', reason: 'boom' },
    { file: 'mixed.test.mjs', name: 'pending', status: 'todo', reason: 'later' },
    { file: 'mixed.test.mjs', name: 'skipped', status: 'skip', reason: 'not here' },
  ]);
});

test('full test entry passes when every result passes', async () => {
  const result = await runSuite({ 'ok.test.mjs': `import test from 'node:test';\ntest('passes', () => {});\n` });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { pass: 1, fail: 0, skip: 0, todo: 0 });
});
