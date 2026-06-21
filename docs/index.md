# Documentation Map

本目录保存人类可读的项目文档、脚本说明和运行手册。实现规则写在 `.trellis/spec/`，领域词汇写在 `CONTEXT.md`，任务过程写在 `.trellis/tasks/`。

## Responsibilities

| Path | Responsibility |
| --- | --- |
| `README.md` | 仓库入口、快速命令和文档导航。 |
| `PRODUCT.md` | 产品上下文、用户、边界、数据原则和版本策略。 |
| `DESIGN.md` | 注入式 userscript UI 的设计上下文和组件规则。 |
| `CONTEXT.md` | 稳定领域词汇表；不要放实现计划、运行手册或任务记录。 |
| `docs/` | 人类可读说明、脚本 runbook、项目约定。 |
| `docs/scripts/` | 具体脚本或本地工具的使用说明。 |
| `.trellis/spec/` | 面向实现的规则、约束、检查点。 |
| `.trellis/tasks/` | Trellis 任务计划和历史证据，不作为读者入口。 |

## Script Docs

- [Installable userscripts](scripts/installable-userscripts.md)
- [Codex Quota Gist sync](scripts/codex-quota-gist-sync.md)
- [Feishu tools and userscript](scripts/feishu-tools.md)

## Project Conventions

- [Product context](../PRODUCT.md)
- [Design context](../DESIGN.md)
- [Script template notes](script-template.md)
- [Frontend design guidelines](frontend-design-guidelines.md)
