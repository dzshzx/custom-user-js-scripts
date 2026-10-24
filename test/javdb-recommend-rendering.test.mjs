import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { md5 } from '../src/userscripts/javdb-recommend/javdb-recommend-request.lib.ts';

import { createDomWindow, createMemoryStorage, domSkip } from './helpers/dom-env.mjs';
import {
  CHROME_HTML,
  DETAIL,
  PERIODS,
  runScript,
  srcPath,
  switchSearchScope,
} from './helpers/javdb-recommend-harness.mjs';
import { parseMetadataBlock } from '../scripts/lib/userscript-metadata.mjs';

// Period-stream loading, caching, jump and retry behaviour lives in
// javdb-recommend-loading.test.mjs; both files share helpers/javdb-recommend-harness.mjs.

const RAW_URL = 'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/javdb-recommend.user.js';

test('metadata pins auto-update URLs to the dist raw path and carries version 0.0.12', async () => {
  const metadata = parseMetadataBlock(await readFile(srcPath, 'utf8'));
  assert.deepEqual(metadata.get('@version'), ['0.0.12']);
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

test('standalone archive page adopts site chrome and streams native-style cards', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  const calls = [];
  let ioCallback = null;
  class FakeIO {
    constructor(cb) {
      ioCallback = cb;
    }
    observe() {}
    disconnect() {}
  }
  await runScript(
    window,
    async (url) => {
      calls.push(url);
      if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
      const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
      return { ok: true, json: async () => payload };
    },
    { IntersectionObserver: FakeIO },
  );

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
  const visible = [...doc.querySelectorAll('.jdb-ra-stream .item')].filter(
    (item) => item.dataset.jdbRaFiltered !== 'true',
  );
  assert.equal(visible.length, 2);
  assert.match(doc.getElementById('jdb-ra-status').textContent, /命中 2 部/);
  await window.happyDOM.close();
});

test(
  'restored browsing position selects the displayed period and lets users choose the latest',
  { skip: domSkip },
  async () => {
    const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    const storage = createMemoryStorage();
    storage.setItem('javdb_recommend_last_period', '593');
    const catalog = [596, 595, 594, 593].map((period) => ({
      period,
      movies_count: 1,
      created_at: '2026-09-21',
    }));
    const requests = [];
    await runScript(
      window,
      async (url) => {
        if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
        if (url.includes('recommend_periods'))
          return { ok: true, json: async () => ({ success: 1, data: { periods: catalog } }) };
        const period = Number(new URL(url).searchParams.get('period'));
        requests.push(period);
        return { ok: true, json: async () => DETAIL };
      },
      {
        IntersectionObserver: class {
          observe() {}
          disconnect() {}
        },
      },
      storage,
    );
    try {
      const select = window.document.getElementById('jdb-ra-select');
      assert.equal(window.document.querySelector('.jdb-ra-sec').dataset.period, '593');
      assert.equal(select.value, '593');
      select.value = '596';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
      for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(window.document.querySelector('.jdb-ra-sec').dataset.period, '596');
      assert.equal(select.value, '596');
      assert.deepEqual(requests, [593, 596]);
    } finally {
      await window.happyDOM.close();
    }
  },
);

test(
  'release-date metadata omits invalid dates without hiding independent score metadata',
  { skip: domSkip },
  async () => {
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
    await runScript(
      window,
      async (url) => {
        if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
        const payload = url.includes('recommend_periods') ? PERIODS : invalidDetail;
        return { ok: true, json: async () => payload };
      },
      {
        IntersectionObserver: class {
          observe() {}
          disconnect() {}
        },
      },
    );

    const cards = window.document.querySelectorAll('.jdb-ra-sec .item');
    assert.equal(cards[0].querySelector('.meta').textContent, '4.22');
    assert.equal(cards[1].querySelector('.meta'), null);
    await window.happyDOM.close();
  },
);

test(
  'the actual bundle renders damaged period metadata as text and preserves third-party body nodes',
  { skip: domSkip },
  async () => {
    const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    const thirdPartyNode = window.document.createElement('aside');
    thirdPartyNode.id = 'third-party-state';
    window.document.body.appendChild(thirdPartyNode);
    const damaged = {
      success: 1,
      data: {
        periods: [
          {
            period: 2,
            movies_count: '<img src=x>',
            views_count: 0,
            created_at: '<strong>today</strong>',
          },
        ],
      },
    };
    await runScript(
      window,
      async (url) => {
        if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
        return { ok: true, json: async () => (url.includes('recommend_periods') ? damaged : DETAIL) };
      },
      {
        IntersectionObserver: class {
          observe() {}
          disconnect() {}
        },
      },
    );

    const document = window.document;
    assert.equal(document.getElementById('third-party-state'), thirdPartyNode);
    assert.equal(document.querySelector('.jdb-ra-ph').textContent, '第 2 期 — · — 部');
    assert.equal(document.querySelector('.jdb-ra-ph em, .jdb-ra-ph img, .jdb-ra-ph strong'), null);
    await window.happyDOM.close();
  },
);

test(
  'later period grids follow the column setting applied to the first grid by another userscript',
  { skip: domSkip },
  async () => {
    const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    let ioCallback = null;
    class FakeIO {
      constructor(cb) {
        ioCallback = cb;
      }
      observe() {}
      disconnect() {}
    }
    await runScript(
      window,
      async (url) => {
        if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
        const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
        return { ok: true, json: async () => payload };
      },
      { IntersectionObserver: FakeIO },
    );

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
  },
);

test(
  'layout copying leaves enhanced grids independent and releases only owned inline values on takeover',
  { skip: domSkip },
  async () => {
    const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    let ioCallback = null;
    class FakeIO {
      constructor(callback) {
        ioCallback = callback;
      }
      observe() {}
      disconnect() {}
    }
    await runScript(
      window,
      async (url) => {
        if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
        return { ok: true, json: async () => (url.includes('recommend_periods') ? PERIODS : DETAIL) };
      },
      { IntersectionObserver: FakeIO },
    );

    const first = window.document.querySelector('.movie-list');
    first.classList.add('javdb-card-grid');
    first.dataset.laosijiGrid = '1';
    first.style.setProperty('grid-template-columns', 'repeat(6, minmax(0, 1fr))', 'important');
    first.style.setProperty('column-gap', '12px', 'important');
    first.style.setProperty('row-gap', '16px', 'important');
    const sourceImage = first.querySelector('img');
    sourceImage.style.setProperty('object-fit', 'cover', 'important');
    sourceImage.style.setProperty('object-position', 'right center', 'important');
    sourceImage.closest('.cover').style.setProperty('aspect-ratio', '380 / 538', 'important');

    ioCallback([{ isIntersecting: true }]);
    for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const second = window.document.querySelectorAll('.movie-list')[1];
    assert.equal(second.style.getPropertyValue('grid-template-columns'), 'repeat(6, minmax(0, 1fr))');
    assert.equal(second.querySelector('img').style.getPropertyValue('object-fit'), 'cover');

    const secondImage = second.querySelector('img');
    const secondCover = secondImage.closest('.cover');
    secondImage.style.setProperty('object-position', 'left top', 'important');
    second.querySelector('.item').dataset.laosijiGridCard = '1';
    second.querySelector('.item').classList.add('jav-card', 'javdb-grid-card');
    secondImage.classList.add('jav-card-image', 'javdb-card-image');
    secondCover.classList.add('jav-card-cover', 'javdb-cover-frame');
    for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(secondImage.style.getPropertyValue('object-fit'), '');
    assert.equal(secondImage.style.getPropertyValue('object-position'), 'left top');
    assert.equal(secondCover.style.getPropertyValue('aspect-ratio'), '');
    assert.equal(second.style.getPropertyValue('grid-template-columns'), 'repeat(6, minmax(0, 1fr))');

    second.style.setProperty('column-gap', '23px', 'important');
    second.classList.add('javdb-card-grid');
    second.dataset.laosijiGrid = '1';
    second.style.setProperty('grid-template-columns', 'repeat(3, minmax(0, 1fr))', 'important');
    for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(second.style.getPropertyValue('grid-template-columns'), 'repeat(3, minmax(0, 1fr))');
    assert.equal(second.style.getPropertyValue('column-gap'), '23px');
    assert.equal(first.style.getPropertyValue('grid-template-columns'), 'repeat(6, minmax(0, 1fr))');
    await window.happyDOM.close();
  },
);

test(
  'normal pages get a navbar entry pointing at the archive route, without touching the API',
  { skip: domSkip },
  async () => {
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
  },
);

/* ---------- Phase 3：图标 / 分段搜索 / 骨架屏 / 封面占位 / 窄屏工具栏 ---------- */

test('toolbar icons are inline Lucide SVGs and the source carries no emoji icons', async () => {
  const source = await readFile(srcPath, 'utf8');
  for (const emoji of ['🔍', '◀', '▶', '★', '←']) {
    assert.equal(source.includes(emoji), false, `source still contains ${emoji}`);
  }
  const shellSource = await readFile(
    new URL('../src/userscripts/javdb-recommend/javdb-recommend-page-shell.lib.ts', import.meta.url),
    'utf8',
  );
  assert.match(shellSource, /vendored from Lucide/);

  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  await runScript(
    window,
    async (url) => {
      if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
      const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
      return { ok: true, json: async () => payload };
    },
    {
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
    },
  );

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
  await runScript(
    window,
    async (url) => {
      if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
      const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
      return { ok: true, json: async () => payload };
    },
    {
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
    },
  );

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
  const visible = [...doc.querySelectorAll('.jdb-ra-stream .item')].filter((item) => item.style.display !== 'none');
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
  const detailGate = new Promise((resolve) => {
    resolveDetail = resolve;
  });
  await runScript(
    window,
    async (url) => {
      if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
      if (url.includes('recommend_periods')) return { ok: true, json: async () => PERIODS };
      await detailGate;
      return { ok: true, json: async () => DETAIL };
    },
    {
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
    },
  );

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
  await runScript(
    window,
    async (url) => {
      if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
      const payload = url.includes('recommend_periods') ? PERIODS : DETAIL;
      return { ok: true, json: async () => payload };
    },
    {
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
    },
  );

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
