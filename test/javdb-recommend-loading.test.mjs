import test from 'node:test';
import assert from 'node:assert/strict';

import { createDomWindow, createMemoryStorage, domSkip } from './helpers/dom-env.mjs';
import { CHROME_HTML, DETAIL, PERIODS, runScript, switchSearchScope } from './helpers/javdb-recommend-harness.mjs';

// Period-stream loading of the javdb-recommend bundle: local cache reuse, shared
// in-flight detail requests, distant jumps, catalog refresh and bounded retries.
// Metadata, rendering and layout tests live in javdb-recommend-rendering.test.mjs.

test(
  'a fresh local cache avoids refetching the period catalog and loaded period details on reopen',
  { skip: domSkip },
  async () => {
    const storage = createMemoryStorage();
    const firstCalls = [];
    const firstWindow = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    await runScript(
      firstWindow,
      async (url) => {
        firstCalls.push(url);
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
      storage,
    );

    assert.equal(firstCalls.filter((url) => url.includes('recommend_periods')).length, 1);
    assert.equal(firstCalls.filter((url) => /\/api\/v1\/movies\/recommend\?/.test(url)).length, 1);

    const secondCalls = [];
    const secondWindow = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    await runScript(
      secondWindow,
      async (url) => {
        secondCalls.push(url);
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
      storage,
    );

    assert.equal(secondWindow.document.querySelectorAll('.jdb-ra-sec .item').length, 2);
    assert.equal(secondWindow.document.querySelector('.jdb-ra-sec .item .meta').textContent, '4.22 · 发售 2026-08-01');
    assert.equal(secondCalls.filter((url) => url.includes('/api/v1/movies/')).length, 0);
    assert.equal(secondCalls.filter((url) => url === 'https://javdb.com/').length, 1);
    firstWindow.close();
    secondWindow.close();
  },
);

test(
  'stream rendering and full-archive search share one in-flight detail request per period',
  { skip: domSkip },
  async () => {
    const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    let resolveDetail;
    const detailResponse = new Promise((resolve) => {
      resolveDetail = resolve;
    });
    const calls = [];
    await runScript(
      window,
      async (url) => {
        calls.push(url);
        if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
        if (url.includes('recommend_periods')) return { ok: true, json: async () => PERIODS };
        await detailResponse;
        return { ok: true, json: async () => DETAIL };
      },
      {
        IntersectionObserver: class {
          observe() {}
          disconnect() {}
        },
      },
    );

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
  },
);

test(
  'a distant period jump re-anchors the stream without loading intermediate periods',
  { skip: domSkip },
  async () => {
    const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    const jumpPeriods = Array.from({ length: 5 }, (_, index) => ({
      period: 5 - index,
      movies_count: 1,
      views_count: 0,
      created_at: `2026-08-${String(5 - index).padStart(2, '0')}T00:00:00.000Z`,
    }));
    const detailCalls = [];
    await runScript(
      window,
      async (url) => {
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
              movies: [
                {
                  id: String(period),
                  number: `TEST-${period}`,
                  title: `影片${period}`,
                  origin_title: `影片${period}`,
                  cover_url: '',
                  score: '4.0',
                  release_date: '2026-08-01',
                },
              ],
            },
          }),
        };
      },
      {
        IntersectionObserver: class {
          observe() {}
          disconnect() {}
        },
      },
    );

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
      window.document
        .querySelector('.jdb-ra-sec[data-period="2"] .movie-list')
        .style.getPropertyValue('grid-template-columns'),
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
  },
);

test(
  'a jump intent preempts a visible sentinel chain while the current period is still loading',
  { skip: domSkip },
  async () => {
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
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const targetGate = new Promise((resolve) => {
      releaseTarget = resolve;
    });
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
        if (url.includes('recommend_periods')) {
          return { ok: true, json: async () => ({ success: 1, data: { periods: jumpPeriods } }) };
        }
        const period = Number(new URL(url).searchParams.get('period'));
        detailCalls.push(period);
        if (period === 5) await firstGate;
        if (period === 2) await targetGate;
        return {
          ok: true,
          json: async () => ({
            success: 1,
            data: { movies: [{ ...DETAIL.data.movies[0], id: String(period), number: `TEST-${period}` }] },
          }),
        };
      },
      { IntersectionObserver: FakeIO },
    );

    ioCallback([{ isIntersecting: true }]);
    const jump = window.document.getElementById('jdb-ra-jump');
    jump.value = '2';
    jump.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (let i = 0; i < 100 && !detailCalls.includes(2); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.deepEqual(detailCalls, [5, 2]);
    releaseTarget();
    // Loading skeletons also carry .item; wait for period 1's real card, which exists only after its request.
    for (
      let i = 0;
      i < 100 && !window.document.querySelector('.jdb-ra-sec[data-period="1"] .item[data-jdb-ra-card="1"]');
      i += 1
    ) {
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
  },
);

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
  await runScript(
    window,
    async (url) => {
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
        json: async () => ({
          success: 1,
          data: { movies: [{ ...DETAIL.data.movies[0], id: String(period), number: `TEST-${period}` }] },
        }),
      };
    },
    {
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
    },
  );

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
  storage.setItem(
    'javdb_recommend_periods_cache_v1',
    JSON.stringify({
      version: 1,
      fetchedAt: now - 7 * 60 * 60 * 1000,
      fullFetchedAt: now - 24 * 60 * 60 * 1000,
      periods: cachedPeriods,
    }),
  );
  const remotePage = [{ ...cachedPeriods[0], period: 61 }, ...cachedPeriods.slice(0, 47)];
  const calls = [];
  const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
  await runScript(
    window,
    async (url) => {
      calls.push(url);
      if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
      if (url.includes('recommend_periods')) {
        const page = Number(new URL(url).searchParams.get('page'));
        return { ok: true, json: async () => ({ success: 1, data: { periods: page === 1 ? remotePage : [] } }) };
      }
      return { ok: true, json: async () => ({ success: 1, data: { movies: [] } }) };
    },
    {
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
      AbortController,
    },
    storage,
  );

  assert.equal(calls.filter((url) => url.includes('recommend_periods')).length, 1);
  const saved = JSON.parse(storage.getItem('javdb_recommend_periods_cache_v1'));
  assert.equal(saved.periods.length, 61);
  assert.deepEqual(
    saved.periods.slice(0, 3).map((item) => item.period),
    [61, 60, 59],
  );
  assert.equal(saved.periods.at(-1).period, 1);
  assert.match(window.document.getElementById('jdb-ra-status').textContent, /增量更新/);
  await window.happyDOM.close();
});

test(
  'a full catalog refresh deduplicates an issue repeated across moving page boundaries',
  { skip: domSkip },
  async () => {
    const window = createDomWindow({ url: 'https://javdb.com/recommend-archive' });
    const pageOne = Array.from({ length: 48 }, (_, index) => ({
      period: 100 - index,
      movies_count: 1,
      views_count: 0,
      created_at: '2026-01-01T00:00:00.000Z',
    }));
    const pageTwo = [
      pageOne.at(-1),
      ...Array.from({ length: 10 }, (_, index) => ({
        period: 52 - index,
        movies_count: 1,
        views_count: 0,
        created_at: '2025-12-01T00:00:00.000Z',
      })),
    ];
    await runScript(
      window,
      async (url) => {
        if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
        if (url.includes('recommend_periods')) {
          const page = Number(new URL(url).searchParams.get('page'));
          return { ok: true, json: async () => ({ success: 1, data: { periods: page === 1 ? pageOne : pageTwo } }) };
        }
        return { ok: true, json: async () => ({ success: 1, data: { movies: [] } }) };
      },
      {
        IntersectionObserver: class {
          observe() {}
          disconnect() {}
        },
        AbortController,
      },
    );

    const optionPeriods = [...window.document.querySelectorAll('#jdb-ra-select option')].map((option) =>
      Number(option.value),
    );
    assert.equal(optionPeriods.length, 58);
    assert.equal(new Set(optionPeriods).size, 58);
    assert.deepEqual(optionPeriods.slice(-3), [45, 44, 43]);
    await window.happyDOM.close();
  },
);

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
    await runScript(
      window,
      async (url) => {
        calls.push(url);
        if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
        if (url.includes('recommend_periods')) {
          return { ok: true, json: async () => ({ success: 1, data: { periods: searchPeriods } }) };
        }
        const period = Number(new URL(url).searchParams.get('period'));
        return {
          ok: true,
          json: async () => ({
            success: 1,
            data: { movies: [{ ...DETAIL.data.movies[0], id: String(period), number: `TEST-${period}` }] },
          }),
        };
      },
      {
        IntersectionObserver: class {
          observe() {}
          disconnect() {}
        },
        AbortController,
      },
      storage,
    );
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
    [...first.window.document.querySelectorAll('.jdb-ra-results .jdb-ra-ph')].map((heading) =>
      heading.textContent.trim(),
    ),
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
  await runScript(
    window,
    async (url) => {
      if (url === 'https://javdb.com/') return { ok: true, text: async () => CHROME_HTML };
      if (url.includes('recommend_periods')) return { ok: true, json: async () => PERIODS };
      attempts += 1;
      if (attempts < 3) return { ok: false, status: 500 };
      return { ok: true, json: async () => DETAIL };
    },
    {
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
      AbortController,
      setTimeout: fastRetryTimeout,
    },
  );

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
  await runScript(
    window,
    async (url, options = {}) => {
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
            json: async () => ({
              success: 1,
              data: { movies: [{ ...DETAIL.data.movies[0], id: '5', number: 'TEST-5' }] },
            }),
          };
        }
        return new Promise((resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              aborted += 1;
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        });
      }
      return {
        ok: true,
        json: async () => ({ success: 1, data: { movies: [{ ...DETAIL.data.movies[0], id: '2', number: 'TEST-2' }] } }),
      };
    },
    {
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
      AbortController,
    },
  );

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
  // The detail read goes through IndexedDB before the request, and loading skeletons also carry .item.
  for (
    let i = 0;
    i < 100 && (periodFiveAttempts < 2 || !window.document.querySelector('.jdb-ra-sec[data-period="5"] .item'));
    i += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(periodFiveAttempts, 2);
  assert.ok(window.document.querySelector('.jdb-ra-sec[data-period="5"] .item'));
  await window.happyDOM.close();
});
