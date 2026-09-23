// Test-only dependency boundary: never use the daily browser-tools cache fallback.
import { readFile } from 'node:fs/promises';

export async function loadTestPlaywright() {
  try {
    const manifest = JSON.parse(await readFile(new URL('../node_modules/playwright/package.json', import.meta.url)));
    if (manifest.version !== '1.61.1') throw new Error('Expected playwright@1.61.1');
    return await import('../node_modules/playwright/index.mjs');
  } catch (cause) {
    throw new Error('Browser tests require project playwright@1.61.1. Run npm ci, then npm run test:prepare.', { cause });
  }
}
