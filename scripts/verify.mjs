import { spawn, spawnSync } from 'node:child_process';
import { environmentReport, runTests, writeReport } from './run-tests.mjs';
import { projectPlaywrightVersion } from './test-playwright.mjs';

const report = {
  passed: false,
  status: 'tests-not-run',
  counts: null,
  environment: { node: process.version, playwright: projectPlaywrightVersion, browser: null },
  stages: { environment: 'not-run', build: 'not-run', checks: 'not-run', tests: 'not-run' },
  timings: {},
};
function command(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(command + ' ' + args.join(' ') + ' failed');
}
// Independent checks run concurrently with buffered output, printed whole in
// list order; the first failure in list order is the one reported.
async function commands(list) {
  const runs = await Promise.all(
    list.map(
      ([command, args]) =>
        new Promise((resolve) => {
          const stdout = [];
          const stderr = [];
          const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
          child.stdout.on('data', (chunk) => stdout.push(chunk));
          child.stderr.on('data', (chunk) => stderr.push(chunk));
          child.on('error', () => resolve({ command, args, stdout, stderr, passed: false }));
          child.on('close', (code) => resolve({ command, args, stdout, stderr, passed: code === 0 }));
        }),
    ),
  );
  for (const { stdout, stderr } of runs) {
    process.stdout.write(Buffer.concat(stdout));
    process.stderr.write(Buffer.concat(stderr));
  }
  const failed = runs.find((run) => !run.passed);
  if (failed) throw new Error(failed.command + ' ' + failed.args.join(' ') + ' failed');
}
try {
  if (process.argv.length > 2 || process.execArgv.some((arg) => arg.startsWith('--test')))
    throw new Error('Full verify does not accept filters.');
  let started = performance.now();
  report.stages.environment = 'running';
  try {
    report.environment = await environmentReport();
  } finally {
    report.timings.environment_ms = performance.now() - started;
  }
  report.stages.environment = 'passed';
  started = performance.now();
  report.stages.build = 'running';
  try {
    command(process.execPath, ['scripts/build-userscripts.mjs']);
  } finally {
    report.timings.build_ms = performance.now() - started;
  }
  report.stages.build = 'passed';
  report.stages.checks = 'running';
  command('git', ['diff', '--exit-code', '--', 'dist', 'src']);
  command('sh', ['-c', 'test -z "$(git status --porcelain dist)"']);
  await commands([
    [process.execPath, ['scripts/check-userscripts.mjs']],
    // tsconfig.json sets noEmit: a type check only, the bundle comes from esbuild.
    [process.execPath, ['node_modules/typescript/bin/tsc', '-p', '.']],
    [process.execPath, ['node_modules/eslint/bin/eslint.js', '.']],
    ['bash', ['scripts/format.sh', '--check']],
  ]);
  report.stages.checks = 'passed';
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
