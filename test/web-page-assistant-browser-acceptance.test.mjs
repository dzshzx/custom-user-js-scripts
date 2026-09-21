import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolvePlaywrightImport } from '../scripts/browser-tools/playwright-loader.mjs';

const bundle = await readFile(new URL('../dist/web-page-assistant.user.js', import.meta.url), 'utf8');

async function findCachedChromium() {
  const cacheRoot = path.join(os.homedir(), '.cache', 'ms-playwright');
  let entries;
  try {
    entries = await readdir(cacheRoot, { withFileTypes: true });
  } catch {
    return '';
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('chromium-')) continue;
    const executable = path.join(cacheRoot, entry.name, 'chrome-linux64', 'chrome');
    try {
      await access(executable);
      return executable;
    } catch {
      // Continue looking for another cached revision.
    }
  }
  return '';
}

test('real Chromium runs the bundle without inert or stale-save lifecycle leaks', async (t) => {
  const executablePath = await findCachedChromium();
  if (!executablePath) {
    t.skip('No isolated Playwright Chromium executable is cached.');
    return;
  }
  let playwright;
  try {
    playwright = await resolvePlaywrightImport();
  } catch {
    t.skip('Playwright is not available in the current user cache.');
    return;
  }
  const browser = await playwright.chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage();
    await page.route('https://assistant.test/**', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<main id="host" inert="host-before-open"></main><aside id="sibling"></aside>',
    }));
    await page.goto('https://assistant.test/fixture');
    await page.evaluate(() => {
      window.GM_setValue = (key) => {
        if (key !== 'pageAutoRefreshTimerSettings') return Promise.resolve();
        return new Promise((resolve) => { window.__releaseAssistantWrite = resolve; });
      };
    });
    await page.evaluate((source) => window.eval(source), bundle);
    await page.locator('.part-widget-button').waitFor();
    await page.locator('.part-widget-button').click();
    assert.equal(await page.locator('#host').getAttribute('inert'), 'host-before-open');
    assert.equal(await page.locator('#sibling').getAttribute('inert'), '');
    await page.evaluate(() => {
      document.querySelector('#sibling').setAttribute('inert', 'host-during-open');
      document.querySelector('[data-part-action="close-dialog"]').click();
    });
    assert.equal(await page.locator('#host').getAttribute('inert'), 'host-before-open');
    assert.equal(await page.locator('#sibling').getAttribute('inert'), 'host-during-open');

    await page.locator('.part-widget-button').click();
    await page.locator('[data-part-action="save-preset"]').first().click();
    await page.waitForFunction(() => (
      document.querySelector('[data-part-action="save-preset"]')?.textContent === '处理中…'
    ));
    await page.locator('button[data-part-action="close-dialog"]').click();
    await page.locator('.part-widget-button').click();
    await page.locator('[data-part-role="custom-value"]').evaluate((input) => {
      input.value = '42';
      input.dataset.acceptanceMarker = 'preserve';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => window.__releaseAssistantWrite());
    await page.waitForTimeout(20);
    assert.equal(await page.locator('[data-part-role="custom-value"]').inputValue(), '42');
    assert.equal(
      await page.locator('[data-part-role="custom-value"]').getAttribute('data-acceptance-marker'),
      'preserve',
    );
  } finally {
    await browser.close();
  }
});
