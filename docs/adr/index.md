# ADR Decision Index

ADR 只留现行决定：被取代的 ADR 直接删除（历史见 git），修订并入正文、修订节只留「日期：一句话」清单。规则本体在 `PRODUCT.md`、`DESIGN.md`、`docs/scripts/` 等 owner 文档，ADR 记录为什么这样选与否决的替代方案。

- [ADR-0001](./0001-bundle-scripts-with-committed-dist-and-byte-identical-bridge.md)：多模块脚本 ESM + esbuild 打包成提交的 dist 单文件，旧路径保留逐字节相同的桥接文件（不是 stub）；运行时 npm 依赖打进 dist，不用 `@require`。
- [ADR-0003](./0003-gm-storage-first-with-page-localstorage-fallback-and-mirror.md)：manager 存储优先、页面存储回退；Quota 归档镜像到页面存储并合并读取；Gist 设置与 token 只进 manager 存储。
- [ADR-0004](./0004-sync-through-the-users-own-github-gist.md)：跨设备同步走用户自己的 secret gist，不建作者服务器、不用管理器 WebDAV。
- [ADR-0005](./0005-agent-entry-files-stay-local-in-this-public-repo.md)：公开仓中 agent 入口文件不入库；项目规则的 owner 必须是受跟踪文档。
- [ADR-0006](./0006-userscript-sources-are-typescript-erased-by-esbuild.md)：源码为 TypeScript（strict tsc 只做检查），esbuild 擦除类型、影响产出的选项单独固定，测试与工具保持 .mjs。
- [ADR-0007](./0007-land-publishes-only-a-green-exact-commit.md)：`master` 只经 `land` 快进到 `ci-ok` 为绿的同一提交即发布；CI 含按最新基线的版本计划校验；版本档位见 `PRODUCT.md`；依赖更新由 agent 周批执行，走同一门禁。
