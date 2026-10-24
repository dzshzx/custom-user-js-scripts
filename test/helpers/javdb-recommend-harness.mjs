// Shared harness for the javdb-recommend bundle tests: runs the userscript
// source in a vm context over a happy-dom window, plus the fixture payloads.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';

import { createMemoryStorage } from './dom-env.mjs';

// Each page-storage object stands for one origin; its IndexedDB lives as long as it does.
const originDatabases = new WeakMap();
function indexedDBFor(storage) {
  if (!originDatabases.has(storage)) originDatabases.set(storage, new IDBFactory());
  return originDatabases.get(storage);
}

export const srcPath = path.resolve(
  import.meta.dirname,
  '../../src/userscripts/javdb-recommend/javdb-recommend.user.js',
);

export const PERIODS = {
  success: 1,
  data: {
    periods: [
      { period: 2, movies_count: 2, views_count: 0, created_at: '2026-08-10T00:00:00.000Z' },
      { period: 1, movies_count: 1, views_count: 0, created_at: '2026-08-06T00:00:00.000Z' },
    ],
    current_page: 1,
  },
};

export const DETAIL = {
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
export const CHROME_HTML =
  '<html><head><link rel="stylesheet" media="all" href="/packs/css/app-testhash.css" /></head>' +
  '<body><nav class="navbar is-fixed-top main-nav"><div class="navbar-start"></div></nav></body></html>';

export async function runScript(window, fetchImpl, extraGlobals = {}, storage = createMemoryStorage()) {
  const source = await readFile(srcPath, 'utf8');
  window.happyDOM.settings.disableCSSFileLoading = true;
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (node) => {
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
    indexedDB: indexedDBFor(storage),
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
    window.document.querySelectorAll('link[data-jdb-ra-site-chrome]:not([data-test-loaded])').forEach((link) => {
      link.dataset.testLoaded = '1';
      link.dispatchEvent(new window.Event('load'));
    });
  }
  return context;
}

// 切搜索范围分段控件（已加载 / 全部期数）
export function switchSearchScope(window, value) {
  const radio = window.document.querySelector(`input[name="jdb-ra-scope"][value="${value}"]`);
  radio.checked = true;
  radio.dispatchEvent(new window.Event('change', { bubbles: true }));
}
