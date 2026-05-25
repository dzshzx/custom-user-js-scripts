// ==UserScript==
// @name         Feishu Preview Image Export
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.1.0
// @description  Export the main visible image from a Feishu file preview page.
// @author       dzshzx
// @match        https://mi.feishu.cn/file/*
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_NAME = 'Feishu Preview Image Export';
  const MIN_IMAGE_AREA = 20_000;

  function notify(message) {
    console.log(`${SCRIPT_NAME}: ${message}`);
    window.alert(message);
  }

  function sanitizeFilePart(value, fallback) {
    const text = String(value || '').trim().replace(/[\\/:*?"<>|]+/g, '-');
    return text || fallback;
  }

  function getDocumentTitle() {
    const raw = document.title.replace(/\s*-\s*飞书云文档\s*$/u, '').trim();
    return sanitizeFilePart(raw, 'feishu-image');
  }

  function getVisibleImages() {
    return [...document.images]
      .map((img) => {
        const rect = img.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        return {
          img,
          width,
          height,
          area: width * height,
          visible: width > 0 && height > 0,
          src: img.currentSrc || img.src || '',
        };
      })
      .filter((item) => item.visible && item.area >= MIN_IMAGE_AREA)
      .sort((left, right) => right.area - left.area);
  }

  function parseDataUrl(dataUrl) {
    const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Unsupported data URL format');
    }
    return {
      mime: match[1],
      base64: match[2],
    };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  async function imageToDownloadPayload(item) {
    const src = item.src;
    if (!src) {
      throw new Error('Image source is empty');
    }

    if (src.startsWith('data:')) {
      const parsed = parseDataUrl(src);
      return {
        mime: parsed.mime,
        url: src,
      };
    }

    const response = await fetch(src, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    return {
      mime: blob.type || 'application/octet-stream',
      url: await blobToDataUrl(blob),
    };
  }

  function extensionFromMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    return 'bin';
  }

  function fallbackDownload(url, filename) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function downloadCurrentImage() {
    const images = getVisibleImages();
    if (!images.length) {
      notify('当前页面没有找到可导出的主图。');
      return;
    }

    const target = images[0];
    const payload = await imageToDownloadPayload(target);
    const filename = `${getDocumentTitle()}.${extensionFromMime(payload.mime)}`;

    if (typeof GM_download === 'function') {
      await new Promise((resolve, reject) => {
        GM_download({
          url: payload.url,
          name: filename,
          saveAs: true,
          onload: resolve,
          onerror: (error) => reject(error || new Error('GM_download failed')),
          ontimeout: () => reject(new Error('GM_download timed out')),
        });
      });
      return;
    }

    fallbackDownload(payload.url, filename);
  }

  function runExport() {
    downloadCurrentImage().catch((error) => {
      console.error(`${SCRIPT_NAME}: export failed.`, error);
      notify(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    });
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('导出当前飞书主图', runExport);
  }
})();
