# ADR Decision Index

先读本表再开单个 ADR；取代关系写在各文件 Status 行。本仓决策的「规则本体」在 `PRODUCT.md` /
`DESIGN.md` / `docs/scripts/` 等 owner 文档里，ADR 只记录为什么这样选与被否决的替代方案。

| ADR | Status | 决定了什么 |
| --- | --- | --- |
| [ADR-0001](./0001-bundle-scripts-with-committed-dist-and-byte-identical-bridge.md) | accepted (2026-07-24) | 多模块脚本 ESM + esbuild 打包成提交的 dist 单文件，旧路径保留逐字节相同的桥接文件（不是 stub） |
| [ADR-0002](./0002-green-pull-requests-are-the-release-gate.md) | accepted (2026-08-17) | 候选分支 bump `@version` → PR CI 绿 → 合并该提交即发布；已发布版本不可变 |
| [ADR-0003](./0003-gm-storage-first-with-page-localstorage-fallback-and-mirror.md) | accepted (2026-05-30 / 06-08) | manager 存储优先、页面 localStorage 回退；Quota 归档镜像到页面存储并合并读取；Gist 设置与 token 只进 manager 存储 |
| [ADR-0004](./0004-sync-through-the-users-own-github-gist.md) | accepted (2026-06-13) | 跨设备同步走用户自己的 secret gist，不建作者服务器、不用管理器 WebDAV |
| [ADR-0005](./0005-agent-entry-files-stay-local-in-this-public-repo.md) | accepted (2026-06-17) | 公开仓中 agent 入口文件不入库；项目规则的 owner 必须是受跟踪文档 |

## 决策链

- 打包与发布：ADR-0001（dist + 桥接）→ ADR-0002（PR 门 = 发布边界）。
- 数据：ADR-0003（存储分层）→ ADR-0004（用 Gist 同步该归档）。
- 文档治理：ADR-0005 决定哪些文件能当规则 owner。
