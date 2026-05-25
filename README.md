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

## 飞书二维码登录脚本

仓库内提供了一个本地脚本，用 Playwright 打开目标飞书页面，直接从登录页二维码 `<img>` 元素导出 PNG，并在扫码成功后保存浏览器登录态。

首次使用前，先确保 Playwright 在本机 npm 缓存里可用：

```bash
rtk npx --yes playwright --version
```

然后运行：

```bash
rtk node scripts/feishu-login-qr.mjs --refresh --tenant "小米合作伙伴"
```

默认行为：

- 强制这次浏览器会话走直连，不使用 shell 里的代理环境变量。
- 只使用 Playwright 自带的 `chromium`，不启动系统 Chrome。
- 二维码、浏览器 profile、storage state 都写到 `~/.local/share/codex-browser/feishu-login/`，不写进仓库。
- 生成二维码后继续等待完整登录跳转；只有真正落到 `mi.feishu.cn` 或 `mi-p.feishu.cn` 页面后，才会把 storage state 写到本地目录。

常用参数：

- `--url <url>`：指定目标飞书页面。
- `--tenant <name>`：导出二维码前先点击“切换租户”，再选择指定租户。
- `--no-wait`：只导出二维码，不等待登录成功。
- `--profile-dir <dir>`：自定义持久化浏览器 profile 目录。
- `--qr-path <file>`：自定义二维码 PNG 输出路径。
- `--state-path <file>`：自定义 storage state 输出路径。
- `--headful`：用可见浏览器窗口运行，便于本地排查。

## 飞书页面图片导出脚本

如果登录态已经准备好，可以直接把当前飞书文件页里显示的主图导出来：

```bash
rtk node scripts/feishu-export-image.mjs \
  --profile-dir /home/ubuntu/.local/share/codex-browser/feishu-login/replay-profile-20260525-143617
```

默认行为：

- 使用已有 Playwright 登录 profile 打开飞书文件页。
- 先进入 `演示` 视图，再导出当前页面里最大的可见图片。
- 优先取页面里的原始 `img` 数据，不走截图；只有脚本后续扩展时才考虑截图兜底。

常用参数：

- `--url <url>`：指定目标飞书文件链接。
- `--profile-dir <dir>`：指定已登录的 Playwright profile。
- `--output <file>`：指定导出的图片路径。
- `--no-play`：不进入演示态，直接从普通预览页导图。
- `--headful`：可见窗口运行，便于排查。

## 飞书主图导出 userscript

如果你要在浏览器里直接点用户脚本菜单导出当前飞书页面主图，可以安装：

- [src/feishu-preview-image-export.user.js](/home/ubuntu/workspace/custom-user-js-scripts/src/feishu-preview-image-export.user.js)

行为：

- 运行在 `https://mi.feishu.cn/file/*`
- 从当前页面里找最大的可见图片
- 优先用 `GM_download` 下载
- 下载文件名默认取当前飞书文档标题

## 开发约定

- 每个用户脚本使用 `.user.js` 后缀。
- 一个文件尽量只解决一个网页或一个功能问题。
- 改写已有脚本时，在文件头部或 `docs/` 中记录来源、修改点和适用版本。
- 有注入 UI 的脚本遵守 `docs/frontend-design-guidelines.md`。
- 不把账号密码、Cookie、Token 等敏感信息写入脚本。

## Git 作者信息

- Username: `dzshzx`
- Email: `dzshzx0930+github@gmail.com`
