// ==UserScript==
// @name         Feishu Preview Image Export
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.1.2
// @description  Export the main visible image from a Feishu file preview page.
// @author       dzshzx
// @match        https://mi.feishu.cn/file/*
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_NAME = 'Feishu Preview Image Export';
  const MIN_IMAGE_AREA = 20_000;
  const ERROR_MESSAGES = {
    network: '图片获取失败，请检查网络或页面权限后重试。',
    read: '图片读取失败，请刷新页面后重试。',
    downloadTimeout: '下载超时，请稍后重试。',
    download: '下载失败，请检查浏览器下载权限后重试。',
    unknown: '导出失败，请刷新页面后重试。',
  };

  class ExportError extends Error {
    constructor(kind, cause) {
      super(ERROR_MESSAGES[kind], { cause });
      this.name = 'ExportError';
    }
  }

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
      throw new ExportError('read', new Error('Unsupported data URL format'));
    }
    return {
      mime: match[1],
      base64: match[2],
    };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => reader.result
          ? resolve(String(reader.result))
          : reject(new ExportError('read', new Error('FileReader returned empty data')));
        reader.onerror = () => reject(new ExportError('read', reader.error || new Error('Failed to read blob')));
        reader.readAsDataURL(blob);
      } catch (error) {
        reject(new ExportError('read', error));
      }
    });
  }

  async function imageToDownloadPayload(item) {
    const src = item.src;
    if (!src) {
      throw new ExportError('read', new Error('Image source is empty'));
    }

    if (src.startsWith('data:')) {
      const parsed = parseDataUrl(src);
      return {
        mime: parsed.mime,
        url: src,
      };
    }

    let response;
    try {
      response = await fetch(src, { credentials: 'include' });
    } catch (error) {
      throw new ExportError('network', error);
    }
    if (!response.ok) {
      throw new ExportError('network', new Error(`Failed to fetch image: ${response.status} ${response.statusText}`));
    }
    let blob;
    try {
      blob = await response.blob();
    } catch (error) {
      throw new ExportError('read', error);
    }
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
        try {
          GM_download({
            url: payload.url,
            name: filename,
            saveAs: true,
            onload: resolve,
            onerror: (error) => reject(new ExportError('download', error || new Error('GM_download failed'))),
            ontimeout: () => reject(new ExportError('downloadTimeout', new Error('GM_download timed out'))),
          });
        } catch (error) {
          reject(new ExportError('download', error));
        }
      });
      return;
    }

    fallbackDownload(payload.url, filename);
  }

  function runExport() {
    downloadCurrentImage().catch((error) => {
      console.error(`${SCRIPT_NAME}: export failed.`, error);
      notify(error instanceof ExportError ? error.message : ERROR_MESSAGES.unknown);
    });
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('导出当前飞书主图', runExport);
  }
})();
