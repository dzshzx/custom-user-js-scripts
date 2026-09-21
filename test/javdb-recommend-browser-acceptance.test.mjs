import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolvePlaywrightImport } from '../scripts/browser-tools/playwright-loader.mjs';

const bundle = await readFile(new URL('../dist/javdb-recommend.user.js', import.meta.url), 'utf8');

async function findCachedChromium() {
  const root = path.join(os.homedir(), '.cache', 'ms-playwright');
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return ''; }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('chromium-')) continue;
    const executable = path.join(root, entry.name, 'chrome-linux64', 'chrome');
    try { await access(executable); return executable; } catch {}
  }
  return '';
}

const periods = {
  success: 1,
  data: {
    periods: [2, 1].map(period => ({
      period,
      movies_count: 1,
      views_count: 0,
      created_at: '2026-09-01T00:00:00.000Z',
    })),
  },
};

function detail(url) {
  const period = new URL(url).searchParams.get('period');
  return {
    success: 1,
    data: {
      movies: [{
        id: period,
        number: `TEST-${period}`,
        title: `Period ${period}`,
        origin_title: '',
        cover_url: `https://images.test/covers/${period}.jpg`,
        score: '4.0',
        release_date: '2026-09-01',
      }],
    },
  };
}

async function installFixture(page, { styles = true } = {}) {
  await page.route('https://javdb.com/**', async route => {
    const url = route.request().url();
    const parsed = new URL(url);
    if (parsed.pathname === '/recommend-archive') {
      await route.fulfill({ contentType: 'text/html', body: '<html><body class="rails-default-error-page"><div class="dialog">404</div><aside id="host-addon"></aside></body></html>' });
    } else if (parsed.pathname === '/') {
      await route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="dark"><head>' + (styles ? '<link rel="stylesheet" href="/assets/app.css">' : '') + '</head>' +
          '<body><nav class="navbar main-nav"><button class="navbar-burger" data-target="nav-menu"></button>' +
          '<div id="nav-menu" class="navbar-menu"><div class="navbar-start"></div></div></nav></body></html>',
      });
    } else if (parsed.pathname === '/assets/app.css') {
      await route.fulfill({
        contentType: 'text/css',
        body: '.navbar{display:flex;min-height:52px}.button{display:inline-flex;padding:8px 12px}.box{display:block;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
      });
    } else if (parsed.pathname.endsWith('/recommend_periods')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(periods) });
    } else if (parsed.pathname.endsWith('/recommend')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(detail(url)) });
    } else {
      await route.fulfill({ status: 404, body: '' });
    }
  });
}

test('real Chromium validates native CSS, fallback, mobile layout, and observable JAV老司机 compatibility', async t => {
  const executablePath = await findCachedChromium();
  if (!executablePath) return t.skip('No isolated Playwright Chromium executable is cached.');
  let playwright;
  try { playwright = await resolvePlaywrightImport(); } catch { return t.skip('Playwright is not available in the current user cache.'); }
  const browser = await playwright.chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await installFixture(page);
    await page.goto('https://javdb.com/recommend-archive');
    await page.evaluate(source => window.eval(source), bundle);
    await page.waitForFunction(() => document.documentElement.classList.contains('jdb-ra-native'));
    await page.waitForFunction(() => document.querySelectorAll('.jdb-ra-stream .movie-list').length === 2);
    assert.ok(await page.locator('#host-addon').count());
    assert.equal(await page.locator('nav.main-nav').count(), 1);
    assert.equal(await page.locator('[data-jdb-ra-site-chrome="probe"]').count(), 0);
    assert.equal(await page.locator('.jdb-ra-bar-row').first().evaluate(node => getComputedStyle(node).display), 'flex');

    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = '.javdb-card-grid{--jav-card-columns:3;display:grid!important;grid-template-columns:repeat(var(--jav-card-columns),minmax(0,1fr))!important;gap:13px!important}' +
        '.javdb-card-grid .jav-card-image{object-fit:cover!important;object-position:right center!important}';
      document.head.appendChild(style);
      const first = document.querySelector('.movie-list');
      first.classList.add('jav-card-grid', 'javdb-card-grid');
      first.dataset.laosijiGrid = '1';
      first.querySelector('.item').dataset.laosijiGridCard = '1';
      first.querySelector('img').classList.add('jav-card-image');
    });
    await page.waitForFunction(() => document.querySelectorAll('.movie-list')[1].style.getPropertyValue('--jav-card-columns') === '3');
    assert.equal(await page.locator('.movie-list').nth(1).locator('img').evaluate(node => node.style.objectFit), 'cover');

    await page.evaluate(() => {
      const second = document.querySelectorAll('.movie-list')[1];
      second.classList.add('jav-card-grid', 'javdb-card-grid');
      second.dataset.laosijiGrid = '1';
      second.style.setProperty('grid-template-columns', 'repeat(2,minmax(0,1fr))', 'important');
      second.style.setProperty('column-gap', '21px', 'important');
    });
    await page.waitForTimeout(30);
    assert.equal(await page.locator('.movie-list').nth(1).evaluate(node => node.style.columnGap), '21px');

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    assert.equal(await page.locator('.jdb-ra').count(), 0);
    assert.equal(await page.locator('link[data-jdb-ra-site-chrome]').count(), 0);

    const fallback = await browser.newPage();
    await installFixture(fallback, { styles: false });
    await fallback.goto('https://javdb.com/recommend-archive');
    await fallback.evaluate(source => window.eval(source), bundle);
    await fallback.locator('.jdb-ra').waitFor();
    assert.equal(await fallback.evaluate(() => document.documentElement.classList.contains('jdb-ra-native')), false);
    assert.equal(await fallback.locator('link[data-jdb-ra-site-chrome]').count(), 0);
  } finally {
    await browser.close();
  }
});
