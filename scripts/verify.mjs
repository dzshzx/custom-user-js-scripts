import { spawn, spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { runTests } from './run-tests.mjs';

function command(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
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
// npm rewrites node_modules/.package-lock.json on every install, so its modification time is
// the time of the last install. Nothing installed yet, or a lock file newer than that (a fresh
// checkout, a rebase that brought a new lock file), means the dependencies are not the locked ones.
function dependenciesAreCurrent() {
  try {
    return statSync('node_modules/.package-lock.json').mtimeMs > statSync('package-lock.json').mtimeMs;
  } catch {
    return false;
  }
}
// `npm run` exports its resolved configuration as npm_config_* variables, and a nested npm
// reads them as if given on its command line, where some user-level settings are refused.
// Without them the nested install reads the npmrc files itself.
function installDependencies() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('npm_config_')));
  command('npm', ['ci'], { env });
}
try {
  if (process.argv.length > 2 || process.execArgv.some((arg) => arg.startsWith('--test')))
    throw new Error('Full verify does not accept filters.');
  if (!dependenciesAreCurrent()) installDependencies();
  command(process.execPath, ['scripts/build-userscripts.mjs']);
  command('git', ['diff', '--exit-code', '--', 'dist']);
  command('sh', ['-c', 'test -z "$(git status --porcelain dist)"']);
  await commands([
    [process.execPath, ['scripts/check-userscripts.mjs']],
    // tsconfig.json sets noEmit: a type check only, the bundle comes from esbuild.
    [process.execPath, ['node_modules/typescript/bin/tsc', '-p', '.']],
    [process.execPath, ['node_modules/eslint/bin/eslint.js', '.']],
    // Cognitive complexity of each function, limit 15 in biome.json. Biome cannot be told to
    // disregard its suppression comments, so any such comment in a linted file fails here.
    [process.execPath, ['node_modules/@biomejs/biome/bin/biome', 'lint', '.']],
    [
      'sh',
      [
        '-c',
        "if git grep -n 'biome[-]ignore' -- '*.js' '*.mjs' '*.cjs' '*.jsx' '*.ts' '*.mts' '*.cts' '*.tsx' " +
          "':(exclude)dist/**'; then " +
          "echo 'verify: Biome suppression comments are not accepted; the complexity limit lives in biome.json' >&2; exit 1; fi",
      ],
    ],
    // A nested biome.json (root: false) can switch the complexity rule off or exclude files,
    // so the root biome.json must be the only Biome configuration in the repository.
    [
      'sh',
      [
        '-c',
        'configs=$(git ls-files -co --exclude-standard -- "*biome.json" "*biome.jsonc"); ' +
          'if [ "$configs" != biome.json ]; then ' +
          'echo "verify: the root biome.json is the only Biome configuration accepted, found: $configs" >&2; exit 1; fi',
      ],
    ],
    ['bash', ['scripts/format.sh', '--check']],
  ]);
  if (!(await runTests())) throw new Error('tests failed');
} catch (error) {
  console.error('verify: ' + error.message);
  process.exitCode = 1;
}
