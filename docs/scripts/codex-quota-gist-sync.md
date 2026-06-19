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

依据 GitHub 官方文档：[Gist REST API](https://docs.github.com/en/rest/gists/gists) 创建、读取和修改 gist 需要 token；[fine-grained token 权限表](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens) 中对应的是 `Gists` 用户权限。

## 脚本配置

安装 `Codex Quota Compass` 后，在 Tampermonkey 菜单或面板“同步”页点击“配置 Gist 同步”：

1. 输入 GitHub token。
2. `Gist ID` 首次配置可留空。
3. 脚本会在当前 GitHub 账号下查找描述为 `Codex Quota Compass Snapshot Archive` 且包含 `codex-quota-compass-snapshot-archive.v1.json` 的 gist。
4. 找不到时，脚本会创建一个 `public: false` 的 secret gist。
5. 后续设备使用同一个 GitHub 账号 token 时，脚本会自动找到同一个 gist；也可以手动填入已有 Gist ID。

每次成功计算并保存快照后，脚本会排队同步；打开页面时若 Gist 同步已启用，也会静默拉取并合并一次。

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

面板「历史」页提供「消耗成本（已结算）」：本周期、本月、以及每日已结算的 credits 与折算 USD（固定按 `0.04 USD/credit` 换算）。

- **结算规则**：统计按 UTC 整日；某一天只有在它结束（即次日北京 08:00，对应 UTC 日结束）再加约 15 分钟缓冲后，才冻结为最终值。当天显示为「今日（暂估）」，不计入已结算总额。
- **周期口径**：从当前 7 天窗口的「本轮开始」当天累计到今天；窗口在当日中途开始时，起始当日按整日计入（日粒度近似）。

注意：GitHub secret gist 是 unlisted，不是端到端加密存储。当前脚本只上传整理后的用量快照，不应把真正敏感材料写入归档。
