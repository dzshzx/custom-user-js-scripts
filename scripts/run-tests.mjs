import { run } from 'node:test';
import path from 'node:path';
import { isMain } from './lib/is-main.mjs';

// Test files run in child processes; they inherit NODE_OPTIONS, so every file
// can import .jsx sources the same way a focused `node --import` run does.
const JSX_LOADER_FLAG = `--import=${new URL('./jsx-loader.mjs', import.meta.url).href}`;

// Prints one failed, skipped or todo result as a JSON line on stderr.
function reportNonPassingResult(data, status) {
  console.error(
    JSON.stringify({
      file: data.file ? path.relative(process.cwd(), data.file) : null,
      name: data.name,
      status,
      reason: data.skip || data.todo || data.details?.error?.message || null,
    }),
  );
}

// Adds the JSX loader to NODE_OPTIONS unless it is already there.
function ensureJsxLoader() {
  if ((process.env.NODE_OPTIONS || '').includes(JSX_LOADER_FLAG)) return;
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, JSX_LOADER_FLAG].filter(Boolean).join(' ');
}

// Classifies one test:pass or test:fail event as pass, fail, skip or todo.
function resultStatus(type, data) {
  if (data.skip) return 'skip';
  if (data.todo) return 'todo';
  return type === 'test:pass' ? 'pass' : 'fail';
}

// Runs the complete node:test suite. Any failed, skipped or todo result fails it.
export async function runTests() {
  ensureJsxLoader();
  const counts = { pass: 0, fail: 0, skip: 0, todo: 0 };
  // Node 22 TestsStream supplies structured pass/fail/skip events. No TAP parsing.
  for await (const { type, data } of run()) {
    if (type === 'test:stderr') process.stderr.write(data.message);
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    const status = resultStatus(type, data);
    counts[status] += 1;
    if (status !== 'pass') reportNonPassingResult(data, status);
  }
  console.log(JSON.stringify(counts));
  return counts.fail === 0 && counts.skip === 0 && counts.todo === 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.length > 2 || process.execArgv.some((arg) => arg.startsWith('--test'))) {
    console.error('Full test entry does not accept filters; use node --test for focused checks.');
    process.exitCode = 2;
  } else if (!(await runTests())) process.exitCode = 1;
}
