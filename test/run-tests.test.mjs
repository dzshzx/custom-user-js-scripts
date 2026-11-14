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
// nodeOptions, when given, replaces the inherited NODE_OPTIONS.
async function runSuite(files, nodeOptions) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'run-tests-'));
  workspaces.push(workspace);
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(workspace, name), content)));
  // NODE_TEST_CONTEXT marks a node:test child process; the nested runner must report as a top-level run.
  const { NODE_TEST_CONTEXT: _context, NODE_OPTIONS: inherited, ...env } = process.env;
  const options = nodeOptions ?? inherited;
  if (options !== undefined) env.NODE_OPTIONS = options;
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

// The test file passes only when NODE_OPTIONS holds the JSX loader exactly once
// and keeps the expected other options.
const loaderSuite = (otherOptions) => ({
  'loader.test.mjs': `import test from 'node:test';
import assert from 'node:assert/strict';
test('loader', () => {
  const options = (process.env.NODE_OPTIONS || '').split(' ').filter(Boolean);
  const loader = options.filter((option) => option.startsWith('--import=') && option.endsWith('/scripts/jsx-loader.mjs'));
  assert.equal(loader.length, 1, process.env.NODE_OPTIONS);
  assert.deepEqual(options.filter((option) => !loader.includes(option)), ${JSON.stringify(otherOptions)});
});
`,
});

test('full test entry adds the JSX loader to the NODE_OPTIONS test files inherit', async () => {
  for (const [nodeOptions, otherOptions] of [
    ['', []],
    ['--no-warnings', ['--no-warnings']],
  ]) {
    const result = await runSuite(loaderSuite(otherOptions), nodeOptions);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('full test entry does not add the JSX loader twice', async () => {
  const loaderFlag = `--import=${new URL('../scripts/jsx-loader.mjs', import.meta.url).href}`;
  const result = await runSuite(loaderSuite(['--no-warnings']), `--no-warnings ${loaderFlag}`);
  assert.equal(result.status, 0, result.stderr);
});
