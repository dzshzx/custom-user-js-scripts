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

- 长期归档优先使用 userscript manager 存储，运行环境不支持时回退到页面 `localStorage`。
- Gist 同步设置和 token 需要 GM storage；仅有 `localStorage` 回退时仍可保留本地归档，但不能启用 Gist 同步。
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
