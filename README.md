# Custom User JS Scripts

这个仓库存放可直接安装到 Tampermonkey、Violentmonkey、Greasemonkey 等脚本管理器的浏览器 userscript，也包含少量本地辅助工具。

## 可安装脚本

| 脚本 | 适用页面 | 用途 | 安装入口 |
| --- | --- | --- | --- |
| Web Page Assistant / 网页助手 | `*://*/*` | 管理网页自动刷新，并可按需解除复制、选择、右键菜单、拖拽和离开确认限制。 | [dist/web-page-assistant.user.js](dist/web-page-assistant.user.js) |
| Codex Quota Compass | `https://chatgpt.com/*` | 查看 Codex 用量、保存本地快照、远程同步、导出 / 导入用量归档。 | [dist/codex-quota-compass.user.js](dist/codex-quota-compass.user.js) |
| JavDB Recommend Archive / JavDB 佳片推荐 · 历史期数 | `https://javdb.com/*` 等 | 在 JavDB 导航栏加入「佳片推荐」入口，打开独立页面浏览全部历史期数（每周一/四更新），支持翻期、搜索与全期关键词搜索。 | [javdb-recommend.user.js](src/userscripts/javdb-recommend/javdb-recommend.user.js) |
| Feishu Preview Image Export | `https://mi.feishu.cn/file/*` | 从飞书文件预览页导出当前最大可见图片。 | [feishu-preview-image-export.user.js](src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js) |

安装方式：

1. 安装一个 userscript 管理器，例如 Tampermonkey、Violentmonkey 或 Greasemonkey。
2. 打开上表里的 `.user.js` 文件。
3. 在 GitHub 文件页点 `Raw`，或把脚本内容复制到脚本管理器的新建脚本里。
4. 安装前检查脚本管理器提示的 `@match` 和 `@grant` 是否符合预期。

更完整的安装列表和迁移说明见 [docs/scripts/installable-userscripts.md](docs/scripts/installable-userscripts.md)。

## Web Page Assistant / 网页助手

网页助手是一个通用网页辅助脚本，安装后会在页面右下角显示一个浮动控件。它的配置支持“当前页面”和“整个站点”两个范围。

主要能力：

- 自动刷新：为当前页面或整个站点设置刷新间隔，支持预设时间和自定义时间。
- 刷新控制：浮动控件显示倒计时，可暂停、继续或删除当前刷新规则。
- 网页限制解除：可按需允许文本选择、复制 / 剪切、右键菜单、拖拽，并可抑制离开页面确认。
- 持久设置：优先使用 userscript manager storage；运行环境不支持时回退到页面 `localStorage`。

使用注意：

- 脚本运行范围是 `*://*/*`，安装时会看到较宽的授权提示；不需要时可以在脚本管理器里禁用。
- “限制解除”只影响浏览器页面事件，不绕过登录、权限、付费墙或服务端限制。
- 安装入口是 `dist/` 下打包好的单文件；`src/` 目录下的 `*.entry.js` 与 `*.lib.js` 是 ES 模块源码，不能直接安装。

## Codex Quota Compass

Codex Quota Compass 运行在 `chatgpt.com`，通过悬浮按钮或 userscript 菜单命令读取当前 Codex 用量并保存历史。

它会把每次成功运行的结果保存为一条 `Quota Snapshot`，并维护本地 `Snapshot Archive`。面板还会展示按模型汇总、可用重置券，以及由 `Cost Ledger` 派生的日 / 周 / 月 / 全量已结算消耗视图。脚本管理器的 WebDAV 同步只能保证脚本代码和管理器设置同步，不作为 Codex 用量历史的可靠跨设备通道。

跨设备自动同步走 GitHub Gist：用户配置自己的 GitHub token 后，脚本会在用户自己的 GitHub 账号里查找或创建一个 secret gist，并把 `Snapshot Archive` 保存为 JSON 文件。不同设备使用同一个 GitHub 账号和 token 后，会按 `Snapshot ID` 合并归档。你也可以从面板导出完整归档，或通过 userscript 菜单导出 / 导入 JSON，作为手动备份或迁移路径。

注意事项：

- 归档里保存的是经过整理的用量信息，不保存 Cookie、Token 或原始私有接口响应。
- 导入是 merge 语义，会跳过重复快照，不会覆盖整个本地归档。
- GitHub token 保存在脚本管理器存储中，不写入仓库；建议使用 fine-grained token，并只授予 Gists read/write 权限。
- Gist 使用 `public: false` 创建，是 unlisted secret gist，不应保存 Cookie、Token 或其他真正敏感信息。
- 本地归档优先保存在 GM storage，同时在当前页面的 `localStorage` 保留一份非敏感镜像；读取时会合并两端，GM storage 不可用时则直接使用该镜像。Gist 同步设置和 token 只保存在 GM storage 中，不会写入页面存储；仅有 `localStorage` 时不能启用 Gist 同步。

Gist 同步设置说明见 [docs/scripts/codex-quota-gist-sync.md](docs/scripts/codex-quota-gist-sync.md)。

领域词汇见 [CONTEXT.md](CONTEXT.md)。

## Feishu Preview Image Export

Feishu Preview Image Export 运行在飞书文件预览页，用 userscript 菜单命令从当前页面找最大的可见图片并下载。它适合处理飞书文件页里“预览图可见但原图入口不好找”的场景。

本仓库还提供两个本地浏览器工具：

- `scripts/browser-tools/login-qr.mjs`：默认适配小米飞书，也可配置其他网站；导出登录二维码并保存浏览器登录态。
- `scripts/browser-tools/export-image.mjs`：使用已有登录态打开飞书文件页并导出当前最大可见图片。

使用说明见 [docs/scripts/feishu-tools.md](docs/scripts/feishu-tools.md)。

## JavDB Recommend Archive / JavDB 佳片推荐 · 历史期数

JavDB Recommend Archive 运行在 JavDB 官网（javdb.com 及 javdb575.com、javdb.today 等镜像域名），在顶部导航栏加入「佳片推荐」入口，点击打开独立页面 `/recommend-archive` 浏览「佳片推荐」栏目的全部历史期数。归档页复用官网首页的样式表与导航（运行时复制，视觉与官网一致）：

- 瀑布流浏览：从上次浏览的期数开始按期流式渲染，滚动到底自动加载更早的期数；相邻未加载期会沿当前流追加，远距离或反向跳转则直接以目标期重建流，不再请求中间期，并记住浏览位置。
- 影片列表：横版封面完整显示（不裁切），卡片展示番号、评分与发售日期，点击直达官网影片详情页。
- 多脚本适配：若其他 JavDB 增强脚本接管首个影片列表并设置卡片列数，后续动态加载的历史期数会同步其实际列数与间距，避免同页出现 5 列、6 列混排。
- 本地缓存：期数目录缓存 6 小时，过期后从最新页读取到首个已知期即停止并复用历史尾部，每 30 天做一次完整校验；最新一期详情缓存 2 小时，历史详情缓存 30 天，并最多保留最近使用的 48 期。全期搜索使用独立的紧凑索引，不挤占浏览缓存，首次补全后同一目录可纯本地搜索。
- 性能与韧性：搜索结果按期增量追加，屏外期区块延迟渲染，内存详情限制为 24 期；详情请求按期单飞并按消费者取消，超时或可重试错误最多尝试 3 次。工具栏可手动刷新期数或清除本脚本缓存。
- 搜索：已加载内容即时过滤，以及全期关键词搜索（逐期扫描、可随时停止）。
- 数据来自官网自身的 `/api/v1/movies/recommend_periods` 与 `/api/v1/movies/recommend` 接口（同域请求，无需额外授权）；封面统一改写为官网页面使用的 `c0.jdbstatic.com` 图床（接口默认返回 App 图床，网页端常被拦截）。

脚本无需登录即可使用；`@grant none`，不使用任何脚本管理器特权 API，以页面 `localStorage` 保存上次浏览期数及上述非敏感缓存。已配置 `@downloadURL` / `@updateURL`，推送新版本后脚本管理器会自动检查更新。

## 仓库结构

```text
.
├── dist/                 # 打包产物：多模块脚本的单文件安装入口（构建生成并提交）
├── docs/                 # 脚本说明、运行手册和项目约定
├── scripts/              # 本地辅助脚本与构建脚本
├── snippets/             # 可复用代码片段
├── src/userscripts/      # userscript 源码（ESM entry + lib 模块，或单文件脚本）
└── test/                 # Node 测试
```

## 开发与验证

需要 Node.js 22 或更高版本。

```bash
npm ci          # 安装 devDependencies（esbuild、happy-dom）
npm run build   # 把 src 的 entry.js 打包为 dist/*.user.js（并生成桥接文件）
npm run lint
npm test
```

`npm run lint` 与 `npm test` 都会先自动执行构建，保证 dist 产物与源码一致；改动多模块脚本后需把重建出的 `dist/` 与桥接文件一并提交，否则 CI 的一致性门禁会失败。DOM 层测试依赖 devDependencies 里的 happy-dom；环境缺失时相关测试自动跳过。

脚本的 raw `@downloadURL` / `@updateURL` 直接读取 `master`，因此合并带新
`@version` 的提交就是外部发布。发版候选必须在分支中先递增 patch 版本并重建产物，
等待 PR CI 全绿后再把该同一提交合入 `master`；不能先合并再等待 push CI 判断发布是否
有效。已进入 `master` 的版本视为不可变，后续修复使用下一个 patch。若用户明确选择
暂不发版，可以不递增版本，但已安装脚本也不会自动获得这次变更。

新建脚本可从 [src/userscripts/example/example.user.js](src/userscripts/example/example.user.js) 开始，并参考 [docs/script-template.md](docs/script-template.md)。有注入 UI 的脚本先看 [DESIGN.md](DESIGN.md)。

## 文档入口

- [PRODUCT.md](PRODUCT.md)：产品上下文、用户、边界、数据原则和版本策略。
- [DESIGN.md](DESIGN.md)：注入式 userscript UI 的设计上下文和组件规则。
- [docs/index.md](docs/index.md)：仓库文档地图和职责边界。
- [docs/scripts/installable-userscripts.md](docs/scripts/installable-userscripts.md)：可安装 userscript 列表和迁移说明。
- [docs/scripts/codex-quota-gist-sync.md](docs/scripts/codex-quota-gist-sync.md)：Codex Quota Compass GitHub Gist 同步说明。
- [docs/scripts/feishu-tools.md](docs/scripts/feishu-tools.md)：二维码登录态捕获、飞书工具和飞书主图 userscript 说明。
- [docs/script-template.md](docs/script-template.md)：新建或迁移 userscript 时需要维护的 metadata。
- [CONTEXT.md](CONTEXT.md)：稳定领域词汇表。
