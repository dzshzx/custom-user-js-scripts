// ==UserScript==
// @name         JavDB Recommend Archive
// @name:zh-CN   JavDB 佳片推荐 · 历史期数
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.0.9
// @description  Adds a "Recommend" entry to the JavDB navbar that opens a standalone archive page for every historical issue (updated Mon/Thu), with flip, search and full-archive keyword search.
// @description:zh-CN  在 JavDB 导航栏加入「佳片推荐」入口，打开独立页面浏览全部历史期数（每周一/四更新），支持翻期、搜索、全期关键词搜索。
// @author       dzshzx
// @match        https://javdb.com/*
// @match        https://www.javdb.com/*
// @match        https://javdb575.com/*
// @match        https://javdb.today/*
// @grant        none
// @run-at       document-idle
// @noframes
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/javdb-recommend.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/javdb-recommend.user.js
// ==/UserScript==
import { createRequest } from './javdb-recommend-request.lib.js';
import { createArchiveData } from './javdb-recommend-data.lib.js';
import { bootArchivePage } from './javdb-recommend-view.lib.js';
const ROUTE = '/recommend-archive';
  function injectNavEntry() {
    var start = document.querySelector('nav.main-nav .navbar-start');
    if (!start || start.querySelector('a[href="' + ROUTE + '"]')) return;
    var a = document.createElement('a');
    a.className = 'navbar-item';
    a.href = ROUTE;
    a.title = '浏览佳片推荐全部历史期数';
    a.textContent = '佳片推荐';
    start.appendChild(a);
  }


if (location.pathname.replace(/\/+$/, '') === ROUTE) {
  const data = createArchiveData({ storage: localStorage, request: createRequest({ base: location.origin }) });
  const view = bootArchivePage(data);
  window.addEventListener('pagehide', event => {
    if (!event.persisted) {
      view.dispose();
      data.dispose();
    }
  });
} else injectNavEntry();
