// ==UserScript==
// @name         JavDB Recommend Archive
// @name:zh-CN   JavDB 佳片推荐 · 历史期数
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.0.2
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
    var S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
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

  function api(path, params) {
    var q = new URLSearchParams(params).toString();
    return fetch(BASE + path + '?' + q, {
      headers: { 'jdsignature': signature(), 'connection': 'keep-alive' }
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (j.success !== 1) throw new Error(j.message || '接口返回错误');
      return j.data;
    });
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
  var periods = [];
  var detailCache = {};   // period -> movies[]
  var currentPeriod = null;
  var searching = false;
  var LS_KEY = 'javdb_recommend_last_period';

  /* ================= 独立归档页（ROUTE） ================= */
  // javdb.com 对未知路径返回不含重定向的 404 HTML 页，脚本直接把它渲染成归档页。
  function isArchiveRoute() {
    return location.pathname.replace(/\/+$/, '') === ROUTE;
  }

  function bootArchivePage() {
    document.title = '佳片推荐 · 历史期数 - JavDB';

    var CSS = [
      'body{margin:0;background:oklch(20.5% 0.012 270.8)}',
      '.jdb-ra{max-width:1080px;margin:0 auto;padding:20px 16px 48px;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:oklch(93.7% 0.008 271.3)}',
      '.jdb-ra .hd{display:flex;align-items:baseline;gap:12px;padding-bottom:12px;border-bottom:1px solid oklch(30.5% 0.021 265.9)}',
      '.jdb-ra h1{margin:0;font-size:18px;color:oklch(82% 0.171 78.5)}',
      '.jdb-ra .hd .sub{font-size:12px;color:oklch(65.7% 0.028 268.7)}',
      '.jdb-ra .home{margin-left:auto;font-size:13px;color:oklch(65.7% 0.028 268.7);text-decoration:none}',
      '.jdb-ra .home:hover{color:oklch(82% 0.171 78.5)}',
      '.jdb-ra .bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 0}',
      '.jdb-ra select,.jdb-ra input,.jdb-ra button{background:oklch(27.6% 0.016 264.3);color:oklch(93.7% 0.008 271.3);border:1px solid oklch(34.8% 0.026 264.1);border-radius:7px;padding:7px 10px;font-size:13px;outline:none}',
      '.jdb-ra select:focus-visible,.jdb-ra input:focus-visible,.jdb-ra button:focus-visible{outline:2px solid oklch(82% 0.171 78.5);outline-offset:1px}',
      '.jdb-ra select{flex:1;min-width:180px;max-width:340px}',
      '.jdb-ra .jump{width:80px}',
      '.jdb-ra .search{flex:1;min-width:140px;max-width:260px}',
      '.jdb-ra button{cursor:pointer}',
      '.jdb-ra button:hover{border-color:oklch(82% 0.171 78.5);color:oklch(82% 0.171 78.5)}',
      '.jdb-ra .status{padding:2px 0 10px;min-height:18px;font-size:12px;color:oklch(65.7% 0.028 268.7)}',
      '.jdb-ra .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}',
      '.jdb-ra .card{display:block;background:oklch(26% 0.018 266.3);border:1px solid oklch(30.5% 0.021 265.9);border-radius:9px;overflow:hidden;text-decoration:none;transition:border-color .15s}',
      '.jdb-ra .card:hover{border-color:oklch(82% 0.171 78.5)}',
      '.jdb-ra .cv{position:relative;aspect-ratio:5/7;background:oklch(23% 0.014 270);overflow:hidden}',
      '.jdb-ra .cv img{width:100%;height:100%;object-fit:cover;display:block}',
      '.jdb-ra .cv .num{position:absolute;left:4px;top:4px;background:oklch(0% 0 0 / .75);color:oklch(95% 0.01 270);font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px}',
      '.jdb-ra .cv .score{position:absolute;right:4px;top:4px;background:oklch(0% 0 0 / .75);color:oklch(82% 0.171 78.5);font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px}',
      '.jdb-ra .info{padding:5px 7px 7px}',
      '.jdb-ra .tt{font-size:12px;line-height:1.35;color:oklch(93.7% 0.008 271.3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:32px}',
      '.jdb-ra .grp-title{grid-column:1/-1;color:oklch(82% 0.171 78.5);font-size:13px;font-weight:600;margin-top:4px}',
      '.jdb-ra .empty{grid-column:1/-1;color:oklch(65.7% 0.028 268.7);text-align:center;padding:24px 0;font-size:13px}',
      '@media (max-width:560px){.jdb-ra .grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}}',
      '@media (prefers-reduced-motion:reduce){.jdb-ra .card{transition:none}}'
    ].join('\n');

    var styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    document.body.innerHTML =
      '<main class="jdb-ra">' +
      '<header class="hd"><h1>🎬 佳片推荐 · 历史期数</h1><span class="sub">每周一/四更新</span>' +
      '<a class="home" href="/">← 返回首页</a></header>' +
      '<div class="bar">' +
      '<select id="jdb-ra-select" aria-label="选择期数"></select>' +
      '<button type="button" id="jdb-ra-prev">◀ 上一期</button><button type="button" id="jdb-ra-next">下一期 ▶</button>' +
      '<input class="jump" id="jdb-ra-jump" type="number" min="1" placeholder="期号" aria-label="输入期号后回车跳转">' +
      '<input class="search" id="jdb-ra-search" type="search" placeholder="🔍 搜索当前期" aria-label="搜索当前期">' +
      '<button type="button" id="jdb-ra-gsearch" title="在所有期数中搜索">全期搜索</button>' +
      '</div>' +
      '<div class="status" id="jdb-ra-status" role="status">加载期数列表中…</div>' +
      '<div class="grid" id="jdb-ra-grid"></div>' +
      '</main>';

    var $ = function (id) { return document.getElementById(id); };
    var statusEl = $('jdb-ra-status'), grid = $('jdb-ra-grid'), select = $('jdb-ra-select');

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function setStatus(t) { statusEl.textContent = t; }

    /* ---------- 期数列表 ---------- */
    function loadPeriods() {
      setStatus('加载期数列表中…');
      var list = [];
      (function next(page) {
        api('/api/v1/movies/recommend_periods', { page: page, limit: 48 }).then(function (d) {
          var batch = d.periods || [];
          list = list.concat(batch);
          setStatus('加载期数列表… 已获取 ' + list.length + ' 期');
          if (batch.length === 48) { next(page + 1); }
          else { finish(list); }
        }).catch(function (e) {
          setStatus('期数列表加载失败：' + e.message + '（3 秒后重试）');
          setTimeout(function () { next(page); }, 3000);
        });
      })(1);
    }

    function finish(list) {
      periods = list;
      renderSelect();
      setStatus('共 ' + periods.length + ' 期 · 每周一/四更新');
      if (periods.length) {
        var saved = parseInt(localStorage.getItem(LS_KEY), 10);
        var first = periods.find(function (p) { return p.period === saved; }) ? saved : periods[0].period;
        loadDetail(first);
      }
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

    /* ---------- 单期详情 ---------- */
    function loadDetail(period) {
      currentPeriod = period;
      try { localStorage.setItem(LS_KEY, String(period)); } catch (e) {}
      select.value = String(period);
      if (detailCache[period]) {
        renderMovies(detailCache[period]);
        setStatus('第 ' + period + ' 期 · 共 ' + detailCache[period].length + ' 部');
        return;
      }
      setStatus('加载第 ' + period + ' 期…');
      api('/api/v1/movies/recommend', { period: period }).then(function (d) {
        detailCache[period] = d.movies || [];
        renderMovies(detailCache[period]);
        setStatus('第 ' + period + ' 期 · 共 ' + detailCache[period].length + ' 部');
      }).catch(function (e) {
        setStatus('加载失败：' + e.message);
      });
    }

    // 卡片即直链：点击直达官网影片详情页 /v/<id>
    function cardHtml(m) {
      return '<a class="card" href="' + esc(movieUrl(m)) + '" target="_blank" rel="noopener">' +
        '<div class="cv"><img loading="lazy" src="' + esc(coverUrl(m.cover_url)) + '" ' +
        'onerror="this.style.visibility=\'hidden\'">' +
        '<span class="num">' + esc(m.number) + '</span>' +
        (m.score ? '<span class="score">★ ' + esc(m.score) + '</span>' : '') +
        '</div><div class="info"><div class="tt">' + esc(m.title || m.origin_title || '') + '</div></div></a>';
    }

    function renderMovies(movies, headerText) {
      grid.innerHTML = '';
      if (headerText) {
        var h = document.createElement('div');
        h.className = 'grp-title';
        h.textContent = headerText;
        grid.appendChild(h);
      }
      if (!movies.length) {
        var e = document.createElement('div');
        e.className = 'empty';
        e.textContent = '没有找到影片';
        grid.appendChild(e);
        return;
      }
      movies.forEach(function (m) {
        var div = document.createElement('div');
        div.innerHTML = cardHtml(m);
        grid.appendChild(div.firstChild);
      });
    }

    /* ---------- 翻期 ---------- */
    // periods 为降序（最新在前）：dir=1 → 更早一期；dir=-1 → 更新一期
    function step(dir) {
      if (!periods.length) return;
      var idx = periods.findIndex(function (p) { return p.period === currentPeriod; });
      if (idx < 0) return;
      var t = idx + dir;
      if (t < 0 || t >= periods.length) { setStatus(dir > 0 ? '已是最早一期' : '已是最新一期'); return; }
      if (periods[t].period !== currentPeriod) loadDetail(periods[t].period);
    }
    $('jdb-ra-prev').addEventListener('click', function () { step(1); });
    $('jdb-ra-next').addEventListener('click', function () { step(-1); });
    select.addEventListener('change', function () { loadDetail(parseInt(select.value, 10)); });
    $('jdb-ra-jump').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var v = parseInt(e.target.value, 10);
      if (v > 0 && periods.some(function (p) { return p.period === v; })) { loadDetail(v); e.target.value = ''; }
      else setStatus('没有第 ' + v + ' 期');
    });

    /* ---------- 搜索 ---------- */
    function matches(m, q) {
      return (m.number + ' ' + (m.title || '') + ' ' + (m.origin_title || '')).toLowerCase().indexOf(q) !== -1;
    }
    var debounceTimer = null;
    $('jdb-ra-search').addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        var q = $('jdb-ra-search').value.trim().toLowerCase();
        if (currentPeriod == null || !detailCache[currentPeriod]) return;
        var movies = detailCache[currentPeriod];
        renderMovies(q ? movies.filter(function (m) { return matches(m, q); }) : movies);
      }, 300);
    });

    $('jdb-ra-gsearch').addEventListener('click', function () {
      var q = $('jdb-ra-search').value.trim().toLowerCase();
      if (!q) { setStatus('请先输入关键词'); return; }
      if (searching) { searching = false; setStatus('已停止搜索'); return; }
      searching = true;
      var btnEl = $('jdb-ra-gsearch');
      btnEl.textContent = '停止';
      var results = [];
      var done = 0;
      (function scan(i) {
        if (!searching || i >= periods.length) {
          searching = false;
          btnEl.textContent = '全期搜索';
          if (results.length) setStatus('搜索完成 · 命中 ' + results.reduce(function (a, r) { return a + r.movies.length; }, 0) + ' 部（' + results.length + ' 期）');
          return;
        }
        var p = periods[i];
        var cont = function (movies) {
          done++;
          var hit = movies.filter(function (m) { return matches(m, q); });
          if (hit.length) { results.push({ period: p.period, movies: hit }); renderResults(results); }
          setStatus('搜索进度 ' + done + '/' + periods.length + ' · 命中 ' + results.reduce(function (a, r) { return a + r.movies.length; }, 0) + ' 部');
          setTimeout(function () { scan(i + 1); }, 60);
        };
        if (detailCache[p.period]) cont(detailCache[p.period]);
        else api('/api/v1/movies/recommend', { period: p.period })
          .then(function (d) { detailCache[p.period] = d.movies || []; cont(detailCache[p.period]); })
          .catch(function () { cont([]); });
      })(0);
    });

    function renderResults(results) {
      grid.innerHTML = '';
      results.forEach(function (g) {
        var h = document.createElement('div');
        h.className = 'grp-title';
        h.textContent = '第 ' + g.period + ' 期';
        grid.appendChild(h);
        g.movies.forEach(function (m) {
          var div = document.createElement('div');
          div.innerHTML = cardHtml(m);
          grid.appendChild(div.firstChild);
        });
      });
    }

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
