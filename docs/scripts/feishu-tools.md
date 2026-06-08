# Feishu Tools and Userscript

本页记录飞书相关本地工具和 userscript。运行产生的二维码、浏览器 profile、storage state 和导出图片默认写入用户目录，不写进仓库。

## QR Login Helper

`scripts/feishu/login-qr.mjs` 用 Playwright 打开目标飞书页面，直接从登录页二维码 `<img>` 元素导出 PNG，并在扫码成功后保存浏览器登录态。

首次使用前，确保 Playwright 在本机 npm 缓存里可用：

```bash
npx --yes playwright --version
```

常用命令：

```bash
node scripts/feishu/login-qr.mjs --refresh --tenant "小米合作伙伴"
```

默认行为：

- 强制这次浏览器会话走直连，不使用 shell 里的代理环境变量。
- 只使用 Playwright 自带的 `chromium`，不启动系统 Chrome。
- 二维码、浏览器 profile、storage state 都写到 `~/.local/share/codex-browser/feishu-login/`。
- 生成二维码后继续等待完整登录跳转；只有真正落到 `mi.feishu.cn` 或 `mi-p.feishu.cn` 页面后，才会写入 storage state。

常用参数：

- `--url <url>`：指定目标飞书页面。
- `--tenant <name>`：导出二维码前先点击“切换租户”，再选择指定租户。
- `--no-wait`：只导出二维码，不等待登录成功。
- `--profile-dir <dir>`：自定义持久化浏览器 profile 目录。
- `--qr-path <file>`：自定义二维码 PNG 输出路径。
- `--state-path <file>`：自定义 storage state 输出路径。
- `--headful`：用可见浏览器窗口运行，便于本地排查。

## Image Export Helper

`scripts/feishu/export-image.mjs` 使用已有登录态打开飞书文件页，进入演示视图后导出当前页面里最大的可见图片。

```bash
node scripts/feishu/export-image.mjs \
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

## Preview Image Export Userscript

安装入口：

- [../../src/feishu-preview-image-export.user.js](../../src/feishu-preview-image-export.user.js)

行为：

- 运行在 `https://mi.feishu.cn/file/*`
- 从当前页面里找最大的可见图片
- 优先用 `GM_download` 下载
- 下载文件名默认取当前飞书文档标题
