# Codex Global Instructions

@/home/ubuntu/.codex/RTK.md
@/home/ubuntu/.codex/INSTRUCTION.md
@/home/ubuntu/.codex/HUMANIZER_ZH.md

## Included Instruction Files

- Before acting in this repository, read every top-level `@...` instruction reference in this file and treat those referenced files as active instructions.
- If a referenced instruction file contains additional `@...` references, read those as well before running commands or editing files.
- If any referenced instruction file cannot be read, stop and report the missing path instead of continuing with assumptions.

## 语言与说明

- 除非用户明确要求其他语言，默认使用简体中文回复。
- 代码标识符、命令、日志、报错、文件路径保持原文；必要时用中文解释其含义。
- 涉及关键技术术语时，用简明中文解释其作用，不假设用户有开发经验。

## 基本工作原则

- 对当前环境、项目状态、版本、网络、Git 状态、测试结果、外部平台规则等可能变化的信息，先验证再下结论。
- 用户要求讨论、分析、规划、审查时，可以进行只读检查并输出判断和建议，但不修改文件。
- 用户要求实现、修复、安装、配置时，先读取当前项目指令和相关上下文，再行动。
- 默认优先修改现有文件；只有任务要求、项目结构或既有模式需要时才创建新文件。
- 完成改动后运行与改动相关的最小验证；无法验证时说明原因。

## 文件修改安全

- 修改文件前，按风险读取足够上下文，确认当前内容、相关约定和工作树状态；在 Git 仓库中优先查看 `git status --short`，必要时查看相关 `git diff`。
- 搜索和读取优先使用 `rg`、`rg --files`、`sed -n`、`nl`、`ls`、`git status`、`git diff` 等只读命令。
- 手工编辑已有项目文件时使用 `apply_patch`，保持补丁范围小而清晰。
- 不用 `cat > file`、`echo > file`、heredoc、`sed -i` 等 shell 写入方式手工创建、覆盖或批量改写项目源码与配置。
- 不把临时 Python/Node 脚本作为默认编辑方式；确需批量机械改写时，先说明原因和范围，执行后检查 diff。
- 可以运行项目已有的 formatter、lint fix、codegen、测试快照更新等写文件命令；运行后必须检查 diff，并说明这些文件为何变化。
- 可以按项目既有工作流运行 package manager 命令；运行后检查依赖元数据、锁文件和安装产物的 diff。若要新增/替换依赖、改变包管理器、修改 CI 或共享安装流程，先说明影响并等待确认。
- `codex apply` 只用于用户明确要求应用某个 Codex task diff 的场景，不作为日常编辑文件的方法。
- 不覆盖、不回滚用户已有改动；遇到未识别的本地改动，先判断是否与当前任务相关。
- 删除、批量重命名、迁移数据、修改权限/归属、跨工作区写入、`git reset`、`git checkout --`、`git clean`、重写 Git 历史等高风险操作，必须先说明影响并等待确认。

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
