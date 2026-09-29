#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import semver from 'semver';

import { firstMetadataValue } from './lib/userscript-metadata.mjs';
import { readUserscriptInventory } from './lib/userscript-inventory.mjs';
import { worktreeSource, refSource } from './lib/userscript-sources.mjs';

const DEFAULT_BASE_REF = 'origin/master';

function usage() {
  return `Usage:
  node scripts/version-plan.mjs plan [--base-ref REF] [--target-ref REF]
       [--target 'INSTALL_IDENTITY=VERSION']... [--json]
  node scripts/version-plan.mjs check [--base-ref REF] [--target-ref REF]
       [--json]

Without --target-ref, plan reads the current worktree. check requires a Git
target ref. The default authoritative baseline is origin/master. Any forward
version transition passes; unknown baselines, missing targets, invalid
metadata, and downgrades of an immutable published version stop the release.`;
}

function fail(message) {
  throw new Error(message);
}

// Releases use plain MAJOR.MINOR.PATCH: semver.valid also accepts a leading "v"
// and returns a prerelease-bearing or build-bearing version differently, so
// only a string that round-trips unchanged without prerelease counts.
function parseVersion(value, label, issues) {
  const version = semver.parse(value);
  if (!version || version.version !== value || version.prerelease.length > 0) {
    issues.push(`${label} has a non-SemVer @version "${value || '<missing>'}"`);
    return null;
  }
  return version;
}

function transitionKind(baseline, target, namespace, issues) {
  const before = parseVersion(baseline, `${namespace} baseline`, issues);
  const after = parseVersion(target, `${namespace} target`, issues);
  if (!before || !after) return 'invalid';
  const order = semver.compare(before, after);
  if (order === 0) return 'unchanged';
  if (order > 0) {
    issues.push(`${namespace} target ${target} is older than immutable published baseline ${baseline}`);
    return 'invalid';
  }
  return semver.diff(before, after);
}

async function readVersions(source, label) {
  const inventory = await readUserscriptInventory(source);
  const versions = new Map();
  // Release requires complete owners and identity/version parity. Byte equality
  // remains the build/lint gate; URL policy does not alter the version plan.
  const releaseIssues = new Set([
    'read-failed',
    'missing-file',
    'invalid-metadata',
    'missing-companion',
    'metadata-mismatch',
    'ownership-conflict',
    'orphan-dist',
    'missing-entry',
    'invalid-entry-path',
  ]);
  const issues = inventory.issues
    .filter((issue) => releaseIssues.has(issue.type))
    .map(
      (issue) =>
        `${label} ${issue.file} ${
          issue.type === 'missing-entry' ? 'is an orphan installable without a source entry owner' : issue.message
        }`,
    );
  for (const { metadataOwner: owner, identity } of inventory.records) {
    if (!owner.metadata) continue;
    if (!identity) {
      issues.push(`${label} ${owner.path} has no complete @namespace/@name install identity`);
      continue;
    }
    if (versions.has(identity)) {
      issues.push(`${label} has duplicate install identity ${identity}`);
      continue;
    }
    versions.set(identity, { file: owner.path, version: firstMetadataValue(owner.metadata, '@version') });
  }
  return { versions, issues };
}

export async function buildVersionPlan({
  root = process.cwd(),
  baseRef = DEFAULT_BASE_REF,
  targetRef,
  targetOverrides = new Map(),
} = {}) {
  const baselineState = await readVersions(refSource(root, baseRef), baseRef);
  const targetState = await readVersions(
    targetRef ? refSource(root, targetRef) : await worktreeSource(root),
    targetRef || 'worktree',
  );
  const issues = [...baselineState.issues, ...targetState.issues];
  for (const [namespace, version] of targetOverrides) {
    const existing = targetState.versions.get(namespace);
    if (!existing) {
      issues.push(`target override names unknown install identity ${namespace}`);
      continue;
    }
    targetState.versions.set(namespace, { ...existing, version });
  }
  const identities = new Set([...baselineState.versions.keys(), ...targetState.versions.keys()]);
  const transitions = [];
  for (const namespace of [...identities].sort()) {
    const baseline = baselineState.versions.get(namespace)?.version;
    const target = targetState.versions.get(namespace)?.version;
    if (baseline === undefined) {
      issues.push(`${namespace} has no published baseline in ${baseRef}`);
      continue;
    }
    if (target === undefined) {
      issues.push(`${namespace} is missing from the complete target version set`);
      continue;
    }
    transitions.push({ baseline, namespace, target, kind: transitionKind(baseline, target, namespace, issues) });
  }
  if (transitions.length === 0) issues.push('complete target version set is empty');
  return { issues, transitions };
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'plan';
  const options = { baseRef: DEFAULT_BASE_REF, command, json: false, targetOverrides: new Map() };
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--base-ref') options.baseRef = args.shift() || fail('--base-ref requires a value');
    else if (arg === '--target-ref') options.targetRef = args.shift() || fail('--target-ref requires a value');
    else if (arg === '--target') {
      const value = args.shift() || fail('--target requires INSTALL_IDENTITY=VERSION');
      const separator = value.lastIndexOf('=');
      if (separator <= 0 || separator === value.length - 1) fail('--target requires INSTALL_IDENTITY=VERSION');
      const namespace = value.slice(0, separator);
      const version = value.slice(separator + 1);
      if (options.targetOverrides.has(namespace)) fail(`duplicate --target install identity: ${namespace}`);
      options.targetOverrides.set(namespace, version);
    } else if (arg === '--json') options.json = true;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (options.help) return options;
  if (!['plan', 'check'].includes(command)) fail(`unknown command: ${command}`);
  if (command === 'check' && !options.targetRef) fail('check requires --target-ref');
  if (command === 'check' && options.targetOverrides.size > 0)
    fail('check reads actual target metadata and does not accept --target overrides');
  return options;
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  console.log('Version plan:');
  for (const transition of result.transitions) {
    console.log(`  ${transition.namespace}: ${transition.baseline} -> ${transition.target} (${transition.kind})`);
  }
  for (const issue of result.issues) console.error(`version-plan: ${issue}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await buildVersionPlan(options);
  printResult(result, options.json);
  if (result.issues.length > 0) fail('version plan is incomplete');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`version-plan: ${error.message}`);
    process.exitCode = 1;
  });
}
