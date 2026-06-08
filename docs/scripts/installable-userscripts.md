# Installable Userscripts

本页列出当前可直接安装到 Tampermonkey、Violentmonkey、Greasemonkey 等管理器的 userscript。

后续仓库治理会把 installable userscript 迁移到脚本级目录。迁移时会同步更新 `@downloadURL`、`@updateURL`、README/docs 链接和测试路径，并保留 `@name`、`@namespace`、存储 key 和用户数据。

## Web Page Assistant

安装入口：

- [../../src/web-page-assistant.user.js](../../src/web-page-assistant.user.js)

用途：

- 在网页上提供可配置的页面辅助能力。
- 包含设置、刷新、session、unlocker 能力和浮动控件。
- 当前脚本运行范围较广，安装前应确认目标用户脚本管理器的授权提示。

## Codex Quota Compass

安装入口：

- [../../src/codex-quota-compass.user.js](../../src/codex-quota-compass.user.js)

用途：

- 在 `https://chatgpt.com/*` 页面运行，通过悬浮按钮或菜单命令计算当前 Codex 用量。
- 每次成功运行后保存一条本地 `Quota Snapshot`。
- 面板里显示 `Snapshot Archive` 概况和最近快照。
- 支持从面板导出整个归档。
- 支持从 userscript 菜单导出 / 导入版本化 JSON 归档，用于手动同步。

说明：

- 长期归档优先使用 userscript manager 存储，运行环境不支持时回退到页面 `localStorage`。
- 导入是 `merge` 语义，不会覆盖本地已有归档。
- 当前只支持完整 JSON 归档导出 / 导入，不支持 CSV 和按范围导出。

## Feishu Preview Image Export

安装入口：

- [../../src/feishu-preview-image-export.user.js](../../src/feishu-preview-image-export.user.js)

用途：

- 运行在 `https://mi.feishu.cn/file/*`。
- 从当前页面里找最大的可见图片。
- 优先用 `GM_download` 下载。
- 下载文件名默认取当前飞书文档标题。
