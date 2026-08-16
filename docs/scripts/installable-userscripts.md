# Installable Userscripts

本页列出当前可直接安装到 Tampermonkey、Violentmonkey、Greasemonkey 等管理器的 userscript。

脚本源码按脚本级目录放在 `src/userscripts/<script-id>/`。多模块脚本的安装入口是构建生成并提交的 `dist/<script-id>.user.js` 单文件；单文件脚本仍直接从 `src` 安装。历次迁移均保留 `@name`、`@namespace`、存储 key 和用户数据。

## Web Page Assistant

安装入口：

- [../../dist/web-page-assistant.user.js](../../dist/web-page-assistant.user.js)

用途：

- 在网页上提供可配置的页面辅助能力。
- 包含设置、刷新、session、unlocker 能力和浮动控件。
- 当前脚本运行范围较广，安装前应确认目标用户脚本管理器的授权提示。
- 源码是 `web-page-assistant.entry.js` 加同目录 `*.lib.js` ES 模块，`npm run build` 打包为 dist 单文件。

迁移说明：

- 更早：`src/web-page-assistant.user.js` → `src/userscripts/web-page-assistant/web-page-assistant.user.js`。
- 当前：多文件 `@require` 入口 → `dist/web-page-assistant.user.js` 单文件；旧 src 路径保留构建生成的桥接文件（按 [../script-template.md](../script-template.md) 的桥接约定），存量安装经一次版本更新自动切换到 dist。

## Codex Quota Compass

安装入口：

- [../../dist/codex-quota-compass.user.js](../../dist/codex-quota-compass.user.js)

用途：

- 在 `https://chatgpt.com/*` 页面运行，通过悬浮按钮或菜单命令计算当前 Codex 用量。
- 每次成功运行后保存一条本地 `Quota Snapshot`。
- 面板里显示 `Snapshot Archive` 概况和最近快照。
- 展示近 30 天按模型汇总和当前可用的重置券明细。
- 通过 `Cost Ledger` 展示日 / 周（滚动 7 天）/ 月 / 全量已结算消耗，并支持区间下钻。
- 支持从面板导出整个归档。
- 支持从 userscript 菜单导出 / 导入版本化 JSON 归档，用于手动同步。
- 支持通过用户自己的 GitHub secret gist 自动合并和同步归档。

说明：

- 长期归档优先使用 userscript manager 存储，同时镜像到页面 `localStorage`；读取时会合并两端，GM storage 不可用时则使用该镜像。
- Gist 同步设置和 token 只保存在 GM storage，不会镜像到页面存储；仅有 `localStorage` 时仍可保留本地归档，但不能启用 Gist 同步。
- 导入是 `merge` 语义，不会覆盖本地已有归档。
- 当前只支持完整 JSON 归档导出 / 导入，不支持 CSV 和按范围导出。

迁移说明：

- 更早：`src/codex-quota-compass.user.js` → `src/userscripts/codex-quota-compass/codex-quota-compass.user.js`。
- 当前：多文件 `@require` 入口 → `dist/codex-quota-compass.user.js` 单文件；旧 src 路径保留构建生成的桥接文件，存量安装经一次版本更新自动切换到 dist。

## Feishu Preview Image Export

安装入口：

- [../../src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js](../../src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js)

用途：

- 运行在 `https://mi.feishu.cn/file/*`。
- 从当前页面里找最大的可见图片。
- 优先用 `GM_download` 下载。
- 下载文件名默认取当前飞书文档标题。

迁移说明：

- 旧路径：`src/feishu-preview-image-export.user.js`
- 新路径：`src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js`
- 当前脚本没有 `@downloadURL` / `@updateURL`；如已手动安装，直接用新路径重新安装即可。

## JavDB Recommend Archive

安装入口：

- [../../src/userscripts/javdb-recommend/javdb-recommend.user.js](../../src/userscripts/javdb-recommend/javdb-recommend.user.js)

用途：

- 运行在 `https://javdb.com/*`（及 `javdb575.com`、`javdb.today` 等镜像域名）。
- 在顶部导航栏加入「佳片推荐」入口，点击打开独立归档页 `/recommend-archive`（官网对未知路径返回 404 HTML 页，脚本把它渲染成归档页）。
- 归档页复用官网首页的样式表与导航（样式表 URL 带部署指纹，运行时复制，不硬编码），视觉与官网一致；复制失败时退化为脚本内置的浅色样式，功能不受影响。
- 瀑布流浏览：从上次浏览的期数开始按期流式渲染，滚动到底自动加载更早的期数；下拉选择、上一期 / 下一期、按期号跳转会滚动到对应期（未加载时自动顺流补齐），并记住浏览位置。
- 影片卡片（横版封面完整显示不裁切、番号、评分）即直链，点击直达官网影片详情页 `/v/<id>`。
- 封面统一改写为官网页面使用的 `c0.jdbstatic.com` 图床；接口默认返回的 App 图床 `tp.spfcas.com` 在网页端常被拦截，导致封面不显示。
- 已加载内容即时过滤 + 全期关键词搜索（逐期扫描、可随时停止）。
- 数据走官网自身的 `/api/v1/movies/recommend_periods` 与 `/api/v1/movies/recommend` 接口（同域请求）。

说明：

- `@grant none`，不使用脚本管理器特权 API；上次浏览期数保存在页面 `localStorage`（key 不变）。
- 无需登录即可使用；脚本内置与官网一致的 `jdsignature` 签名算法。
- 已配置 `@downloadURL` / `@updateURL`（指向本文件的 raw 地址），推送新版本后脚本管理器会按 `@version` 自动更新。

迁移说明：

- 旧版为右下角「🎬」悬浮面板；现改为导航栏入口 + 独立归档页，卡片点击由官网搜索改为直达详情页。存储 key 与安装路径保持不变。
- 版本号从 `1.0.0` 重置为 `0.0.2`：脚本管理器只向更高版本自动更新，已安装 `1.0.0` 的副本需用安装入口手动重装一次，之后恢复正常自动更新。
