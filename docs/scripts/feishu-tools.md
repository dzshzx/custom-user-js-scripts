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
- 二维码文件写完时立即开始最长 10 分钟的自动等待；日志或事件处理耗时不会推迟截止时间。工具每 3 秒读取一次页面，只有同一个 document 的 URL、正文和二维码状态都读取成功，真正落到 `mi.feishu.cn` 或 `mi-p.feishu.cn`，且二维码/扫码提示已经消失后，才允许保存。
- 导航、同 URL reload 或下一次观测都会使旧观测失效。保存前和临时 state 导出后都会重新核对观测；失效时继续在原截止时间内等待，不会重置 10 分钟期限。
- 登录超时、页面读取失败或取消都不会替换已有 storage state。新 state 先以 `0600` 权限写入目标同目录的独占临时文件；导出前、导出后和 rename 前均复核原截止时间及页面观测，页面校验或临时 state 导出无响应也不能延长截止时间，只有仍有效时才提交。

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

这会在二维码导出后等待你扫码并明确按 Enter，然后才保存 storage state。EOF、非交互终端和取消都不会保存；同时传 `--no-wait` 时，以只导出二维码为准。

`agent-browser` 复用登录态：

```bash
agent-browser --state ~/.local/share/codex-browser/example-login/storage-state.json open https://app.example.com
```

`storage-state.json` 含有 cookies 和本地存储，按密钥文件处理，不提交到仓库、不贴到聊天或 issue。

浏览器 profile 与显式 storage state 是两种独立产物。持久化 Chromium 在运行和关闭时都可能更新 profile；storage state 则只在上述 rename 成功后视为已提交，两者不构成事务。二维码会在等待开始前写好，后续超时不会删除它。

`SIGINT` 和 `SIGTERM` 会分别在资源清理结算后以 130 和 143 退出。若信号发生在 rename 已经开始之后，工具会等待 rename 结果，并准确报告 state 是否已经提交；浏览器关闭失败不会把已提交结果改成未保存，也不会覆盖原来的超时原因。

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
  --url 'https://mi.feishu.cn/file/<file-token>'
```

默认行为：

- 使用已有 Playwright 登录 profile 打开飞书文件页。
- 先进入 `演示` 视图，再导出当前页面里最大的可见图片。
- 通过与 userscript 共用的图片读取模块提取原始 `img` 数据，不走截图。
- CLI 保留原有兼容规则：使用 `src` 属性原值，按未取整面积 `> 20000` 选图，fetch 使用页面默认凭据规则，响应头提供 MIME，并用 `arrayBuffer` 编码为 base64。
- 没有候选或 data URL 格式无效时不写输出文件；网络、读取和编码失败直接以非零状态退出。

常用参数：

- `--url <url>`：指定目标飞书文件链接。
- `--profile-dir <dir>`：指定已登录的 Playwright profile。
- `--output <file>`：指定导出的图片路径。
- `--no-play`：不进入演示态，直接从普通预览页导图。
- `--headful`：可见窗口运行，便于排查。

## Preview Image Export Userscript

安装入口：

- [../../dist/feishu-preview-image-export.user.js](../../dist/feishu-preview-image-export.user.js)

行为：

- 运行在 `https://mi.feishu.cn/file/*`
- 从当前页面里找最大的可见图片
- 使用 `currentSrc`（后备 `img.src`），宽高分别取整后按面积 `>= 20000` 选图；远端图片 fetch 明确携带当前登录凭据，Blob MIME 和 FileReader data URL 保持原值
- 优先用 `GM_download` 下载
- 下载文件名默认取当前飞书文档标题

两条导出路径都调用 `readPreviewImage`，通过固定的 `userscript-v1` / `cli-v1` profile 保留上述历史差异。两者共享候选选择、data URL 解析和图片读取实现；命名、GM 下载、本地文件写入与页面准备仍由各自入口负责。

迁移说明：

- 旧路径：`src/feishu-preview-image-export.user.js`
- 其后路径：`src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js`
- 当前安装入口为 Dist Bundle，`@downloadURL` / `@updateURL` 均指向该路径；上述 src 路径保留与 Dist Bundle 逐字节相同的完整 Bridge File。
