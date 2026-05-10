# Custom User JS Scripts

用于编写、整理和改写浏览器用户脚本的项目仓库。适合 Tampermonkey、Violentmonkey、Greasemonkey 等用户脚本管理器。

## 目录结构

```text
.
├── docs/                 # 脚本说明、改写记录、目标网页规则
├── scripts/              # 本地辅助脚本
├── snippets/             # 可复用代码片段
└── src/                  # .user.js 用户脚本源码
```

## 快速开始

1. 在 `src/` 下创建或复制 `.user.js` 文件。
2. 修改文件顶部的 userscript metadata，例如 `@name`、`@match`、`@grant`。
3. 在浏览器用户脚本管理器中新建脚本，粘贴 `.user.js` 内容。

## 常用命令

```bash
npm run lint
```

该命令会检查 `src/` 下的 `.user.js` 文件是否包含基本 userscript metadata。

## 开发约定

- 每个用户脚本使用 `.user.js` 后缀。
- 一个文件尽量只解决一个网页或一个功能问题。
- 改写已有脚本时，在文件头部或 `docs/` 中记录来源、修改点和适用版本。
- 不把账号密码、Cookie、Token 等敏感信息写入脚本。

## Git 作者信息

- Username: `dzshzx`
- Email: `dzshzx0930+github@gmail.com`
