import { spawnSync } from 'node:child_process';
import { environmentReport, runTests, writeReport } from './run-tests.mjs';

const report = { passed: false, environment: { node: process.version, playwright: '1.61.1', browser: null }, timings: {} };
function command(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(command + ' ' + args.join(' ') + ' failed');
}
try {
  if (process.argv.length > 2 || process.execArgv.some(arg => arg.startsWith('--test'))) throw new Error('Full verify does not accept filters.');
  let started = performance.now();
  report.environment = await environmentReport();
  report.timings.environment_ms = performance.now() - started;
  started = performance.now();
  command(process.execPath, ['scripts/build-userscripts.mjs']);
  report.timings.build_ms = performance.now() - started;
  command('git', ['diff', '--exit-code', '--', 'dist', 'src']);
  command('sh', ['-c', 'test -z "$(git status --porcelain dist)"']);
  command(process.execPath, ['scripts/check-userscripts.mjs']);
  Object.assign(report, await runTests());
  report.timings.tests_ms = report.duration_ms;
} catch (error) { report.error = error.message; }
await writeReport(report);
if (!report.passed) process.exitCode = 1;
