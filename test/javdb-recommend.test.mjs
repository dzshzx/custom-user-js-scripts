import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import { createDomWindow, createMemoryStorage, domSkip } from './helpers/dom-env.mjs';
import { parseMetadataBlock } from '../scripts/lib/userscript-metadata.mjs';

const srcPath = path.resolve(
  import.meta.dirname,
  '../src/userscripts/javdb-recommend/javdb-recommend.user.js',
);

const RAW_URL =
  'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/javdb-recommend/javdb-recommend.user.js';

test('metadata pins auto-update URLs to the src raw path and carries version 0.0.2', async () => {
  const metadata = parseMetadataBlock(await readFile(srcPath, 'utf8'));
  assert.deepEqual(metadata.get('@version'), ['0.0.2']);
  assert.deepEqual(metadata.get('@downloadURL'), [RAW_URL]);
  assert.deepEqual(metadata.get('@updateURL'), [RAW_URL]);
});

const PERIODS = {
  success: 1,
  data: {
    periods: [
      { period: 2, movies_count: 2, views_count: 0, created_at: '2026-08-10T00:00:00.000Z' },
      { period: 1, movies_count: 1, views_count: 0, created_at: '2026-08-06T00:00:00.000Z' },
    ],
    current_page: 1,
  },
};

const DETAIL = {
  success: 1,
  data: {
    period: 2,
    movies: [
      {
        id: '0827',
        number: 'HND-499',
        title: '标题甲',
        origin_title: '标题甲',
        cover_url: 'https://tp.spfcas.com/rhe951l4q/covers/08/0827.jpg',
        score: '4.22',
      },
      {
        id: 'vDXan',
        number: 'NFDM-203',
        title: '标题乙',
        origin_title: '标题乙',
        cover_url: 'https://static.example.com/img/x.jpg',
        score: '4.03',
      },
    ],
  },
};

async function runScript(window, fetchImpl) {
  const source = await readFile(srcPath, 'utf8');
  const context = vm.createContext({
    window,
    document: window.document,
    location: window.location,
    localStorage: createMemoryStorage(),
    fetch: fetchImpl,
    console,
    URLSearchParams,
    TextDecoder,
    // 浏览器 atob 语义 = 字节串；Node 全局 atob 传入 vm 上下文会抛 InvalidCharacterError，用 Buffer 包装
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    Uint8Array,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(source, context, { filename: 'javdb-recommend.user.js' });
  // 等待期数列表与首期详情的 promise 链落定
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return context;
}

test('standalone archive page renders cards with site image host and direct /v/ links', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  const calls = [];
  await runScript(window, async (url) => {
    calls.push(url);
    const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
    return { ok: true, json: async () => payload };
  });

  const doc = window.document;
  assert.equal(doc.title, '佳片推荐 · 历史期数 - JavDB');

  const cards = doc.querySelectorAll('.jdb-ra .card');
  assert.equal(cards.length, 2);

  // 封面从 App 图床 tp.spfcas.com 改写为官网图床 c0.jdbstatic.com
  const img = cards[0].querySelector('img');
  assert.equal(img.getAttribute('src'), 'https://c0.jdbstatic.com/covers/08/0827.jpg');
  // 不匹配 /covers/ 路径的地址保持原样
  const img2 = cards[1].querySelector('img');
  assert.equal(img2.getAttribute('src'), 'https://static.example.com/img/x.jpg');

  // 卡片直链影片详情页，新标签打开
  assert.equal(cards[0].getAttribute('href'), 'https://javdb.com/v/0827');
  assert.equal(cards[0].getAttribute('target'), '_blank');
  assert.equal(cards[0].getAttribute('rel'), 'noopener');

  assert.equal(doc.querySelectorAll('#jdb-ra-select option').length, 2);
  assert.match(doc.getElementById('jdb-ra-status').textContent, /第 2 期 · 共 2 部/);
  // 期数列表与首期详情各一次请求
  assert.equal(calls.length, 2);
});

test('normal pages get a navbar entry pointing at the archive route, without touching the API', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/' });
  window.document.body.innerHTML =
    '<nav class="navbar is-fixed-top is-black is-fluid main-nav">' +
    '<div class="navbar-menu"><div class="navbar-start"></div></div></nav>';

  let fetchCalled = false;
  await runScript(window, async () => {
    fetchCalled = true;
    return { ok: true, json: async () => PERIODS };
  });

  const doc = window.document;
  const entry = doc.querySelector('nav.main-nav .navbar-start a[href="/recommend-archive"]');
  assert.ok(entry);
  assert.equal(entry.textContent, '佳片推荐');
  assert.equal(fetchCalled, false);
  assert.equal(doc.querySelector('.jdb-ra'), null);
});
