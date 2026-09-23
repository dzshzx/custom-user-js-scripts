import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadTestPlaywright } from '../scripts/test-playwright.mjs';

const bundle = await readFile(new URL('../dist/codex-quota-compass.user.js', import.meta.url), 'utf8');

test('real Chromium preserves the bundle sync draft and cancels file work on disposal', async () => {
  const playwright = await loadTestPlaywright();

  let failUsage = false;
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const values = new Map();
      const listeners = new Map();
      let listenerId = 0;
      window.__quotaAcceptance = { values, writes: 0, removedListeners: 0, menus: [] };
      window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
      window.GM_setValue = (key, value) => {
        values.set(key, structuredClone(value));
        window.__quotaAcceptance.writes += 1;
      };
      window.GM_addValueChangeListener = (key, callback) => {
        listeners.set(++listenerId, { key, callback });
        return listenerId;
      };
      window.GM_removeValueChangeListener = (id) => {
        if (listeners.delete(id)) window.__quotaAcceptance.removedListeners += 1;
      };
      window.GM_registerMenuCommand = (label, callback) => {
        window.__quotaAcceptance.menus.push({ label, callback });
      };
    });
    await page.route('https://chatgpt.com/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.resourceType() === 'document') {
        route.fulfill({ contentType: 'text/html', body: '<main id="host">Quota fixture</main>' });
        return;
      }
      if (url.pathname === '/api/auth/session') {
        route.fulfill({ contentType: 'application/json', body: '{}' });
        return;
      }
      if (failUsage && url.pathname === '/backend-api/wham/usage') {
        route.fulfill({ status: 503, contentType: 'text/plain', body: 'controlled failure' });
        return;
      }
      if (url.pathname === '/backend-api/wham/usage') {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            rate_limit: { secondary_window: {
              used_percent: 40,
              limit_window_seconds: 7 * 86400,
              reset_after_seconds: 86400,
              reset_at: Math.floor(Date.now() / 1000) + 86400,
            } },
          }),
        });
        return;
      }
      route.fulfill({ contentType: 'application/json', body: '{"data":[]}' });
    });

    await page.goto('https://chatgpt.com/codex/cloud/settings/analytics#usage');
    await page.evaluate((source) => window.eval(source), bundle);
    assert.equal(await page.evaluate(() => window.__quotaAcceptance.menus.length), 5);
    await page.locator('.cqc-button').click();
    await page.locator('[data-view="archive"]').waitFor();
    await page.locator('[data-view="archive"]').click();
    await page.waitForFunction(() => !window.__codexQuotaCompassRunning);

    const token = page.locator('[data-field="token"]');
    await token.evaluate((input) => {
      input.value = 'acceptance-draft';
      input.dataset.acceptanceMarker = 'preserve';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    });
    failUsage = true;
    await page.locator('.cqc-panel-header [data-action="refresh"]').click();
    await page.locator('.wk-toast[data-tone="error"]').waitFor();
    await page.waitForFunction(() => !window.__codexQuotaCompassRunning);
    assert.equal(await token.inputValue(), 'acceptance-draft');
    assert.equal(await token.getAttribute('data-acceptance-marker'), 'preserve');
    assert.equal(await page.locator('[data-field="token"]').count(), 1);

    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('[data-action="import-archive"]').click();
    await chooserPromise;
    const fileInput = await page.$('input[type="file"]');
    assert.ok(fileInput, 'bundle must create its owned file input');
    const writesBeforeDispose = await page.evaluate(() => window.__quotaAcceptance.writes);
    await page.evaluate(() => {
      const event = new Event('pagehide');
      Object.defineProperty(event, 'persisted', { value: false });
      window.dispatchEvent(event);
    });
    assert.equal(await page.locator('#codex-quota-compass-root').count(), 0);
    assert.equal(await page.locator('input[type="file"]').count(), 0);
    await fileInput.dispatchEvent('change');
    await page.waitForTimeout(20);
    assert.equal(await page.evaluate(() => window.__quotaAcceptance.writes), writesBeforeDispose);
    assert.equal(await page.evaluate(() => window.__quotaAcceptance.removedListeners), 1);
  } finally {
    await browser.close();
  }
});
