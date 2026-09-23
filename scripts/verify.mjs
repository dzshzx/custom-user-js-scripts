import { spawnSync } from 'node:child_process';
import { environmentReport, runTests, writeReport } from './run-tests.mjs';

const report = {
  passed: false, status: 'tests-not-run', counts: null,
  environment: { node: process.version, playwright: '1.61.1', browser: null },
  stages: { environment: 'not-run', build: 'not-run', checks: 'not-run', tests: 'not-run' },
  timings: {},
};
function command(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(command + ' ' + args.join(' ') + ' failed');
}
try {
  if (process.argv.length > 2 || process.execArgv.some(arg => arg.startsWith('--test'))) throw new Error('Full verify does not accept filters.');
  let started = performance.now();
  report.stages.environment = 'running';
  try { report.environment = await environmentReport(); }
  finally { report.timings.environment_ms = performance.now() - started; }
  report.stages.environment = 'passed';
  started = performance.now();
  report.stages.build = 'running';
  try { command(process.execPath, ['scripts/build-userscripts.mjs']); }
  finally { report.timings.build_ms = performance.now() - started; }
  report.stages.build = 'passed';
  report.stages.checks = 'running';
  command('git', ['diff', '--exit-code', '--', 'dist', 'src']);
  command('sh', ['-c', 'test -z "$(git status --porcelain dist)"']);
  command(process.execPath, ['scripts/check-userscripts.mjs']);
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
