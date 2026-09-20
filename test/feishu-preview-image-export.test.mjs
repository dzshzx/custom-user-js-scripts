import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

const srcPath = path.resolve(import.meta.dirname, '../src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js');

async function runExport({ src, fetchImpl, downloadImpl, imageRect }) {
  const window = createDomWindow({ url: 'https://mi.feishu.cn/file/example' });
  const alerts = [];
  const errors = [];
  let menuAction;
  let downloadRequest;
  window.alert = (message) => alerts.push(message);
  window.document.title = '图片示例 - 飞书云文档';

  const img = window.document.createElement('img');
  img.src = src;
  img.getBoundingClientRect = imageRect || (() => ({ width: 200, height: 200 }));
  window.document.body.appendChild(img);
  // happy-dom exposes document.images without the browser's iterable HTMLCollection contract.
  Object.defineProperty(window.document, 'images', { configurable: true, value: [img] });

  vm.runInNewContext(await readFile(srcPath, 'utf8'), {
    window,
    document: window.document,
    fetch: fetchImpl,
    FileReader: window.FileReader,
    GM_registerMenuCommand: (_label, action) => { menuAction = action; },
    GM_download: (request) => {
      downloadRequest = request;
      downloadImpl(request);
    },
    console: { log() {}, error: (...args) => errors.push(args) },
  });
  menuAction();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const result = { alerts, errors, downloadRequest };
  await window.happyDOM.close();
  return result;
}

test('menu export keeps the document-based filename and download settings', { skip: domSkip }, async () => {
  const result = await runExport({
    src: 'data:image/png;base64,Zm9v',
    downloadImpl: (request) => request.onload(),
  });
  assert.ok(result.downloadRequest, String(result.errors[0]?.[1]));
  assert.equal(result.downloadRequest.name, '图片示例.png');
  assert.equal(result.downloadRequest.saveAs, true);
  assert.equal(result.downloadRequest.url, 'data:image/png;base64,Zm9v');
  assert.deepEqual(result.alerts, []);
});

test('network and image-read failures show actionable Chinese feedback while retaining technical causes in console', { skip: domSkip }, async () => {
  const network = await runExport({
    src: 'https://example.com/image.png',
    fetchImpl: async () => { throw new Error('NetworkError when attempting to fetch resource'); },
  });
  assert.deepEqual(network.alerts, ['图片获取失败，请检查网络或页面权限后重试。']);
  assert.match(String(network.errors[0][1].cause), /NetworkError/);

  const read = await runExport({
    src: 'data:image/png,not-base64',
  });
  assert.deepEqual(read.alerts, ['图片读取失败，请刷新页面后重试。']);
  assert.match(String(read.errors[0][1].cause), /Unsupported data URL format/);

  const blobRead = await runExport({
    src: 'https://example.com/image.png',
    fetchImpl: async () => ({ ok: true, blob: async () => { throw new Error('Blob decode failed'); } }),
  });
  assert.deepEqual(blobRead.alerts, ['图片读取失败，请刷新页面后重试。']);
  assert.match(String(blobRead.errors[0][1].cause), /Blob decode failed/);
});

test('GM download timeout and failure have distinct safe feedback', { skip: domSkip }, async () => {
  const timeout = await runExport({
    src: 'data:image/png;base64,Zm9v',
    downloadImpl: (request) => request.ontimeout(),
  });
  assert.deepEqual(timeout.alerts, ['下载超时，请稍后重试。']);
  assert.match(String(timeout.errors[0][1].cause), /timed out/);

  const failure = await runExport({
    src: 'data:image/png;base64,Zm9v',
    downloadImpl: (request) => request.onerror(new Error('secret internal downloader detail')),
  });
  assert.deepEqual(failure.alerts, ['下载失败，请检查浏览器下载权限后重试。']);
  assert.match(String(failure.errors[0][1].cause), /secret internal downloader detail/);
});

test('unexpected failures retain their cause in console without exposing it in the alert', { skip: domSkip }, async () => {
  const result = await runExport({
    src: 'data:image/png;base64,Zm9v',
    imageRect: () => { throw new Error('private image layout detail'); },
  });
  assert.deepEqual(result.alerts, ['导出失败，请刷新页面后重试。']);
  assert.match(String(result.errors[0][1]), /private image layout detail/);
});
