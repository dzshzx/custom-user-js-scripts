import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadTestPlaywright } from '../scripts/test-playwright.mjs';

const bundle = await readFile(new URL('../dist/web-page-assistant.user.js', import.meta.url), 'utf8');

test('real Chromium runs the bundle without inert or stale-save lifecycle leaks', async () => {
  const playwright = await loadTestPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
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
