import { run } from 'node:test';
import path from 'node:path';
import { isMain } from './lib/is-main.mjs';

// Test files run in child processes; they inherit NODE_OPTIONS, so every file
// can import .jsx sources the same way a focused `node --import` run does.
const JSX_LOADER_FLAG = `--import=${new URL('./jsx-loader.mjs', import.meta.url).href}`;

// Runs the complete node:test suite. Any failed, skipped or todo result fails it.
export async function runTests() {
  if (!(process.env.NODE_OPTIONS || '').includes(JSX_LOADER_FLAG))
    process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, JSX_LOADER_FLAG].filter(Boolean).join(' ');
  const counts = { pass: 0, fail: 0, skip: 0, todo: 0 };
  // Node 22 TestsStream supplies structured pass/fail/skip events. No TAP parsing.
  for await (const { type, data } of run()) {
    if (type === 'test:stderr') process.stderr.write(data.message);
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    const status = data.skip ? 'skip' : data.todo ? 'todo' : type === 'test:pass' ? 'pass' : 'fail';
    counts[status] += 1;
    if (status !== 'pass')
      console.error(
        JSON.stringify({
          file: data.file ? path.relative(process.cwd(), data.file) : null,
          name: data.name,
          status,
          reason: data.skip || data.todo || data.details?.error?.message || null,
        }),
      );
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
