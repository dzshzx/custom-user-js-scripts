# Feishu Tools and Userscript

本页记录飞书相关本地工具和 userscript。登录态捕获工具默认适配小米飞书，也可以通过参数用于其他二维码登录网站。运行产生的二维码、浏览器 profile、storage state 和导出图片默认写入用户目录，不写进仓库。

## QR Login Helper

`scripts/browser-tools/login-qr.mjs` 用 Playwright 打开目标页面，直接从登录页二维码 `<img>` 元素导出 PNG，并在扫码成功后保存浏览器登录态。脚本默认值保留小米飞书行为；实际参数已经支持非飞书网站。

首次使用前，确保 Playwright 在本机 npm 缓存里可用。Playwright 负责二维码元素导出和 storage state 写入：

```bash
npx --yes playwright --version
```

默认小米飞书命令：

```bash
node scripts/browser-tools/login-qr.mjs --refresh --tenant "小米合作伙伴"
```

默认行为：

- 强制这次浏览器会话走直连，不使用 shell 里的代理环境变量。
- 只使用 Playwright 自带的 `chromium`，不启动系统 Chrome。
- 二维码、浏览器 profile、storage state 都写到 `~/.local/share/codex-browser/feishu-login/`。
- 生成二维码后继续等待完整登录跳转；只有真正落到 `mi.feishu.cn` 或 `mi-p.feishu.cn` 页面，且二维码/扫码提示已经消失后，才会写入 storage state。
- 登录超时不会写入新的 storage state。

非飞书网站示例：

```bash
node scripts/browser-tools/login-qr.mjs \
  --url https://login.example.com/qr \
  --qr-selector 'img#login-qr' \
  --success-host app.example.com \
  --pending-url-pattern '/login|/qr' \
  --profile-dir ~/.local/share/codex-browser/example-login/playwright-profile \
  --qr-path ~/.local/share/codex-browser/example-login/qr.png \
  --state-path ~/.local/share/codex-browser/example-login/storage-state.json \
  --use-shell-proxy
```

如果某个网站没有稳定的 URL 或页面文本作为登录成功信号，可以显式人工确认：

```bash
node scripts/browser-tools/login-qr.mjs \
  --url https://login.example.com/qr \
  --qr-selector 'img#login-qr' \
  --manual-confirm
```

这会在二维码导出后等待你扫码并按 Enter，然后才保存 storage state。

`agent-browser` 复用登录态：

```bash
agent-browser --state ~/.local/share/codex-browser/example-login/storage-state.json open https://app.example.com
```

`storage-state.json` 含有 cookies 和本地存储，按密钥文件处理，不提交到仓库、不贴到聊天或 issue。

常用参数：

- `--url <url>`：指定目标飞书页面。
- `--qr-selector <selector>`：指定二维码图片元素；默认是小米飞书的 `img[src*="/qr_img?qr="]`。
- `--success-host <host>`：指定登录成功后的 host，可重复传多个。
- `--success-url-pattern <regex>`：用 URL 正则判断登录成功，可重复传多个。
- `--success-text <text>`：用页面文本判断登录成功，可重复传多个。
- `--pending-url-pattern <regex>`：指定仍处于登录中的 URL 正则，可重复传多个。
- `--pending-text <text>`：指定仍处于登录中的页面文本，可重复传多个。
- `--tenant <name>`：导出二维码前先点击“切换租户”，再选择指定租户。
- `--tenant-switch-text <text>`：自定义租户切换按钮文案，默认 `切换租户`。
- `--no-wait`：只导出二维码，不等待登录成功。
- `--manual-confirm`：不跑自动成功判定，扫码完成后手动按 Enter 保存状态。
- `--profile-dir <dir>`：自定义持久化浏览器 profile 目录。
- `--qr-path <file>`：自定义二维码 PNG 输出路径。
- `--state-path <file>`：自定义 storage state 输出路径。
- `--headful`：用可见浏览器窗口运行，便于本地排查。
- `--use-shell-proxy`：不强制直连，保留 shell 里的代理设置。

## Image Export Helper

`scripts/browser-tools/export-image.mjs` 使用已有登录态打开飞书文件页，进入演示视图后导出当前页面里最大的可见图片。

```bash
node scripts/browser-tools/export-image.mjs \
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

- [../../src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js](../../src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js)

行为：

- 运行在 `https://mi.feishu.cn/file/*`
- 从当前页面里找最大的可见图片
- 优先用 `GM_download` 下载
- 下载文件名默认取当前飞书文档标题

迁移说明：

- 旧路径：`src/feishu-preview-image-export.user.js`
- 新路径：`src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js`
- 当前脚本没有 `@downloadURL` / `@updateURL`；如已手动安装，直接用新路径重新安装即可。
