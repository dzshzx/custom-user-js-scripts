#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  firstMetadataValue,
  installIdentity,
  parseMetadataBlock,
} from './lib/userscript-metadata.mjs';

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

async function walkFiles(root, dir = root) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return files;
}

async function worktreeSource(root) {
  const userscriptRoot = path.join(root, 'src/userscripts');
  const srcFiles = await walkFiles(root, userscriptRoot);
  let distFiles = [];
  try {
    distFiles = await walkFiles(root, path.join(root, 'dist'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const files = [...srcFiles, ...distFiles]
    .filter((file) => file.endsWith('.entry.js') || file.endsWith('.user.js'));
  return {
    files,
    read: (file) => readFile(path.join(root, file), 'utf8'),
  };
}

function refSource(root, ref) {
  let output;
  try {
    output = git(['ls-tree', '-r', '--name-only', ref, '--', 'src/userscripts', 'dist'], { cwd: root });
  } catch {
    fail(`cannot read version baseline or target ref ${ref}`);
  }
  const files = output.split('\n')
    .filter(Boolean)
    .filter((file) => file.endsWith('.entry.js') || file.endsWith('.user.js'));
  return {
    files,
    read(file) {
      try {
        return git(['show', `${ref}:${file}`], { cwd: root });
      } catch {
        fail(`cannot read ${file} from ${ref}`);
      }
    },
  };
}

async function readVersions(source, label) {
  const entryOwners = new Set(source.files
    .filter((file) => file.endsWith('.entry.js'))
    .map((file) => file.slice(0, -'.entry.js'.length)));
  const ownerFiles = source.files.filter((file) => file.startsWith('src/userscripts/')).filter((file) => {
    if (file.endsWith('.entry.js')) return true;
    return !entryOwners.has(file.slice(0, -'.user.js'.length));
  });
  const versions = new Map();
  const identitiesByFile = new Map();
  const issues = [];
  for (const file of ownerFiles.sort()) {
    const metadata = parseMetadataBlock(await source.read(file));
    if (!metadata) {
      issues.push(`${label} ${file} has no userscript metadata block`);
      continue;
    }
    const namespace = installIdentity(metadata);
    const version = firstMetadataValue(metadata, '@version');
    if (!namespace) {
      issues.push(`${label} ${file} has no complete @namespace/@name install identity`);
      continue;
    }
    if (versions.has(namespace)) {
      issues.push(`${label} has duplicate install identity ${namespace}`);
      continue;
    }
    versions.set(namespace, { file, version });
    identitiesByFile.set(file, namespace);
  }
  const expectedDistFiles = new Set();
  for (const entryFile of source.files.filter((file) => file.endsWith('.entry.js')).sort()) {
    const stem = entryFile.slice(0, -'.entry.js'.length);
    const entry = [...versions.values()].find(({ file }) => file === entryFile);
    if (!entry) continue;
    const companionFiles = [`${stem}.user.js`, `dist/${path.basename(stem)}.user.js`];
    expectedDistFiles.add(companionFiles[1]);
    for (const companionFile of companionFiles) {
      if (!source.files.includes(companionFile)) {
        issues.push(`${label} ${entryFile} is missing installable companion ${companionFile}`);
        continue;
      }
      const metadata = parseMetadataBlock(await source.read(companionFile));
      const identity = metadata && installIdentity(metadata);
      const version = metadata && firstMetadataValue(metadata, '@version');
      const ownerIdentity = identitiesByFile.get(entryFile);
      if (!metadata || identity !== ownerIdentity || version !== entry.version) {
        issues.push(`${label} ${companionFile} does not match ${entryFile} install identity and @version`);
      }
    }
  }
  for (const distFile of source.files.filter((file) => file.startsWith('dist/') && file.endsWith('.user.js'))) {
    if (!expectedDistFiles.has(distFile)) {
      issues.push(`${label} ${distFile} is an orphan installable without a source entry owner`);
    }
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
