import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionPlanScript = path.join(projectRoot, 'scripts/version-plan.mjs');
const fixtureRoots = [];
after(() => Promise.all(fixtureRoots.map((root) => rm(root, { recursive: true, force: true }))));

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function metadata(version, name = 'Fixture') {
  return `// ==UserScript==
// @name         ${name}
// @namespace    https://example.test/userscripts
// @version      ${version}
// @description  Version plan fixture.
// @match        https://example.test/*
// @grant        none
// ==/UserScript==
`;
}

async function fixtureRepository(version = '1.2.3') {
  const root = await mkdtemp(path.join(tmpdir(), 'userscript-version-plan-'));
  fixtureRoots.push(root);
  const scriptDir = path.join(root, 'src/userscripts/fixture');
  await mkdir(scriptDir, { recursive: true });
  await writeFile(path.join(scriptDir, 'fixture.user.js'), metadata(version));
  git(root, 'init', '-b', 'master');
  git(root, 'config', 'user.name', 'Version Plan Test');
  git(root, 'config', 'user.email', 'version-plan@example.test');
  git(root, 'remote', 'add', 'origin', 'git@GitHub.com:Dzshzx/Example.git');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'published baseline');
  git(root, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
  return { root, script: path.join(scriptDir, 'fixture.user.js') };
}

function runPlan(root, ...args) {
  return spawnSync(process.execPath, [versionPlanScript, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

const fixtureNamespace = 'https://example.test/userscripts';

async function retire(root, entries) {
  await writeFile(path.join(root, 'retired-userscripts.json'), JSON.stringify({ retired: entries }, null, 2) + '\n');
}

// Baseline with two published single-file scripts: Fixture 1.2.3 and Kept 0.0.1.
async function twoScriptRepository() {
  const fixture = await fixtureRepository();
  const keptDir = path.join(fixture.root, 'src/userscripts/kept');
  await mkdir(keptDir, { recursive: true });
  await writeFile(path.join(keptDir, 'kept.user.js'), metadata('0.0.1', 'Kept'));
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'publish a second script');
  git(fixture.root, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
  return fixture;
}

// Baseline with Kept (single file) and Fixture as an entry + dist bundle at 1.2.3.
async function bundledRepository() {
  const fixture = await twoScriptRepository();
  const entry = path.join(fixture.root, 'src/userscripts/fixture/fixture.entry.ts');
  const dist = path.join(fixture.root, 'dist/fixture.user.js');
  await mkdir(path.dirname(dist), { recursive: true });
  await rm(fixture.script);
  await writeFile(entry, metadata('1.2.3'));
  await writeFile(dist, metadata('1.2.3'));
  git(fixture.root, 'add', '-A');
  git(fixture.root, 'commit', '-m', 'publish bundled shape');
  git(fixture.root, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
  return { ...fixture, entry, dist };
}

function commitAll(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-m', message);
}

async function commitVersion(fixture, version, ...messageArgs) {
  await writeFile(fixture.script, metadata(version));
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', `set ${version}`, ...messageArgs);
}

test('an exact next patch passes', async () => {
  const fixture = await fixtureRepository();
  await commitVersion(fixture, '1.2.4');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD', '--json');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout).transitions.map(({ kind }) => kind),
    ['patch'],
  );
});

test('plan proposes a target without editing files and actual metadata reproduces it', async () => {
  const fixture = await fixtureRepository();
  const identity = 'https://example.test/userscripts :: Fixture';
  const before = await readFile(fixture.script, 'utf8');
  const proposed = runPlan(fixture.root, 'plan', '--target', `${identity}=1.3.0`, '--json');
  assert.equal(proposed.status, 0, proposed.stderr);
  const proposal = JSON.parse(proposed.stdout);
  assert.deepEqual(
    proposal.transitions.map(({ kind }) => kind),
    ['minor'],
  );
  assert.equal(await readFile(fixture.script, 'utf8'), before);

  await commitVersion(fixture, '1.3.0');
  const actual = runPlan(fixture.root, 'plan', '--target-ref', 'HEAD', '--json');
  assert.equal(actual.status, 0, actual.stderr);
  assert.deepEqual(JSON.parse(actual.stdout), proposal);

  const unknown = runPlan(fixture.root, 'plan', '--target', 'unknown=1.3.0');
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown install identity/);
  const duplicate = runPlan(fixture.root, 'plan', '--target', `${identity}=1.3.0`, '--target', `${identity}=1.4.0`);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /duplicate --target/);
  const executionOverride = runPlan(fixture.root, 'check', '--target-ref', 'HEAD', '--target', `${identity}=1.3.0`);
  assert.equal(executionOverride.status, 1);
  assert.match(executionOverride.stderr, /does not accept --target overrides/);
});

test('check --help does not require a target ref', () => {
  const result = runPlan(projectRoot, 'check', '--help');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /check \[--base-ref REF\]/);
});

test('version comparison rejects integers that would lose precision', async () => {
  const fixture = await fixtureRepository('1.2.9007199254740993');
  const proposed = runPlan(
    fixture.root,
    'plan',
    '--target',
    'https://example.test/userscripts :: Fixture=1.2.9007199254740992',
  );
  assert.equal(proposed.status, 1);
  assert.match(proposed.stderr, /non-SemVer @version "1\.2\.9007199254740993"/);
  assert.match(proposed.stderr, /non-SemVer @version "1\.2\.9007199254740992"/);
});

test('minor, major, and skipped-patch transitions pass without approval', async () => {
  for (const [target, kind] of [
    ['1.3.0', 'minor'],
    ['2.0.0', 'major'],
    ['1.2.5', 'patch'],
  ]) {
    const fixture = await fixtureRepository();
    await commitVersion(fixture, target);
    const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD', '--json');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      JSON.parse(result.stdout).transitions.map((transition) => transition.kind),
      [kind],
    );
  }
});

test('first release, unregistered removal, and downgrade are rejected', async () => {
  const firstRelease = await fixtureRepository();
  const newDir = path.join(firstRelease.root, 'src/userscripts/new-script');
  await mkdir(newDir, { recursive: true });
  await writeFile(path.join(newDir, 'new-script.user.js'), metadata('0.0.1', 'New Script'));
  git(firstRelease.root, 'add', '.');
  git(firstRelease.root, 'commit', '-m', 'add new script');
  const newScriptResult = runPlan(firstRelease.root, 'check', '--target-ref', 'HEAD');
  assert.equal(newScriptResult.status, 1);
  assert.match(newScriptResult.stderr, /has no published baseline/);

  const removal = await fixtureRepository();
  await rm(removal.script);
  git(removal.root, 'add', '-A');
  git(removal.root, 'commit', '-m', 'remove published script');
  const removalResult = runPlan(removal.root, 'check', '--target-ref', 'HEAD');
  assert.equal(removalResult.status, 1);
  assert.match(removalResult.stderr, /missing from the complete target version set/);

  const downgrade = await fixtureRepository();
  await commitVersion(downgrade, '1.2.2');
  const downgradeResult = runPlan(downgrade.root, 'check', '--target-ref', 'HEAD');
  assert.equal(downgradeResult.status, 1);
  assert.match(downgradeResult.stderr, /older than immutable published baseline/);
});

test('removing every script is rejected even when each one is registered', async () => {
  const fixture = await twoScriptRepository();
  await rm(path.join(fixture.root, 'src'), { recursive: true });
  await retire(fixture.root, [
    { namespace: fixtureNamespace, name: 'Fixture', lastVersion: '1.2.3' },
    { namespace: fixtureNamespace, name: 'Kept', lastVersion: '0.0.1' },
  ]);
  commitAll(fixture.root, 'remove everything');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /complete target version set is empty/);
});

test('removing an unregistered script is rejected', async () => {
  const fixture = await twoScriptRepository();
  await rm(fixture.script);
  await retire(fixture.root, [{ namespace: fixtureNamespace, name: 'Kept', lastVersion: '0.0.1' }]);
  commitAll(fixture.root, 'remove without registering');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Fixture is missing from the complete target version set/);
});

test('removing a registered script at its published final version is a removed transition', async () => {
  const fixture = await bundledRepository();
  await rm(fixture.entry);
  await rm(fixture.dist);
  await retire(fixture.root, [{ namespace: fixtureNamespace, name: 'Fixture', lastVersion: '1.2.3' }]);
  commitAll(fixture.root, 'retire the bundled script');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /:: Fixture: 1\.2\.3 -> \(removed\)/);
  assert.match(result.stdout, /:: Kept: 0\.0\.1 -> 0\.0\.1 \(unchanged\)/);
});

test('a registered removal must remove the published final version', async () => {
  const fixture = await twoScriptRepository();
  await rm(fixture.script);
  await retire(fixture.root, [{ namespace: fixtureNamespace, name: 'Fixture', lastVersion: '1.2.4' }]);
  commitAll(fixture.root, 'remove before publishing the final version');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Fixture is retired at 1\.2\.4 but the published baseline is 1\.2\.3/);
});

test('a registered script that is still present is rejected', async () => {
  const fixture = await twoScriptRepository();
  await retire(fixture.root, [{ namespace: fixtureNamespace, name: 'Fixture', lastVersion: '1.2.3' }]);
  commitAll(fixture.root, 'register without removing');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Fixture is listed as retired but still present/);
});

test('half-removed registered scripts are rejected by check', async () => {
  const entryOnly = await bundledRepository();
  await rm(entryOnly.dist);
  await retire(entryOnly.root, [{ namespace: fixtureNamespace, name: 'Fixture', lastVersion: '1.2.3' }]);
  commitAll(entryOnly.root, 'remove dist, keep entry');
  const entryResult = runPlan(entryOnly.root, 'check', '--target-ref', 'HEAD');
  assert.equal(entryResult.status, 1);
  assert.match(entryResult.stderr, /missing dist bundle dist\/fixture\.user\.js/);

  const distOnly = await bundledRepository();
  await rm(distOnly.entry);
  await retire(distOnly.root, [{ namespace: fixtureNamespace, name: 'Fixture', lastVersion: '1.2.3' }]);
  commitAll(distOnly.root, 'remove entry, keep dist');
  const distResult = runPlan(distOnly.root, 'check', '--target-ref', 'HEAD');
  assert.equal(distResult.status, 1);
  assert.match(distResult.stderr, /orphan installable without a source entry owner/);
});

test('a malformed retired list stops the plan', async () => {
  const fixture = await twoScriptRepository();
  await writeFile(path.join(fixture.root, 'retired-userscripts.json'), '{"retired": [{"name": "Fixture"}]}\n');
  commitAll(fixture.root, 'bad list');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /retired-userscripts\.json/);
});

test('a bundled entry requires matching dist metadata', async () => {
  const fixture = await fixtureRepository();
  const entry = path.join(fixture.root, 'src/userscripts/fixture/fixture.entry.ts');
  const dist = path.join(fixture.root, 'dist/fixture.user.js');
  await mkdir(path.dirname(dist), { recursive: true });
  await rm(fixture.script);
  await writeFile(entry, metadata('1.2.3'));
  await writeFile(dist, metadata('1.2.3'));
  git(fixture.root, 'add', '-A');
  git(fixture.root, 'commit', '-m', 'publish bundled shape');
  git(fixture.root, 'update-ref', 'refs/remotes/origin/master', 'HEAD');

  await writeFile(entry, metadata('1.2.4'));
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'forget the rebuild');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match .* install identity and @version/);
});

test('an orphan dist installable makes the complete target set invalid', async () => {
  const fixture = await fixtureRepository();
  await mkdir(path.join(fixture.root, 'dist'), { recursive: true });
  await writeFile(path.join(fixture.root, 'dist/orphan.user.js'), metadata('0.0.1', 'Orphan'));
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'add orphan dist script');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /orphan installable without a source entry owner/);
});

test('five-identity fixed plan survives single-file to entry migration unchanged', async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await rm(path.join(fixture.root, 'src'), { recursive: true });
  const entries = [
    ['codex-quota-compass', 'Codex Quota Compass', '0.5.3'],
    ['example', 'Example Custom User Script', '0.1.2'],
    ['feishu', 'Feishu Preview Image Export', '0.1.3'],
    ['javdb-recommend', 'JavDB Recommend Archive', '0.0.7'],
    ['web-page-assistant', 'Web Page Assistant', '0.3.2'],
  ];
  for (const [id, name, version] of entries) {
    const dir = path.join(fixture.root, 'src/userscripts', id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `${id}.user.js`),
      metadata(version, name).replace(
        'https://example.test/userscripts',
        'https://github.com/dzshzx/custom-user-js-scripts',
      ),
    );
  }
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'fixed five-identity baseline');
  git(fixture.root, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
  const before = JSON.parse(runPlan(fixture.root, 'plan', '--json').stdout);
  const stem = path.join(fixture.root, 'src/userscripts/javdb-recommend/javdb-recommend');
  const content = await readFile(`${stem}.user.js`, 'utf8');
  await writeFile(`${stem}.entry.ts`, content);
  await rm(`${stem}.user.js`);
  await mkdir(path.join(fixture.root, 'dist'));
  await writeFile(path.join(fixture.root, 'dist/javdb-recommend.user.js'), content);
  const result = runPlan(fixture.root, 'plan', '--json');
  assert.equal(result.status, 0, result.stderr);
  const after = JSON.parse(result.stdout);
  assert.deepEqual(after, before);
  assert.deepEqual(
    after.transitions,
    entries.map(([, name, version]) => ({
      baseline: version,
      namespace: `https://github.com/dzshzx/custom-user-js-scripts :: ${name}`,
      target: version,
      kind: 'unchanged',
    })),
  );
});

test('a dist file is an orphan without an entry even when a src script points its URL there', async () => {
  const fixture = await fixtureRepository();
  const content = metadata('1.2.3').replace(
    '// ==/UserScript==',
    '// @downloadURL https://example.test/dist/fixture.user.js\n// ==/UserScript==',
  );
  await writeFile(fixture.script, content);
  await mkdir(path.join(fixture.root, 'dist'));
  await writeFile(path.join(fixture.root, 'dist/fixture.user.js'), content);
  const result = runPlan(fixture.root, 'plan');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without a source entry owner/);
});

test('prerelease, build-tagged and v-prefixed versions are rejected', async () => {
  const fixture = await fixtureRepository('1.2.3');
  for (const target of ['1.2.4-rc.1', '1.2.4+build.1', 'v1.2.4']) {
    const proposed = runPlan(fixture.root, 'plan', '--target', `https://example.test/userscripts :: Fixture=${target}`);
    assert.equal(proposed.status, 1, target);
    assert.match(proposed.stderr, /non-SemVer @version/, target);
  }
});
