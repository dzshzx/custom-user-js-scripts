import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

import {
  createImageExportRuntime,
  extensionFromMime,
  sanitizeFilePart,
  toUserMessage,
} from '../src/userscripts/feishu-preview-image-export/feishu-preview-image-export-logic.lib.ts';
import { flush } from './helpers/async.mjs';

const distPath = path.resolve(import.meta.dirname, '../dist/feishu-preview-image-export.user.js');
const distSource = await readFile(distPath, 'utf8');

/* ---------- lib 级：纯函数与运行时 ---------- */

test('sanitizeFilePart and extensionFromMime keep filenames safe and typed', () => {
  assert.equal(sanitizeFilePart(' 报表/最终版? ', 'fb'), '报表-最终版-');
  assert.equal(sanitizeFilePart('   ', 'feishu-image'), 'feishu-image');
  assert.equal(extensionFromMime('image/png'), 'png');
  assert.equal(extensionFromMime('image/jpeg'), 'jpg');
  assert.equal(extensionFromMime('image/webp'), 'webp');
  assert.equal(extensionFromMime('application/octet-stream'), 'bin');
  assert.equal(extensionFromMime('image/png; charset=binary'), 'png');
  assert.equal(extensionFromMime('image/WEBP'), 'webp');
  assert.equal(extensionFromMime(''), 'bin');
  assert.equal(extensionFromMime(undefined), 'bin');
  assert.equal(sanitizeFilePart('a\u0000b<c>', 'fb'), 'a-b-c-');
});

test('toUserMessage maps internal English errors to Chinese user copy', () => {
  assert.equal(
    toUserMessage(new Error('Failed to fetch image: 403 Forbidden')),
    '图片拉取失败（HTTP 403），请确认已登录飞书或稍后重试。',
  );
  assert.equal(toUserMessage(new Error('Unsupported data URL format')), '图片地址格式不支持，无法导出。');
  assert.equal(toUserMessage(new Error('Image source is empty')), '未读取到图片地址，请刷新页面后重试。');
  assert.equal(toUserMessage(new Error('GM_download timed out')), '下载超时，请重试。');
  assert.equal(toUserMessage(new Error('weird')), '导出失败：weird');
});

test('runtime picks the largest visible image and exports its data URL', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://mi.feishu.cn/file/docx-1' });
  window.document.title = '设计稿 - 飞书云文档';
  const big = window.document.createElement('img');
  big.src = 'data:image/png;base64,aGk=';
  big.getBoundingClientRect = () => ({ width: 800, height: 600 });
  const small = window.document.createElement('img');
  small.src = 'data:image/png;base64,eGk=';
  small.getBoundingClientRect = () => ({ width: 100, height: 100 });
  window.document.body.append(big, small);

  const downloads = [];
  const runtime = createImageExportRuntime({
    documentObject: window.document,
    gmDownload: (options) => {
      downloads.push(options);
      options.onload();
    },
  });

  assert.equal(runtime.getVisibleImages().length, 1); // 小图低于面积阈值
  assert.equal(runtime.getDocumentTitle(), '设计稿');

  const result = await runtime.exportMainImage();
  assert.equal(result.filename, '设计稿.png');
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].url, 'data:image/png;base64,aGk=');
  assert.equal(downloads[0].name, '设计稿.png');
});

test('runtime returns null when no image passes the area threshold', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://mi.feishu.cn/file/docx-1' });
  const runtime = createImageExportRuntime({ documentObject: window.document });
  assert.equal(await runtime.exportMainImage(), null);
});

test('runtime keeps the anchor fallback when GM_download is unavailable', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://mi.feishu.cn/file/docx-1' });
  const clicks = recordAnchorClicks(window);
  appendBigImage(window);
  const runtime = createImageExportRuntime({ documentObject: window.document });

  assert.deepEqual(await runtime.exportMainImage(), { filename: 'feishu-image.png' });
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0].download, 'feishu-image.png');
  assert.match(clicks[0].href, /^blob:/);
  await window.happyDOM.close();
});

test('runtime maps fetch failures into a throwable internal error', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://mi.feishu.cn/file/docx-1' });
  const img = window.document.createElement('img');
  img.src = 'https://internal-api-drive.feishu.cn/img.png';
  img.getBoundingClientRect = () => ({ width: 800, height: 600 });
  window.document.body.append(img);

  const runtime = createImageExportRuntime({
    documentObject: window.document,
    fetchImpl: async () => ({ ok: false, status: 403, statusText: 'Forbidden' }),
  });

  await assert.rejects(runtime.exportMainImage(), /Failed to fetch image: 403/);
});

const INVISIBLE = '​‌‍⁡⁢⁣⁤‬﻿';

test('sanitizeFilePart strips Unicode format (Cf) characters and falls back when nothing is left', () => {
  assert.equal(sanitizeFilePart(`设${INVISIBLE}计稿${'​'}`, 'feishu-image'), '设计稿');
  assert.equal(sanitizeFilePart(INVISIBLE, 'feishu-image'), 'feishu-image');
  assert.equal(sanitizeFilePart(` ${INVISIBLE} `, 'feishu-image'), 'feishu-image');
  assert.doesNotMatch(sanitizeFilePart(`a${INVISIBLE}/b`, 'fb'), /\p{Cf}/u);
  // filenamify 截断后为空串（首个字形簇超过 100 个 UTF-16 码元）时同样回退。
  assert.equal(sanitizeFilePart(`a${'\u0301'.repeat(150)}`, 'feishu-image'), 'feishu-image');
});

test('toUserMessage never throws for non-Error values', () => {
  const nullProto = Object.create(null);
  assert.equal(typeof toUserMessage(nullProto), 'string');
  const tmError = Object.assign(Object.create(null), { id: 7, error: 'not_succeeded' });
  assert.equal(typeof toUserMessage(tmError), 'string');
  assert.equal(typeof toUserMessage(null), 'string');
  assert.equal(typeof toUserMessage(undefined), 'string');
  assert.equal(toUserMessage('plain'), '导出失败：plain');
  const hostile = {
    get error() {
      throw new Error('boom');
    },
    toString() {
      throw new Error('boom');
    },
  };
  assert.equal(typeof toUserMessage(hostile), 'string');
});

function appendBigImage(window) {
  const img = window.document.createElement('img');
  img.src = 'data:image/png;base64,aGk=';
  img.getBoundingClientRect = () => ({ width: 800, height: 600 });
  window.document.body.append(img);
}

function recordAnchorClicks(window) {
  const clicks = [];
  window.HTMLAnchorElement.prototype.click = function click() {
    clicks.push({ href: this.href, download: this.download });
  };
  return clicks;
}

test('runtime sends GM_download a filename without invisible characters', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://mi.feishu.cn/file/docx-1' });
  window.document.title = `报${INVISIBLE}价单 - 飞书云文档`;
  appendBigImage(window);
  const downloads = [];
  const runtime = createImageExportRuntime({
    documentObject: window.document,
    gmDownload: (options) => {
      downloads.push(options);
      options.onload();
    },
  });
  assert.deepEqual(await runtime.exportMainImage(), { filename: '报价单.png' });
  assert.equal(downloads[0].name, '报价单.png');
});

test(
  'runtime falls back to an anchor download when GM_download reports a Tampermonkey error',
  { skip: domSkip },
  async () => {
    const window = createDomWindow({ url: 'https://mi.feishu.cn/file/docx-1' });
    window.document.title = `设计稿${INVISIBLE} - 飞书云文档`;
    appendBigImage(window);
    const clicks = recordAnchorClicks(window);
    const runtime = createImageExportRuntime({
      documentObject: window.document,
      gmDownload: (options) => options.onerror(Object.assign(Object.create(null), { id: 1, error: 'unknown' })),
    });
    assert.deepEqual(await runtime.exportMainImage(), { filename: '设计稿.png', via: 'anchor' });
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].download, '设计稿.png');
    assert.match(clicks[0].href, /^blob:/);
    await window.happyDOM.close();
  },
);

test('runtime falls back to an anchor download when GM_download throws synchronously', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://mi.feishu.cn/file/docx-1' });
  appendBigImage(window);
  const clicks = recordAnchorClicks(window);
  const runtime = createImageExportRuntime({
    documentObject: window.document,
    gmDownload: () => {
      throw new Error('not allowed');
    },
  });
  assert.equal((await runtime.exportMainImage()).via, 'anchor');
  assert.equal(clicks.length, 1);
  await window.happyDOM.close();
});

test('runtime rejects with a timeout when GM_download never settles', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://mi.feishu.cn/file/docx-1' });
  appendBigImage(window);
  const clicks = recordAnchorClicks(window);
  const runtime = createImageExportRuntime({
    documentObject: window.document,
    gmDownload: () => {},
    downloadTimeoutMs: 20,
  });
  await assert.rejects(runtime.exportMainImage(), (error) => {
    assert.equal(toUserMessage(error), '下载超时，请重试。');
    return true;
  });
  assert.equal(clicks.length, 0);
});

/* ---------- dist 级：菜单注册与 toast 反馈 ---------- */

function boot({ gmDownload, fetchImpl } = {}) {
  const window = createDomWindow({ url: 'https://mi.feishu.cn/file/docx-1' });
  const menuCalls = [];
  window.GM_registerMenuCommand = (label, callback) => menuCalls.push({ label, callback });
  if (gmDownload) window.GM_download = gmDownload;
  if (fetchImpl) window.fetch = fetchImpl;
  window.eval(distSource);
  return { window, menuCalls };
}

test('dist registers the export menu command', { skip: domSkip }, () => {
  const { menuCalls } = boot();
  assert.deepEqual(
    menuCalls.map((call) => call.label),
    ['导出当前飞书主图'],
  );
});

test('dist shows an info toast when no exportable image exists', { skip: domSkip }, async () => {
  const { window, menuCalls } = boot();
  menuCalls[0].callback();
  await flush(10);

  const root = window.document.getElementById('feishu-pie-root');
  assert.ok(root);
  assert.ok(root.dataset.wkTheme === 'light' || root.dataset.wkTheme === 'dark');
  const toast = root.querySelector('.wk-toast');
  assert.ok(toast);
  assert.equal(toast.dataset.tone, 'info');
  assert.match(toast.textContent, /当前页面没有找到可导出的主图/);
  // token 与 toast 样式一次性安装
  assert.ok(
    window.document.getElementById('feishu-pie-root-style').textContent.includes('--wk-accent: oklch(55% 0.15 250)'),
  );
  // The toast leaves a real happy-dom auto-dismiss setTimeout (4s) pending;
  // node:test's mock.timers can't reach it (happy-dom binds its own timer
  // globals at module load, before any mock is installed), so abort it the
  // way the javdb-recommend-*.test.mjs files already do for their DOM windows.
  await window.happyDOM.close();
});

test('dist reports export progress and success through toast', { skip: domSkip }, async () => {
  const downloads = [];
  const { window, menuCalls } = boot({
    gmDownload: (options) => {
      downloads.push(options);
      options.onload();
    },
  });
  window.document.title = '报价单 - 飞书云文档';
  const img = window.document.createElement('img');
  img.src = 'data:image/png;base64,aGk=';
  img.getBoundingClientRect = () => ({ width: 900, height: 700 });
  window.document.body.append(img);

  menuCalls[0].callback();
  await flush(10);

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, '报价单.png');
  const toast = window.document.querySelector('#feishu-pie-root .wk-toast');
  assert.equal(toast.dataset.tone, 'success');
  assert.match(toast.textContent, /已导出 报价单\.png/);
  // See the "info toast" test above: aborts the real happy-dom dismiss timer.
  await window.happyDOM.close();
});

test('dist maps export failures to Chinese user copy on an error toast', { skip: domSkip }, async () => {
  const { window, menuCalls } = boot({
    gmDownload: (options) => options.onload(),
    fetchImpl: async () => ({ ok: false, status: 403, statusText: 'Forbidden' }),
  });
  const img = window.document.createElement('img');
  img.src = 'https://internal-api-drive.feishu.cn/img.png';
  img.getBoundingClientRect = () => ({ width: 900, height: 700 });
  window.document.body.append(img);

  menuCalls[0].callback();
  await flush(10);

  const toast = window.document.querySelector('#feishu-pie-root .wk-toast');
  assert.equal(toast.dataset.tone, 'error');
  assert.match(toast.textContent, /图片拉取失败（HTTP 403）/);
  // See the "info toast" test above: aborts the real happy-dom dismiss timer
  // (this one is the longest, ERROR_DURATION_MS = 6s).
  await window.happyDOM.close();
});

test(
  'dist leaves the progress toast when GM_download fails with a Tampermonkey error object',
  { skip: domSkip },
  async () => {
    const { window, menuCalls } = boot({
      gmDownload: (options) => options.onerror(Object.assign(Object.create(null), { id: 3, error: 'unknown' })),
    });
    recordAnchorClicks(window);
    window.document.title = `报${INVISIBLE}价单 - 飞书云文档`;
    appendBigImage(window);

    menuCalls[0].callback();
    await flush(10);

    const toast = window.document.querySelector('#feishu-pie-root .wk-toast');
    assert.notEqual(toast.dataset.tone, 'progress');
    assert.match(toast.textContent, /报价单\.png/);
    await window.happyDOM.close();
  },
);

test('dist source contains no alert() call', async () => {
  assert.doesNotMatch(distSource, /\balert\s*\(/);
});
