import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { access, chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionPlanScript = path.join(projectRoot, 'scripts/version-plan.mjs');

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

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function releaseToolRepository({ bare = false } = {}) {
  const fixture = await fixtureRepository();
  await mkdir(path.join(fixture.root, 'scripts/lib'), { recursive: true });
  for (const file of ['candidate.sh', 'promote-version-plan.sh', 'version-plan.mjs']) {
    await copyFile(path.join(projectRoot, 'scripts', file), path.join(fixture.root, 'scripts', file));
  }
  for (const file of ['userscript-metadata.mjs', 'userscript-inventory.mjs', 'userscript-sources.mjs']) {
    await copyFile(path.join(projectRoot, 'scripts/lib', file), path.join(fixture.root, 'scripts/lib', file));
  }
  await chmod(path.join(fixture.root, 'scripts/candidate.sh'), 0o755);
  await chmod(path.join(fixture.root, 'scripts/promote-version-plan.sh'), 0o755);
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'add trusted release tools');
  git(fixture.root, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
  const baseline = git(fixture.root, 'rev-parse', 'HEAD');

  let bareRoot;
  if (bare) {
    bareRoot = await mkdtemp(path.join(tmpdir(), 'userscript-version-remote-'));
    git(fixture.root, 'remote', 'set-url', 'origin', bareRoot);
    execFileSync('git', ['init', '--bare', '--initial-branch=master'], { cwd: bareRoot });
    git(fixture.root, 'push', 'origin', 'master');
  }
  git(fixture.root, 'switch', '-c', 'task/release');
  return { ...fixture, baseline, bareRoot };
}

async function gitWrapper({ advanceMarker, advanceRef, pushMarker } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'userscript-git-wrapper-'));
  const wrapper = path.join(root, 'git');
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  await writeFile(wrapper, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "remote" && "\${2:-}" == "get-url" && "\${3:-}" == "origin" ]]; then
  echo git@github.com:Dzshzx/Example.git
  exit 0
fi
if [[ "\${1:-}" == "fetch" && -n "\${SKIP_FETCH:-}" ]]; then
  exit 0
fi
if [[ "\${1:-}" == "push" && -n "\${PUSH_MARKER:-}" ]]; then
  touch "$PUSH_MARKER"
fi
if [[ "\${1:-}" == "push" && " $* " == *" --force-with-lease="* && -n "\${ADVANCE_REF:-}" && ! -e "\${ADVANCE_MARKER:-}" ]]; then
  "$REAL_GIT" push origin "\${ADVANCE_REF}:refs/heads/master"
  touch "$ADVANCE_MARKER"
fi
exec "$REAL_GIT" "$@"
`);
  await chmod(wrapper, 0o755);
  return {
    env: {
      ...process.env,
      ADVANCE_MARKER: advanceMarker || '',
      ADVANCE_REF: advanceRef || '',
      BASH_ENV: '',
      PATH: `${root}:${process.env.PATH}`,
      PUSH_MARKER: pushMarker || '',
      REAL_GIT: realGit,
    },
  };
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
  assert.deepEqual(JSON.parse(result.stdout).transitions.map(({ kind }) => kind), ['patch']);
});

test('plan proposes a target without editing files and actual metadata reproduces it', async () => {
  const fixture = await fixtureRepository();
  const identity = 'https://example.test/userscripts :: Fixture';
  const before = await readFile(fixture.script, 'utf8');
  const proposed = runPlan(fixture.root, 'plan', '--target', `${identity}=1.3.0`, '--json');
  assert.equal(proposed.status, 0, proposed.stderr);
  const proposal = JSON.parse(proposed.stdout);
  assert.deepEqual(proposal.transitions.map(({ kind }) => kind), ['minor']);
  assert.equal(await readFile(fixture.script, 'utf8'), before);

  await commitVersion(fixture, '1.3.0');
  const actual = runPlan(fixture.root, 'plan', '--target-ref', 'HEAD', '--json');
  assert.equal(actual.status, 0, actual.stderr);
  assert.deepEqual(JSON.parse(actual.stdout), proposal);

  const unknown = runPlan(fixture.root, 'plan', '--target', 'unknown=1.3.0');
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown install identity/);
  const duplicate = runPlan(
    fixture.root,
    'plan', '--target', `${identity}=1.3.0`, '--target', `${identity}=1.4.0`,
  );
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /duplicate --target/);
  const executionOverride = runPlan(
    fixture.root,
    'check', '--target-ref', 'HEAD', '--target', `${identity}=1.3.0`,
  );
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
    fixture.root, 'plan', '--target',
    'https://example.test/userscripts :: Fixture=1.2.9007199254740992',
  );
  assert.equal(proposed.status, 1);
  assert.match(proposed.stderr, /outside the safe integer range/);
});

test('minor, major, and skipped-patch transitions pass without approval', async () => {
  for (const [target, kind] of [['1.3.0', 'minor'], ['2.0.0', 'major'], ['1.2.5', 'patch']]) {
    const fixture = await fixtureRepository();
    await commitVersion(fixture, target);
    const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD', '--json');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).transitions.map((transition) => transition.kind), [kind]);
  }
});

test('a legacy Version-Approval trailer is ignored', async () => {
  const fixture = await fixtureRepository();
  await commitVersion(fixture, '1.3.0', '-m', 'Version-Approval: not-a-digest');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD');
  assert.equal(result.status, 0, result.stderr);
});

test('first release, removal, and downgrade are rejected', async () => {
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

test('a bundled entry requires matching bridge and dist metadata', async () => {
  const fixture = await fixtureRepository();
  const standalone = path.join(fixture.root, 'src/userscripts/fixture/fixture.user.js');
  const entry = path.join(fixture.root, 'src/userscripts/fixture/fixture.entry.js');
  const dist = path.join(fixture.root, 'dist/fixture.user.js');
  await mkdir(path.dirname(dist), { recursive: true });
  await writeFile(entry, metadata('1.2.3'));
  await writeFile(standalone, metadata('1.2.3'));
  await writeFile(dist, metadata('1.2.3'));
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'publish bundled shape');
  git(fixture.root, 'update-ref', 'refs/remotes/origin/master', 'HEAD');

  await writeFile(entry, metadata('1.2.4'));
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'forget generated companions');
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

test('candidate entry rejects a downgrade before any remote push', async () => {
  const fixture = await releaseToolRepository();
  await commitVersion(fixture, '1.2.2');
  const pushMarker = path.join(await mkdtemp(path.join(tmpdir(), 'candidate-push-marker-')), 'push');
  const wrapper = await gitWrapper({ pushMarker });
  wrapper.env.SKIP_FETCH = '1';
  const result = spawnSync('bash', ['scripts/candidate.sh', '--no-wait'], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: wrapper.env,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /version plan is invalid/);
  assert.equal(await exists(pushMarker), false, 'candidate must stop before git push');
});

test('candidate entry pushes a minor without any confirmation argument', async () => {
  const fixture = await releaseToolRepository({ bare: true });
  await commitVersion(fixture, '1.3.0');
  const sha = git(fixture.root, 'rev-parse', 'HEAD');
  const wrapper = await gitWrapper();
  const result = spawnSync('bash', ['scripts/candidate.sh', '--no-wait'], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: wrapper.env,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(git(fixture.bareRoot, 'for-each-ref', '--format=%(objectname)', 'refs/heads/candidate/'), new RegExp(sha));
});

test('trusted promote gate rejects a downgrade without moving master', async () => {
  const fixture = await releaseToolRepository({ bare: true });
  await commitVersion(fixture, '1.2.2');
  const candidate = git(fixture.root, 'rev-parse', 'HEAD');
  const wrapper = await gitWrapper();
  const result = spawnSync('bash', ['scripts/promote-version-plan.sh', candidate], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: wrapper.env,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /older than immutable published baseline/);
  assert.equal(git(fixture.bareRoot, 'rev-parse', 'master'), fixture.baseline);
});

test('trusted promote fast-forwards a minor without approval', async () => {
  const fixture = await releaseToolRepository({ bare: true });
  await commitVersion(fixture, '1.3.0');
  const candidate = git(fixture.root, 'rev-parse', 'HEAD');
  const wrapper = await gitWrapper();
  const result = spawnSync('bash', ['scripts/promote-version-plan.sh', candidate], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: wrapper.env,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(fixture.bareRoot, 'rev-parse', 'master'), candidate);
});

test('trusted promote reads malicious candidate inventory modules as data only', async () => {
  const fixture = await releaseToolRepository({ bare: true });
  await writeFile(fixture.script, metadata('1.2.2'));
  for (const file of ['userscript-inventory.mjs', 'userscript-sources.mjs']) {
    await writeFile(path.join(fixture.root, 'scripts/lib', file), "throw new Error('CANDIDATE_CODE_EXECUTED');\n");
  }
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'downgraded candidate with untrusted tools');
  const candidate = git(fixture.root, 'rev-parse', 'HEAD');
  // Mirrors checkout(master) in promote.yml while candidate remains a Git object.
  git(fixture.root, 'checkout', fixture.baseline, '--', 'scripts');
  const wrapper = await gitWrapper();
  const result = spawnSync('bash', ['scripts/promote-version-plan.sh', candidate], {
    cwd: fixture.root, encoding: 'utf8', env: wrapper.env,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /older than immutable published baseline/);
  assert.doesNotMatch(result.stderr, /CANDIDATE_CODE_EXECUTED/);
  assert.equal(git(fixture.bareRoot, 'rev-parse', 'master'), fixture.baseline);
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
    await writeFile(path.join(dir, `${id}.user.js`), metadata(version, name)
      .replace('https://example.test/userscripts', 'https://github.com/dzshzx/custom-user-js-scripts'));
  }
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'fixed five-identity baseline');
  git(fixture.root, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
  const before = JSON.parse(runPlan(fixture.root, 'plan', '--json').stdout);
  const stem = path.join(fixture.root, 'src/userscripts/javdb-recommend/javdb-recommend');
  const content = await readFile(`${stem}.user.js`, 'utf8');
  await writeFile(`${stem}.entry.js`, content);
  await mkdir(path.join(fixture.root, 'dist'));
  await writeFile(path.join(fixture.root, 'dist/javdb-recommend.user.js'), content);
  const result = runPlan(fixture.root, 'plan', '--json');
  assert.equal(result.status, 0, result.stderr);
  const after = JSON.parse(result.stdout);
  assert.deepEqual(after, before);
  assert.deepEqual(after.transitions, entries.map(([, name, version]) => ({
    baseline: version, namespace: `https://github.com/dzshzx/custom-user-js-scripts :: ${name}`, target: version, kind: 'unchanged',
  })));
});

test('version plan requires a real entry even when lint can accept a historical URL pair', async () => {
  const fixture = await fixtureRepository();
  const content = metadata('1.2.3').replace('// ==/UserScript==', '// @downloadURL https://example.test/dist/fixture.user.js\n// ==/UserScript==');
  await writeFile(fixture.script, content);
  await mkdir(path.join(fixture.root, 'dist'));
  await writeFile(path.join(fixture.root, 'dist/fixture.user.js'), content);
  const result = runPlan(fixture.root, 'plan');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without a source entry owner/);
});

test('trusted promote lease rejects a still-fast-forwardable baseline race', async () => {
  const fixture = await releaseToolRepository({ bare: true });
  await writeFile(path.join(fixture.root, 'non-version-change.txt'), 'candidate ancestor\n');
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'candidate ancestor');
  const advanceRef = git(fixture.root, 'rev-parse', 'HEAD');

  await commitVersion(fixture, '1.3.0');
  const candidate = git(fixture.root, 'rev-parse', 'HEAD');

  const markerRoot = await mkdtemp(path.join(tmpdir(), 'promote-race-marker-'));
  const advanceMarker = path.join(markerRoot, 'advanced');
  const wrapper = await gitWrapper({ advanceMarker, advanceRef });
  const result = spawnSync('bash', ['scripts/promote-version-plan.sh', candidate], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: wrapper.env,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stale info|rejected/i);
  assert.equal(await exists(advanceMarker), true, 'test must advance master during the final push');
  assert.equal(git(fixture.bareRoot, 'rev-parse', 'master'), advanceRef);
  assert.equal(git(fixture.root, 'merge-base', '--is-ancestor', advanceRef, candidate), '');
});
