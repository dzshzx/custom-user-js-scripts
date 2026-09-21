import { createPeriodSection } from './javdb-recommend-period-section.lib.js';

var BASE = location.origin;
  /* ================= 官网资源约定 ================= */
  var ROUTE = '/recommend-archive';
  /* 图标 vendored from Lucide (https://lucide.dev), ISC License —— 与
     src/userscripts/shared/shared-icons.lib.js 同源；由构建打包到安装文件。 */
  var ICON_PATHS = {
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'
  };

  function iconSvg(name, size) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="' + size + '" height="' + size + '" ' +
      'class="jdb-ra-icon" aria-hidden="true" focusable="false">' + ICON_PATHS[name] + '</svg>';
  }

  var periods = [], searching = false;
  var LS_KEY = 'javdb_recommend_last_period';
  export function bootArchivePage(data) {
    document.title = '佳片推荐 · 历史期数 - JavDB';
    // 只清理可识别的官网 404 内容与本脚本旧根；保留其他脚本先挂载的节点和 body 状态。
    document.body.classList.remove('rails-default-error-page');
    document.querySelectorAll('body > .rails-default-error-page, body > .dialog, body > .jdb-ra').forEach(function (node) {
      node.remove();
    });

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
      '.jdb-ra .movie-list .item:not([data-laosiji-grid-card="1"])>.box{display:flex!important;flex-direction:column!important;height:100%!important}',
      '.jdb-ra .movie-list .item .cover{flex:0 0 auto;background:#fff}',
      '.jdb-ra .movie-list .item .cover.contain img:not(.jav-card-image){object-fit:contain!important}',
      '.jdb-ra .movie-list .item .meta{margin-top:auto}',
      '.jdb-ra [data-jdb-ra-filtered="true"]{display:none!important}',
      '.jdb-ra .jdb-ra-empty{color:#7a7a7a;font-size:13px;padding:12px 0}',
      '.jdb-ra .jdb-ra-sentinel{display:block;margin:14px auto;padding:7px 18px;font-size:13px;color:#4a4a4a;background:#fff;border:1px solid #dbdbdb;border-radius:4px;cursor:pointer}',
      '.jdb-ra .jdb-ra-sentinel[disabled]{cursor:default;color:#7a7a7a}',
      // 内联 Lucide 图标与文字对齐
      '.jdb-ra .jdb-ra-icon{display:inline-block;vertical-align:-2px;flex:none}',
      '.jdb-ra .jdb-ra-score{display:inline-flex;align-items:center;gap:3px}',
      // 搜索范围分段控件（已加载 / 全部期数）
      '.jdb-ra .jdb-ra-scope{display:inline-flex;align-items:center;gap:0;border:1px solid #dbdbdb;border-radius:4px;overflow:hidden;background:#fff}',
      '.jdb-ra .jdb-ra-scope label{display:inline-flex;align-items:center;padding:5px 10px;font-size:13px;color:#4a4a4a;cursor:pointer}',
      '.jdb-ra .jdb-ra-scope label:has(input:checked){background:#3273dc;color:#fff}',
      '.jdb-ra .jdb-ra-scope input{position:absolute;opacity:0;pointer-events:none}',
      // 期区块骨架屏：与官网卡片同宽高比（padding-top:67%），数据到达后整列替换
      '.jdb-ra .jdb-ra-skel{min-width:0}',
      '.jdb-ra .jdb-ra-skel-cover{position:relative;padding-top:67%;background:#e8e8e8;border-radius:6px 6px 0 0}',
      '.jdb-ra .jdb-ra-skel-line{height:12px;margin:8px 8px 0;background:#eee;border-radius:4px}',
      '.jdb-ra .jdb-ra-skel-line.short{width:60%}',
      // 封面加载失败占位（替换原来的隐藏空洞）
      '.jdb-ra .cover{position:relative}',
      '.jdb-ra .jdb-ra-cover-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#eee;color:#a0a0a0;border-radius:6px 6px 0 0}',
      // 窄视口：吸顶栏固定两行（期数导航行 / 搜索与动作行）
      '.jdb-ra .jdb-ra-bar-row{display:contents}',
      '@media (max-width:768px){.jdb-ra .jdb-ra-bar{flex-direction:column;align-items:stretch;flex-wrap:nowrap;gap:6px}',
      '.jdb-ra .jdb-ra-bar-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;width:100%}',
      '.jdb-ra .jdb-ra-bar-row .select{flex:1 1 160px}',
      '.jdb-ra .jdb-ra-bar-row .jdb-ra-search{flex:1 1 140px}',
      '.jdb-ra .jdb-ra-sec{scroll-margin-top:150px}}',
      '@media (max-width:768px){html:not(.jdb-ra-native) .jdb-ra .jdb-ra-sec{scroll-margin-top:96px}}',
      // 深色主题跟随官网（data-theme 由官网首页复制而来）
      'html[data-theme=dark] .jdb-ra{color:#eee}',
      'html[data-theme=dark] .jdb-ra .jdb-ra-hd h1,html[data-theme=dark] .jdb-ra .jdb-ra-ph{color:#eee}',
      'html[data-theme=dark] .jdb-ra .jdb-ra-bar{background:#17181c}',
      'html[data-theme=dark] .jdb-ra .movie-list .item .cover{background:#222}',
      'html[data-theme=dark] .jdb-ra .jdb-ra-scope{background:#232428;border-color:#3a3b40}',
      'html[data-theme=dark] .jdb-ra .jdb-ra-scope label{color:#ccc}',
      'html[data-theme=dark] .jdb-ra .jdb-ra-skel-cover{background:#26272b}',
      'html[data-theme=dark] .jdb-ra .jdb-ra-skel-line{background:#2e2f34}',
      'html[data-theme=dark] .jdb-ra .jdb-ra-cover-ph{background:#26272b;color:#555}',
      // 官网样式缺失时的兜底
      'html:not(.jdb-ra-native) .jdb-ra select,html:not(.jdb-ra-native) .jdb-ra input,html:not(.jdb-ra-native) .jdb-ra button{background:#fff;color:#4a4a4a;border:1px solid #dbdbdb;border-radius:4px;padding:6px 10px;font-size:13px;outline:none}',
      'html:not(.jdb-ra-native) .jdb-ra button{cursor:pointer}',
      'html:not(.jdb-ra-native) .jdb-ra .box,html:not(.jdb-ra-native) .jdb-ra .jdb-ra-skel{display:block;background:#fff;border-radius:6px;box-shadow:0 .5em 1em -.125em rgba(10,10,10,.1),0 0 0 1px rgba(10,10,10,.02);padding-bottom:.6rem;color:#4a4a4a;text-decoration:none}',
      'html:not(.jdb-ra-native) .jdb-ra .cover{position:relative;padding-top:67%;background:#fff;overflow:hidden;border-radius:6px 6px 0 0}',
      'html:not(.jdb-ra-native) .jdb-ra .cover img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain}',
      'html:not(.jdb-ra-native) .jdb-ra .video-title{color:#3273dc;font-size:13px;padding:6px 8px 0}',
      'html:not(.jdb-ra-native) .jdb-ra .meta{color:#7a7a7a;font-size:12px;padding:2px 8px 0}'
    ].join('\n');

    var styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    var rootHost = document.createElement('div');
    rootHost.innerHTML =
      '<main class="jdb-ra">' +
      '<header class="jdb-ra-hd"><h1>佳片推荐 · 历史期数</h1><span class="sub">每周一/四更新 · 滚动加载更多期数</span>' +
      '<a class="home" href="/">' + iconSvg('arrow-left', 14) + ' 返回首页</a></header>' +
      '<div class="jdb-ra-bar">' +
      '<div class="jdb-ra-bar-row jdb-ra-bar-nav">' +
      '<div class="select is-small"><select id="jdb-ra-select" aria-label="选择期数"></select></div>' +
      '<button type="button" class="button is-small" id="jdb-ra-prev">' + iconSvg('chevron-left', 14) + ' 上一期</button>' +
      '<button type="button" class="button is-small" id="jdb-ra-next">下一期 ' + iconSvg('chevron-right', 14) + '</button>' +
      '<input class="input is-small jdb-ra-jump" id="jdb-ra-jump" type="number" min="1" placeholder="期号" aria-label="输入期号后回车跳转">' +
      '</div>' +
      '<div class="jdb-ra-bar-row jdb-ra-bar-tools">' +
      '<div class="jdb-ra-scope" role="radiogroup" aria-label="搜索范围">' +
      '<label><input type="radio" name="jdb-ra-scope" value="loaded" checked> 已加载</label>' +
      '<label><input type="radio" name="jdb-ra-scope" value="all"> 全部期数</label>' +
      '</div>' +
      '<input class="input is-small jdb-ra-search" id="jdb-ra-search" type="search" placeholder="搜索已加载内容" aria-label="搜索关键词">' +
      '<button type="button" class="button is-small" id="jdb-ra-gsearch" title="在所有期数中搜索">全期搜索</button>' +
      '<button type="button" class="button is-small" id="jdb-ra-refresh" title="重新检查期数目录">刷新期数</button>' +
      '<button type="button" class="button is-small" id="jdb-ra-clear" title="清除本脚本的本地缓存">清缓存</button>' +
      '</div>' +
      '</div>' +
      '<div class="jdb-ra-status" id="jdb-ra-status" role="status">加载期数列表中…</div>' +
      '<div class="jdb-ra-results" id="jdb-ra-results" hidden></div>' +
      '<div class="jdb-ra-stream" id="jdb-ra-stream"></div>' +
      '<button type="button" class="jdb-ra-sentinel" id="jdb-ra-sentinel" disabled>加载期数列表中…</button>' +
      '</main>';
    document.body.appendChild(rootHost.firstElementChild);

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
    var copiedGridStyles = new WeakMap();
    var archiveMutationObserver = null;

    function enhancedGrid(list) {
      return list.matches('.javdb-card-grid,[data-laosiji-grid="1"]');
    }

    function setCopiedStyle(el, name, value) {
      var owned = copiedGridStyles.get(el);
      if (!owned) {
        owned = {};
        copiedGridStyles.set(el, owned);
      }
      if (!owned[name]) {
        owned[name] = {
          previousValue: el.style.getPropertyValue(name),
          previousPriority: el.style.getPropertyPriority(name)
        };
      }
      if (el.style.getPropertyValue(name) === value && el.style.getPropertyPriority(name) === 'important') {
        owned[name].writtenValue = value;
        owned[name].writtenPriority = 'important';
        return;
      }
      el.style.setProperty(name, value, 'important');
      owned[name].writtenValue = value;
      owned[name].writtenPriority = 'important';
    }

    function releaseCopiedStyles(el) {
      var owned = copiedGridStyles.get(el);
      if (!owned) return;
      Object.keys(owned).forEach(function (name) {
        var record = owned[name];
        if (el.style.getPropertyValue(name) !== record.writtenValue ||
            el.style.getPropertyPriority(name) !== record.writtenPriority) return;
        if (record.previousValue) el.style.setProperty(name, record.previousValue, record.previousPriority);
        else el.style.removeProperty(name);
      });
      copiedGridStyles.delete(el);
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
            rowGap: computed.rowGap || '1rem',
            columns: String(columns)
          };
          var image = source.querySelector('.jav-card-image,.cover img');
          var cover = image && image.closest('.jav-card-cover,.cover');
          if (image) {
            var imageStyle = window.getComputedStyle(image);
            lastCompatibleGridLayout.objectFit = imageStyle.objectFit;
            lastCompatibleGridLayout.objectPosition = imageStyle.objectPosition;
          }
          if (cover) lastCompatibleGridLayout.aspectRatio = window.getComputedStyle(cover).aspectRatio;
        }
      } else if (observedGridSource && !observedGridSource.isConnected) {
        if (gridResizeObserver) gridResizeObserver.disconnect();
        observedGridSource = null;
      }
      if (!lastCompatibleGridLayout) return;
      document.querySelectorAll('.jdb-ra .movie-list').forEach(function (list) {
        if (enhancedGrid(list)) {
          releaseCopiedStyles(list);
          return;
        }
        setCopiedStyle(list, 'grid-template-columns', lastCompatibleGridLayout.template);
        setCopiedStyle(list, '--jav-card-columns', lastCompatibleGridLayout.columns);
        setCopiedStyle(list, 'column-gap', lastCompatibleGridLayout.columnGap);
        setCopiedStyle(list, 'row-gap', lastCompatibleGridLayout.rowGap);
        list.querySelectorAll('.item:not([data-laosiji-grid-card="1"]) .cover img').forEach(function (image) {
          if (lastCompatibleGridLayout.objectFit) setCopiedStyle(image, 'object-fit', lastCompatibleGridLayout.objectFit);
          if (lastCompatibleGridLayout.objectPosition) setCopiedStyle(image, 'object-position', lastCompatibleGridLayout.objectPosition);
          var cover = image.closest('.cover');
          if (cover && lastCompatibleGridLayout.aspectRatio && lastCompatibleGridLayout.aspectRatio !== 'auto') {
            setCopiedStyle(cover, 'aspect-ratio', lastCompatibleGridLayout.aspectRatio);
          }
        });
      });
    }

    function scheduleArchiveGridSync() {
      if (gridSyncScheduled) return;
      gridSyncScheduled = true;
      Promise.resolve().then(syncArchiveGridLayout);
    }

    if (typeof window.MutationObserver === 'function') {
      archiveMutationObserver = new window.MutationObserver(scheduleArchiveGridSync);
      archiveMutationObserver.observe(document.querySelector('.jdb-ra'), {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-laosiji-grid']
      });
    }
    window.addEventListener('resize', scheduleArchiveGridSync, { passive: true });

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
    function loadPeriods() {
      setStatus('加载期数列表中…');
      data.loadCatalog({ onProgress: count => setStatus('加载期数列表… 已获取 ' + count + ' 期') })
        .then(result => finish(result.periods, result.degraded ? '期数目录更新失败，使用本地缓存' : '期数目录：' + result.source))
        .catch(error => setStatus('期数列表加载失败：' + error.message + '（可点击“刷新期数”重试）'));
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
        var date = /^(\d{4}-\d{2}-\d{2})/.exec(String(p.created_at || ''));
        var count = Number(p.movies_count);
        o.textContent = '第 ' + p.period + ' 期 · ' + (date ? date[1] : '—') + ' · ' +
          (Number.isInteger(count) && count >= 0 ? count : '—') + ' 部';
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

    function currentQuery() { return $('jdb-ra-search').value.trim().toLowerCase(); }

    // 已加载内容的即时过滤：隐藏不匹配的卡片与空区块
    function applyFilter(q) {
      var hits = 0;
      Object.keys(loadedSections).forEach(function (period) {
        hits += loadedSections[period].filter(q);
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
      var section = createPeriodSection({ document: document, baseUrl: BASE, period: p, mode: 'browse', loading: true });
      loadedSections[p.period] = section;
      streamEl.appendChild(section.element);
      setSentinel('加载第 ' + p.period + ' 期…', true);
      var lease = data.acquirePeriod(p.period, { purpose: 'navigation' });
      streamLease = lease;
      return lease.promise.then(function (result) {
        var movies = result.movies;
        if (generation !== streamGeneration) return false;
        if (result.degraded) setStatus('详情更新失败，使用本地缓存');
        section.update({ movies: movies, degraded: result.degraded });
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
        section.dispose();
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
      Object.keys(loadedSections).forEach(function (period) { loadedSections[period].dispose(); });
      loadedSections = {};
      streamNext = index;
      streamBusy = false;
      return appendNext(generation);
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
          setStatus(readyText() + (loadedSections[period].element.dataset.degraded === 'true' ? ' · 详情更新失败，使用本地缓存' : ''));
          scrollToPeriod(period);
        }
      });
    }

    function scrollToPeriod(period) {
      var section = loadedSections[period];
      if (section) section.element.scrollIntoView();
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
    // 搜索范围分段控件：已加载 = 输入即过滤当前流；全部期数 = 回车/按钮触发全期搜索
    function searchScope() {
      var radios = document.querySelectorAll('input[name="jdb-ra-scope"]');
      for (var i = 0; i < radios.length; i += 1) {
        if (radios[i].checked) return radios[i].value === 'all' ? 'all' : 'loaded';
      }
      return 'loaded';
    }

    function enterResultsMode() {
      resultsEl.hidden = false;
      streamEl.style.display = 'none';
      sentinel.style.display = 'none';
    }

    var resultSections = [];

    function exitResultsMode() {
      resultsEl.hidden = true;
      resultSections.forEach(function (section) { section.dispose(); });
      resultSections = [];
      resultsEl.replaceChildren();
      streamEl.style.display = '';
      sentinel.style.display = '';
    }

    var debounceTimer = null;
    $('jdb-ra-search').addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        if (searching) return; // 全期搜索进行中不打断
        if (searchScope() === 'all') {
          // 全期模式不做即时过滤，等待显式触发
          if (currentQuery()) setStatus('回车或点击「全期搜索」，在全部期数中搜索');
          return;
        }
        exitResultsMode();
        var q = currentQuery();
        var hits = applyFilter(q);
        setStatus(q ? '已加载内容中命中 ' + hits + ' 部' : (periods.length ? readyText() : '加载期数列表中…'));
      }, 300);
    });

    $('jdb-ra-search').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || searchScope() !== 'all') return;
      startFullSearch();
    });

    document.querySelectorAll('input[name="jdb-ra-scope"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (searchScope() === 'loaded') {
          if (searching) stopSearch('已停止全期搜索');
          exitResultsMode();
          var q = currentQuery();
          var hits = applyFilter(q);
          setStatus(q ? '已加载内容中命中 ' + hits + ' 部' : (periods.length ? readyText() : '加载期数列表中…'));
          return;
        }
        // 切到「全部期数」：撤销即时过滤，等待显式触发全期搜索
        applyFilter('');
        setStatus(currentQuery() ? '回车或点击「全期搜索」，在全部期数中搜索' : '输入关键词后回车，在全部期数中搜索');
      });
    });

    var searchGeneration = 0;
    var activeSearch = null;

    function stopSearch(label) {
      searching = false;
      searchGeneration += 1;
      if (activeSearch) activeSearch.cancel();
      activeSearch = null;
      $('jdb-ra-gsearch').textContent = '全期搜索';
      if (label) setStatus(label);
    }

    function appendSearchGroup(period, periodIndex, movies) {
      if (!movies.length) return;
      var section = createPeriodSection({
        document: document,
        baseUrl: BASE,
        period: { period: period },
        mode: 'search',
        loading: false
      });
      section.element.dataset.periodIndex = String(periodIndex);
      section.update({ movies: movies });
      var before = Array.prototype.find.call(resultsEl.querySelectorAll('.jdb-ra-sec'), function (item) {
        return parseInt(item.dataset.periodIndex, 10) > periodIndex;
      });
      resultsEl.insertBefore(section.element, before || null);
      resultSections.push(section);
      scheduleArchiveGridSync();
    }

    function startFullSearch() {
      var q = currentQuery();
      if (!q) { setStatus('请先输入关键词'); return; }
      if (searching) { stopSearch('已停止搜索'); return; }
      searching = true;
      var generation = ++searchGeneration;
      var btnEl = $('jdb-ra-gsearch');
      btnEl.textContent = '停止';
      enterResultsMode();
      resultSections.forEach(function (section) { section.dispose(); });
      resultSections = [];
      resultsEl.replaceChildren();
      activeSearch = data.search({ query: q, onUpdate: update => {
        if (generation !== searchGeneration) return;
        if (update.group) appendSearchGroup(update.group.period, update.group.index, update.group.movies);
        setStatus('索引补全 ' + update.completed + '/' + update.total + ' 期 · 命中 ' + update.hits + ' 部');
      } });
      activeSearch.done.then(result => {
        if (generation !== searchGeneration) return;
        searching = false;
        btnEl.textContent = '全期搜索';
        setStatus((result.status === 'partial' ? '搜索部分完成 · 失败 ' + result.failed + ' 期 · ' :
          result.status === 'cancelled' ? '搜索已停止 · ' : '搜索完成 · ') +
          '命中 ' + result.hits + ' 部（' + result.hitPeriods + ' 期）' +
          (result.degraded ? ' · 使用旧缓存 ' + result.degraded + ' 期' : ''));
        if (!result.hits) {
          var empty = document.createElement('div');
          empty.className = 'jdb-ra-empty';
          empty.textContent = result.status === 'complete' ? '没有找到影片' : '部分期数未完成，当前没有匹配结果';
          resultsEl.replaceChildren(empty);
        }
      });
    }

    $('jdb-ra-gsearch').addEventListener('click', function () {
      // 停止不受范围限制；启动只在「全部期数」段，避免与即时过滤混淆
      if (!searching && searchScope() !== 'all') {
        setStatus('搜索全部期数：先把搜索框左侧范围切换到「全部期数」');
        return;
      }
      startFullSearch();
    });

    $('jdb-ra-refresh').addEventListener('click', function () {
      data.invalidateCatalog();
      location.reload();
    });
    $('jdb-ra-clear').addEventListener('click', function () {
      stopSearch();
      data.clearCaches();
      location.reload();
    });

    loadSiteChrome();
    loadPeriods();
  }
