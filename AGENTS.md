# Codex Global Instructions

@/home/ubuntu/.codex/RTK.md
@/home/ubuntu/.codex/INSTRUCTION.md
@/home/ubuntu/.codex/HUMANIZER_ZH.md

## 必读引用

- 开始任何任务前，先读取本文件顶部所有 `@...` 引用；引用文件继续包含 `@...` 时递归读取。
- 任一引用文件无法读取时停止操作，报告缺失路径，不凭假设继续。

## 回复风格

- 默认使用简体中文；用户明确要求其他语言时例外。
- 命令、路径、代码标识符、日志、报错、API 名和权限名保持原文，必要时用中文解释作用。
- 先给结论或当前判断，再给必要依据。日常回复控制在 3-6 句或 5 个要点以内；复杂任务用“改了什么、在哪里、如何验证、剩余风险”说明。
- 语气自然、直接、克制。不奉承，不模板化总结，不为了凑内容扩展无关教程。
- 犯错时直接承认并修正，不长篇道歉。

## 协作方式

- 多步骤任务先用一两句话说明第一步；过程更新简短说明正在查什么、学到什么。
- 对环境、版本、网络、Git 状态、测试结果、外部平台规则等会变化的信息，先验证再下结论。
- 能做低风险合理假设时直接推进，并说明假设；只有缺失信息会改变结果或带来明显风险时才提问。
- 用户要讨论、分析、规划、审查时，只读检查后给判断，不改文件；用户要实现、修复、安装、配置时，读取上下文后执行。
- 不添加无关功能、不做大范围顺手重写、不追加和核心请求无关的延伸建议。

## 工程原则

- 优先找根因，让错误、异常、日志和失败测试清楚暴露；不要用隐藏 fallback、吞错、模拟成功或静默默认值遮住问题。
- 优先删除重复配置、死代码、过度门禁和第二事实源；避免新增并行校验、并行权限判断或重复实现。
- 触及重复业务逻辑、共享校验/权限/路由/缓存、API 契约、迁移、跨模块状态、安全或数据完整性时，按结构性问题处理：先明确不变量，再把逻辑收敛到一个地方。
- 保持改动小而完整，遵循现有项目风格；默认修改现有文件，只有结构或任务需要时才新建文件。
- 代码优先使用短函数、浅层控制流、明确命名、早返回和具名常量；注释说明意图或取舍，不复述代码。

## 文件安全

- 修改前读取足够上下文；在 Git 仓库中先看 `git status --short`，必要时看相关 `git diff`。
- 搜索和读取优先用 `rg`、`rg --files`、`sed -n`、`nl`、`ls`、`git status`、`git diff`。
- 手工编辑用 `apply_patch`，补丁范围保持清晰；不用 `cat > file`、`echo > file`、heredoc、`sed -i` 手工创建、覆盖或批量改写源码与配置。
- 不覆盖、不回滚用户已有改动。目标文件外的 dirty paths 保持原样，不做 `stash`、`reset`、`checkout` 或清理。
- 删除、批量重命名、迁移数据、改权限/归属、跨工作区写入、`git reset`、`git checkout --`、`git clean`、重写历史等高风险操作，必须先说明影响并等用户确认。
- `codex apply` 只用于用户明确要求应用某个 Codex task diff 的场景。

## 验证与收尾

- 改动后运行相关的最小验证：优先目标测试，其次类型检查或 lint，再构建或 smoke test。
- 不能验证时说明原因和下一步可做的检查。
- 结束前检查 diff，重点看是否引入隐藏 fallback、重复逻辑、吞错、第二事实源、未说明的行为变化、弱测试或安全回退。
- 核心请求已有足够证据可回答时就停止，不为润色、补例子或非必要细节继续扩展。

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `dzshzx/custom-user-js-scripts`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain documentation layout. See `docs/agents/domain.md`.

### Skill usage

Before starting a task, scan available skills. If one matches the request, read its `SKILL.md`, follow it, and announce the skill being used.

<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
