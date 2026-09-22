# Installable Userscripts

本页列出当前可直接安装到 Tampermonkey、Violentmonkey、Greasemonkey 等管理器的 userscript。

脚本源码按脚本级目录放在 `src/userscripts/<script-id>/`。多模块脚本的安装入口是构建生成并提交的 `dist/<script-id>.user.js` 单文件；单文件脚本仍直接从 `src` 安装。历次迁移均保留 `@name`、`@namespace`、存储 key 和用户数据。

## Web Page Assistant

安装入口：

- [../../dist/web-page-assistant.user.js](../../dist/web-page-assistant.user.js)

用途：

- 在网页上提供可配置的页面辅助能力。
- 包含设置、刷新、session、unlocker 能力和浮动控件。
- 浮动 widget 常驻页面：未启用自动刷新时显示为降权圆钮，悬停/点击可展开说明与设置入口，点击圆钮直接打开设置对话框。
- 当前脚本运行范围较广，安装前应确认目标用户脚本管理器的授权提示。
- 源码是 `web-page-assistant.entry.js` 加同目录 `*.lib.js` ES 模块，`npm run build` 打包为 dist 单文件。

会话契约：

- Session 直接使用 Settings 与 Refresh Runtime，独占已提交设置、规则匹配和实际应用状态；View 只接收 Session 快照并负责对话框、浮动 widget、草稿、焦点、宿主 inert 和布局绑定，Entry 只组装浏览器 adapter、注册菜单并管理页面退出。
- `start()` 幂等，菜单在读取前注册，倒计时与常驻 widget 等待 DOM 和保存的位置就绪。页面与站点 scope 固定为启动时的地址；初始化结算前的多个开窗请求合并，读取失败时对话框显示错误并禁用写操作。
- 设置命令按 FIFO 持久化，成功后才重匹配并应用；暂停立即作用于当前倒计时。保存 Unlocker 不重启刷新，删除页面规则后重新匹配站点规则。
- 操作结果区分无效输入、未就绪、已销毁、存储失败和应用失败，并携带 `persisted`。设置已保存但能力安装失败时保留设置、清理安装并显示实际应用错误。
- 快照与内部状态隔离。每秒通知仅更新倒计时和暂停状态；设置通知与异步保存结果使用对话框代次和草稿修订保护，不能覆盖保存期间的新输入或关闭重开后的新表单。必要重建保留焦点与滚动位置。
- 对话框只移除本次添加且未被宿主继续修改的 inert 属性；widget 每次重绑先释放旧监听、hover 计时器、拖拽抑制和 pointer capture。
- 真正退出时先 `dispose()` View，再停止 Session；两者都不接受迟到异步结果恢复界面或能力。`pagehide.persisted` 保留 bfcache 页面及其现有运行状态。

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

- 长期归档优先使用 userscript manager 存储，同时镜像到页面 `localStorage`；读取时会合并两端，GM storage 不可用时则使用该镜像。
- Gist 同步设置和 token 只保存在 GM storage，不会镜像到页面存储；仅有 `localStorage` 时仍可保留本地归档，但不能启用 Gist 同步。
- 导入是 `merge` 语义，不会覆盖本地已有归档。
- 当前只支持完整 JSON 归档导出 / 导入，不支持 CSV 和按范围导出。

迁移说明：

- 更早：`src/codex-quota-compass.user.js` → `src/userscripts/codex-quota-compass/codex-quota-compass.user.js`。
- 当前：多文件 `@require` 入口 → `dist/codex-quota-compass.user.js` 单文件；旧 src 路径保留构建生成的桥接文件，存量安装经一次版本更新自动切换到 dist。

## Feishu Preview Image Export

安装入口：

- [../../dist/feishu-preview-image-export.user.js](../../dist/feishu-preview-image-export.user.js)

用途：

- 运行在 `https://mi.feishu.cn/file/*`。
- 从当前页面里找最大的可见图片。
- 优先用 `GM_download` 下载。
- 下载文件名默认取当前飞书文档标题。
- 用户反馈经页面内 toast（导出进度 / 成功文件名 / 中文失败原因），不再弹 alert。
- 图片选择与读取由 `readPreviewImage` 持有；userscript 使用固定 `userscript-v1` profile，本地 Playwright 导出工具使用 `cli-v1` profile。两者共享实现，同时保留 currentSrc/src、面积边界、fetch 凭据、MIME 与编码方式的历史差异。

迁移说明：

- 更早：`src/feishu-preview-image-export.user.js`。
- 其后：单文件 `src/userscripts/feishu-preview-image-export/feishu-preview-image-export.user.js`。
- 当前：entry + lib ES 模块，`npm run build` 打包为 `dist/feishu-preview-image-export.user.js`；旧 src 路径保留构建生成的桥接文件（与 dist 逐字节一致），存量安装经一次版本更新自动切换到 dist。
- 图片读取迁移不改变脚本版本、metadata、下载文件名或安装身份；CLI 的页面准备、时间戳/`--output` 命名和本地写入仍由 CLI 持有。

## JavDB Recommend Archive

归档页恢复上次浏览期数时，期数选择框与正文起始期保持一致；选择最新期可直接跳转。刷新期数和清缓存保留浏览位置。

安装入口：

- [../../dist/javdb-recommend.user.js](../../dist/javdb-recommend.user.js)
- 旧 src 安装路径保留与 Dist Bundle 逐字节相同的完整 Bridge File。

用途：

- 运行在 `https://javdb.com/*`（及 `javdb575.com`、`javdb.today` 等镜像域名）。
- 在顶部导航栏加入「佳片推荐」入口，点击打开独立归档页 `/recommend-archive`（官网对未知路径返回 404 HTML 页，脚本把它渲染成归档页）。
- 归档页从官网首页发现带部署指纹的样式表和导航，不硬编码资源地址。所有屏幕适用样式须在 12 秒总时限内加载，并通过导航、按钮和卡片盒计算样式检查后才启用官网外观；缺失、失败、超时或无实际样式时会清理本次资源并使用完整内置样式，数据加载不受影响。
- 瀑布流浏览：从上次浏览的期数开始按期流式渲染，滚动到底自动加载更早的期数；相邻未加载期沿当前流追加，远距离或反向跳转直接以目标期重建流，不请求中间期，并记住浏览位置。
- 影片卡片（横版封面完整显示不裁切、番号、评分、发售日期）即直链，点击直达官网影片详情页 `/v/<id>`。
- 与其他 JavDB 增强脚本同时运行时，检测已接管列表实际生效的列数、间距和封面模式，只同步到尚未接管的动态列表；列表后来被接管时释放本脚本仍持有的 inline 值。已按 Tampermonkey + `JAV老司机-新` 2.8.4.8 的可观察 DOM 契约适配，不调用第三方私有函数，也不代替其卡片按钮、排序或账号功能。
- 期数目录在页面 `localStorage` 缓存 6 小时；过期时从最新页读取到缓存重叠点即停止并复用历史尾部，每 30 天完整校验一次。最新一期详情缓存 2 小时、历史详情缓存 30 天，浏览详情按最近使用保留最多 48 期、内存保留 24 期。
- 全期搜索先查独立的紧凑本地索引，再以双工作线程补齐缺失期数；结果按期增量追加，停止搜索会释放其请求租约且不会中断仍被滚动流使用的同一期请求。索引补全后，同一目录下再次搜索不再请求详情接口。
- 请求设 12 秒超时，对网络错误、408、429 和 5xx 最多尝试 3 次并指数退避；换期会中止没有其他消费者的旧详情请求。屏外期区块使用 `content-visibility` 降低渲染成本，工具栏提供“刷新期数”和“清缓存”。
- 封面统一改写为官网页面使用的 `c0.jdbstatic.com` 图床；接口默认返回的 App 图床 `tp.spfcas.com` 在网页端常被拦截，导致封面不显示。封面加载失败时显示带「封面加载失败」标签的占位盒，不再留空洞。
- 搜索框左侧用分段控件区分范围：「已加载」输入即过滤当前流；「全部期数」回车或点「全期搜索」触发逐期扫描（可随时停止），两段的触发与状态行文案不再混用。
- 期区块加载期间渲染与官网卡片同宽高比的灰色骨架占位卡，数据到达后整列替换。
- 窄视口（<769px）吸顶工具栏固定为两行（期数导航行 / 搜索与动作行），锚点滚动边距随之重新核算。
- 工具栏与卡片的图形符号全部为内联 Lucide SVG（与 `src/userscripts/shared/shared-icons.lib.js` 同源内联），不使用 emoji。
- 数据走官网自身的 `/api/v1/movies/recommend_periods` 与 `/api/v1/movies/recommend` 接口（同域请求）。

说明：

- `@grant none`，不使用脚本管理器特权 API；上次浏览期数继续使用原 `localStorage` key，期数目录与详情缓存使用独立的版本化 key。
- 无需登录即可使用；脚本内置与官网一致的 `jdsignature` 签名算法。
- 已配置 `@downloadURL` / `@updateURL`（指向 Dist Bundle 的 raw 地址），推送新版本后脚本管理器会按 `@version` 自动更新。

迁移说明：

- 当前源码为 `javdb-recommend.entry.js` 与数据、请求、Period Section、Site Chrome、展示 Lib Module，构建生成 Dist Bundle 和完整 Bridge File。数据模块拥有 Catalog、Navigation Payload、Search Index、Consumer Lease 及双路搜索；Period Section 统一浏览与搜索的安全文本、稳定节点、卡片、封面失败和即时筛选；Site Chrome 独占官网资源的准备、校验、启用与清理；展示模块编排顺序与导航。内存和磁盘均按来源时间判断 TTL，缓存投影不会延长来源有效期。
- 搜索区分完成、取消和部分失败，并显示失败期数及使用旧缓存的期数。清缓存先取消工作，再删除缓存；迟到的响应不能重新写入。请求取消同时清理超时与退避计时器。
- `@name`、`@namespace`、`@match`、`@grant none`、缓存版本及全部存储 key 保持不变。安装路径迁移保持同一个安装身份；正式升级仍需按发布流程步进版本。
- 旧版为右下角「🎬」悬浮面板；现改为导航栏入口 + 独立归档页，卡片点击由官网搜索改为直达详情页。存储 key 与安装路径保持不变。
- 版本号从 `1.0.0` 重置为 `0.0.2`：脚本管理器只向更高版本自动更新，已安装 `1.0.0` 的副本需用安装入口手动重装一次，之后恢复正常自动更新。
