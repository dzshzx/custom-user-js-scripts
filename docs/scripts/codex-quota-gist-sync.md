# Codex Quota Gist Sync

Codex Quota Compass 的公开免费同步方案是 GitHub Gist。每个用户使用自己的 GitHub 账号保存自己的 `Snapshot Archive`，不依赖脚本作者的服务器，也不会把不同用户的数据混在同一个后端。

## 为什么不用脚本管理器 WebDAV

脚本管理器 WebDAV 主要同步脚本代码和管理器配置。不同脚本管理器、浏览器和同步后端对 `GM_setValue` 数据是否同步、何时同步、如何冲突合并并不一致，所以它不能作为 Codex 用量历史的可靠数据同步层。

## GitHub 权限

推荐使用 fine-grained personal access token：

- Resource owner：自己的 GitHub 账号。
- Repository access：不需要仓库权限。
- Account permissions / User permissions：`Gists` 设为 `Read and write`。
- Expiration：按个人习惯设置，建议不要无限期。

如果使用 classic token，只选择 `gist` scope。

依据 GitHub 官方文档：[Gist REST API](https://docs.github.com/en/rest/gists/gists) 允许匿名读取公开 gist；本脚本要代表当前用户查找、创建和更新其 secret gist，因此仍需要 token。[fine-grained token 权限表](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens) 中对应的是 `Gists` 用户权限。

## 脚本配置

Gist 同步要求当前 userscript manager 提供 GM storage。本地 `Snapshot Archive` 优先写入 GM storage，同时镜像到页面 `localStorage`；读取时合并两端，GM storage 不可用时直接使用该镜像。镜像只包含整理后的归档数据；同步设置和 GitHub token 始终只保存在 GM storage，不会写入页面存储，因此仅有 `localStorage` 时不能启用 Gist 同步。

安装 `Codex Quota Compass` 后，在 Tampermonkey 菜单或面板“同步”页点击“配置 Gist 同步”：

1. 输入 GitHub token。
2. `Gist ID` 首次配置可留空。
3. 脚本会在当前 GitHub 账号下查找描述为 `Codex Quota Compass Snapshot Archive` 且包含 `codex-quota-compass-snapshot-archive.v1.json` 的 gist。
4. 找不到时，脚本会创建一个 `public: false` 的 secret gist。
5. 勾选「启用自动同步」并保存——不勾选只会保存 token，不会同步。
6. 后续设备使用同一个 GitHub 账号 token 时，脚本会自动找到同一个 gist；也可以手动填入已有 Gist ID。

每次成功计算并保存快照后，脚本会排队同步；打开页面时若 Gist 同步已启用，也会静默拉取并合并一次。

## 本地操作与失败恢复

`codex-quota-compass-application.lib.js` 统一管理计算、归档、同步和面板派生状态。`codex-quota-compass-panel-controller.lib.js` 是面板展示、交互、文件选择和一次性反馈的唯一 owner；Entry 只组装生产 adapter、菜单和页面生命周期。Archive Store、Cost Ledger 和 Remote Sync 保留独立职责。

- 同一页面的并发刷新共享完整的「计算 → 保存一次快照 → 刷新统计」操作；运行标记直到整个操作结束才释放。
- Archive Store 的读取、镜像迁移、保存和导入使用同一个 FIFO。网络等待不会占用本地归档队列；拉取后的远端内容合入当时最新本地归档。
- GM 与镜像使用相同的完整归档合并规则，包括仅有 Cost Ledger 的历史。先折入所有原始快照，再保留最近 5 条；内容未改变时不反复迁移或通知。
- Summary 与 Ledger Cost 从同一归档和时间读取。计算保存、导入、启动同步、手动同步、定时同步和存储通知都会更新该视图。
- 自动同步防抖 5 秒。手动同步吸收待执行任务；同步期间的本地修改合成一个后续任务。同步与配置写入串行，旧请求不会覆盖后提交的 token 或启用状态。
- 计算失败保留最近成功结果；计算成功但保存失败仍显示结果，并报告部分成功。两条存储读取路径都失败时不继续覆盖写入。GM 写入成功但镜像失败时显示主存储成功及镜像降级。
- 本地导入已完成而远端更新失败时，最新本地统计仍然可用。网络异常造成远端写入结果未知时，停止自动重发，并在 GM 设置的既有错误字段中保留提示；刷新页面也不会自动重发。核对 Gist 后可手动同步。
- 正在编辑或尚未提交的同步表单保留输入与焦点，后台状态照常更新。token 只在表单和 GM 设置中使用，不进入 Application 状态、日志、页面存储或导出。
- 面板用表单 generation 与编辑 revision 关联异步保存结果。保存期间继续输入或切换后重新打开时，旧结果不会清除新草稿；设置已保存而远端同步失败时，结果明确保留 `settings` 完成阶段。
- 菜单和页面按钮进入同一 dispatch 流程；同类型在途操作只执行一次。文件选择取消不触发导入，页面销毁会清理选择器、读取器和临时下载 URL，业务完成后也不会再更新界面。
- 页面销毁取消防抖任务并解除存储订阅；已经发出的请求可能完成。本流程保证限定于同一页面实例，跨标签页和跨设备仍使用存储通知与归档合并。

Application 操作结果使用 `ok / partial / skipped / error`，并列出已完成阶段；状态分别保存计算、持久化、同步、派生视图和设置错误。存储键、归档 schema、v1/v2 导入兼容性和导出文件名保持不变。

## 数据格式

Gist 中只有一个文件：

```text
codex-quota-compass-snapshot-archive.v1.json
```

内容是标准 `Snapshot Export`。从 `version: 2` 起，文档由「按日成本账本（Cost Ledger）」加「最近 5 条原始快照」组成，不再每条快照内嵌完整的近 30 天 / 本月日明细：

```json
{
  "format": "codex-quota-compass.snapshot-archive",
  "version": 2,
  "exportedAt": "2026-06-19T00:00:00.000Z",
  "snapshotCount": 0,
  "ledger": {
    "2026-06-18": { "date": "2026-06-18", "credits": 3402.93, "usd": 136.12, "settled": true, "settledAt": "2026-06-19T00:15:00.000Z" }
  },
  "snapshots": []
}
```

这样同步体积随**天数**线性增长（每天一行），不再随**同步次数**膨胀——这是相对旧版的关键改动。文件名仍保持 `codex-quota-compass-snapshot-archive.v1.json` 不变（改名会让已有 gist 失联、历史变孤儿），只是内容升级为 v2。

同步是 merge 语义：

- 账本按日期合并：同一天取较大值（已结算日不回退），`settled` 只增不减。
- 最近 5 条原始快照按 `Snapshot ID` 去重，仅保留最新 5 条。
- 读取时兼容旧的 `version: 1`（全快照）文档：把其中每条快照的日明细一次性折叠进账本（幂等、无损），再按上述规则合并。
- 不上传 Cookie、OpenAI Token、GitHub token、WebDAV 账号或原始私有接口响应。

> 跨版本提示：升级到新脚本的设备只写 v2 内容；尚未升级的旧设备读到 v2 会同步报错（fail-closed，不丢数据），升级后即恢复。建议各设备一并升级。

## 消耗成本视图与结算口径

面板「统计」页提供消耗成本，四个维度切换：**日 / 周（滚动 7 天）/ 月 / 全量**，每行展示已结算的 credits 与折算 USD（固定按 `0.04 USD/credit` 换算）。周、月维度的行可点击，在面板内**下钻**到该区间的每日明细，并可返回汇总。统计页顶部另有一行「近 30 天滚动（实时）」，取自当前快照的实时口径，与下方已结算口径分开呈现。

- **结算规则**：统计按 UTC 整日；某一天只有在它结束（即次日北京 08:00，对应 UTC 日结束）再加约 15 分钟缓冲后，才冻结为最终值。进行中的当天 / 当前滚动周 / 本月显示为「暂估」，不计入已结算总额。
- **维度口径**：
  - **日**：最近 30 天每日已结算（顶部今日暂估），日为最细粒度、不可下钻。
  - **周**：从今天往回每 7 天一个非重叠块，当前块为进行中暂估，过往块可下钻到 7 天明细。
  - **月**：按 UTC 自然月，本月为暂估，过往月可下钻到当月每日明细。
  - **全量**：全部已结算日的总计（含覆盖天数与日期范围）加平铺每日。

注意：GitHub secret gist 是 unlisted，不是端到端加密存储。当前脚本只上传整理后的用量快照，不应把真正敏感材料写入归档。
