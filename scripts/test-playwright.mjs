// Test-only dependency boundary: never use the daily browser-tools cache fallback.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// package.json devDependencies is the one place the exact Playwright pin lives.
export const projectPlaywrightVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  .devDependencies.playwright;

export async function loadTestPlaywright() {
  try {
    const manifest = JSON.parse(await readFile(new URL('../node_modules/playwright/package.json', import.meta.url)));
    if (manifest.version !== projectPlaywrightVersion)
      throw new Error(`Expected playwright@${projectPlaywrightVersion}`);
    return await import('../node_modules/playwright/index.mjs');
  } catch (cause) {
    throw new Error(
      `Browser tests require project playwright@${projectPlaywrightVersion}. Run npm ci, then npm run test:prepare.`,
      { cause },
    );
  }
}
