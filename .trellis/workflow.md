# Channel-Driven Sub-Agent Dispatch Workflow

---

## Core Principles

1. **Plan before code** — define the task, planning artifacts, and acceptance criteria before implementation.
2. **The main session coordinates** — the main session clarifies requirements, plans the task, dispatches channel workers, updates specs, commits, and finishes the work.
3. **Implementation and checking run in channel workers** — Phase 2 defaults to `trellis channel spawn --agent implement` and `trellis channel spawn --agent check`.
4. **Host-native sub-agents are fallback only** — `.codex/agents/*`, Claude Task agents, and similar host-native workers are used only when the user explicitly asks or a host-only capability is required.
5. **Persist decisions** — requirements, research, plans, review conclusions, and lessons belong in task files or specs, not only in chat.
6. **Keep results auditable** — use `trellis channel messages --raw` for worker events; pretty output is only a quick operator view.

---

## Trellis System

### Developer Identity

Initialize your identity on first use:

```bash
python3 ./.trellis/scripts/init_developer.py <your-name>
```

This creates `.trellis/.developer` (gitignored) and `.trellis/workspace/<your-name>/`.

### Spec System

`.trellis/spec/` stores project engineering guidelines organized by package and layer.

- `.trellis/spec/<package>/<layer>/index.md` is the entry point with pre-development and quality checks.
- `.trellis/spec/guides/index.md` contains cross-package thinking guides.

```bash
python3 ./.trellis/scripts/get_context.py --mode packages
```

Update specs when a task reveals a reusable pattern, a bug-prevention rule, or a technical decision that future sessions should follow.

### Task System

Each task has its own directory under `.trellis/tasks/{MM-DD-name}/` with `task.json`, `prd.md`, optional `design.md`, optional `implement.md`, optional `research/`, and context manifests `implement.jsonl` / `check.jsonl`.

```bash
# Task lifecycle
python3 ./.trellis/scripts/task.py create "<title>" [--slug <name>] [--parent <dir>]
python3 ./.trellis/scripts/task.py start <name>
python3 ./.trellis/scripts/task.py current --source
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive <name>
python3 ./.trellis/scripts/task.py list [--mine] [--status <s>]
python3 ./.trellis/scripts/task.py list-archive

# Worker context manifests
python3 ./.trellis/scripts/task.py add-context <name> <action> <file> <reason>
python3 ./.trellis/scripts/task.py list-context <name> [action]
python3 ./.trellis/scripts/task.py validate <name>

# Task metadata
python3 ./.trellis/scripts/task.py set-branch <name> <branch>
python3 ./.trellis/scripts/task.py set-base-branch <name> <branch>
python3 ./.trellis/scripts/task.py set-scope <name> <scope>

# Parent / child hierarchy
python3 ./.trellis/scripts/task.py add-subtask <parent> <child>
python3 ./.trellis/scripts/task.py remove-subtask <parent> <child>

# PR helper
python3 ./.trellis/scripts/task.py create-pr [name] [--dry-run]
```

Run `python3 ./.trellis/scripts/task.py --help` for the authoritative command list.

**Current-task mechanism**: `task.py create` creates the task and, when session identity is available, sets the per-session active-task pointer. `task.py start` writes the same pointer and flips `task.json.status` from `planning` to `in_progress`. Runtime state lives under `.trellis/.runtime/sessions/`. `task.py finish` clears the current session pointer without changing task status. `task.py archive <task>` writes `status=completed`, moves the directory to `archive/`, and clears runtime session files that still point at it.

### Workspace System

AI session records live under `.trellis/workspace/<developer>/`.

- `journal-N.md` stores session logs and rotates after `max_journal_lines`.
- `index.md` stores the personal workspace index.

```bash
python3 ./.trellis/scripts/add_session.py --title "Title" --commit "hash" --summary "Summary"
```

### Context Script

```bash
python3 ./.trellis/scripts/get_context.py
python3 ./.trellis/scripts/get_context.py --mode packages
python3 ./.trellis/scripts/get_context.py --mode phase
python3 ./.trellis/scripts/get_context.py --mode phase --step <X.Y> --platform codex
```

Use `--mode phase --step 2.1 --platform codex` and `--mode phase --step 2.2 --platform codex` to verify that Phase 2 dispatch semantics still point at channel workers.

### Channel System

Channels are the worker collaboration and event-audit layer. Use ephemeral channels for implementation/check work and delete them after results are captured.

Stable worker handles:

- `implement` — implementation worker loaded from `.trellis/agents/implement.md`
- `check` — check worker loaded from `.trellis/agents/check.md`
- `check-cc` — optional Claude check worker
- `check-cx` — optional Codex check worker

---

<!--
  WORKFLOW-STATE BREADCRUMB CONTRACT

  [workflow-state:STATUS] blocks in this file are the single source of truth
  for per-turn prompt injection. Hook parsers read these tags from workflow.md;
  they do not keep a complete fallback copy elsewhere.

  STATUS charset: [A-Za-z0-9_-]+.

  Tag scope:
    [workflow-state:no_task]            -> no active task; before Phase 1
    [workflow-state:planning]           -> Phase 1
    [workflow-state:planning-inline]    -> legacy inline Phase 1 fallback
    [workflow-state:in_progress]        -> Phase 2 + Phase 3.1-3.4
    [workflow-state:in_progress-inline] -> legacy inline Phase 2/3 fallback
    [workflow-state:completed]          -> currently rarely reached because archive moves the task

  Editing checklist:
    - Keep required walkthrough steps and matching workflow-state text in sync.
    - Keep Phase 2 breadcrumbs channel-driven unless intentionally changing this workflow.
    - Preserve Phase 3.3 spec update and Phase 3.4 commit guidance in in_progress flow.
-->

## Phase Index

```
Phase 1: Plan    -> classify, get task-creation consent, then write planning artifacts
Phase 2: Execute -> implement/check through trellis channel workers
Phase 3: Finish  -> verify, update spec, commit, and wrap up
```

### Request Triage

- Simple conversation or small task: ask only whether this turn should create a Trellis task. If the user says no, skip Trellis for this session.
- Complex task: ask whether you may create a Trellis task and enter planning. If the user says no, do not do broad inline implementation; explain, clarify scope, or suggest a smaller split.
- User approval to create a task is not approval to start implementation. Planning still happens first.

### Planning Artifacts

- `prd.md` — requirements, constraints, and acceptance criteria. Do not put technical design or execution checklists here.
- `design.md` — technical design for complex tasks: boundaries, contracts, data flow, tradeoffs, compatibility, rollout / rollback shape.
- `implement.md` — execution plan for complex tasks: ordered checklist, validation commands, review gates, and rollback points.
- `implement.jsonl` / `check.jsonl` — worker context manifests containing spec and research files only. Do not put code files or files about to be modified here.

Lightweight tasks may be PRD-only. Complex tasks must have `prd.md`, `design.md`, and `implement.md` before `task.py start`.

### Parent / Child Task Trees

Use a parent task when one request contains several independently verifiable deliverables. The parent owns the source requirement set, task map, cross-child acceptance criteria, and final integration review; it normally is not the implementation target unless it also has direct work.

Use child tasks for deliverables that can be planned, implemented, checked, and archived independently. Parent/child structure is not a dependency system: if one child depends on another, write that ordering in the child `prd.md` / `implement.md`.

Create new children with `task.py create "<title>" --slug <name> --parent <parent-dir>`. Link existing tasks with `task.py add-subtask <parent> <child>`, and unlink mistakes with `task.py remove-subtask <parent> <child>`.

[workflow-state:no_task]
No active task. First classify the current turn and ask for task-creation consent before creating any Trellis task.
Simple conversation / small task: ask only whether this turn should create a Trellis task. If the user says no, skip Trellis for this session.
Complex task: ask the user if you can create a Trellis task and enter the planning phase. If the user says no, explain, clarify scope, or suggest a smaller split.
[/workflow-state:no_task]

### Phase 1: Plan

- 1.0 Create task `[required · once]` (only after task-creation consent)
- 1.1 Requirement exploration `[required · repeatable]`
- 1.2 Research `[optional · repeatable]`
- 1.3 Configure context `[conditional · once]`
- 1.4 Activate task `[required · once]` (review gate, then `task.py start`; status -> in_progress)
- 1.5 Completion criteria

[workflow-state:planning]
Load `trellis-brainstorm`; stay in planning.
Lightweight: `prd.md` can be enough. Complex: finish `prd.md`, `design.md`, and `implement.md`; ask for review before `task.py start`.
Multi-deliverable scope: consider a parent task plus independently verifiable child tasks; dependencies must be written in child artifacts, not implied by tree position.
Channel-worker mode: curate `implement.jsonl` and `check.jsonl` as spec/research manifests before start.
[/workflow-state:planning]

[workflow-state:planning-inline]
Load `trellis-brainstorm`; stay in planning.
Lightweight: `prd.md` can be enough. Complex: finish `prd.md`, `design.md`, and `implement.md`; ask for review before `task.py start`.
Multi-deliverable scope: consider a parent task plus independently verifiable child tasks; dependencies must be written in child artifacts, not implied by tree position.
Inline mode is legacy fallback only; prefer channel workers once the task is active.
[/workflow-state:planning-inline]

### Phase 2: Execute

- 2.1 Implement `[required · repeatable]`
- 2.2 Quality check `[required · repeatable]`
- 2.3 Rollback `[on demand]`

Channel-driven sub-agent dispatch is the default execution model for this workflow. The main session uses `trellis channel create`, `trellis channel spawn`, `trellis channel send`, `trellis channel wait`, and `trellis channel messages --raw` to coordinate workers. Fall back to native host sub-agents only when the user explicitly asks for native dispatch or a host-only capability is required.

[workflow-state:in_progress]
Flow: `trellis channel spawn --agent implement` -> `trellis channel spawn --agent check` -> `trellis-update-spec` -> commit plan (Phase 3.4) -> `/trellis:finish-work`.
Main-session default: use channel worker agents from `.trellis/agents/implement.md` and `.trellis/agents/check.md`; do not use `.codex/agents/*`, Claude Task agents, or other host-native sub-agents unless explicitly requested or host-only tools require them.
Worker context order: jsonl entries -> `prd.md` -> `design.md if present` -> `implement.md if present`. Use raw channel messages for audit evidence and keep Phase 3.3 spec update plus Phase 3.4 commit planning reachable before finish.
[/workflow-state:in_progress]

[workflow-state:in_progress-inline]
Legacy fallback flow: `trellis-before-dev` -> inline edit -> channel-driven `check` worker -> validation -> `trellis-update-spec` -> commit plan (Phase 3.4) -> `/trellis:finish-work`.
Inline implementation is allowed only when the user asks for it, the task is very small, or channel workers are unavailable. After editing, prefer `trellis channel spawn --agent check` for independent review.
Read context before editing: `prd.md` -> `design.md if present` -> `implement.md if present`, plus relevant spec/research loaded by skills.
[/workflow-state:in_progress-inline]

### Phase 3: Finish

- 3.1 Quality verification `[required · repeatable]`
- 3.2 Debug retrospective `[on demand]`
- 3.3 Spec update `[required · once]`
- 3.4 Commit changes `[required · once]`
- 3.5 Wrap-up reminder

[workflow-state:completed]
Code committed. Run `/trellis:finish-work`; if dirty, return to Phase 3.4 first.
[/workflow-state:completed]

---

## Rules

1. Identify the current Phase, then continue from the next step in that Phase.
2. Run steps in order inside each Phase; `[required]` steps cannot be skipped.
3. Phase 2 defaults to channel workers, not host-native sub-agents.
4. Worker briefs must state the active task, goal, editable scope, validation commands, forbidden actions, and expected completion summary.
5. `trellis channel messages --raw` is the precise audit path; pretty output is only for quick status checks.
6. After a worker completes, the main session integrates results and runs check workers when needed. Final judgment stays with the main session.
7. Do not amend commits and do not push unless the user explicitly asks.

### Active Task Routing

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

- Planning or unclear requirements -> `trellis-brainstorm`.
- `in_progress` implementation -> `trellis channel spawn --agent implement`.
- `in_progress` quality check -> `trellis channel spawn --agent check`.
- Repeated debugging -> `trellis-break-loop`; spec updates -> `trellis-update-spec`.
- Native host sub-agents -> fallback only when explicitly requested or host-only tools are required.

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]

[codex-inline, Kilo, Antigravity, Windsurf]

- Planning or unclear requirements -> `trellis-brainstorm`.
- Before inline fallback edits -> `trellis-before-dev`; after edits -> prefer a channel-driven `check` worker.
- Repeated debugging -> `trellis-break-loop`; spec updates -> `trellis-update-spec`.

[/codex-inline, Kilo, Antigravity, Windsurf]

### Loading Step Detail

```bash
python3 ./.trellis/scripts/get_context.py --mode phase --step <step> --platform codex
```

---

## Phase 1: Plan

Goal: clarify requirements, get task-creation consent, and produce planning artifacts that must be reviewed before implementation.

#### 1.0 Create task `[required · once]`

Create the task directory only after task-creation consent:

```bash
python3 ./.trellis/scripts/task.py create "<task title>" --slug <name>
```

`--slug` is the human-readable name only; `task.py create` adds the date prefix.

Run only `create` here. Do not also run `start`. `start` switches status to `in_progress`, which moves the breadcrumb into execution before planning artifacts are reviewed.

Skip when `python3 ./.trellis/scripts/task.py current --source` already points to a task.

#### 1.1 Requirement exploration `[required · repeatable]`

Load `trellis-brainstorm` and write user requirements into `prd.md`.

Requirements:

- Ask one question at a time.
- Prefer researching over asking for information that can be discovered.
- Update task artifacts immediately when requirements change.
- Split broad work into parent task plus independently verifiable child tasks.
- Keep `prd.md` focused on requirements and acceptance criteria, not implementation checklists.
- For complex tasks, produce `design.md` and `implement.md` before implementation starts.

#### 1.2 Research `[optional · repeatable]`

Research can use available local tools, MCP servers, web search, docs, and code inspection. Research output must be written to `{TASK_DIR}/research/`.

Research artifact conventions:

- One file per research topic, such as `research/auth-library-comparison.md`.
- Record third-party library usage examples, API references, version constraints, relevant files, caveats, and related spec paths.
- Do not leave research only in chat. Conversations get compacted; files do not.

#### 1.3 Configure context `[conditional · once]`

Curate worker context manifests:

- `implement.jsonl` — specs and research needed by the implementation worker.
- `check.jsonl` — quality specs, test specs, and research needed by the check worker.

Format: one JSON object per line:

```json
{"file": "<path>", "reason": "<why>"}
```

Put in:

- `.trellis/spec/<package>/<layer>/index.md` and specific guideline files relevant to the task.
- `{TASK_DIR}/research/*.md` files needed by workers.

Do not put in:

- Code files (`src/**`, `packages/**/*.ts`, userscript files, etc.).
- Files workers are about to modify.

Append entries with:

```bash
python3 ./.trellis/scripts/task.py add-context "$TASK_DIR" implement "<path>" "<reason>"
python3 ./.trellis/scripts/task.py add-context "$TASK_DIR" check "<path>" "<reason>"
```

Seed `_example` rows may remain; workers skip rows without a `file` field.

#### 1.4 Activate task `[required · once]`

After artifact review, start the task:

```bash
python3 ./.trellis/scripts/task.py start <task-dir>
```

For lightweight tasks, `prd.md` can be enough. For complex tasks, `prd.md`, `design.md`, and `implement.md` must exist and be reviewed before start.

If `task.py start` reports missing session identity, follow its hint, then retry.

#### 1.5 Completion criteria

| Condition | Required |
| --- | :---: |
| `prd.md` exists | yes |
| user confirms task should enter implementation | yes |
| `task.py start` has run | yes |
| `design.md` exists for complex tasks | yes |
| `implement.md` exists for complex tasks | yes |
| `implement.jsonl` / `check.jsonl` curated when needed | recommended |

---

## Phase 2: Execute

Goal: the main session turns reviewed planning artifacts into checked work through channel workers.

#### 2.1 Implement `[required · repeatable]`

Default path:

```bash
TASK=.trellis/tasks/<active-task>
trellis channel create impl-<topic> --scope project --task "$TASK" --ephemeral
trellis channel spawn impl-<topic> \
  --scope project \
  --agent implement \
  --as implement \
  --cwd "$PWD" \
  --timeout 60m \
  --idle-timeout 10m \
  --max-live-workers 4
trellis channel send impl-<topic> --to implement "<implementation brief>"
trellis channel wait impl-<topic> --kind done --from implement --timeout 60m
trellis channel messages impl-<topic> --raw --last 80
```

The `implement` worker reads `.trellis/agents/implement.md`, resolves the active task, reads `implement.jsonl`, each JSONL `file`, `prd.md`, and optional `design.md` / `implement.md`.

The brief must start with `Active task: <task path>` when practical and must state:

- worker goal
- editable scope
- forbidden actions
- validation commands
- expected completion summary

Native host sub-agent fallback is allowed only when the user explicitly asks for it or a host-only capability is required. If using fallback, say why.

#### 2.2 Quality check `[required · repeatable]`

Default path:

```bash
TASK=.trellis/tasks/<active-task>
trellis channel create cr-<topic> --scope project --task "$TASK" --ephemeral
trellis channel spawn cr-<topic> \
  --scope project \
  --agent check \
  --as check \
  --cwd "$PWD" \
  --timeout 30m \
  --idle-timeout 10m \
  --max-live-workers 4
trellis channel send cr-<topic> --to check "<check brief>"
trellis channel wait cr-<topic> --kind done --from check --timeout 30m
trellis channel messages cr-<topic> --raw --last 80
```

The `check` worker reads `.trellis/agents/check.md`, resolves the active task, reads `check.jsonl`, each JSONL `file`, `prd.md`, and optional `design.md` / `implement.md`.

Check workers can fix clear issues directly. The main session reads raw events and makes the final judgment.

For independent cross-provider review, spawn `check-cc` and `check-cx` in the same channel only when needed:

```bash
trellis channel spawn cr-<topic> --agent check --provider claude --as check-cc --cwd "$PWD" --timeout 30m
trellis channel spawn cr-<topic> --agent check --provider codex --as check-cx --cwd "$PWD" --timeout 30m
trellis channel wait cr-<topic> --kind done --from check-cc,check-cx --all --timeout 30m
```

#### 2.3 Rollback `[on demand]`

- If check finds a PRD defect, return to Phase 1, fix artifacts, then redo Phase 2.
- If a worker goes off-track, narrow the brief, redispatch, or revert only the worker's work after confirming scope.
- If more research is needed, write findings into `{TASK_DIR}/research/`, update JSONL manifests if useful, then redispatch.

---

## Phase 3: Finish

Goal: verify quality, capture lessons, and prepare commits without hiding unrelated dirty files.

#### 3.1 Quality verification `[required · repeatable]`

Use `trellis-check` skill or a channel-driven `check` worker for final verification:

- spec compliance
- lint / type-check / tests
- cross-layer consistency when changes span layers
- task artifact alignment

If issues are found, fix and re-check until the remaining risk is explicit.

#### 3.2 Debug retrospective `[on demand]`

If the same class of issue recurred, load `trellis-break-loop` to classify root cause, explain why earlier fixes failed, and propose prevention.

#### 3.3 Spec update `[required · once]`

Load `trellis-update-spec` and decide whether this task produced knowledge worth recording:

- newly discovered patterns or conventions
- pitfalls hit during implementation/check
- new technical decisions
- workflow migration lessons

Update `.trellis/spec/` when there is durable knowledge. If there is nothing to update, state that conclusion and why.

#### 3.4 Commit changes `[required · once]`

The main session drafts a batched commit plan. Do not auto-commit without user confirmation. Do not amend. Do not push.

Steps:

1. Inspect dirty state:
   ```bash
   git status --porcelain
   ```
2. Learn commit style:
   ```bash
   git log --oneline -5
   ```
3. Classify dirty files:
   - **AI-edited this session** — files edited by this session, with known purpose.
   - **Unrecognized** — files not touched by this session. Do not silently include these.
4. Draft logical commit groups. Use one commit per coherent change unit, not one per file.
5. Present the plan once and ask for one-shot confirmation:
   ```text
   Proposed commits (in order):
     1. <message>
        - <file>

   Unrecognized dirty files (NOT in any commit — confirm include/exclude):
     - <file>

   Reply 'ok' / '行' to execute. Reply with edits, or '我自己来' / 'manual' to abort.
   ```
6. On confirmation, run `git add <files>` and `git commit -m "<msg>"` for each batch in order.
7. On rejection, stop and let the user commit manually.

Bookkeeping changes such as smoke task archive and journal updates should be grouped separately from workflow changes.

#### 3.5 Wrap-up reminder

After commits, remind the user to run `/trellis:finish-work` to archive the task and record the session.

---

## Customizing Trellis

This workflow is customized through `.trellis/workflow.md`. Scripts parse headings and workflow-state tags; they do not store a full fallback copy.

### Change a step

Edit the corresponding Phase 1 / 2 / 3 step body and keep matching workflow-state blocks in sync.

### Change per-turn prompt text

Edit the body of the matching `[workflow-state:STATUS]` block. Do not change tag names or syntax.

### Add a custom status

Add:

```text
[workflow-state:my-status]
...
[/workflow-state:my-status]
```

A lifecycle hook or script must write `task.json.status` to that value, otherwise the block is never read.
