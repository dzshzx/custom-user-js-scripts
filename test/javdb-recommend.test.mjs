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

test('metadata pins auto-update URLs to the src raw path and carries version 0.0.4', async () => {
  const metadata = parseMetadataBlock(await readFile(srcPath, 'utf8'));
  assert.deepEqual(metadata.get('@version'), ['0.0.4']);
  assert.deepEqual(metadata.get('@downloadURL'), [RAW_URL]);
  assert.deepEqual(metadata.get('@updateURL'), [RAW_URL]);
});

// md5 是签名链的根：S 表错位曾导致摘要全错、decrypt 产出非法 base64，
// 浏览器严格 atob 直接抛错让整个脚本不运行。用已知向量钉死它。
test('md5 matches known vectors', async () => {
  const source = await readFile(srcPath, 'utf8');
  const md5Source = source.match(/function md5\(s\) \{[\s\S]*?\n  \}/);
  assert.ok(md5Source, 'md5 function source should be extractable');
  const md5 = new Function(`${md5Source[0]}; return md5;`)();
  assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(md5('30820'), 'da97c8240e2ad99a2d331eed95c411f5');
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

// 归档页从官网首页复制样式表与导航（样式表 URL 带部署指纹，只能运行时取）
const CHROME_HTML =
  '<html><head><link rel="stylesheet" media="all" href="/packs/css/app-testhash.css" /></head>' +
  '<body><nav class="navbar is-fixed-top main-nav"><div class="navbar-start"></div></nav></body></html>';

async function runScript(window, fetchImpl, extraGlobals) {
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
    // Node 全局 atob 与浏览器同为严格语义（非法 base64 抛 InvalidCharacterError），直接传入；
    // 不要用 Buffer 包装——宽容解码会吞掉 decrypt 产出的非法字符，掩盖签名链错误
    atob,
    Uint8Array,
    DOMParser: window.DOMParser,
    setTimeout,
    clearTimeout,
    ...extraGlobals,
  });
  vm.runInContext(source, context, { filename: 'javdb-recommend.user.js' });
  // 等待期数列表、首期详情与官网外观的 promise 链落定
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return context;
}

test('standalone archive page adopts site chrome and streams native-style cards', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  const calls = [];
  let ioCallback = null;
  class FakeIO {
    constructor(cb) { ioCallback = cb; }
    observe() {}
    disconnect() {}
  }
  await runScript(window, async (url) => {
    calls.push(url);
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
    return { ok: true, json: async () => payload };
  }, { IntersectionObserver: FakeIO });

  const doc = window.document;
  assert.equal(doc.title, '佳片推荐 · 历史期数 - JavDB');

  // 官网样式表与导航复制自首页，并打上 jdb-ra-native 标记
  assert.ok(doc.querySelector('link[href="/packs/css/app-testhash.css"]'));
  assert.ok(doc.querySelector('nav.main-nav'));
  assert.ok(doc.documentElement.classList.contains('jdb-ra-native'));
  // 导航里补上归档页自身入口
  assert.ok(doc.querySelector('nav.main-nav .navbar-start a[href="/recommend-archive"]'));

  // 首期按官网原生 movie-list 结构渲染
  const cards = doc.querySelectorAll('.jdb-ra .jdb-ra-stream .item');
  assert.equal(cards.length, 2);

  // 封面从 App 图床 tp.spfcas.com 改写为官网图床 c0.jdbstatic.com；横版完整显示（contain 不裁切）
  const img = cards[0].querySelector('img');
  assert.equal(img.getAttribute('src'), 'https://c0.jdbstatic.com/covers/08/0827.jpg');
  assert.ok(cards[0].querySelector('.cover').classList.contains('contain'));
  // 不匹配 /covers/ 路径的地址保持原样
  const img2 = cards[1].querySelector('img');
  assert.equal(img2.getAttribute('src'), 'https://static.example.com/img/x.jpg');

  // 卡片直链影片详情页，新标签打开
  const link = cards[0].querySelector('a.box');
  assert.equal(link.getAttribute('href'), 'https://javdb.com/v/0827');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener');

  assert.ok(doc.querySelector('.jdb-ra-ph').textContent.includes('第 2 期'));
  assert.equal(doc.querySelectorAll('#jdb-ra-select option').length, 2);
  // 期数列表 + 首期详情 + 官网首页外观各一次请求
  assert.equal(calls.length, 3);

  // 哨兵进入视口（滚动到底）→ 追加下一期
  ioCallback([{ isIntersecting: true }]);
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(doc.querySelectorAll('.jdb-ra-stream .jdb-ra-sec').length, 2);
  assert.equal(calls.length, 4);

  // 搜索已加载内容：即时过滤，隐藏不匹配卡片；两期各命中同一张 HND-499
  const search = doc.getElementById('jdb-ra-search');
  search.value = 'HND';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 400)); // 300ms 防抖
  const visible = [...doc.querySelectorAll('.jdb-ra-stream .item')]
    .filter((item) => item.style.display !== 'none');
  assert.equal(visible.length, 2);
  assert.match(doc.getElementById('jdb-ra-status').textContent, /命中 2 部/);
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
