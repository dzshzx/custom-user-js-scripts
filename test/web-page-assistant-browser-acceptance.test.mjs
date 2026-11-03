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
    await page.route('https://assistant.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<main id="host" inert="host-before-open"></main><aside id="sibling"></aside>',
      }),
    );
    await page.goto('https://assistant.test/fixture');
    await page.evaluate(() => {
      window.GM_setValue = (key) => {
        if (key !== 'pageAutoRefreshTimerSettings') return Promise.resolve();
        return new Promise((resolve) => {
          window.__releaseAssistantWrite = resolve;
        });
      };
    });
    await page.evaluate((source) => window.eval(source), bundle);
    await page.locator('.part-widget-button').waitFor();
    await page.locator('.part-widget-button').click();
    assert.equal(await page.locator('#host').getAttribute('inert'), 'host-before-open');
    assert.equal(await page.locator('#sibling').getAttribute('inert'), null);
    // The native modal dialog is in the top layer and the page behind it is
    // inert without any attribute writes, including nodes added while open.
    const modalState = await page.evaluate(() => {
      const late = document.createElement('button');
      late.id = 'late';
      document.body.append(late);
      const dialog = document.querySelector('.part-backdrop');
      const hit = document.elementFromPoint(2, 2);
      return {
        modal: dialog.matches(':modal'),
        focusInside: dialog.contains(document.activeElement),
        hitInside: dialog.contains(hit),
      };
    });
    assert.deepEqual(modalState, { modal: true, focusInside: true, hitInside: true });
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id === 'late'), false);

    await page.evaluate(() => document.querySelector('#sibling').setAttribute('inert', 'host-during-open'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.part-backdrop'));
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('part-widget-button')), true);
    assert.equal(await page.locator('#host').getAttribute('inert'), 'host-before-open');
    assert.equal(await page.locator('#sibling').getAttribute('inert'), 'host-during-open');
    await page.evaluate(() => document.querySelector('#late').remove());

    await page.locator('.part-widget-button').click();
    await page.locator('[data-part-action="save-preset"]').first().click();
    await page.waitForFunction(
      () => document.querySelector('[data-part-action="save-preset"]')?.textContent === '处理中…',
    );
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

test('real Chromium keeps the collapsed corner widget out of host controls', async () => {
  const playwright = await loadTestPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.route('https://assistant.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<button id="host-corner" style="position:fixed;right:0;bottom:0;width:200px;height:100px"
          onclick="window.__hostClicks=(window.__hostClicks||0)+1">host</button>`,
      }),
    );
    await page.goto('https://assistant.test/corner');
    await page.evaluate((source) => window.eval(source), bundle);
    const button = page.locator('.part-widget-button');
    await button.waitFor();
    const buttonBox = await button.boundingBox();
    const isExpanded = () => page.locator('.part-widget').evaluate((node) => node.classList.contains('is-expanded'));

    // Just left of the visible button, where the expanded pill will grow: the
    // host gets the pointer, and resting there never opens the panel.
    const gapPoint = { x: buttonBox.x - 20, y: buttonBox.y + buttonBox.height / 2 };
    assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, gapPoint), 'host-corner');
    await page.mouse.move(gapPoint.x, gapPoint.y);
    await page.mouse.click(gapPoint.x, gapPoint.y);
    assert.equal(await page.evaluate(() => window.__hostClicks), 1);
    await page.waitForTimeout(500);
    assert.equal(await isExpanded(), false);

    // Resting on the button expands it, and the cursor can travel up to the
    // panel without the widget collapsing on the way.
    await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
    await page.waitForFunction(() => document.querySelector('.part-widget').classList.contains('is-expanded'));
    // Idle has no countdown to show, so the expanded button stays the round dot.
    await page.waitForTimeout(200);
    const expandedBox = await button.boundingBox();
    assert.deepEqual({ width: expandedBox.width, height: expandedBox.height }, { width: 40, height: 40 });
    const panelBox = await page.locator('.part-widget-panel').boundingBox();
    await page.mouse.move(panelBox.x + panelBox.width - 20, panelBox.y + panelBox.height / 2, { steps: 12 });
    assert.equal(await isExpanded(), true);

    // A mouse click opens settings; closing them by mouse hands focus back to
    // the button without popping the panel open while the cursor is away.
    await page.mouse.move(10, 10);
    assert.equal(await isExpanded(), false);
    await button.click();
    await page.locator('button[data-part-action="close-dialog"]').click();
    await page.waitForFunction(() => !document.querySelector('.part-backdrop'));
    await page.mouse.move(10, 10);
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('part-widget-button')), true);
    assert.equal(await isExpanded(), false);
  } finally {
    await browser.close();
  }
});

for (const [mode, body] of [
  ['standards', '<!doctype html><div style="height:3000px"></div>'],
  // Without a doctype <html> reports the whole page height, not the viewport.
  ['quirks', '<div style="height:3000px"></div>'],
]) {
  test(`real Chromium starts an undragged widget in the corner beside the scrollbar (${mode} mode)`, async () => {
    const playwright = await loadTestPlaywright();
    // Headless Chromium hides scrollbars by default; keep them so the default
    // position is measured against the viewport the user actually sees.
    const browser = await playwright.chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.route('https://assistant.test/**', (route) => route.fulfill({ contentType: 'text/html', body }));
      await page.goto('https://assistant.test/tall');
      await page.evaluate(() => {
        // A position saved before positions were per site must not move this site.
        const values = { pageAutoRefreshTimerWidgetPosition: { left: 40, top: 60 } };
        window.GM_getValue = (key, fallbackValue) => values[key] ?? fallbackValue;
        window.GM_setValue = async () => {};
      });
      await page.evaluate((source) => window.eval(source), bundle);
      const button = page.locator('.part-widget-button');
      await button.waitFor();
      const box = await button.boundingBox();
      // The page only scrolls vertically: the visible height is innerHeight
      // and the width loses one scrollbar, measured on a scrolling probe.
      const viewport = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;top:0;width:100px;height:100px;overflow:scroll';
        document.body.append(probe);
        const scrollbar = probe.offsetWidth - probe.clientWidth;
        probe.remove();
        return { width: window.innerWidth - scrollbar, height: window.innerHeight, scrollbar };
      });
      assert.ok(viewport.scrollbar > 0);
      assert.deepEqual(
        { right: viewport.width - (box.x + box.width), bottom: viewport.height - (box.y + box.height) },
        { right: 18, bottom: 18 },
      );
    } finally {
      await browser.close();
    }
  });
}

test('real Chromium expands an active widget into a pill that hugs the countdown', async () => {
  const playwright = await loadTestPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.route('https://assistant.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>page</p>' }),
    );
    await page.goto('https://assistant.test/active');
    await page.evaluate(() => {
      const values = {
        pageAutoRefreshTimerSettings: {
          version: 2,
          refresh: { sites: { 'assistant.test': { intervalMs: 300000 } }, pages: {} },
        },
      };
      window.GM_getValue = (key, fallbackValue) => values[key] ?? fallbackValue;
      window.GM_setValue = async () => {};
    });
    await page.evaluate((source) => window.eval(source), bundle);
    const button = page.locator('.part-widget-button');
    await button.waitFor();
    const collapsed = await button.boundingBox();
    await page.mouse.move(collapsed.x + collapsed.width / 2, collapsed.y + collapsed.height / 2);
    await page.waitForFunction(() => document.querySelector('.part-widget').classList.contains('is-expanded'));
    await page.waitForTimeout(250);
    const layout = await button.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const text = node.querySelector('[data-part-role="countdown"]').getBoundingClientRect();
      // Space between the countdown and the pill edge beyond the 14px padding.
      return { right: box.right, slack: Math.round(box.right - text.right - 14 - 1), width: box.width };
    });
    // The pill grows left from the round button, keeping its right edge.
    assert.equal(layout.right, collapsed.x + collapsed.width);
    assert.equal(layout.slack, 0);
    assert.ok(layout.width < 154);
  } finally {
    await browser.close();
  }
});

test('real Chromium lets the widget reach the left edge and opens it toward the page', async () => {
  const playwright = await loadTestPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    await page.route('https://assistant.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>page</p>' }),
    );
    await page.goto('https://assistant.test/left');
    await page.evaluate(() => {
      window.__saved = [];
      const values = {
        pageAutoRefreshTimerSettings: {
          version: 2,
          refresh: { sites: { 'assistant.test': { intervalMs: 300000 } }, pages: {} },
        },
      };
      window.GM_getValue = (key, fallbackValue) => values[key] ?? fallbackValue;
      window.GM_setValue = async (key, value) => {
        if (key.startsWith('pageAutoRefreshTimerWidgetPosition')) window.__saved.push(value);
      };
    });
    await page.evaluate((source) => window.eval(source), bundle);
    const button = page.locator('.part-widget-button');
    await button.waitFor();
    const start = await button.boundingBox();
    await page.mouse.move(start.x + 20, start.y + 20);
    await page.mouse.down();
    await page.mouse.move(2, 250, { steps: 10 });
    await page.mouse.up();

    const dropped = await button.boundingBox();
    // Clamped to the 12px safe margin, like the right edge.
    assert.equal(dropped.x, 12);
    // Saved in the former box format: 114px left of the button.
    await page.waitForFunction(() => window.__saved.length > 0);
    assert.equal((await page.evaluate(() => window.__saved.at(-1))).left, 12 - 114);

    await page.mouse.move(400, 100);
    await page.mouse.move(dropped.x + 20, dropped.y + 20);
    await page.waitForFunction(() => document.querySelector('.part-widget').classList.contains('is-expanded'));
    await page.waitForTimeout(250);
    const pill = await button.boundingBox();
    const panel = await page.locator('.part-widget-panel').boundingBox();
    // The pill grows to the right from the button and the panel starts at it.
    assert.equal(pill.x, 12);
    assert.ok(pill.width > 40);
    assert.equal(panel.x, 12);
  } finally {
    await browser.close();
  }
});
