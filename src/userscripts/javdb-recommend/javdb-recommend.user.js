// ==UserScript==
// @name         JavDB Recommend Archive
// @name:zh-CN   JavDB 佳片推荐 · 历史期数
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.0.5
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
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/javdb-recommend/javdb-recommend.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/javdb-recommend/javdb-recommend.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ================= 签名算法（与官方 App 一致） ================= */
  var KEY = '30820'; // APK 签名证书 X.509 DER hex 前 5 字符（getSecret / getIKey）
  var B64_1 = 'WzE3OCwyMTksMTI3LDE2MSwxODksMTYyLDEyMywxMDMsMTM3LDIxMCwxMjMsMjE5LDE4OSwxNzksMTIzLDIwMiwxMzksMTUwLDEzMywxNjAsMTI2LDIwNywxNjYsMTUxLDE0NiwxNTksMTg4LDEwMCwxMzgsMTM2LDE3NiwxNjEsMTQyLDEwMywxMzUsMTYwLDE0MiwxNzUsMTYwLDEwNCwxMzAsMTIxLDExOCwxMDYsMTMyLDEyNCwxMzAsMTA0LDEzMSwxMjEsMTI2LDE3MywxNDMsMTQwLDEzOCwxMDQsMTMwLDE1OSwxMTgsMTc1LDE0MiwxNTksMTYxLDE1OSwxNDMsMTI0LDEyMywxNjEsMTMxLDEzNywxMzQsMTAxLDEzMSwxNzUsMTU2LDEwMSwxMzEsMTc1LDE1NywxNTcsMTMwLDEzNywxNjAsMTA2LDE0MywxMzcsMTUzLDE2MCwxMzEsMTQwLDEyMiwxMDMsMTQzLDEzNywxMjMsMTU3LDEzMSwxMzcsMTUyLDEwMywxMzIsMTM3LDEyMiwxNzMsMTMwLDE1OSwxMzEsMTU5LDEzMCwxNDAsMTIyLDEwNiwxMzAsMTc1LDEyMywxNTksMTMwLDEyMSwxMzgsMTA0LDEzMiwxMjEsMTM0LDE3NCwxNDMsMTYyLDEyNiwxMDQsMTMwLDEwMywxMjcsMTU3LDEzMCwxMDMsMTI2LDE3NSwxNDIsMTc1LDE1NiwxNzUsMTQyLDE2MiwxMzEsMTYwLDEzMSwxNTksMTYxLDE1OSwxMzAsMTM3LDE1MywxNTksMTQyLDEwMywxNDIsMTczLDEzMSwxNzUsMTM0LDE3MiwxMzIsMTIxLDEyMywxNjEsMTMwLDEwMywxMzQsMTA1LDE0MiwxNDAsMTIyLDExNF0=';
  var B64_2 = 'WzE5OCwxNjksMTIzLDEwNiwxNzcsMTY2LDE0MCwxNjIsMTQ3LDE4OSwxNjIsMjE5LDE5OSwxMjIsMTE4LDE1OF0=';

  function md5(s) {
    function rol(x, c) { return ((x << c) | (x >>> (32 - c))) >>> 0; }
    var K = [0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];
    var S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    var bytes = [], i;
    for (i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff);
    var lenBits = (s.length * 8) >>> 0;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    function push32(v) { bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }
    push32(lenBits);
    push32(Math.floor(s.length / 536870912) >>> 0);
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (var o = 0; o < bytes.length; o += 64) {
      var M = new Array(16);
      for (var j = 0; j < 16; j++) M[j] = (bytes[o + j * 4] | (bytes[o + j * 4 + 1] << 8) | (bytes[o + j * 4 + 2] << 16) | (bytes[o + j * 4 + 3] << 24)) >>> 0;
      var A = a0, B = b0, C = c0, D = d0;
      for (var k = 0; k < 64; k++) {
        var F, g;
        if (k < 16) { F = (B & C) | ((~B) & D); g = k; }
        else if (k < 32) { F = (D & B) | ((~D) & C); g = (5 * k + 1) % 16; }
        else if (k < 48) { F = B ^ C ^ D; g = (3 * k + 5) % 16; }
        else { F = C ^ (B | (~D)); g = (7 * k) % 16; }
        F = (F + A + K[k] + M[g]) >>> 0;
        A = D; D = C; C = B;
        B = (B + rol(F, S[k])) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    // MD5 规范输出：每个 32 位字按小端字节序
    function hx(v) { var h = ''; for (var i = 0; i < 32; i += 8) h += ((v >>> i) & 0xff).toString(16).padStart(2, '0'); return h; }
    return hx(a0) + hx(b0) + hx(c0) + hx(d0);
  }

  function decrypt(blob) {
    var md5key = md5(KEY);
    var codes = JSON.parse(atob(blob));
    var out = '';
    for (var i = 0; i < codes.length; i++) {
      var idx = i < md5key.length ? i : md5key.length - 1;
      out += String.fromCharCode(codes[i] - md5key.charCodeAt(idx));
    }
    var bin = atob(out);
    var u8 = new Uint8Array(bin.length);
    for (var j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j) & 0xff;
    return new TextDecoder('utf-8').decode(u8);
  }

  var S1 = decrypt(B64_1);
  var S2 = decrypt(B64_2);

  function signature() {
    var t = Math.floor(Date.now() / 1000);
    return t + '.' + S2 + '.' + md5('' + t + S1);
  }

  /* ================= API（同域，免跨域） ================= */
  var BASE = location.origin;

  var REQUEST_TIMEOUT = 12000, REQUEST_ATTEMPTS = 3;

  function api(path, params, options) {
    options = options || {};
    var q = new URLSearchParams(params).toString();
    var attempt = 0;
    function run() {
      attempt += 1;
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var abortedByOwner = function () { if (controller) controller.abort(); };
      if (options.signal) {
        if (options.signal.aborted) abortedByOwner();
        else options.signal.addEventListener('abort', abortedByOwner, { once: true });
      }
      var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT) : null;
      return fetch(BASE + path + '?' + q, {
        headers: { 'jdsignature': signature(), 'connection': 'keep-alive' },
        signal: controller ? controller.signal : options.signal
      }).then(function (r) {
        if (!r.ok) {
          var error = new Error('HTTP ' + r.status);
          error.retryable = r.status === 408 || r.status === 429 || r.status >= 500;
          throw error;
        }
        return r.json();
      }).then(function (j) {
        if (j.success !== 1) throw new Error(j.message || '接口返回错误');
        return j.data;
      }).catch(function (e) {
        var ownerAborted = options.signal && options.signal.aborted;
        var retryable = !ownerAborted && (e.retryable || e.name === 'TypeError' || e.name === 'AbortError');
        if (!retryable || attempt >= REQUEST_ATTEMPTS) throw e;
        return new Promise(function (resolve) {
          setTimeout(resolve, 500 * Math.pow(2, attempt - 1));
        }).then(run);
      }).finally(function () {
        if (timer) clearTimeout(timer);
        if (options.signal) options.signal.removeEventListener('abort', abortedByOwner);
      });
    }
    return run();
  }

  /* ================= 官网资源约定 ================= */
  var ROUTE = '/recommend-archive';
  // 接口返回的封面是 App 图床 tp.spfcas.com（网页端常被拦截导致封面不显示）；
  // 官网页面自身使用 c0.jdbstatic.com，且 /covers/<前缀>/<id>.jpg 路径完全一致，直接换宿主即可。
  var SITE_IMG_HOST = 'https://c0.jdbstatic.com';

  function coverUrl(url) {
    var m = /\/covers\/.*$/.exec(url || '');
    return m ? SITE_IMG_HOST + m[0] : (url || '');
  }

  function movieUrl(movie) {
    return BASE + '/v/' + encodeURIComponent(movie.id);
  }

  /* ================= 状态 ================= */
  var periods = [], detailCache = {}, detailRequests = {}, searching = false;
  var LS_KEY = 'javdb_recommend_last_period';
  var CACHE_VERSION = 1, PERIODS_CACHE_KEY = 'javdb_recommend_periods_cache_v1';
  var DETAILS_CACHE_KEY = 'javdb_recommend_details_cache_v1', PERIODS_CACHE_TTL = 6 * 60 * 60 * 1000;
  var LATEST_DETAIL_CACHE_TTL = 2 * 60 * 60 * 1000, HISTORICAL_DETAIL_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  var DETAIL_CACHE_LIMIT = 48, DETAIL_MEMORY_LIMIT = 24, DETAIL_TOUCH_INTERVAL = 60 * 60 * 1000;
  var PERIODS_FULL_REFRESH_TTL = 30 * 24 * 60 * 60 * 1000;
  var SEARCH_INDEX_PREFIX = 'javdb_recommend_search_index_v1_', detailCacheAccess = {};

  function readCache(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.version === CACHE_VERSION ? parsed : null;
    } catch (e) {
      console.warn('[javdb-recommend] 本地缓存读取失败:', e.message);
      return null;
    }
  }

  function writeCache(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[javdb-recommend] 本地缓存写入失败:', e.message);
      return false;
    }
  }

  function readPeriodsCache() {
    var cache = readCache(PERIODS_CACHE_KEY);
    if (!cache || !Array.isArray(cache.periods) || !cache.periods.length || !Number.isFinite(cache.fetchedAt)) return null;
    return {
      periods: cache.periods,
      fetchedAt: cache.fetchedAt,
      fullFetchedAt: cache.fullFetchedAt || cache.fetchedAt,
      fresh: Date.now() - cache.fetchedAt < PERIODS_CACHE_TTL
    };
  }

  function writePeriodsCache(list, fullFetchedAt) {
    writeCache(PERIODS_CACHE_KEY, {
      version: CACHE_VERSION,
      fetchedAt: Date.now(),
      fullFetchedAt: fullFetchedAt || Date.now(),
      periods: list
    });
  }

  function detailCacheTtl(period) {
    return periods.length && periods[0].period === period
      ? LATEST_DETAIL_CACHE_TTL
      : HISTORICAL_DETAIL_CACHE_TTL;
  }

  function readCachedDetail(period) {
    var cache = readCache(DETAILS_CACHE_KEY);
    var entry = cache && cache.entries && cache.entries[String(period)];
    if (!entry || !Array.isArray(entry.movies) || !Number.isFinite(entry.fetchedAt)) return null;
    var now = Date.now();
    if (now - (entry.accessedAt || 0) >= DETAIL_TOUCH_INTERVAL) {
      entry.accessedAt = now;
      writeCache(DETAILS_CACHE_KEY, cache);
    }
    return {
      movies: entry.movies,
      fresh: now - entry.fetchedAt < detailCacheTtl(period)
    };
  }

  function rememberDetail(period, movies) {
    detailCache[period] = movies;
    detailCacheAccess[period] = Date.now();
    var keys = Object.keys(detailCache).sort(function (a, b) {
      return (detailCacheAccess[b] || 0) - (detailCacheAccess[a] || 0);
    });
    keys.slice(DETAIL_MEMORY_LIMIT).forEach(function (key) {
      delete detailCache[key];
      delete detailCacheAccess[key];
    });
  }

  function searchIndexKey(period) { return SEARCH_INDEX_PREFIX + period; }

  function projectMovie(movie) {
    return { id: movie.id, number: movie.number || '', title: movie.title || '', origin_title: movie.origin_title || '', cover_url: movie.cover_url || '', score: movie.score || '', release_date: movie.release_date || '' };
  }

  function readSearchIndex(period) {
    var entry = readCache(searchIndexKey(period));
    if (!entry || !Array.isArray(entry.movies) || !Number.isFinite(entry.fetchedAt)) return null;
    if (periods.length && periods[0].period !== period) return entry.movies;
    return Date.now() - entry.fetchedAt < LATEST_DETAIL_CACHE_TTL ? entry.movies : null;
  }

  function writeSearchIndex(period, movies) {
    writeCache(searchIndexKey(period), {
      version: CACHE_VERSION,
      fetchedAt: Date.now(),
      movies: movies.map(projectMovie)
    });
  }

  function clearArchiveCaches() {
    localStorage.removeItem(PERIODS_CACHE_KEY);
    localStorage.removeItem(DETAILS_CACHE_KEY);
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var key = localStorage.key(i);
      if (key && key.indexOf(SEARCH_INDEX_PREFIX) === 0) localStorage.removeItem(key);
    }
  }

  function writeCachedDetail(period, movies) {
    var cache = readCache(DETAILS_CACHE_KEY);
    var entries = cache && cache.entries && typeof cache.entries === 'object' ? cache.entries : {};
    var now = Date.now();
    entries[String(period)] = { fetchedAt: now, accessedAt: now, movies: movies };
    var keys = Object.keys(entries).sort(function (a, b) {
      return (entries[b].accessedAt || entries[b].fetchedAt || 0) - (entries[a].accessedAt || entries[a].fetchedAt || 0);
    });
    keys.slice(DETAIL_CACHE_LIMIT).forEach(function (key) { delete entries[key]; });
    keys = keys.slice(0, DETAIL_CACHE_LIMIT);
    while (!writeCache(DETAILS_CACHE_KEY, { version: CACHE_VERSION, entries: entries })) {
      if (keys.length <= 1) break;
      delete entries[keys.pop()];
    }
  }

  /* ================= 独立归档页（ROUTE） ================= */
  // javdb.com 对未知路径返回不含重定向的 404 HTML 页，脚本直接把它渲染成归档页。
  function isArchiveRoute() {
    return location.pathname.replace(/\/+$/, '') === ROUTE;
  }

  function bootArchivePage() {
    document.title = '佳片推荐 · 历史期数 - JavDB';
    // 官网裸 404 页自带 rails-default-error-page 居中浅底样式，清掉后由本脚本完全接管
    document.body.className = '';

    /* ---------- 样式（全部限定在 .jdb-ra 下） ----------
       始终生效：页面结构、工具栏、期区块、栅格列数、封面不裁切；
       html.jdb-ra-native（官网样式表已加载）：只需补吸顶偏移等少量适配，外观交给官网 CSS；
       html:not(.jdb-ra-native)（官网样式缺失）：控件与卡片的浅色可读兜底。 */
    var CSS = [
      'html:not(.jdb-ra-native) body{background:#f5f5f5}',
      '.jdb-ra{max-width:1700px;margin:0 auto;padding:4px 16px 40px;font-family:BlinkMacSystemFont,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;color:#4a4a4a}',
      '.jdb-ra .jdb-ra-hd{display:flex;align-items:baseline;gap:10px;padding:6px 0 2px}',
      '.jdb-ra .jdb-ra-hd h1{font-size:17px;margin:0;color:#363636}',
      '.jdb-ra .jdb-ra-hd .sub{font-size:12px;color:#7a7a7a}',
      '.jdb-ra .jdb-ra-hd .home{margin-left:auto;font-size:13px;color:#3273dc;text-decoration:none}',
      '.jdb-ra .jdb-ra-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0;position:sticky;top:0;z-index:20;background:#f5f5f5}',
      'html.jdb-ra-native .jdb-ra .jdb-ra-bar{top:52px}',
      '.jdb-ra .jdb-ra-bar .select{flex:1 1 200px;max-width:340px}',
      '.jdb-ra .jdb-ra-bar .select select{width:100%}',
      '.jdb-ra .jdb-ra-bar .jdb-ra-jump{flex:0 0 90px;width:90px}',
      '.jdb-ra .jdb-ra-bar .jdb-ra-search{flex:1 1 160px;max-width:280px}',
      '.jdb-ra .jdb-ra-status{min-height:20px;padding:2px 0 6px;font-size:13px;color:#7a7a7a}',
      '.jdb-ra .jdb-ra-sec{scroll-margin-top:118px}',
      '@supports(content-visibility:auto){.jdb-ra .jdb-ra-sec{content-visibility:auto;contain-intrinsic-size:auto 820px}}',
      '.jdb-ra .jdb-ra-ph{font-size:15px;font-weight:600;color:#363636;margin:20px 0 8px;display:flex;align-items:baseline;gap:10px}',
      '.jdb-ra .jdb-ra-ph .sub{font-size:12px;color:#7a7a7a;font-weight:400}',
      // 栅格列数随宽度升档（覆盖官网 .movie-list 的固定 4 列），宽屏充分利用
      '.jdb-ra .movie-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:.4rem;row-gap:1rem;padding-bottom:.5rem}',
      '@media (min-width:769px){.jdb-ra .movie-list{grid-template-columns:repeat(4,minmax(0,1fr))}}',
      '@media (min-width:1216px){.jdb-ra .movie-list{grid-template-columns:repeat(5,minmax(0,1fr))}}',
      '@media (min-width:1500px){.jdb-ra .movie-list{grid-template-columns:repeat(6,minmax(0,1fr))}}',
      // 封面横版完整显示（contain 不裁切），两侧留白融进卡片底色
      '.jdb-ra .movie-list .item{min-width:0;height:100%}',
      '.jdb-ra .movie-list .item>.box{display:flex!important;flex-direction:column!important;height:100%!important}',
      '.jdb-ra .movie-list .item .cover{flex:0 0 auto;background:#fff}',
      '.jdb-ra .movie-list .item .cover.contain img{object-fit:contain!important}',
      '.jdb-ra .movie-list .item .meta{margin-top:auto}',
      '.jdb-ra .jdb-ra-empty{color:#7a7a7a;font-size:13px;padding:12px 0}',
      '.jdb-ra .jdb-ra-sentinel{display:block;margin:14px auto;padding:7px 18px;font-size:13px;color:#4a4a4a;background:#fff;border:1px solid #dbdbdb;border-radius:4px;cursor:pointer}',
      '.jdb-ra .jdb-ra-sentinel[disabled]{cursor:default;color:#7a7a7a}',
      // 深色主题跟随官网（data-theme 由官网首页复制而来）
      'html[data-theme=dark] .jdb-ra{color:#eee}',
      'html[data-theme=dark] .jdb-ra .jdb-ra-hd h1,html[data-theme=dark] .jdb-ra .jdb-ra-ph{color:#eee}',
      'html[data-theme=dark] .jdb-ra .jdb-ra-bar{background:#17181c}',
      'html[data-theme=dark] .jdb-ra .movie-list .item .cover{background:#222}',
      // 官网样式缺失时的兜底
      'html:not(.jdb-ra-native) .jdb-ra select,html:not(.jdb-ra-native) .jdb-ra input,html:not(.jdb-ra-native) .jdb-ra button{background:#fff;color:#4a4a4a;border:1px solid #dbdbdb;border-radius:4px;padding:6px 10px;font-size:13px;outline:none}',
      'html:not(.jdb-ra-native) .jdb-ra button{cursor:pointer}',
      'html:not(.jdb-ra-native) .jdb-ra .box{display:block;background:#fff;border-radius:6px;box-shadow:0 .5em 1em -.125em rgba(10,10,10,.1),0 0 0 1px rgba(10,10,10,.02);padding-bottom:.6rem;color:#4a4a4a;text-decoration:none}',
      'html:not(.jdb-ra-native) .jdb-ra .cover{position:relative;padding-top:67%;background:#fff;overflow:hidden;border-radius:6px 6px 0 0}',
      'html:not(.jdb-ra-native) .jdb-ra .cover img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain}',
      'html:not(.jdb-ra-native) .jdb-ra .video-title{color:#3273dc;font-size:13px;padding:6px 8px 0}',
      'html:not(.jdb-ra-native) .jdb-ra .meta{color:#7a7a7a;font-size:12px;padding:2px 8px 0}'
    ].join('\n');

    var styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    document.body.innerHTML =
      '<main class="jdb-ra">' +
      '<header class="jdb-ra-hd"><h1>佳片推荐 · 历史期数</h1><span class="sub">每周一/四更新 · 滚动加载更多期数</span>' +
      '<a class="home" href="/">← 返回首页</a></header>' +
      '<div class="jdb-ra-bar">' +
      '<div class="select is-small"><select id="jdb-ra-select" aria-label="选择期数"></select></div>' +
      '<button type="button" class="button is-small" id="jdb-ra-prev">◀ 上一期</button>' +
      '<button type="button" class="button is-small" id="jdb-ra-next">下一期 ▶</button>' +
      '<input class="input is-small jdb-ra-jump" id="jdb-ra-jump" type="number" min="1" placeholder="期号" aria-label="输入期号后回车跳转">' +
      '<input class="input is-small jdb-ra-search" id="jdb-ra-search" type="search" placeholder="🔍 搜索已加载内容" aria-label="搜索已加载内容">' +
      '<button type="button" class="button is-small" id="jdb-ra-gsearch" title="在所有期数中搜索">全期搜索</button>' +
      '<button type="button" class="button is-small" id="jdb-ra-refresh" title="重新检查期数目录">刷新期数</button>' +
      '<button type="button" class="button is-small" id="jdb-ra-clear" title="清除本脚本的本地缓存">清缓存</button>' +
      '</div>' +
      '<div class="jdb-ra-status" id="jdb-ra-status" role="status">加载期数列表中…</div>' +
      '<div class="jdb-ra-results" id="jdb-ra-results" hidden></div>' +
      '<div class="jdb-ra-stream" id="jdb-ra-stream"></div>' +
      '<button type="button" class="jdb-ra-sentinel" id="jdb-ra-sentinel" disabled>加载期数列表中…</button>' +
      '</main>';

    var $ = function (id) { return document.getElementById(id); };
    var statusEl = $('jdb-ra-status'), streamEl = $('jdb-ra-stream'),
        resultsEl = $('jdb-ra-results'), sentinel = $('jdb-ra-sentinel'),
        select = $('jdb-ra-select');

    /* ---------- 多脚本布局兼容 ----------
       第三方 JavDB 增强脚本可能只接管动态流中的第一块 movie-list。
       一旦检测到它的 javdb-card-grid 标记，就把其实际列数与间距同步到本归档页的全部期区块。 */
    var gridSyncScheduled = false;
    var gridResizeObserver = null;
    var observedGridSource = null;
    var lastCompatibleGridLayout = null;

    function setImportantStyle(el, name, value) {
      if (el.style.getPropertyValue(name) === value && el.style.getPropertyPriority(name) === 'important') return;
      el.style.setProperty(name, value, 'important');
    }

    function countGridTracks(template) {
      var value = String(template || '').trim();
      if (!value || value === 'none') return 0;
      var repeated = /^repeat\(\s*(\d+)\s*,/i.exec(value);
      if (repeated) return parseInt(repeated[1], 10);
      var depth = 0;
      var count = 0;
      var inTrack = false;
      for (var i = 0; i < value.length; i++) {
        var char = value[i];
        if (char === '(' || char === '[') depth += 1;
        else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
        if (/\s/.test(char) && depth === 0) {
          if (inTrack) count += 1;
          inTrack = false;
        } else {
          inTrack = true;
        }
      }
      return count + (inTrack ? 1 : 0);
    }

    function observeGridSource(source) {
      if (observedGridSource === source) return;
      if (gridResizeObserver) gridResizeObserver.disconnect();
      observedGridSource = source;
      if (typeof window.ResizeObserver === 'function') {
        gridResizeObserver = new window.ResizeObserver(scheduleArchiveGridSync);
        gridResizeObserver.observe(source);
      }
    }

    function syncArchiveGridLayout() {
      gridSyncScheduled = false;
      var source = streamEl.querySelector('.movie-list.javdb-card-grid,.movie-list[data-laosiji-grid="1"]');
      if (!source) source = resultsEl.querySelector('.movie-list.javdb-card-grid,.movie-list[data-laosiji-grid="1"]');
      if (source) {
        var computed = window.getComputedStyle(source);
        var columns = countGridTracks(computed.gridTemplateColumns);
        if (!columns) columns = parseInt(computed.getPropertyValue('--jav-card-columns'), 10);
        if (Number.isFinite(columns) && columns > 0) {
          observeGridSource(source);
          lastCompatibleGridLayout = {
            template: 'repeat(' + columns + ', minmax(0, 1fr))',
            columnGap: computed.columnGap || '.4rem',
            rowGap: computed.rowGap || '1rem'
          };
        }
      } else if (observedGridSource && !observedGridSource.isConnected) {
        if (gridResizeObserver) gridResizeObserver.disconnect();
        observedGridSource = null;
      }
      if (!lastCompatibleGridLayout) return;
      document.querySelectorAll('.jdb-ra .movie-list').forEach(function (list) {
        if (list === source) return;
        setImportantStyle(list, 'grid-template-columns', lastCompatibleGridLayout.template);
        setImportantStyle(list, 'column-gap', lastCompatibleGridLayout.columnGap);
        setImportantStyle(list, 'row-gap', lastCompatibleGridLayout.rowGap);
      });
    }

    function scheduleArchiveGridSync() {
      if (gridSyncScheduled) return;
      gridSyncScheduled = true;
      Promise.resolve().then(syncArchiveGridLayout);
    }

    if (typeof window.MutationObserver === 'function') {
      new window.MutationObserver(scheduleArchiveGridSync).observe(document.querySelector('.jdb-ra'), {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-laosiji-grid']
      });
    }
    window.addEventListener('resize', scheduleArchiveGridSync, { passive: true });

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function setStatus(t) { statusEl.textContent = t; }
    function readyText() { return '共 ' + periods.length + ' 期 · 每周一/四更新 · 滚动加载更多'; }

    /* ---------- 官网原生外观 ----------
       样式表与导航直接复制自官网首页（同源）。样式表 URL 带部署指纹
       （/packs/css/app-<hash>.css），硬编码会随官网发版失效，只能运行时复制。
       失败时页面用上面的兜底样式，功能不受影响。 */
    function loadSiteChrome() {
      fetch(BASE + '/').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if (doc.documentElement.dataset.theme) {
          document.documentElement.dataset.theme = doc.documentElement.dataset.theme;
        }
        doc.querySelectorAll('link[rel~="stylesheet"]').forEach(function (l) {
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = l.getAttribute('href');
          if (l.getAttribute('media')) link.media = l.getAttribute('media');
          document.head.appendChild(link);
        });
        var nav = doc.querySelector('nav.main-nav');
        if (nav) {
          document.body.insertAdjacentHTML('afterbegin', nav.outerHTML);
          document.documentElement.classList.add('has-navbar-fixed-top');
          // 官网 JS 不在本页运行，汉堡菜单的展开收起由脚本接管
          document.body.querySelectorAll('nav.main-nav [data-target]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
              e.preventDefault();
              var t = document.getElementById(btn.getAttribute('data-target'));
              btn.classList.toggle('is-active');
              if (t) t.classList.toggle('is-active');
            });
          });
          // 补归档页自身入口，与官网其他页面保持一致
          var start = document.body.querySelector('nav.main-nav .navbar-start');
          if (start && !start.querySelector('a[href="' + ROUTE + '"]')) {
            var a = document.createElement('a');
            a.className = 'navbar-item';
            a.href = ROUTE;
            a.title = '浏览佳片推荐全部历史期数';
            a.textContent = '佳片推荐';
            start.appendChild(a);
          }
        }
        document.documentElement.classList.add('jdb-ra-native');
      }).catch(function (e) {
        console.warn('[javdb-recommend] 官网样式加载失败，使用内置兜底样式:', e.message);
      });
    }

    /* ---------- 期数列表 ---------- */
    function uniquePeriods(list) {
      var seen = {};
      return list.filter(function (item) {
        if (seen[item.period]) return false;
        seen[item.period] = true;
        return true;
      });
    }

    function mergeCatalogPrefix(remote, local) {
      var localIndex = {};
      local.forEach(function (item, index) { localIndex[item.period] = index; });
      for (var i = remote.length - 1; i >= 0; i--) {
        if (localIndex[remote[i].period] === undefined) continue;
        return uniquePeriods(remote.concat(local.slice(localIndex[remote[i].period] + 1)));
      }
      return null;
    }

    function loadPeriods() {
      var cached = readPeriodsCache();
      if (cached && cached.fresh) {
        finish(cached.periods, '期数目录：本地缓存');
        return;
      }
      setStatus('加载期数列表中…');
      var list = [];
      var allowIncremental = cached && Date.now() - cached.fullFetchedAt < PERIODS_FULL_REFRESH_TTL;
      (function next(page) {
        api('/api/v1/movies/recommend_periods', { page: page, limit: 48 }).then(function (d) {
          var batch = d.periods || [];
          list = list.concat(batch);
          setStatus('加载期数列表… 已获取 ' + list.length + ' 期');
          var merged = allowIncremental ? mergeCatalogPrefix(list, cached.periods) : null;
          if (merged) {
            writePeriodsCache(merged, cached.fullFetchedAt);
            finish(merged, '期数目录：已增量更新');
          } else if (batch.length === 48) {
            next(page + 1);
          } else {
            list = uniquePeriods(list);
            writePeriodsCache(list, Date.now());
            finish(list, '期数目录：已完整更新');
          }
        }).catch(function (e) {
          if (cached) {
            finish(cached.periods, '期数目录更新失败，使用本地缓存');
            return;
          }
          setStatus('期数列表加载失败：' + e.message + '（可点击“刷新期数”重试）');
        });
      })(1);
    }

    function finish(list, sourceLabel) {
      periods = list;
      renderSelect();
      setStatus(sourceLabel ? readyText() + ' · ' + sourceLabel : readyText());
      if (periods.length) startStream();
    }

    function renderSelect() {
      select.innerHTML = '';
      periods.forEach(function (p) {
        var o = document.createElement('option');
        o.value = String(p.period);
        o.textContent = '第 ' + p.period + ' 期 · ' + p.created_at.slice(0, 10) + ' · ' + p.movies_count + ' 部';
        select.appendChild(o);
      });
    }

    /* ---------- 流式浏览（滚动加载更多期数） ---------- */
    var streamNext = 0;      // periods 中下一块待加载的下标
    var streamBusy = false;
    var sentinelVisible = false;
    var streamGeneration = 0;
    var navigationGeneration = 0;
    var streamLease = null;
    var loadedSections = {}; // period -> section 元素
    var currentIdx = 0;

    function setSentinel(t, disabled) {
      sentinel.textContent = t;
      sentinel.disabled = !!disabled;
    }

    function sectionShell(p) {
      var sec = document.createElement('section');
      sec.className = 'jdb-ra-sec';
      sec.dataset.period = String(p.period);
      sec.innerHTML =
        '<h2 class="jdb-ra-ph">第 ' + p.period + ' 期 <span class="sub">' +
        esc(p.created_at.slice(0, 10)) + ' · ' + p.movies_count + ' 部</span></h2>' +
        '<div class="movie-list"></div>';
      return sec;
    }

    // 卡片用官网原生 movie-list 标记，点击直达官网影片详情页 /v/<id>；
    // cover 加 contain：横版封面完整显示不裁切
    function normalizedReleaseDate(value) {
      var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
      if (!match) return '';
      var year = parseInt(match[1], 10);
      var month = parseInt(match[2], 10);
      var day = parseInt(match[3], 10);
      var date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? match[0]
        : '';
    }

    function cardMetaHtml(movie) {
      var parts = [];
      if (movie.score) parts.push('★ ' + esc(movie.score));
      var releaseDate = normalizedReleaseDate(movie.release_date);
      if (releaseDate) parts.push('发售 ' + releaseDate);
      return parts.length ? '<div class="meta">' + parts.join(' · ') + '</div>' : '';
    }

    function cardHtml(m) {
      var title = m.title || m.origin_title || '';
      return '<div class="item" data-q="' + esc((m.number + ' ' + (m.title || '') + ' ' + (m.origin_title || '')).toLowerCase()) + '">' +
        '<a class="box" href="' + esc(movieUrl(m)) + '" target="_blank" rel="noopener" title="' + esc(title) + '">' +
        '<div class="cover contain"><img loading="lazy" src="' + esc(coverUrl(m.cover_url)) + '" alt="' + esc(m.number) + '" ' +
        'onerror="this.style.visibility=\'hidden\'"></div>' +
        '<div class="video-title"><strong>' + esc(m.number) + '</strong> ' + esc(title) + '</div>' +
        cardMetaHtml(m) +
        '</a></div>';
    }

    function currentQuery() { return $('jdb-ra-search').value.trim().toLowerCase(); }

    // 已加载内容的即时过滤：隐藏不匹配的卡片与空区块
    function applyFilter(q) {
      var hits = 0;
      streamEl.querySelectorAll('.jdb-ra-sec').forEach(function (sec) {
        var visible = 0;
        sec.querySelectorAll('.item').forEach(function (item) {
          var show = !q || item.dataset.q.indexOf(q) !== -1;
          item.style.display = show ? '' : 'none';
          if (show) visible += 1;
        });
        sec.style.display = visible ? '' : 'none';
        hits += visible;
      });
      return hits;
    }

    function appendNext(generation) {
      if (generation === undefined) generation = streamGeneration;
      if (generation !== streamGeneration) return Promise.resolve(false);
      if (streamBusy || !periods.length) return Promise.resolve(false);
      if (streamNext >= periods.length) {
        setSentinel('已加载全部 ' + periods.length + ' 期', true);
        return Promise.resolve(false);
      }
      streamBusy = true;
      var p = periods[streamNext];
      var sec = sectionShell(p);
      loadedSections[p.period] = sec;
      streamEl.appendChild(sec);
      setSentinel('加载第 ' + p.period + ' 期…', true);
      var lease = acquirePeriodMovies(p.period, 'navigation', 'stream:' + generation);
      streamLease = lease;
      return lease.promise.then(function (movies) {
        if (generation !== streamGeneration) return false;
        sec.querySelector('.movie-list').innerHTML =
          movies.map(cardHtml).join('') || '<div class="jdb-ra-empty">本期没有影片</div>';
        streamNext = streamNext + 1;
        streamBusy = false;
        setSentinel('加载更多期数', false);
        var q = currentQuery();
        if (q) applyFilter(q); // 搜索激活时新加载的卡片也要参与过滤
        scheduleArchiveGridSync();
        if (sentinelVisible) appendNext(generation);
        return true;
      }).catch(function (e) {
        if (generation !== streamGeneration) return false;
        streamBusy = false;
        delete loadedSections[p.period];
        sec.remove();
        setSentinel('第 ' + p.period + ' 期加载失败：' + e.message + '（点击重试）', false);
        return false;
      }).finally(function () {
        lease.release();
        if (streamLease === lease) streamLease = null;
      });
    }

    function startStream() {
      var saved = parseInt(localStorage.getItem(LS_KEY), 10);
      var idx = periods.findIndex(function (p) { return p.period === saved; });
      streamNext = idx >= 0 ? idx : 0;
      currentIdx = streamNext;
      sentinel.addEventListener('click', function () { appendNext(); });
      if (typeof IntersectionObserver !== 'undefined') {
        var io = new IntersectionObserver(function (entries) {
          sentinelVisible = entries[0].isIntersecting;
          if (sentinelVisible) appendNext();
        }, { rootMargin: '600px' });
        io.observe(sentinel);
      }
      appendNext();
    }

    function reanchorStream(index) {
      if (streamLease) streamLease.release();
      var generation = streamGeneration + 1;
      streamGeneration = generation;
      streamEl.innerHTML = '';
      loadedSections = {};
      streamNext = index;
      streamBusy = false;
      return appendNext(generation);
    }

    function resolvedLease(movies) { return { promise: Promise.resolve(movies), release: function () {} }; }

    function acquireDetailRequest(period, owner) {
      var entry = detailRequests[period];
      if (!entry) {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        entry = { controller: controller, consumers: new Set(), promise: null };
        entry.promise = api('/api/v1/movies/recommend', { period: period }, {
          signal: controller ? controller.signal : null
        }).then(function (d) { return d.movies || []; }).finally(function () {
          if (detailRequests[period] === entry) delete detailRequests[period];
        });
        detailRequests[period] = entry;
      }
      entry.consumers.add(owner);
      var released = false;
      return {
        promise: entry.promise,
        release: function () {
          if (released) return;
          released = true;
          entry.consumers.delete(owner);
          if (!entry.consumers.size && detailRequests[period] === entry) {
            delete detailRequests[period];
            if (entry.controller) entry.controller.abort();
          }
        }
      };
    }

    function acquirePeriodMovies(period, purpose, owner) {
      if (detailCache[period]) {
        detailCacheAccess[period] = Date.now();
        return resolvedLease(detailCache[period]);
      }
      if (purpose === 'search') {
        var indexed = readSearchIndex(period);
        if (indexed) return resolvedLease(indexed);
      }
      var cached = readCachedDetail(period);
      if (cached && cached.fresh) {
        if (purpose === 'navigation') rememberDetail(period, cached.movies);
        writeSearchIndex(period, cached.movies);
        return resolvedLease(cached.movies);
      }
      var networkLease = acquireDetailRequest(period, owner);
      var promise = networkLease.promise.then(function (movies) {
        writeSearchIndex(period, movies);
        if (purpose === 'navigation') {
          rememberDetail(period, movies);
          writeCachedDetail(period, movies);
        }
        return movies;
      }).catch(function (e) {
        if (!cached) throw e;
        if (purpose === 'navigation') rememberDetail(period, cached.movies);
        return cached.movies;
      });
      return { promise: promise, release: networkLease.release };
    }

    var leaseSequence = 0;
    function getPeriodMovies(period) {
      var lease = acquirePeriodMovies(period, 'navigation', 'read:' + (++leaseSequence));
      return lease.promise.finally(lease.release);
    }

    /* ---------- 期数导航：已加载的滚动到位，相邻追加，远距直接重定位 ---------- */
    function gotoPeriod(period) {
      var navigation = navigationGeneration + 1;
      navigationGeneration = navigation;
      var idx = periods.findIndex(function (p) { return p.period === period; });
      if (idx < 0) { setStatus('没有第 ' + period + ' 期'); return; }
      currentIdx = idx;
      try { localStorage.setItem(LS_KEY, String(period)); } catch (e) {}
      select.value = String(period);
      if (loadedSections[period]) { scrollToPeriod(period); return; }
      setStatus('跳转到第 ' + period + ' 期，加载中…');
      var load = idx === streamNext && !streamBusy
        ? appendNext(streamGeneration)
        : reanchorStream(idx);
      load.then(function () {
        if (navigation !== navigationGeneration) return;
        if (loadedSections[period]) {
          setStatus(readyText());
          scrollToPeriod(period);
        }
      });
    }

    function scrollToPeriod(period) {
      var sec = loadedSections[period];
      if (sec) sec.scrollIntoView();
    }

    // periods 为降序（最新在前）：dir=1 → 更早一期；dir=-1 → 更新一期
    function stepPeriod(dir) {
      if (!periods.length) return;
      var t = currentIdx + dir;
      if (t < 0 || t >= periods.length) { setStatus(dir > 0 ? '已是最早一期' : '已是最新一期'); return; }
      gotoPeriod(periods[t].period);
    }
    $('jdb-ra-prev').addEventListener('click', function () { stepPeriod(1); });
    $('jdb-ra-next').addEventListener('click', function () { stepPeriod(-1); });
    select.addEventListener('change', function () { gotoPeriod(parseInt(select.value, 10)); });
    $('jdb-ra-jump').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var v = parseInt(e.target.value, 10);
      if (v > 0) { gotoPeriod(v); e.target.value = ''; }
    });

    /* ---------- 搜索 ---------- */
    function matches(m, q) {
      return (m.number + ' ' + (m.title || '') + ' ' + (m.origin_title || '')).toLowerCase().indexOf(q) !== -1;
    }

    function enterResultsMode() {
      resultsEl.hidden = false;
      streamEl.style.display = 'none';
      sentinel.style.display = 'none';
    }

    function exitResultsMode() {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      streamEl.style.display = '';
      sentinel.style.display = '';
    }

    var debounceTimer = null;
    $('jdb-ra-search').addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        if (searching) return; // 全期搜索进行中不打断
        exitResultsMode();
        var q = currentQuery();
        var hits = applyFilter(q);
        setStatus(q ? '已加载内容中命中 ' + hits + ' 部' : (periods.length ? readyText() : '加载期数列表中…'));
      }, 300);
    });

    var searchGeneration = 0;
    var activeSearchLeases = {};

    function stopSearch(label) {
      searching = false;
      searchGeneration += 1;
      Object.keys(activeSearchLeases).forEach(function (key) { activeSearchLeases[key].release(); });
      activeSearchLeases = {};
      $('jdb-ra-gsearch').textContent = '全期搜索';
      if (label) setStatus(label);
    }

    function appendSearchGroup(period, periodIndex, movies) {
      if (!movies.length) return;
      var sec = document.createElement('section');
      sec.className = 'jdb-ra-sec';
      sec.dataset.periodIndex = String(periodIndex);
      sec.innerHTML = '<h2 class="jdb-ra-ph">第 ' + period + ' 期</h2>' +
        '<div class="movie-list">' + movies.map(cardHtml).join('') + '</div>';
      var before = Array.prototype.find.call(resultsEl.querySelectorAll('.jdb-ra-sec'), function (item) {
        return parseInt(item.dataset.periodIndex, 10) > periodIndex;
      });
      resultsEl.insertBefore(sec, before || null);
      scheduleArchiveGridSync();
    }

    $('jdb-ra-gsearch').addEventListener('click', function () {
      var q = currentQuery();
      if (!q) { setStatus('请先输入关键词'); return; }
      if (searching) { stopSearch('已停止搜索'); return; }
      searching = true;
      var generation = ++searchGeneration;
      var btnEl = $('jdb-ra-gsearch');
      btnEl.textContent = '停止';
      enterResultsMode();
      resultsEl.innerHTML = '';
      var done = 0;
      var hits = 0;
      var hitPeriods = 0;
      var missing = [];
      var disk = readCache(DETAILS_CACHE_KEY);
      var diskEntries = disk && disk.entries ? disk.entries : {};
      periods.forEach(function (p, periodIndex) {
        var movies = detailCache[p.period] || readSearchIndex(p.period);
        var diskEntry = diskEntries[String(p.period)];
        if (!movies && diskEntry && Array.isArray(diskEntry.movies) &&
            Date.now() - diskEntry.fetchedAt < detailCacheTtl(p.period)) {
          movies = diskEntry.movies;
          writeSearchIndex(p.period, movies);
        }
        if (!movies) { missing.push({ period: p, index: periodIndex }); return; }
        done += 1;
        var localHits = movies.filter(function (movie) { return matches(movie, q); });
        if (localHits.length) {
          hits += localHits.length;
          hitPeriods += 1;
          appendSearchGroup(p.period, periodIndex, localHits);
        }
      });
      setStatus('本地索引已搜索 ' + done + '/' + periods.length + ' 期 · 命中 ' + hits + ' 部');

      var cursor = 0;
      function worker() {
        if (!searching || generation !== searchGeneration || cursor >= missing.length) return Promise.resolve();
        var missingItem = missing[cursor++];
        var p = missingItem.period;
        var owner = 'search:' + generation + ':' + p.period;
        var lease = acquirePeriodMovies(p.period, 'search', owner);
        activeSearchLeases[owner] = lease;
        return lease.promise.then(function (movies) {
          if (!searching || generation !== searchGeneration) return;
          var found = movies.filter(function (movie) { return matches(movie, q); });
          if (found.length) {
            hits += found.length;
            hitPeriods += 1;
            appendSearchGroup(p.period, missingItem.index, found);
          }
        }).catch(function () {}).finally(function () {
          lease.release();
          delete activeSearchLeases[owner];
          if (generation === searchGeneration) {
            done += 1;
            setStatus('索引补全 ' + done + '/' + periods.length + ' 期 · 命中 ' + hits + ' 部');
          }
        }).then(function () {
          if (!searching || generation !== searchGeneration) return;
          return new Promise(function (resolve) { setTimeout(resolve, 100); }).then(worker);
        });
      }
      Promise.all([worker(), worker()]).then(function () {
        if (!searching || generation !== searchGeneration) return;
        searching = false;
        btnEl.textContent = '全期搜索';
        setStatus('搜索完成 · 命中 ' + hits + ' 部（' + hitPeriods + ' 期）');
        if (!hits) resultsEl.innerHTML = '<div class="jdb-ra-empty">没有找到影片</div>';
      });
    });

    $('jdb-ra-refresh').addEventListener('click', function () {
      localStorage.removeItem(PERIODS_CACHE_KEY);
      location.reload();
    });
    $('jdb-ra-clear').addEventListener('click', function () {
      stopSearch();
      clearArchiveCaches();
      location.reload();
    });

    loadSiteChrome();
    loadPeriods();
  }

  /* ================= 导航入口（普通页面） ================= */
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

  if (isArchiveRoute()) bootArchivePage();
  else injectNavEntry();
})();
