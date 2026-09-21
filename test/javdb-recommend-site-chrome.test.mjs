import test from 'node:test';
import assert from 'node:assert/strict';

import { createSiteChrome } from '../src/userscripts/javdb-recommend/javdb-recommend-site-chrome.lib.js';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

function response(html, url = 'https://mirror.example/home') {
  return { ok: true, url, text: async () => html };
}

function installComputedStyleFixture(window, ready = true) {
  const original = window.getComputedStyle.bind(window);
  window.getComputedStyle = node => {
    if (!node.closest?.('[data-jdb-ra-site-chrome="probe"]')) return original(node);
    if (!ready) return { display: 'block', minHeight: '0px', paddingLeft: '2px', paddingTop: '0px', boxShadow: 'none' };
    if (node.matches('nav')) return { display: 'flex', minHeight: '52px' };
    if (node.matches('button')) return { display: 'inline-flex', paddingLeft: '12px' };
    return { display: 'block', paddingTop: '20px', boxShadow: 'rgb(0 0 0 / 10%) 0px 1px 2px' };
  };
}

async function settleLinks(window, event = 'load') {
  for (let index = 0; index < 10 && !window.document.querySelector('link[data-jdb-ra-site-chrome]'); index += 1) {
    await Promise.resolve();
  }
  window.document.querySelectorAll('link[data-jdb-ra-site-chrome]').forEach(link => {
    link.dispatchEvent(new window.Event(event));
  });
}

const HOME = '<html data-theme="dark"><head><base href="/assets/">' +
  '<link rel="stylesheet" href="app.css"><link rel="stylesheet" media="print" href="print.css"></head>' +
  '<body><nav class="navbar main-nav"><button data-target="menu"></button>' +
  '<div id="menu"></div><div class="navbar-start"><a href="/movies">影片</a></div></nav></body></html>';

test('loads every screen stylesheet before enabling native chrome and resolves homepage-relative assets', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  window.document.body.innerHTML = '<main class="jdb-ra"></main>';
  window.matchMedia = query => ({ matches: query !== 'print' });
  installComputedStyleFixture(window, true);
  const changes = [];
  const chrome = createSiteChrome({
    document: window.document,
    window,
    fetch: async () => response(HOME),
    baseUrl: 'https://javdb.com',
    onChange: change => changes.push(change),
  });
  const started = chrome.start();
  assert.equal(chrome.start(), started);
  await settleLinks(window);
  const result = await started;

  assert.deepEqual(result, { status: 'native', reason: 'ready', stylesheets: 1 });
  assert.equal(window.document.querySelector('link[data-jdb-ra-site-chrome]').href, 'https://mirror.example/assets/app.css');
  assert.ok(window.document.documentElement.classList.contains('jdb-ra-native'));
  assert.equal(window.document.documentElement.dataset.theme, 'dark');
  assert.equal(window.document.querySelector('nav.main-nav a').href, 'https://mirror.example/movies');
  assert.ok(window.document.querySelector('nav.main-nav a[href$="/recommend-archive"]'));
  assert.equal(window.document.querySelector('[data-jdb-ra-site-chrome="probe"]'), null);
  assert.equal(window.document.querySelector('.movie-list'), null);
  assert.deepEqual(changes, [result]);
  chrome.dispose();
  await window.happyDOM.close();
});

test('no stylesheet, stylesheet failure, and empty styles all stay in complete fallback mode', { skip: domSkip }, async () => {
  for (const scenario of ['none', 'error', 'empty']) {
    const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    window.document.body.innerHTML = '<main class="jdb-ra"></main>';
    installComputedStyleFixture(window, scenario !== 'empty');
    const html = scenario === 'none' ? '<html><body><nav class="main-nav"></nav></body></html>' : HOME;
    const chrome = createSiteChrome({ document: window.document, window, fetch: async () => response(html), baseUrl: window.location.origin });
    const started = chrome.start();
    if (scenario !== 'none') await settleLinks(window, scenario === 'error' ? 'error' : 'load');
    const result = await started;
    assert.equal(result.status, 'fallback');
    assert.equal(result.reason, scenario === 'none' ? 'no-stylesheets' : scenario === 'error' ? 'stylesheet-error' : 'style-check');
    assert.equal(window.document.querySelectorAll('link[data-jdb-ra-site-chrome]').length, 0);
    assert.equal(window.document.documentElement.classList.contains('jdb-ra-native'), false);
    await window.happyDOM.close();
  }
});

test('a single total deadline covers a stalled homepage and start remains idempotent', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  let timeout;
  let cleared = false;
  const clock = {
    now: () => 0,
    setTimeout: callback => { timeout = callback; return 7; },
    clearTimeout: id => { if (id === 7) cleared = true; },
  };
  const chrome = createSiteChrome({
    document: window.document,
    window,
    fetch: () => new Promise(() => {}),
    clock,
    baseUrl: window.location.origin,
  });
  const started = chrome.start();
  assert.equal(chrome.start(), started);
  timeout();
  assert.deepEqual(await started, { status: 'fallback', reason: 'timeout' });
  assert.equal(cleared, false);
  await window.happyDOM.close();
});

test('dispose wins over a late homepage response and an existing theme is never overwritten', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  window.document.documentElement.dataset.theme = 'light';
  let resolveFetch;
  const pending = new Promise(resolve => { resolveFetch = resolve; });
  const chrome = createSiteChrome({ document: window.document, window, fetch: () => pending, baseUrl: window.location.origin });
  const started = chrome.start();
  chrome.dispose();
  resolveFetch(response(HOME));
  assert.deepEqual(await started, { status: 'disposed', reason: 'disposed' });
  assert.equal(window.document.documentElement.dataset.theme, 'light');
  assert.equal(window.document.querySelector('[data-jdb-ra-site-chrome]'), null);
  assert.equal(window.document.documentElement.classList.contains('jdb-ra-native'), false);
  assert.deepEqual(await chrome.start(), { status: 'disposed', reason: 'disposed' });
  await window.happyDOM.close();
});

test('dispose settles stylesheet loading and late resource events cannot enable native mode', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  installComputedStyleFixture(window, true);
  const chrome = createSiteChrome({ document: window.document, window, fetch: async () => response(HOME), baseUrl: window.location.origin });
  const started = chrome.start();
  for (let index = 0; index < 10 && !window.document.querySelector('link[data-jdb-ra-site-chrome]'); index += 1) await Promise.resolve();
  const link = window.document.querySelector('link[data-jdb-ra-site-chrome]');
  chrome.dispose();
  assert.deepEqual(await started, { status: 'disposed', reason: 'disposed' });
  link.dispatchEvent(new window.Event('load'));
  await Promise.resolve();
  assert.equal(window.document.documentElement.classList.contains('jdb-ra-native'), false);
  assert.equal(window.document.querySelector('link[data-jdb-ra-site-chrome]'), null);
  await window.happyDOM.close();
});

test('existing navigation is reused without duplication and hamburger listeners are removed on dispose', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  window.document.body.innerHTML = '<nav class="main-nav"><button data-target="existing-menu"></button>' +
    '<div id="existing-menu"></div><div class="navbar-start"></div></nav><main class="jdb-ra"></main>';
  installComputedStyleFixture(window, true);
  const chrome = createSiteChrome({ document: window.document, window, fetch: async () => response(HOME), baseUrl: window.location.origin });
  const started = chrome.start();
  await settleLinks(window);
  assert.equal((await started).status, 'native');
  assert.equal(window.document.querySelectorAll('nav.main-nav').length, 1);
  const button = window.document.querySelector('nav.main-nav button');
  button.click();
  assert.ok(button.classList.contains('is-active'));
  chrome.dispose();
  button.click();
  assert.ok(button.classList.contains('is-active'));
  assert.ok(window.document.querySelector('nav.main-nav'));
  await window.happyDOM.close();
});
