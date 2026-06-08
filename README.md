# Custom User JS Scripts

用于编写、整理和改写浏览器用户脚本的项目仓库。适合 Tampermonkey、Violentmonkey、Greasemonkey 等用户脚本管理器。

## 文档入口

- [docs/index.md](docs/index.md)：仓库文档地图和职责边界。
- [docs/scripts/installable-userscripts.md](docs/scripts/installable-userscripts.md)：当前可安装 userscript 列表和安装说明。
- [docs/scripts/feishu-tools.md](docs/scripts/feishu-tools.md)：飞书二维码登录、页面图片导出和飞书主图 userscript 说明。
- [docs/script-template.md](docs/script-template.md)：新建或迁移 userscript 时需要维护的 metadata。
- [docs/frontend-design-guidelines.md](docs/frontend-design-guidelines.md)：注入式 userscript UI 的设计约定。
- [CONTEXT.md](CONTEXT.md)：稳定领域词汇表，只记录业务术语。

## 目录结构

```text
.
├── docs/                 # 人类可读文档、脚本说明和运行手册
├── scripts/              # 本地辅助脚本
├── snippets/             # 可复用代码片段
├── src/userscripts/      # installable userscript 和同脚本支持模块
└── test/                 # Node 测试
```

## 快速开始

1. 复制现有 `.user.js` 或从 [src/userscripts/example/example.user.js](src/userscripts/example/example.user.js) 开始。
2. 按 [docs/script-template.md](docs/script-template.md) 修改 `@name`、`@match`、`@grant` 等 metadata。
3. 在浏览器 userscript 管理器中新建脚本，粘贴或安装 `.user.js` 内容。
4. 如果脚本注入 UI，先看 [docs/frontend-design-guidelines.md](docs/frontend-design-guidelines.md)。

## 常用命令

```bash
npm run lint
npm test
```

`npm run lint` 检查 installable userscript metadata；`npm test` 运行 Node 测试。

## 当前脚本

- [Installable userscripts](docs/scripts/installable-userscripts.md)
- [Feishu tools and userscript](docs/scripts/feishu-tools.md)

## 开发约定

- 每个用户脚本使用 `.user.js` 后缀。
- 一个文件尽量只解决一个网页或一个功能问题。
- 改写已有脚本时，在文件头部或 `docs/` 中记录来源、修改点和适用版本。
- 有注入 UI 的脚本遵守 `docs/frontend-design-guidelines.md`。
- 不把账号密码、Cookie、Token 等敏感信息写入脚本。
