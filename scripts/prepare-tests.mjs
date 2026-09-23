import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const started = performance.now();
// An explicit local CLI cannot download a different Playwright package via npx.
const result = spawnSync(process.execPath, ['node_modules/playwright/cli.js', 'install', '--with-deps', 'chromium'], { stdio: 'inherit' });
await mkdir('.scratch/test-report', { recursive: true });
await writeFile('.scratch/test-report/preparation.json', JSON.stringify({
  node: process.version, playwright: '1.61.1',
  duration_ms: performance.now() - started, exitCode: result.status ?? 1,
}, null, 2));
process.exitCode = result.status ?? 1;
