// ==UserScript==
// @name         Feishu Preview Image Export
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.1.3
// @description  Export the main visible image from a Feishu file preview page.
// @author       dzshzx
// @match        https://mi.feishu.cn/file/*
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @run-at       document-idle
// @homepageURL  https://github.com/dzshzx/custom-user-js-scripts
// @supportURL   https://github.com/dzshzx/custom-user-js-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/feishu-preview-image-export.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/feishu-preview-image-export.user.js
// @license      MIT
// ==/UserScript==

import { buildTokenCss, applyTheme } from '../shared/shared-tokens.lib.js';
import { createToaster } from '../shared/shared-toast.lib.js';
import { createImageExportRuntime, toUserMessage } from './feishu-preview-image-export-logic.lib.js';

(function () {
  'use strict';

  const SCRIPT_NAME = 'Feishu Preview Image Export';
  const ROOT_ID = 'feishu-pie-root';
  const STYLE_ID = `${ROOT_ID}-style`;

  let toaster = null;

  // Toast 容器挂在脚本自建 root 上；令牌由共享 kit 提供（飞书蓝 accent），
  // 主题跟随 prefers-color-scheme（不探测宿主）。
  function ensureToaster() {
    if (toaster) return toaster;

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.documentElement.append(root);
    }
    applyTheme(root);

    toaster = createToaster({ root });

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = [
        buildTokenCss({
          rootSelector: `#${ROOT_ID}`,
          accent: 'oklch(55% 0.15 250)',
          accentDark: 'oklch(70% 0.13 250)',
        }),
        // 让 toast 叠在预览页之上，root 自身不拦截页面交互
        `#${ROOT_ID} { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }`,
        toaster.cssText,
      ].join('\n\n');
      document.head.append(style);
    }

    return toaster;
  }

  const runtime = createImageExportRuntime({
    documentObject: document,
    fetchImpl: typeof fetch === 'function' ? fetch.bind(globalThis) : null,
    gmDownload: typeof GM_download === 'function' ? GM_download : null,
  });

  function runExport() {
    const activeToaster = ensureToaster();

    if (!runtime.getVisibleImages().length) {
      activeToaster.show({ message: '当前页面没有找到可导出的主图。', tone: 'info' });
      return;
    }

    const progress = activeToaster.showProgress({ message: '正在导出主图…' });
    runtime.exportMainImage()
      .then((result) => {
        if (result) {
          progress.done(`已导出 ${result.filename}`);
        } else {
          progress.done('当前页面没有找到可导出的主图。');
        }
      })
      .catch((error) => {
        console.error(`${SCRIPT_NAME}: export failed.`, error);
        progress.fail(toUserMessage(error));
      });
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('导出当前飞书主图', runExport);
  }
})();
