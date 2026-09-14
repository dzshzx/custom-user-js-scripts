import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { access, chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  canonicalJson,
  normalizeRepository,
  planSummary,
} from '../scripts/version-plan.mjs';

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
  await copyFile(
    path.join(projectRoot, 'scripts/lib/userscript-metadata.mjs'),
    path.join(fixture.root, 'scripts/lib/userscript-metadata.mjs'),
  );
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

test('canonical plan matches the shared cross-language digest fixture', () => {
  const plan = {
    repository: 'dzshzx/example',
    schema: 1,
    versions: [{ baseline: '1.2.3', namespace: 'v', target: '1.3.0' }],
  };
  assert.equal(
    canonicalJson(plan),
    '{"repository":"dzshzx/example","schema":1,"versions":[{"baseline":"1.2.3","namespace":"v","target":"1.3.0"}]}',
  );
  assert.equal(planSummary(plan), 'sha256:1eed417ccd593af576ef4e828eda87fd02791a4053eef7085a860475c9e5e3be');
});

test('SSH and HTTPS origin forms normalize to a lowercase owner/repository', () => {
  assert.equal(normalizeRepository('git@github.com:Dzshzx/Example.git'), 'dzshzx/example');
  assert.equal(normalizeRepository('https://github.com/Dzshzx/Example.git'), 'dzshzx/example');
});

test('an exact next patch passes without approval', async () => {
  const fixture = await fixtureRepository();
  await commitVersion(fixture, '1.2.4');
  const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD', '--approval-ref', 'HEAD');
  assert.equal(result.status, 0, result.stderr);

  const preview = runPlan(fixture.root, 'plan', '--target-ref', 'HEAD', '--json');
  const { summary } = JSON.parse(preview.stdout);
  const unrecordedConfirmation = runPlan(
    fixture.root,
    'check', '--target-ref', 'HEAD', '--confirmed-version-plan', summary, '--approval-ref', 'HEAD',
  );
  assert.equal(unrecordedConfirmation.status, 1);
  assert.match(unrecordedConfirmation.stderr, /supplied confirmation must be recorded/);
});

test('plan proposes a target without editing files and actual metadata reproduces its digest', async () => {
  const fixture = await fixtureRepository();
  const identity = 'https://example.test/userscripts :: Fixture';
  const before = await readFile(fixture.script, 'utf8');
  const proposed = runPlan(fixture.root, 'plan', '--target', `${identity}=1.3.0`, '--json');
  assert.equal(proposed.status, 0, proposed.stderr);
  const proposal = JSON.parse(proposed.stdout);
  assert.equal(proposal.requiresConfirmation, true);
  assert.equal(await readFile(fixture.script, 'utf8'), before);

  await commitVersion(fixture, '1.3.0');
  const actual = runPlan(fixture.root, 'plan', '--target-ref', 'HEAD', '--json');
  assert.equal(actual.status, 0, actual.stderr);
  assert.equal(JSON.parse(actual.stdout).summary, proposal.summary);

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

test('minor requires an exact summary in one commit trailer', async () => {
  const fixture = await fixtureRepository();
  await commitVersion(fixture, '1.3.0');
  const preview = runPlan(fixture.root, 'plan', '--target-ref', 'HEAD', '--json');
  assert.equal(preview.status, 0, preview.stderr);
  const { summary } = JSON.parse(preview.stdout);

  const missing = runPlan(
    fixture.root,
    'check', '--target-ref', 'HEAD', '--confirmed-version-plan', summary, '--approval-ref', 'HEAD',
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /exactly one Version-Approval/);

  git(fixture.root, 'commit', '--amend', '-m', 'set 1.3.0', '-m', `Version-Approval: ${summary}`);
  const approved = runPlan(
    fixture.root,
    'check', '--target-ref', 'HEAD', '--confirmed-version-plan', summary, '--approval-ref', 'HEAD',
  );
  assert.equal(approved.status, 0, approved.stderr);

  const trustedPromote = runPlan(fixture.root, 'check', '--target-ref', 'HEAD', '--approval-ref', 'HEAD');
  assert.equal(trustedPromote.status, 0, trustedPromote.stderr);
});

test('major and skipped-patch transitions are not automatic', async () => {
  for (const target of ['1.2.5', '2.0.0']) {
    const fixture = await fixtureRepository();
    await commitVersion(fixture, target);
    const result = runPlan(fixture.root, 'check', '--target-ref', 'HEAD');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires explicit approval/);
  }
});

test('target or baseline drift invalidates a recorded confirmation', async () => {
  const fixture = await fixtureRepository();
  await commitVersion(fixture, '1.3.0');
  const preview = runPlan(fixture.root, 'plan', '--target-ref', 'HEAD', '--json');
  const { summary } = JSON.parse(preview.stdout);
  git(fixture.root, 'commit', '--amend', '-m', 'set 1.3.0', '-m', `Version-Approval: ${summary}`);

  await writeFile(fixture.script, metadata('1.4.0'));
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'change target after confirmation');
  const targetDrift = runPlan(
    fixture.root,
    'check', '--target-ref', 'HEAD', '--confirmed-version-plan', summary, '--approval-ref', 'HEAD~',
  );
  assert.equal(targetDrift.status, 1);
  assert.match(targetDrift.stderr, /does not match the current complete version plan/);

  git(fixture.root, 'update-ref', 'refs/remotes/origin/master', 'HEAD~');
  const baselineDrift = runPlan(
    fixture.root,
    'check', '--target-ref', 'HEAD', '--confirmed-version-plan', summary, '--approval-ref', 'HEAD~',
  );
  assert.equal(baselineDrift.status, 1);
  assert.match(baselineDrift.stderr, /does not match the current complete version plan/);
});

test('first release, removal, downgrade, and malformed trailers are rejected', async () => {
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

  const malformed = await fixtureRepository();
  await commitVersion(malformed, '1.2.4', '-m', 'Version-Approval: not-a-digest');
  const malformedResult = runPlan(malformed.root, 'check', '--target-ref', 'HEAD', '--approval-ref', 'HEAD');
  assert.equal(malformedResult.status, 1);
  assert.match(malformedResult.stderr, /malformed Version-Approval/);
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

test('candidate entry rejects an unapproved minor before any remote push', async () => {
  const fixture = await releaseToolRepository();
  await commitVersion(fixture, '1.3.0');
  const pushMarker = path.join(await mkdtemp(path.join(tmpdir(), 'candidate-push-marker-')), 'push');
  const wrapper = await gitWrapper({ pushMarker });
  wrapper.env.SKIP_FETCH = '1';
  const result = spawnSync('bash', ['scripts/candidate.sh', '--no-wait'], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: wrapper.env,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /version plan was not authorized/);
  assert.equal(await exists(pushMarker), false, 'candidate must stop before git push');
});

test('candidate entry requires its confirmation argument even when the trailer exists', async () => {
  const fixture = await releaseToolRepository();
  const summary = planSummary({
    repository: 'dzshzx/example',
    schema: 1,
    versions: [{
      baseline: '1.2.3',
      namespace: 'https://example.test/userscripts :: Fixture',
      target: '1.3.0',
    }],
  });
  await commitVersion(fixture, '1.3.0', '-m', `Version-Approval: ${summary}`);
  const pushMarker = path.join(await mkdtemp(path.join(tmpdir(), 'candidate-push-marker-')), 'push');
  const wrapper = await gitWrapper({ pushMarker });
  wrapper.env.SKIP_FETCH = '1';
  const result = spawnSync('bash', ['scripts/candidate.sh', '--no-wait'], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: wrapper.env,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires --confirmed-version-plan/);
  assert.equal(await exists(pushMarker), false, 'candidate must stop before git push');
});

test('trusted promote gate rejects missing approval without moving master', async () => {
  const fixture = await releaseToolRepository({ bare: true });
  await commitVersion(fixture, '1.3.0');
  const candidate = git(fixture.root, 'rev-parse', 'HEAD');
  const wrapper = await gitWrapper();
  const result = spawnSync('bash', ['scripts/promote-version-plan.sh', candidate], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: wrapper.env,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires explicit approval/);
  assert.equal(git(fixture.bareRoot, 'rev-parse', 'master'), fixture.baseline);
});

test('trusted promote lease rejects a still-fast-forwardable baseline race', async () => {
  const fixture = await releaseToolRepository({ bare: true });
  await writeFile(path.join(fixture.root, 'non-version-change.txt'), 'candidate ancestor\n');
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'candidate ancestor');
  const advanceRef = git(fixture.root, 'rev-parse', 'HEAD');

  const identity = 'https://example.test/userscripts :: Fixture';
  const plan = {
    repository: 'dzshzx/example',
    schema: 1,
    versions: [{ baseline: '1.2.3', namespace: identity, target: '1.3.0' }],
  };
  const summary = planSummary(plan);
  await writeFile(fixture.script, metadata('1.3.0'));
  git(fixture.root, 'add', '.');
  git(fixture.root, 'commit', '-m', 'set 1.3.0', '-m', `Version-Approval: ${summary}`);
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
