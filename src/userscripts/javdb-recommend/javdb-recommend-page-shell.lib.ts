// 归档页静态外壳：Lucide 图标、页面样式表与页面骨架 HTML；由 javdb-recommend-view.lib.ts 的 bootArchivePage 挂载。
/* ================= 官网资源约定 ================= */
/* 图标 vendored from Lucide (https://lucide.dev), ISC License；本脚本的卡片流
     仍用字符串模板，不走 shared-icons 的 preact 组件。 */
var ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
};

function iconSvg(name: keyof typeof ICON_PATHS, size: number) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="' +
    size +
    '" height="' +
    size +
    '" ' +
    'class="jdb-ra-icon" aria-hidden="true" focusable="false">' +
    ICON_PATHS[name] +
    '</svg>'
  );
}

/* ---------- 样式（全部限定在 .jdb-ra 下） ----------
     始终生效：页面结构、工具栏、期区块、栅格列数、封面不裁切；
     html.jdb-ra-native（官网样式表已加载）：只需补吸顶偏移等少量适配，外观交给官网 CSS；
     html:not(.jdb-ra-native)（官网样式缺失）：控件与卡片的浅色可读兜底。 */
export const ARCHIVE_CSS = [
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
  'html:not(.jdb-ra-native) .jdb-ra .meta{color:#7a7a7a;font-size:12px;padding:2px 8px 0}',
].join('\n');

export function archivePageMarkup() {
  return (
    '<section data-jdb-ra-page="1"><div class="jdb-ra">' +
    '<header class="jdb-ra-hd"><h1>佳片推荐 · 历史期数</h1><span class="sub">每周一/四更新 · 滚动加载更多期数</span>' +
    '<a class="home" href="/">' +
    iconSvg('arrow-left', 14) +
    ' 返回首页</a></header>' +
    '<div class="jdb-ra-bar">' +
    '<div class="jdb-ra-bar-row jdb-ra-bar-nav">' +
    '<div class="select is-small"><select id="jdb-ra-select" aria-label="选择期数"></select></div>' +
    '<button type="button" class="button is-small" id="jdb-ra-prev">' +
    iconSvg('chevron-left', 14) +
    ' 上一期</button>' +
    '<button type="button" class="button is-small" id="jdb-ra-next">下一期 ' +
    iconSvg('chevron-right', 14) +
    '</button>' +
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
    '</div></section>'
  );
}
