#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { firstMetadataValue } from './lib/userscript-metadata.mjs';
import { readUserscriptInventory } from './lib/userscript-inventory.mjs';
import { worktreeSource, refSource } from './lib/userscript-sources.mjs';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const APPROVAL_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DEFAULT_BASE_REF = 'origin/master';

function usage() {
  return `Usage:
  node scripts/version-plan.mjs plan [--base-ref REF] [--target-ref REF]
       [--target 'INSTALL_IDENTITY=VERSION']... [--json]
  node scripts/version-plan.mjs check [--base-ref REF] [--target-ref REF]
       [--confirmed-version-plan sha256:...] [--approval-ref REF] [--json]

Without --target-ref, plan reads the current worktree. check requires a Git
target ref. The default authoritative baseline is origin/master.`;
}

function fail(message) {
  throw new Error(message);
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}

export function normalizeRepository(remoteUrl) {
  let pathname = remoteUrl.trim();
  const scpMatch = pathname.match(/^(?:[^@/]+@)?[^:/]+:(.+)$/);
  if (scpMatch && !pathname.includes('://')) {
    pathname = scpMatch[1];
  } else {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      fail(`origin URL is not a supported Git remote: ${remoteUrl}`);
    }
  }
  const parts = pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '').split('/');
  if (parts.length !== 2 || parts.some((part) => !part)) {
    fail(`origin URL must identify one owner/repository pair: ${remoteUrl}`);
  }
  return parts.join('/').toLowerCase();
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function planSummary(plan) {
  return `sha256:${createHash('sha256').update(canonicalJson(plan), 'utf8').digest('hex')}`;
}

function parseVersion(value, label, issues) {
  const match = VERSION_PATTERN.exec(value);
  if (!match) {
    issues.push(`${label} has a non-SemVer @version "${value || '<missing>'}"`);
    return null;
  }
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) {
    issues.push(`${label} has a version component outside the safe integer range`);
    return null;
  }
  return parts;
}

function transitionKind(baseline, target, namespace, issues) {
  const before = parseVersion(baseline, `${namespace} baseline`, issues);
  const after = parseVersion(target, `${namespace} target`, issues);
  if (!before || !after) return 'invalid';
  if (before.every((part, index) => part === after[index])) return 'unchanged';
  const direction = before.findIndex((part, index) => part !== after[index]);
  if (after[direction] < before[direction]) {
    issues.push(`${namespace} target ${target} is older than immutable published baseline ${baseline}`);
    return 'invalid';
  }
  if (before[0] === after[0] && before[1] === after[1] && after[2] === before[2] + 1) {
    return 'patch';
  }
  return 'confirmation-required';
}

async function readVersions(source, label) {
  const inventory = await readUserscriptInventory(source);
  const versions = new Map();
  // Release requires complete owners and identity/version parity. Byte equality
  // remains the build/lint gate; URL policy does not alter the approval schema.
  const releaseIssues = new Set([
    'read-failed', 'missing-file', 'invalid-metadata', 'missing-companion',
    'metadata-mismatch', 'ownership-conflict', 'orphan-dist', 'missing-entry', 'invalid-entry-path',
  ]);
  const issues = inventory.issues.filter((issue) => releaseIssues.has(issue.type))
    .map((issue) => `${label} ${issue.file} ${issue.type === 'missing-entry'
      ? 'is an orphan installable without a source entry owner' : issue.message}`);
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
  const repository = normalizeRepository(git(['remote', 'get-url', 'origin'], { cwd: root }));
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
  const versions = [];
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
    const version = { baseline, namespace, target };
    versions.push(version);
    transitions.push({ ...version, kind: transitionKind(baseline, target, namespace, issues) });
  }
  const plan = { repository, schema: 1, versions };
  if (versions.length === 0) issues.push('complete target version set is empty');
  return {
    canonical: canonicalJson(plan),
    issues,
    plan,
    requiresConfirmation: transitions.some(({ kind }) => kind === 'confirmation-required'),
    summary: planSummary(plan),
    transitions,
  };
}

function approvalTrailers(root, ref) {
  let message;
  try {
    message = git(['show', '-s', '--format=%B', ref], { cwd: root });
  } catch {
    fail(`cannot read approval trailer from ${ref}`);
  }
  const rawLines = message.split('\n').filter((line) => line.startsWith('Version-Approval:'));
  if (rawLines.some((line) => !/^Version-Approval: sha256:[0-9a-f]{64}$/.test(line))) {
    fail(`${ref} contains a malformed Version-Approval trailer`);
  }
  const parsed = execFileSync('git', ['interpret-trailers', '--parse'], {
    cwd: root,
    encoding: 'utf8',
    input: message,
  });
  const parsedTrailers = parsed.split('\n')
    .map((line) => line.match(/^Version-Approval:\s*(\S+)\s*$/)?.[1])
    .filter(Boolean);
  if (parsedTrailers.length !== rawLines.length) {
    fail(`${ref} contains Version-Approval outside the commit trailer block`);
  }
  return parsedTrailers;
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
    }
    else if (arg === '--confirmed-version-plan') options.confirmed = args.shift() || fail('--confirmed-version-plan requires a value');
    else if (arg === '--approval-ref') options.approvalRef = args.shift() || fail('--approval-ref requires a value');
    else if (arg === '--require-confirmed-argument') options.requireConfirmedArgument = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (options.help) return options;
  if (!['plan', 'check'].includes(command)) fail(`unknown command: ${command}`);
  if (command === 'check' && !options.targetRef) fail('check requires --target-ref');
  if (command === 'check' && options.targetOverrides.size > 0) fail('check reads actual target metadata and does not accept --target overrides');
  return options;
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  console.log(`Repository: ${result.plan.repository}`);
  console.log('Version plan:');
  for (const transition of result.transitions) {
    console.log(`  ${transition.namespace}: ${transition.baseline} -> ${transition.target} (${transition.kind})`);
  }
  console.log(`Canonical plan: ${result.canonical}`);
  console.log(`Summary: ${result.summary}`);
  console.log(`Confirmation required: ${result.requiresConfirmation ? 'yes' : 'no'}`);
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
  if (options.command === 'plan') return;
  if (options.confirmed) {
    if (!APPROVAL_PATTERN.test(options.confirmed)) fail('confirmed version plan must be a sha256 digest');
    if (options.confirmed !== result.summary) fail('confirmed version plan does not match the current complete version plan');
  }
  let trailers = [];
  if (options.approvalRef) {
    trailers = approvalTrailers(process.cwd(), options.approvalRef);
    if (trailers.length > 0 && (trailers.length !== 1 || trailers[0] !== result.summary)) {
      fail(`${options.approvalRef} must contain at most one Version-Approval trailer matching ${result.summary}`);
    }
  }
  if (options.confirmed && (!options.approvalRef || trailers.length !== 1)) {
    fail(`a supplied confirmation must be recorded as exactly one Version-Approval: ${result.summary} trailer on --approval-ref`);
  }
  if (!result.requiresConfirmation) return;
  if (options.requireConfirmedArgument && !options.confirmed) {
    fail(`this entry requires --confirmed-version-plan ${result.summary}`);
  }
  if (!options.confirmed && trailers.length === 0) {
    fail(`this version transition requires explicit approval; rerun with --confirmed-version-plan ${result.summary} and record the same value in a Version-Approval commit trailer`);
  }
  if (!options.approvalRef || trailers.length !== 1) {
    fail(`confirmation-required plans must have exactly one Version-Approval: ${result.summary} trailer on --approval-ref`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`version-plan: ${error.message}`);
    process.exitCode = 1;
  });
}
