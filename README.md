# Custom User JS Scripts

这个仓库存放可直接安装到 Tampermonkey、Violentmonkey、Greasemonkey 等脚本管理器的浏览器 userscript，也包含少量本地辅助工具。

## 可安装脚本

| 脚本 | 适用页面 | 用途 | 安装入口 |
| --- | --- | --- | --- |
| Web Page Assistant / 网页助手 | `*://*/*` | 管理网页自动刷新，并可按需解除复制、选择、右键菜单、拖拽和离开确认限制。 | [web-page-assistant.user.js](src/userscripts/web-page-assistant/web-page-assistant.user.js) |
| Codex Quota Compass | `https://chatgpt.com/*` | 查看 Codex 用量、保存本地快照、远程同步、导出 / 导入用量归档。 | [codex-quota-compass.user.js](src/userscripts/codex-quota-compass/codex-quota-compass.user.js) |
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
- 该脚本通过 `@require` 加载同目录的 settings、storage 和 refresh support modules，手动安装时应使用安装入口文件，不要只复制单个 support module。

## Codex Quota Compass

Codex Quota Compass 运行在 `chatgpt.com`，通过悬浮按钮或 userscript 菜单命令读取当前 Codex 用量并保存历史。

它会把每次成功运行的结果保存为一条 `Quota Snapshot`，并维护本地 `Snapshot Archive`。脚本管理器的 WebDAV 同步只能保证脚本代码和管理器设置同步，不作为 Codex 用量历史的可靠跨设备通道。

跨设备自动同步走 GitHub Gist：用户配置自己的 GitHub token 后，脚本会在用户自己的 GitHub 账号里查找或创建一个 secret gist，并把 `Snapshot Archive` 保存为 JSON 文件。不同设备使用同一个 GitHub 账号和 token 后，会按 `Snapshot ID` 合并归档。你也可以从面板导出完整归档，或通过 userscript 菜单导出 / 导入 JSON，作为手动备份或迁移路径。

注意事项：

- 归档里保存的是经过整理的用量信息，不保存 Cookie、Token 或原始私有接口响应。
- 导入是 merge 语义，会跳过重复快照，不会覆盖整个本地归档。
- GitHub token 保存在脚本管理器存储中，不写入仓库；建议使用 fine-grained token，并只授予 Gists read/write 权限。
- Gist 使用 `public: false` 创建，是 unlisted secret gist，不应保存 Cookie、Token 或其他真正敏感信息。
- 运行环境不支持 GM storage 时会回退到当前浏览器的 `localStorage`；跨设备同步仍需要配置 GitHub token。

Gist 同步设置说明见 [docs/scripts/codex-quota-gist-sync.md](docs/scripts/codex-quota-gist-sync.md)。

领域词汇见 [CONTEXT.md](CONTEXT.md)。

## Feishu Preview Image Export

Feishu Preview Image Export 运行在飞书文件预览页，用 userscript 菜单命令从当前页面找最大的可见图片并下载。它适合处理飞书文件页里“预览图可见但原图入口不好找”的场景。

本仓库还提供两个本地浏览器工具：

- `scripts/browser-tools/login-qr.mjs`：默认适配小米飞书，也可配置其他网站；导出登录二维码并保存浏览器登录态。
- `scripts/browser-tools/export-image.mjs`：使用已有登录态打开飞书文件页并导出当前最大可见图片。

使用说明见 [docs/scripts/feishu-tools.md](docs/scripts/feishu-tools.md)。

## 仓库结构

```text
.
├── docs/                 # 脚本说明、运行手册和项目约定
├── scripts/              # 本地辅助脚本
├── snippets/             # 可复用代码片段
├── src/userscripts/      # 可安装 userscript 和同脚本 support modules
└── test/                 # Node 测试
```

## 开发与验证

```bash
npm run lint
npm test
```

`npm run lint` 检查 installable userscript metadata；`npm test` 运行 Node 测试。

UI/UX（DOM 层）测试可选：仓库保持零依赖，不记录 DOM 测试库。本机启用时执行 `npm install --no-save --no-package-lock happy-dom`，相关测试会自动运行；未安装时这些测试自动跳过，`npm test` 仍然全绿。

新建脚本可从 [src/userscripts/example/example.user.js](src/userscripts/example/example.user.js) 开始，并参考 [docs/script-template.md](docs/script-template.md)。有注入 UI 的脚本先看 [docs/frontend-design-guidelines.md](docs/frontend-design-guidelines.md)。

## 文档入口

- [PRODUCT.md](PRODUCT.md)：产品上下文、用户、边界、数据原则和版本策略。
- [DESIGN.md](DESIGN.md)：注入式 userscript UI 的设计上下文和组件规则。
- [docs/index.md](docs/index.md)：仓库文档地图和职责边界。
- [docs/scripts/installable-userscripts.md](docs/scripts/installable-userscripts.md)：可安装 userscript 列表和迁移说明。
- [docs/scripts/codex-quota-gist-sync.md](docs/scripts/codex-quota-gist-sync.md)：Codex Quota Compass GitHub Gist 同步说明。
- [docs/scripts/feishu-tools.md](docs/scripts/feishu-tools.md)：二维码登录态捕获、飞书工具和飞书主图 userscript 说明。
- [docs/script-template.md](docs/script-template.md)：新建或迁移 userscript 时需要维护的 metadata。
- [CONTEXT.md](CONTEXT.md)：稳定领域词汇表。
