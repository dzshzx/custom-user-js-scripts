#!/usr/bin/env node

import process from 'node:process';

import semver from 'semver';

import { isMain } from './lib/is-main.mjs';
import { firstMetadataValue } from './lib/userscript-metadata.mjs';
import { readUserscriptInventory } from './lib/userscript-inventory.mjs';
import { worktreeSource, refSource } from './lib/userscript-sources.mjs';

const DEFAULT_BASE_REF = 'origin/master';
// Install identities retired on purpose, read from the target. Only a listed
// script may disappear, and only after its final version is the baseline.
const RETIRED_LIST = 'retired-userscripts.json';

function usage() {
  return `Usage:
  node scripts/version-plan.mjs plan [--base-ref REF] [--target-ref REF]
       [--target 'INSTALL_IDENTITY=VERSION']... [--json]
  node scripts/version-plan.mjs check [--base-ref REF] [--target-ref REF]
       [--json]

Without --target-ref, plan reads the current worktree. check requires a Git
target ref. The default authoritative baseline is origin/master. Any forward
version transition passes. A script listed in retired-userscripts.json whose
entry and dist are both gone is a removed transition, provided the baseline is
its listed lastVersion; unknown baselines, unlisted missing targets, an empty
target set, invalid metadata, and downgrades of an immutable published version
stop the release.`;
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
  // Release requires complete owners and identity/version parity. Dist freshness
  // remains the build/lint gate; URL policy does not alter the version plan.
  const releaseIssues = new Set([
    'read-failed',
    'missing-file',
    'invalid-metadata',
    'missing-dist',
    'metadata-mismatch',
    'ownership-conflict',
    'orphan-dist',
    'invalid-entry-path',
  ]);
  const issues = inventory.issues
    .filter((issue) => releaseIssues.has(issue.type))
    .map((issue) => `${label} ${issue.file} ${issue.message}`);
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

// Missing list = nothing retired; anything present must be well-formed.
async function readRetired(source, label, issues) {
  let text;
  try {
    text = await source.readText(RETIRED_LIST);
  } catch {
    return new Map();
  }
  const retired = new Map();
  let entries;
  try {
    entries = JSON.parse(text).retired;
  } catch (error) {
    issues.push(`${label} ${RETIRED_LIST} is not valid JSON: ${error.message}`);
    return retired;
  }
  if (!Array.isArray(entries)) {
    issues.push(`${label} ${RETIRED_LIST} must hold a "retired" array`);
    return retired;
  }
  for (const entry of entries) {
    const fields = [entry?.namespace, entry?.name, entry?.lastVersion];
    if (!fields.every((value) => typeof value === 'string' && value !== '')) {
      issues.push(`${label} ${RETIRED_LIST} entries need namespace, name and lastVersion strings`);
      continue;
    }
    retired.set(`${entry.namespace} :: ${entry.name}`, entry.lastVersion);
  }
  return retired;
}

async function buildVersionPlan({
  root = process.cwd(),
  baseRef = DEFAULT_BASE_REF,
  targetRef,
  targetOverrides = new Map(),
} = {}) {
  const baselineState = await readVersions(refSource(root, baseRef), baseRef);
  const targetSource = targetRef ? refSource(root, targetRef) : await worktreeSource(root);
  const targetState = await readVersions(targetSource, targetRef || 'worktree');
  const issues = [...baselineState.issues, ...targetState.issues];
  const retired = await readRetired(targetSource, targetRef || 'worktree', issues);
  for (const [namespace, version] of targetOverrides) {
    const existing = targetState.versions.get(namespace);
    if (!existing) {
      issues.push(`target override names unknown install identity ${namespace}`);
      continue;
    }
    targetState.versions.set(namespace, { ...existing, version });
  }
  const transitions = collectTransitions(baselineState, targetState, retired, baseRef, issues);
  if (targetState.versions.size === 0) issues.push('complete target version set is empty');
  return { issues, transitions };
}

// One transition per install identity in either set, sorted by identity; problems go to issues.
function collectTransitions(baselineState, targetState, retired, baseRef, issues) {
  const identities = new Set([...baselineState.versions.keys(), ...targetState.versions.keys()]);
  const transitions = [];
  for (const namespace of [...identities].sort()) {
    const baseline = baselineState.versions.get(namespace)?.version;
    const target = targetState.versions.get(namespace)?.version;
    if (target !== undefined && retired.has(namespace)) {
      issues.push(`${namespace} is listed as retired but still present`);
      continue;
    }
    if (baseline === undefined) {
      issues.push(`${namespace} has no published baseline in ${baseRef}`);
      continue;
    }
    if (target === undefined) {
      const lastVersion = retired.get(namespace);
      if (lastVersion === undefined) issues.push(`${namespace} is missing from the complete target version set`);
      else if (lastVersion !== baseline)
        issues.push(`${namespace} is retired at ${lastVersion} but the published baseline is ${baseline}`);
      else transitions.push({ baseline, namespace, target: null, kind: 'removed' });
      continue;
    }
    transitions.push({ baseline, namespace, target, kind: transitionKind(baseline, target, namespace, issues) });
  }
  return transitions;
}

// Consumes the value after --target and records it as one INSTALL_IDENTITY=VERSION override.
function readTargetOverride(args, options) {
  const value = args.shift() || fail('--target requires INSTALL_IDENTITY=VERSION');
  const separator = value.lastIndexOf('=');
  if (separator <= 0 || separator === value.length - 1) fail('--target requires INSTALL_IDENTITY=VERSION');
  const namespace = value.slice(0, separator);
  const version = value.slice(separator + 1);
  if (options.targetOverrides.has(namespace)) fail(`duplicate --target install identity: ${namespace}`);
  options.targetOverrides.set(namespace, version);
}

// Rejects an unknown command and option combinations the command does not accept.
function validateCommandOptions(command, options) {
  if (!['plan', 'check'].includes(command)) fail(`unknown command: ${command}`);
  if (command === 'check' && !options.targetRef) fail('check requires --target-ref');
  if (command === 'check' && options.targetOverrides.size > 0)
    fail('check reads actual target metadata and does not accept --target overrides');
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'plan';
  const options = { baseRef: DEFAULT_BASE_REF, command, json: false, targetOverrides: new Map() };
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--base-ref') options.baseRef = args.shift() || fail('--base-ref requires a value');
    else if (arg === '--target-ref') options.targetRef = args.shift() || fail('--target-ref requires a value');
    else if (arg === '--target') readTargetOverride(args, options);
    else if (arg === '--json') options.json = true;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (options.help) return options;
  validateCommandOptions(command, options);
  return options;
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  console.log('Version plan:');
  for (const transition of result.transitions) {
    const target = transition.kind === 'removed' ? '(removed)' : `${transition.target} (${transition.kind})`;
    console.log(`  ${transition.namespace}: ${transition.baseline} -> ${target}`);
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

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(`version-plan: ${error.message}`);
    process.exitCode = 1;
  });
}
