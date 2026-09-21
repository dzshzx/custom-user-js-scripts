import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { md5 } from '../src/userscripts/javdb-recommend/javdb-recommend-request.lib.js';

import { createDomWindow, createMemoryStorage, domSkip } from './helpers/dom-env.mjs';
import { parseMetadataBlock } from '../scripts/lib/userscript-metadata.mjs';

const srcPath = path.resolve(
  import.meta.dirname,
  '../src/userscripts/javdb-recommend/javdb-recommend.user.js',
);

const RAW_URL =
  'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/javdb-recommend.user.js';

test('metadata pins auto-update URLs to the dist raw path and carries version 0.0.7', async () => {
  const metadata = parseMetadataBlock(await readFile(srcPath, 'utf8'));
  assert.deepEqual(metadata.get('@version'), ['0.0.7']);
  assert.deepEqual(metadata.get('@downloadURL'), [RAW_URL]);
  assert.deepEqual(metadata.get('@updateURL'), [RAW_URL]);
});

// md5 是签名链的根：S 表错位曾导致摘要全错、decrypt 产出非法 base64，
// 浏览器严格 atob 直接抛错让整个脚本不运行。用已知向量钉死它。
test('md5 matches known vectors', async () => {
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
        release_date: '2026-08-01',
      },
      {
        id: 'vDXan',
        number: 'NFDM-203',
        title: '标题乙',
        origin_title: '标题乙',
        cover_url: 'https://static.example.com/img/x.jpg',
        score: '',
        release_date: '2026-07-15',
      },
    ],
  },
};

// 归档页从官网首页复制样式表与导航（样式表 URL 带部署指纹，只能运行时取）
const CHROME_HTML =
  '<html><head><link rel="stylesheet" media="all" href="/packs/css/app-testhash.css" /></head>' +
  '<body><nav class="navbar is-fixed-top main-nav"><div class="navbar-start"></div></nav></body></html>';

async function runScript(window, fetchImpl, extraGlobals = {}, storage = createMemoryStorage()) {
  const source = await readFile(srcPath, 'utf8');
  window.happyDOM.settings.disableCSSFileLoading = true;
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = node => {
    if (!node.closest?.('[data-jdb-ra-site-chrome="probe"]')) return nativeGetComputedStyle(node);
    if (node.matches('nav')) return { display: 'flex', minHeight: '52px' };
    if (node.matches('button')) return { display: 'inline-flex', paddingLeft: '12px' };
    return { display: 'block', paddingTop: '20px', boxShadow: 'rgb(0 0 0 / 10%) 0px 1px 2px' };
  };
  const nativeLinkListener = window.HTMLLinkElement.prototype.addEventListener;
  window.HTMLLinkElement.prototype.addEventListener = function (type, listener, options) {
    if (this.dataset.jdbRaSiteChrome && type === 'error') return;
    nativeLinkListener.call(this, type, listener, options);
    if (this.dataset.jdbRaSiteChrome && type === 'load') {
      Promise.resolve().then(() => this.dispatchEvent(new window.Event('load')));
    }
  };
  const context = vm.createContext({
    window,
    document: window.document,
    location: window.location,
    localStorage: storage,
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
    window.document.querySelectorAll('link[data-jdb-ra-site-chrome]:not([data-test-loaded])').forEach(link => {
      link.dataset.testLoaded = '1';
      link.dispatchEvent(new window.Event('load'));
    });
  }
  return context;
}

// 切搜索范围分段控件（已加载 / 全部期数）
function switchSearchScope(window, value) {
  const radio = window.document.querySelector(`input[name="jdb-ra-scope"][value="${value}"]`);
  radio.checked = true;
  radio.dispatchEvent(new window.Event('change', { bubbles: true }));
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
  assert.ok(doc.querySelector('link[href$="/packs/css/app-testhash.css"]'));
  assert.ok(doc.querySelector('nav.main-nav'));
  assert.ok(doc.documentElement.classList.contains('jdb-ra-native'));
  assert.match(doc.querySelector('style').textContent, /content-visibility:auto/);
  assert.ok(doc.getElementById('jdb-ra-refresh'));
  assert.ok(doc.getElementById('jdb-ra-clear'));
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

  // 卡片直链影片详情页，新标签打开；评分前缀为内联 Lucide 星形图标（非 emoji）
  const link = cards[0].querySelector('a.box');
  assert.equal(link.getAttribute('href'), 'https://javdb.com/v/0827');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener');
  assert.equal(cards[0].querySelector('.meta').textContent, '4.22 · 发售 2026-08-01');
  assert.ok(cards[0].querySelector('.meta .jdb-ra-score svg.jdb-ra-icon'));
  assert.equal(cards[1].querySelector('.meta').textContent, '发售 2026-07-15');

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
    .filter((item) => item.dataset.jdbRaFiltered !== 'true');
  assert.equal(visible.length, 2);
  assert.match(doc.getElementById('jdb-ra-status').textContent, /命中 2 部/);
  await window.happyDOM.close();
});

test('release-date metadata omits invalid dates without hiding independent score metadata', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  const invalidDetail = {
    success: 1,
    data: {
      period: 2,
      movies: [
        { ...DETAIL.data.movies[0], release_date: '2025-02-29' },
        { ...DETAIL.data.movies[1], release_date: '2026-99-99' },
      ],
    },
  };
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    const payload = url.includes('recommend_periods') ? PERIODS : invalidDetail;
    return { ok: true, json: async () => payload };
  }, { IntersectionObserver: class { observe() {} disconnect() {} } });

  const cards = window.document.querySelectorAll('.jdb-ra-sec .item');
  assert.equal(cards[0].querySelector('.meta').textContent, '4.22');
  assert.equal(cards[1].querySelector('.meta'), null);
  await window.happyDOM.close();
});

test('the actual bundle renders damaged period metadata as text and preserves third-party body nodes', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  const thirdPartyNode = window.document.createElement('aside');
  thirdPartyNode.id = 'third-party-state';
  window.document.body.appendChild(thirdPartyNode);
  const damaged = {
    success: 1,
    data: {
      periods: [{
        period: 2,
        movies_count: '<img src=x>',
        views_count: 0,
        created_at: '<strong>today</strong>',
      }],
    },
  };
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    return { ok: true, json: async () => url.includes('recommend_periods') ? damaged : DETAIL };
  }, { IntersectionObserver: class { observe() {} disconnect() {} } });

  const document = window.document;
  assert.equal(document.getElementById('third-party-state'), thirdPartyNode);
  assert.equal(document.querySelector('.jdb-ra-ph').textContent, '第 2 期 — · — 部');
  assert.equal(document.querySelector('.jdb-ra-ph em, .jdb-ra-ph img, .jdb-ra-ph strong'), null);
  await window.happyDOM.close();
});

test('later period grids follow the column setting applied to the first grid by another userscript', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  let ioCallback = null;
  class FakeIO {
    constructor(cb) { ioCallback = cb; }
    observe() {}
    disconnect() {}
  }
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
    return { ok: true, json: async () => payload };
  }, { IntersectionObserver: FakeIO });

  const firstGrid = window.document.querySelector('.jdb-ra-sec .movie-list');
  firstGrid.classList.add('jav-card-grid', 'javdb-card-grid');
  firstGrid.style.setProperty('--jav-card-columns', '5');
  firstGrid.style.setProperty('grid-template-columns', 'repeat(5, minmax(0, 1fr))', 'important');
  firstGrid.style.setProperty('column-gap', '14px', 'important');
  firstGrid.style.setProperty('row-gap', '14px', 'important');

  ioCallback([{ isIntersecting: true }]);
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));

  const grids = [...window.document.querySelectorAll('.jdb-ra-sec .movie-list')];
  assert.equal(grids.length, 2);
  for (const grid of grids) {
    assert.equal(grid.style.getPropertyValue('grid-template-columns'), 'repeat(5, minmax(0, 1fr))');
    assert.equal(grid.style.getPropertyPriority('grid-template-columns'), 'important');
    assert.equal(grid.style.getPropertyValue('column-gap'), '14px');
    assert.equal(grid.style.getPropertyValue('row-gap'), '14px');
  }

  firstGrid.style.setProperty('--jav-card-columns', '4');
  firstGrid.style.setProperty('grid-template-columns', 'repeat(4, minmax(0, 1fr))', 'important');
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  for (const grid of grids) {
    assert.equal(grid.style.getPropertyValue('grid-template-columns'), 'repeat(4, minmax(0, 1fr))');
  }
  await window.happyDOM.close();
});

test('layout copying leaves enhanced grids independent and releases only owned inline values on takeover', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  let ioCallback = null;
  class FakeIO {
    constructor(callback) { ioCallback = callback; }
    observe() {}
    disconnect() {}
  }
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    return { ok: true, json: async () => url.includes('recommend_periods') ? PERIODS : DETAIL };
  }, { IntersectionObserver: FakeIO });

  const first = window.document.querySelector('.movie-list');
  first.classList.add('javdb-card-grid');
  first.dataset.laosijiGrid = '1';
  first.style.setProperty('grid-template-columns', 'repeat(6, minmax(0, 1fr))', 'important');
  first.style.setProperty('column-gap', '12px', 'important');
  first.style.setProperty('row-gap', '16px', 'important');
  const sourceImage = first.querySelector('img');
  sourceImage.style.setProperty('object-fit', 'cover', 'important');

  ioCallback([{ isIntersecting: true }]);
  for (let index = 0; index < 20; index += 1) await new Promise(resolve => setTimeout(resolve, 0));
  const second = window.document.querySelectorAll('.movie-list')[1];
  assert.equal(second.style.getPropertyValue('grid-template-columns'), 'repeat(6, minmax(0, 1fr))');
  assert.equal(second.querySelector('img').style.getPropertyValue('object-fit'), 'cover');

  second.style.setProperty('column-gap', '23px', 'important');
  second.classList.add('javdb-card-grid');
  second.dataset.laosijiGrid = '1';
  second.style.setProperty('grid-template-columns', 'repeat(3, minmax(0, 1fr))', 'important');
  for (let index = 0; index < 10; index += 1) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(second.style.getPropertyValue('grid-template-columns'), 'repeat(3, minmax(0, 1fr))');
  assert.equal(second.style.getPropertyValue('column-gap'), '23px');
  assert.equal(first.style.getPropertyValue('grid-template-columns'), 'repeat(6, minmax(0, 1fr))');
  await window.happyDOM.close();
});

test('a fresh local cache avoids refetching the period catalog and loaded period details on reopen', { skip: domSkip }, async () => {
  const storage = createMemoryStorage();
  const firstCalls = [];
  const firstWindow = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  await runScript(firstWindow, async (url) => {
    firstCalls.push(url);
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
    return { ok: true, json: async () => payload };
  }, { IntersectionObserver: class { observe() {} disconnect() {} } }, storage);

  assert.equal(firstCalls.filter((url) => url.includes('recommend_periods')).length, 1);
  assert.equal(firstCalls.filter((url) => /\/api\/v1\/movies\/recommend\?/.test(url)).length, 1);

  const secondCalls = [];
  const secondWindow = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  await runScript(secondWindow, async (url) => {
    secondCalls.push(url);
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
    return { ok: true, json: async () => payload };
  }, { IntersectionObserver: class { observe() {} disconnect() {} } }, storage);

  assert.equal(secondWindow.document.querySelectorAll('.jdb-ra-sec .item').length, 2);
  assert.equal(secondWindow.document.querySelector('.jdb-ra-sec .item .meta').textContent, '4.22 · 发售 2026-08-01');
  assert.equal(secondCalls.filter((url) => url.includes('/api/v1/movies/')).length, 0);
  assert.equal(secondCalls.filter((url) => url === 'https://javdb.com/').length, 1);
  firstWindow.close();
  secondWindow.close();
});

test('stream rendering and full-archive search share one in-flight detail request per period', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  let resolveDetail;
  const detailResponse = new Promise((resolve) => { resolveDetail = resolve; });
  const calls = [];
  await runScript(window, async (url) => {
    calls.push(url);
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    if (url.includes('recommend_periods')) return { ok: true, json: async () => PERIODS };
    await detailResponse;
    return { ok: true, json: async () => DETAIL };
  }, { IntersectionObserver: class { observe() {} disconnect() {} } });

  const search = window.document.getElementById('jdb-ra-search');
  search.value = 'HND';
  switchSearchScope(window, 'all');
  window.document.getElementById('jdb-ra-gsearch').click();
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.filter((url) => /\/api\/v1\/movies\/recommend\?/.test(url)).length, 2);
  assert.equal(calls.filter((url) => /\/api\/v1\/movies\/recommend\?period=2/.test(url)).length, 1);

  resolveDetail();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(calls.filter((url) => /\/api\/v1\/movies\/recommend\?/.test(url)).length, 2);
  await window.happyDOM.close();
});

test('a distant period jump re-anchors the stream without loading intermediate periods', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  const jumpPeriods = Array.from({ length: 5 }, (_, index) => ({
    period: 5 - index,
    movies_count: 1,
    views_count: 0,
    created_at: `2026-08-${String(5 - index).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const detailCalls = [];
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    if (url.includes('recommend_periods')) {
      return { ok: true, json: async () => ({ success: 1, data: { periods: jumpPeriods } }) };
    }
    const period = Number(new URL(url).searchParams.get('period'));
    detailCalls.push(period);
    return {
      ok: true,
      json: async () => ({
        success: 1,
        data: {
          movies: [{
            id: String(period),
            number: `TEST-${period}`,
            title: `影片${period}`,
            origin_title: `影片${period}`,
            cover_url: '',
            score: '4.0',
            release_date: '2026-08-01',
          }],
        },
      }),
    };
  }, { IntersectionObserver: class { observe() {} disconnect() {} } });

  const initialGrid = window.document.querySelector('.jdb-ra-sec .movie-list');
  initialGrid.classList.add('jav-card-grid', 'javdb-card-grid');
  initialGrid.style.setProperty('--jav-card-columns', '5');
  initialGrid.style.setProperty('grid-template-columns', 'repeat(5, minmax(0, 1fr))', 'important');
  initialGrid.style.setProperty('column-gap', '14px', 'important');
  initialGrid.style.setProperty('row-gap', '14px', 'important');
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));

  const jump = window.document.getElementById('jdb-ra-jump');
  jump.value = '2';
  jump.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  // 骨架卡也带 .item；等真实卡片（a.box）才算加载完成
  for (let i = 0; i < 100 && !window.document.querySelector('.jdb-ra-sec[data-period="2"] .item .box'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.deepEqual(detailCalls, [5, 2]);
  assert.deepEqual(
    [...window.document.querySelectorAll('.jdb-ra-sec')].map((section) => Number(section.dataset.period)),
    [2],
  );
  assert.equal(
    window.document.querySelector('.jdb-ra-sec[data-period="2"] .movie-list').style.getPropertyValue('grid-template-columns'),
    'repeat(5, minmax(0, 1fr))',
  );

  window.document.getElementById('jdb-ra-prev').click();
  for (let i = 0; i < 100 && !window.document.querySelector('.jdb-ra-sec[data-period="1"] .item .box'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.deepEqual(detailCalls, [5, 2, 1]);
  assert.deepEqual(
    [...window.document.querySelectorAll('.jdb-ra-sec')].map((section) => Number(section.dataset.period)),
    [2, 1],
  );

  jump.value = '5';
  jump.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < 100 && !window.document.querySelector('.jdb-ra-sec[data-period="5"] .item .box'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.deepEqual(detailCalls, [5, 2, 1]);
  assert.deepEqual(
    [...window.document.querySelectorAll('.jdb-ra-sec')].map((section) => Number(section.dataset.period)),
    [5],
  );
  await window.happyDOM.close();
});

test('a jump intent preempts a visible sentinel chain while the current period is still loading', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  const jumpPeriods = Array.from({ length: 5 }, (_, index) => ({
    period: 5 - index,
    movies_count: 1,
    views_count: 0,
    created_at: `2026-08-${String(5 - index).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const detailCalls = [];
  let ioCallback;
  let releaseFirst;
  let releaseTarget;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const targetGate = new Promise((resolve) => { releaseTarget = resolve; });
  class FakeIO {
    constructor(callback) { ioCallback = callback; }
    observe() {}
    disconnect() {}
  }
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    if (url.includes('recommend_periods')) {
      return { ok: true, json: async () => ({ success: 1, data: { periods: jumpPeriods } }) };
    }
    const period = Number(new URL(url).searchParams.get('period'));
    detailCalls.push(period);
    if (period === 5) await firstGate;
    if (period === 2) await targetGate;
    return {
      ok: true,
      json: async () => ({ success: 1, data: { movies: [{ ...DETAIL.data.movies[0], id: String(period), number: `TEST-${period}` }] } }),
    };
  }, { IntersectionObserver: FakeIO });

  ioCallback([{ isIntersecting: true }]);
  const jump = window.document.getElementById('jdb-ra-jump');
  jump.value = '2';
  jump.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < 100 && !detailCalls.includes(2); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.deepEqual(detailCalls, [5, 2]);
  releaseTarget();
  for (let i = 0; i < 100 && !window.document.querySelector('.jdb-ra-sec[data-period="1"] .item'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(detailCalls, [5, 2, 1]);
  assert.deepEqual(
    [...window.document.querySelectorAll('.jdb-ra-sec')].map((section) => Number(section.dataset.period)),
    [2, 1],
  );
  await window.happyDOM.close();
});

test('a failed load does not retry forever or override a newer jump intent', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  const jumpPeriods = Array.from({ length: 5 }, (_, index) => ({
    period: 5 - index,
    movies_count: 1,
    views_count: 0,
    created_at: `2026-08-${String(5 - index).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const detailCalls = [];
  const attempts = new Map();
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    if (url.includes('recommend_periods')) {
      return { ok: true, json: async () => ({ success: 1, data: { periods: jumpPeriods } }) };
    }
    const period = Number(new URL(url).searchParams.get('period'));
    detailCalls.push(period);
    attempts.set(period, (attempts.get(period) || 0) + 1);
    if (period === 2 && attempts.get(period) === 1) throw new Error('planned detail failure');
    return {
      ok: true,
      json: async () => ({ success: 1, data: { movies: [{ ...DETAIL.data.movies[0], id: String(period), number: `TEST-${period}` }] } }),
    };
  }, {
    IntersectionObserver: class { observe() {} disconnect() {} },
  });

  const jump = window.document.getElementById('jdb-ra-jump');
  jump.value = '2';
  jump.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < 100 && (attempts.get(2) || 0) === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(attempts.get(2), 1);

  jump.value = '5';
  jump.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < 100 && !window.document.querySelector('.jdb-ra-sec[data-period="5"] .item'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.deepEqual(detailCalls, [5, 2]);
  assert.deepEqual(
    [...window.document.querySelectorAll('.jdb-ra-sec')].map((section) => Number(section.dataset.period)),
    [5],
  );
  await window.happyDOM.close();
});

test('an expired catalog stops at the first overlap and reuses the cached tail', { skip: domSkip }, async () => {
  const storage = createMemoryStorage();
  const now = Date.now();
  const cachedPeriods = Array.from({ length: 60 }, (_, index) => ({
    period: 60 - index,
    movies_count: 1,
    views_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  }));
  storage.setItem('javdb_recommend_periods_cache_v1', JSON.stringify({
    version: 1,
    fetchedAt: now - 7 * 60 * 60 * 1000,
    fullFetchedAt: now - 24 * 60 * 60 * 1000,
    periods: cachedPeriods,
  }));
  const remotePage = [{ ...cachedPeriods[0], period: 61 }, ...cachedPeriods.slice(0, 47)];
  const calls = [];
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  await runScript(window, async (url) => {
    calls.push(url);
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    if (url.includes('recommend_periods')) {
      const page = Number(new URL(url).searchParams.get('page'));
      return { ok: true, json: async () => ({ success: 1, data: { periods: page === 1 ? remotePage : [] } }) };
    }
    return { ok: true, json: async () => ({ success: 1, data: { movies: [] } }) };
  }, { IntersectionObserver: class { observe() {} disconnect() {} }, AbortController }, storage);

  assert.equal(calls.filter((url) => url.includes('recommend_periods')).length, 1);
  const saved = JSON.parse(storage.getItem('javdb_recommend_periods_cache_v1'));
  assert.equal(saved.periods.length, 61);
  assert.deepEqual(saved.periods.slice(0, 3).map((item) => item.period), [61, 60, 59]);
  assert.equal(saved.periods.at(-1).period, 1);
  assert.match(window.document.getElementById('jdb-ra-status').textContent, /增量更新/);
  await window.happyDOM.close();
});

test('a full catalog refresh deduplicates an issue repeated across moving page boundaries', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  const pageOne = Array.from({ length: 48 }, (_, index) => ({
    period: 100 - index,
    movies_count: 1,
    views_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  }));
  const pageTwo = [pageOne.at(-1), ...Array.from({ length: 10 }, (_, index) => ({
    period: 52 - index,
    movies_count: 1,
    views_count: 0,
    created_at: '2025-12-01T00:00:00.000Z',
  }))];
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    if (url.includes('recommend_periods')) {
      const page = Number(new URL(url).searchParams.get('page'));
      return { ok: true, json: async () => ({ success: 1, data: { periods: page === 1 ? pageOne : pageTwo } }) };
    }
    return { ok: true, json: async () => ({ success: 1, data: { movies: [] } }) };
  }, { IntersectionObserver: class { observe() {} disconnect() {} }, AbortController });

  const optionPeriods = [...window.document.querySelectorAll('#jdb-ra-select option')].map((option) => Number(option.value));
  assert.equal(optionPeriods.length, 58);
  assert.equal(new Set(optionPeriods).size, 58);
  assert.deepEqual(optionPeriods.slice(-3), [45, 44, 43]);
  await window.happyDOM.close();
});

test('a completed search index makes the same search local-only after reopen', { skip: domSkip }, async () => {
  const storage = createMemoryStorage();
  const searchPeriods = [3, 2, 1].map((period) => ({
    period,
    movies_count: 1,
    views_count: 0,
    created_at: `2026-08-0${period}T00:00:00.000Z`,
  }));
  const openAndSearch = async () => {
    const calls = [];
    const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    await runScript(window, async (url) => {
      calls.push(url);
      if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
      if (url.includes('recommend_periods')) {
        return { ok: true, json: async () => ({ success: 1, data: { periods: searchPeriods } }) };
      }
      const period = Number(new URL(url).searchParams.get('period'));
      return {
        ok: true,
        json: async () => ({ success: 1, data: { movies: [{ ...DETAIL.data.movies[0], id: String(period), number: `TEST-${period}` }] } }),
      };
    }, { IntersectionObserver: class { observe() {} disconnect() {} }, AbortController }, storage);
    window.document.getElementById('jdb-ra-search').value = 'TEST';
    switchSearchScope(window, 'all');
    window.document.getElementById('jdb-ra-gsearch').click();
    for (let i = 0; i < 100 && window.document.getElementById('jdb-ra-gsearch').textContent === '停止'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return { window, calls };
  };

  const first = await openAndSearch();
  assert.equal(first.calls.filter((url) => /\/api\/v1\/movies\/recommend\?/.test(url)).length, 3);
  assert.equal(first.window.document.querySelectorAll('.jdb-ra-results .jdb-ra-sec').length, 3);
  assert.deepEqual(
    [...first.window.document.querySelectorAll('.jdb-ra-results .jdb-ra-ph')].map((heading) => heading.textContent.trim()),
    ['第 3 期', '第 2 期', '第 1 期'],
  );
  await first.window.happyDOM.close();

  const second = await openAndSearch();
  assert.equal(second.calls.filter((url) => /\/api\/v1\/movies\/recommend\?/.test(url)).length, 0);
  assert.equal(second.window.document.querySelectorAll('.jdb-ra-results .jdb-ra-sec').length, 3);
  await second.window.happyDOM.close();
});

test('retryable detail failures stop after bounded exponential retries', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  let attempts = 0;
  const fastRetryTimeout = (callback, delay) => {
    if (delay === 500 || delay === 1000) return setTimeout(callback, 0);
    return setTimeout(callback, delay);
  };
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    if (url.includes('recommend_periods')) return { ok: true, json: async () => PERIODS };
    attempts += 1;
    if (attempts < 3) return { ok: false, status: 500 };
    return { ok: true, json: async () => DETAIL };
  }, {
    IntersectionObserver: class { observe() {} disconnect() {} },
    AbortController,
    setTimeout: fastRetryTimeout,
  });

  for (let i = 0; i < 100 && !window.document.querySelector('.jdb-ra-sec .item'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(attempts, 3);
  assert.ok(window.document.querySelector('.jdb-ra-sec .item'));
  await window.happyDOM.close();
});

test('re-anchoring aborts an obsolete detail request with no other consumers', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  const jumpPeriods = [5, 2].map((period) => ({
    period,
    movies_count: 1,
    views_count: 0,
    created_at: '2026-08-01T00:00:00.000Z',
  }));
  let aborted = 0;
  let periodFiveAttempts = 0;
  await runScript(window, async (url, options = {}) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    if (url.includes('recommend_periods')) {
      return { ok: true, json: async () => ({ success: 1, data: { periods: jumpPeriods } }) };
    }
    const period = Number(new URL(url).searchParams.get('period'));
    if (period === 5) {
      periodFiveAttempts += 1;
      if (periodFiveAttempts > 1) {
        return {
          ok: true,
          json: async () => ({ success: 1, data: { movies: [{ ...DETAIL.data.movies[0], id: '5', number: 'TEST-5' }] } }),
        };
      }
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted += 1;
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
    return {
      ok: true,
      json: async () => ({ success: 1, data: { movies: [{ ...DETAIL.data.movies[0], id: '2', number: 'TEST-2' }] } }),
    };
  }, { IntersectionObserver: class { observe() {} disconnect() {} }, AbortController });

  const jump = window.document.getElementById('jdb-ra-jump');
  jump.value = '2';
  jump.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < 100 && !window.document.querySelector('.jdb-ra-sec[data-period="2"] .item'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(aborted, 1);
  assert.ok(window.document.querySelector('.jdb-ra-sec[data-period="2"] .item'));

  jump.value = '5';
  jump.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < 100 && !window.document.querySelector('.jdb-ra-sec[data-period="5"] .item'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(periodFiveAttempts, 2);
  assert.ok(window.document.querySelector('.jdb-ra-sec[data-period="5"] .item'));
  await window.happyDOM.close();
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
  await window.happyDOM.close();
});

/* ---------- Phase 3：图标 / 分段搜索 / 骨架屏 / 封面占位 / 窄屏工具栏 ---------- */

test('toolbar icons are inline Lucide SVGs and the source carries no emoji icons', async () => {
  const source = await readFile(srcPath, 'utf8');
  for (const emoji of ['🔍', '◀', '▶', '★', '←']) {
    assert.equal(source.includes(emoji), false, `source still contains ${emoji}`);
  }
  const viewSource = await readFile(new URL('../src/userscripts/javdb-recommend/javdb-recommend-view.lib.js', import.meta.url), 'utf8');
  assert.match(viewSource, /vendored from Lucide/);

  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
    return { ok: true, json: async () => payload };
  }, { IntersectionObserver: class { observe() {} disconnect() {} } });

  const doc = window.document;
  assert.ok(doc.querySelector('.jdb-ra-hd .home svg.jdb-ra-icon'));
  assert.ok(doc.querySelector('#jdb-ra-prev svg.jdb-ra-icon'));
  assert.ok(doc.querySelector('#jdb-ra-next svg.jdb-ra-icon'));
  // 图标+文字并存，不是图标-only 按钮
  assert.match(doc.getElementById('jdb-ra-prev').textContent, /上一期/);
  assert.match(doc.getElementById('jdb-ra-next').textContent, /下一期/);
  assert.match(doc.querySelector('.jdb-ra-hd .home').textContent, /返回首页/);
  assert.equal(doc.getElementById('jdb-ra-search').placeholder, '搜索已加载内容');
  await window.happyDOM.close();
});

test('the segmented control disambiguates loaded-filter from full-archive search', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
    return { ok: true, json: async () => payload };
  }, { IntersectionObserver: class { observe() {} disconnect() {} } });

  const doc = window.document;
  const radios = [...doc.querySelectorAll('input[name="jdb-ra-scope"]')];
  assert.equal(radios.length, 2);
  assert.ok(doc.querySelector('.jdb-ra-scope[role="radiogroup"]'));
  assert.equal(radios[0].checked, true);
  assert.equal(radios[0].value, 'loaded');

  const search = doc.getElementById('jdb-ra-search');
  search.value = 'HND';

  // 「已加载」段：输入即过滤
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.match(doc.getElementById('jdb-ra-status').textContent, /已加载内容中命中 1 部/);

  // 过滤激活时切到「全部期数」：撤销过滤，提示显式触发
  switchSearchScope(window, 'all');
  assert.match(doc.getElementById('jdb-ra-status').textContent, /在全部期数中搜索/);
  const visible = [...doc.querySelectorAll('.jdb-ra-stream .item')]
    .filter((item) => item.style.display !== 'none');
  assert.equal(visible.length, 2);

  // 全期模式下输入不做即时过滤
  search.value = 'HND-499';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.doesNotMatch(doc.getElementById('jdb-ra-status').textContent, /已加载内容中命中/);

  // 回车触发全期搜索（两期都已缓存，本地索引直接命中；两期 fixture 各含一张 HND-499）
  search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < 100 && doc.getElementById('jdb-ra-gsearch').textContent === '停止'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.match(doc.getElementById('jdb-ra-status').textContent, /搜索完成 · 命中 2 部（2 期）/);
  assert.equal(doc.querySelectorAll('.jdb-ra-results .jdb-ra-sec').length, 2);

  // 切回「已加载」：退出结果模式，恢复即时过滤
  switchSearchScope(window, 'loaded');
  assert.equal(doc.getElementById('jdb-ra-results').hidden, true);
  assert.match(doc.getElementById('jdb-ra-status').textContent, /已加载内容中命中 1 部/);

  // 「已加载」段点全期搜索按钮只给提示，不启动
  doc.getElementById('jdb-ra-gsearch').click();
  assert.match(doc.getElementById('jdb-ra-status').textContent, /切换到「全部期数」/);
  await window.happyDOM.close();
});

test('period sections render skeleton cards while loading and swap in real cards', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  let resolveDetail;
  const detailGate = new Promise((resolve) => { resolveDetail = resolve; });
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    if (url.includes('recommend_periods')) return { ok: true, json: async () => PERIODS };
    await detailGate;
    return { ok: true, json: async () => DETAIL };
  }, { IntersectionObserver: class { observe() {} disconnect() {} } });

  const doc = window.document;
  // 详情未返回：期区块里是与卡片同宽高比的骨架占位
  const section = doc.querySelector('.jdb-ra-stream .jdb-ra-sec');
  assert.ok(section);
  const skeletons = section.querySelectorAll('.jdb-ra-skel');
  assert.equal(skeletons.length, 3); // movies_count=2 → 最少 3 张
  assert.ok(section.querySelector('.jdb-ra-skel-cover'));
  assert.equal(section.querySelectorAll('.jdb-ra-sec .item .box').length, 0);
  assert.match(doc.querySelector('.jdb-ra style, style')?.textContent || '', /padding-top:67%/);

  resolveDetail();
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(section.querySelectorAll('.jdb-ra-skel').length, 0);
  assert.equal(section.querySelectorAll('.item .box').length, 2);
  await window.happyDOM.close();
});

test('a failed cover image is replaced by a labelled placeholder instead of a hole', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  await runScript(window, async (url) => {
    if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
    const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
    return { ok: true, json: async () => payload };
  }, { IntersectionObserver: class { observe() {} disconnect() {} } });

  const doc = window.document;
  const img = doc.querySelector('.jdb-ra-sec .item .cover img');
  img.dispatchEvent(new window.Event('error', { bubbles: false }));

  const cover = img.closest('.cover');
  assert.equal(img.style.display, 'none');
  const placeholder = cover.querySelector('.jdb-ra-cover-ph');
  assert.ok(placeholder);
  assert.equal(placeholder.getAttribute('role'), 'img');
  assert.equal(placeholder.getAttribute('aria-label'), '封面加载失败');
  assert.ok(placeholder.querySelector('svg.jdb-ra-icon'));

  // 重复 error 不叠加占位
  img.dispatchEvent(new window.Event('error', { bubbles: false }));
  assert.equal(cover.querySelectorAll('.jdb-ra-cover-ph').length, 1);
  await window.happyDOM.close();
});

test('the sticky toolbar splits into two rows on narrow viewports with recalculated offsets', async () => {
  const source = await readFile(srcPath, 'utf8');
  // 两行结构：期数导航行 / 搜索与动作行
  assert.match(source, /jdb-ra-bar-row jdb-ra-bar-nav/);
  assert.match(source, /jdb-ra-bar-row jdb-ra-bar-tools/);
  // 宽屏行容器透明（display:contents），窄屏转两行 flex
  assert.match(source, /\.jdb-ra-bar-row\{display:contents\}/);
  assert.match(source, /@media \(max-width:768px\)[^]*\.jdb-ra-bar\{flex-direction:column/);
  // 锚点滚动边距随两行高度重新核算，native（吸顶 52px）/兜底分别给出
  assert.match(source, /scroll-margin-top:150px/);
  assert.match(source, /html:not\(\.jdb-ra-native\) \.jdb-ra \.jdb-ra-sec\{scroll-margin-top:96px\}/);
});
