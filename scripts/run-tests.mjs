import { run } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadTestPlaywright } from './test-playwright.mjs';

// These existing names and owning files are stable acceptance identifiers.
export const requiredTests = [
  ['codex-quota-compass-browser-acceptance.test.mjs', 'real Chromium preserves the bundle sync draft and cancels file work on disposal'],
  ['web-page-assistant-browser-acceptance.test.mjs', 'real Chromium runs the bundle without inert or stale-save lifecycle leaks'],
  ['javdb-recommend-browser-acceptance.test.mjs', 'real Chromium validates native CSS, fallback, mobile layout, and observable JAV老司机 compatibility'],
  ['browser-tools-login-qr-playwright.test.mjs', 'real Playwright fixture observes one document and commits private state'],
  ['feishu-preview-image-extraction.test.mjs', 'real Playwright page.evaluate matches the direct result'],
];

export async function runTests(options = {}) {
  const results = [];
  const diagnostics = [];
  const started = performance.now();
  // Node 22 TestsStream supplies structured pass/fail/skip events. No TAP parsing.
  for await (const { type, data } of run(options)) {
    if (type === 'test:stderr' || type === 'test:diagnostic') {
      diagnostics.push({ type, file: data.file ? path.relative(process.cwd(), data.file) : null, message: data.message });
    }
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    const result = {
      file: data.file ? path.relative(process.cwd(), data.file) : null,
      name: data.name, status: data.skip ? 'skip' : data.todo ? 'todo' : type === 'test:pass' ? 'pass' : 'fail',
      reason: data.skip || data.todo || data.details?.error?.message || null,
      duration_ms: data.details?.duration_ms,
    };
    results.push(result);
    if (result.status !== 'pass') console.error(JSON.stringify(result));
  }
  const required = requiredTests.map(([file, name]) => {
    const matches = results.filter(result => result.file === 'test/' + file && result.name === name);
    return { file, name, passed: matches.length === 1 && matches[0].status === 'pass' };
  });
  const counts = Object.fromEntries(['pass', 'fail', 'skip', 'todo'].map(status => [status, results.filter(r => r.status === status).length]));
  return { duration_ms: performance.now() - started, counts, required, results, diagnostics,
    passed: counts.fail === 0 && counts.skip === 0 && counts.todo === 0 && required.every(result => result.passed) };
}

export async function environmentReport() {
  const playwright = await loadTestPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try { return { node: process.version, playwright: '1.61.1', browser: browser.version() }; }
  finally { await browser.close(); }
}

export async function writeReport(report) {
  await mkdir('.scratch/test-report', { recursive: true });
  report.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  report.worktreeDirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
  report.scope = 'All node:test tests; browser acceptance uses synthetic fixtures. Manual browser and real sites remain unverified.';
  await writeFile('.scratch/test-report/results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, status: report.status, stages: report.stages, counts: report.counts, timings: report.timings, error: report.error }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = {
    passed: false, status: 'tests-not-run', counts: null,
    environment: { node: process.version, playwright: '1.61.1', browser: null },
    stages: { environment: 'not-run', build: 'not-in-this-entry', tests: 'not-run' },
    timings: {},
  };
  try {
    if (process.argv.length > 2 || process.execArgv.some(arg => arg.startsWith('--test'))) throw new Error('Full test entry does not accept filters; use node --test for focused checks.');
    const started = performance.now();
    report.stages.environment = 'running';
    try { report.environment = await environmentReport(); }
    finally { report.timings.environment_ms = performance.now() - started; }
    report.stages.environment = 'passed';
    report.stages.tests = 'running';
    Object.assign(report, await runTests());
    report.timings.tests_ms = report.duration_ms;
    report.stages.tests = report.passed ? 'passed' : 'failed';
    report.status = report.passed ? 'passed' : 'tests-failed';
  } catch (error) {
    report.error = error.message;
    report.status = report.stages.environment === 'running' ? 'environment-unavailable' : 'verification-failed';
    for (const stage of Object.keys(report.stages)) {
      if (report.stages[stage] === 'running') report.stages[stage] = 'failed';
    }
  }
  await writeReport(report);
  if (!report.passed) process.exitCode = 1;
}
