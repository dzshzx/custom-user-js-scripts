# Repository structure and documentation governance

## Goal

Establish a clear repository governance model for this browser userscript workspace so humans and agents can quickly answer:

- where installable userscripts, helper libraries, snippets, local tools, and tests belong;
- which document is the canonical source for project overview, domain terms, user-facing runbooks, agent guidance, implementation specs, and historical task notes;
- how future scripts and local tools should be added without turning `README.md`, `docs/`, `scripts/`, or `.trellis/spec/` into overlapping catch-all areas.

This is the parent task for full repository governance. It owns the overall scope, child-task map, ordering, and final integration review. Implementation work should happen in child tasks so documentation changes, script/tooling moves, and source-module refactors remain independently reviewable.

## Confirmed Facts

- The repository is a private Node ESM workspace for standalone browser userscripts; `package.json` exposes `npm run lint` and `npm test`.
- `README.md` is currently 129 lines and combines project overview, quick start, command reference, detailed Feishu login/export runbooks, install notes for specific userscripts, development conventions, and Git author metadata.
- `CONTEXT.md` currently acts as a domain glossary for Codex Quota Compass terms such as `Quota Snapshot`, `Snapshot Archive`, `Snapshot Export`, `Snapshot Import`, and `Sync Path`.
- `docs/` currently contains `frontend-design-guidelines.md`, `script-template.md`, and `docs/agents/*` configuration files for engineering skills.
- `.trellis/spec/frontend/` already contains source-backed userscript implementation guidance, including directory structure, metadata, versioning, UI, hook, state, quality, and type-safety rules.
- `scripts/` contains one repository validator (`check-userscripts.mjs`) and Feishu Playwright utilities grouped under `scripts/feishu/`.
- Installable userscripts and same-script support modules now live under `src/userscripts/<script-id>/`; migration kept userscript identity and storage keys stable while updating metadata URLs where present.
- Web Page Assistant now keeps settings, storage, and refresh support logic in
  same-directory libraries loaded by the installable entrypoint through
  `@require`; the entrypoint remains the only installable Web Page Assistant
  `.user.js` file.
- Codex Quota Compass panel shell now separates shell markup and shell styles
  into same-directory support libraries loaded before the shell module through
  `@require`; the shell module dropped below 600 lines without changing panel
  behavior or userscript identity.
- `.gitignore` ignores `.agents/`, `.codex/`, `.trellis/`, `AGENTS.md`, and `.scratch/`; task/spec changes can be invisible to normal `git status` unless checked intentionally.
- Recent archived tasks already handled Web Page Assistant install-entrypoint cleanup and Codex Quota Compass module architecture work. This governance task should not reopen those implementation details unless they affect repository-level structure or documentation rules.
- Some source files are large: `src/web-page-assistant.user.js` is 2460 lines, `src/codex-quota-compass-panel-shell.lib.js` is 950 lines, and `src/codex-quota-compass-panel-renderer.lib.js` is 813 lines. Full governance includes these as child-task source-module refactor candidates.
- The user confirmed this is a single-user repository and install migration cost is low, so full governance may move installable userscripts away from the current `src/*.user.js` layout when the target structure is clearer.

## Requirements

- Define the intended responsibility of each top-level project area: `README.md`, `CONTEXT.md`, `docs/`, `docs/agents/`, `.trellis/spec/`, `.trellis/tasks/`, `scripts/`, `snippets/`, `src/`, and `test/`.
- Define a README policy that keeps it as an entrypoint and navigation surface rather than the home for every detailed script runbook.
- Define a `docs/` policy that separates user-facing script notes/runbooks from agent configuration and project conventions.
- Define a `CONTEXT.md` policy that keeps it as a domain glossary and prevents it from becoming a requirements document, implementation spec, changelog, or task scratchpad.
- Define a `.trellis/spec/` policy that keeps implementation rules source-backed, concrete, and non-duplicative with README or ordinary docs.
- Define a `scripts/` policy for when a local tool stays as a plain script, when it should be exposed through `package.json`, and when related tools should be grouped or split.
- Allow installable userscript entrypoints to move when the new layout is documented and every repository reference is updated.
- Preserve userscript identity and user data by default: keep `@name`, `@namespace`, storage keys, grants, and target hosts stable unless a child task explicitly plans a change.
- Treat `@downloadURL` and `@updateURL` as migration artifacts: update them intentionally when paths move, and document any manual reinstall/update step the user needs.
- Do not bump userscript `@version` or package version during ordinary governance work unless the user explicitly asks for a version update.
- Track the full scope as child tasks so each deliverable can be planned, implemented, checked, committed, and archived independently.
- Require a final integration pass after all child tasks complete.

## Child Task Map

1. `06-08-docs-spec-boundaries`: define and apply README/docs/CONTEXT/spec responsibility boundaries.
2. `06-08-local-tooling-script-governance`: define and apply local tooling placement, package script exposure, and script-directory policy.
3. `06-08-installable-userscript-layout-migration`: move installable userscripts and support modules into the chosen source layout, updating metadata URLs, lint/test discovery, and docs.
4. `06-08-web-page-assistant-source-module-split`: reduce the Web Page Assistant installable script from a large monolith while preserving identity and persisted data.
5. `06-08-codex-quota-panel-module-governance`: finish panel-module governance for oversized Codex Quota Compass panel files without reopening completed architecture work unnecessarily.
6. `06-08-repository-governance-integration-verification`: verify the integrated result across docs, specs, scripts, source entrypoints, tests, and task artifacts.

## Acceptance Criteria

- [x] `prd.md` captures the governance scope, confirmed facts, requirements, non-goals, and open decisions.
- [x] Complex-task planning includes `design.md` and `implement.md` before any repository files outside the task directory are modified.
- [x] The final plan contains a concrete repository responsibility map with no ambiguous catch-all bucket for docs or scripts.
- [x] The final plan identifies which changes can be made safely in this task and which should become child tasks.
- [x] Each child task has its own `prd.md`; complex child tasks have `design.md` and `implement.md` before they start.
- [x] Child tasks complete in an order that avoids broken install, command, or documentation references.
- [x] The final plan distinguishes stable userscript identity/data from path-level install migration.
- [x] Any installable userscript path migration updates metadata URLs, docs, lint discovery, tests, and manual migration notes together.
- [x] The integration child verifies the combined result after the implementation children finish.
- [x] If implementation proceeds, changed docs/specs are checked for duplicated facts, stale links, and contradiction with current `.trellis/spec/frontend/` rules.
- [x] If implementation proceeds, relevant verification commands are run; at minimum `npm run lint` and `npm test` remain passing when source or tooling behavior is affected.
- [x] End-of-task diff review confirms no hidden fallback, duplicate rule source, silent script behavior change, or unintended userscript version bump was introduced.

## Non-Goals

- Do not perform implementation directly in this parent task beyond planning, task-tree maintenance, and final integration coordination.
- Do not redesign injected userscript UI.
- Do not delete `.trellis/tasks/archive/`, `.trellis/.backup-*`, `.scratch/reports/`, or other historical/local artifacts without a separate explicit cleanup decision.
- Do not publish a new architecture report unless the user explicitly requests report output.
- Do not change package or userscript versions unless explicitly requested.

## Resolved Scope Decision

The user chose full governance (`C`): documentation/spec governance, script/tooling directory governance, and source-level large-file governance are all in scope. The implementation shape is parent + child tasks rather than one broad parent implementation.

The user later clarified that moving installable userscripts inside the repository is acceptable because this is currently a single-user workspace and install migration cost is low. Planning now allows path migration, while still protecting userscript identity, metadata intent, and persisted settings.

## Notes

- Evidence gathered from `README.md`, `CONTEXT.md`, `docs/`, `.trellis/spec/frontend/`, `.gitignore`, `package.json`, `scripts/`, `src/`, `test/`, and recent archived Trellis tasks.
- Final integration completed on 2026-06-08. All six child tasks completed:
  docs/spec boundaries, local tooling governance, installable userscript layout
  migration, Web Page Assistant module split, Codex Quota Compass panel
  governance, and integration verification.
- Final repository checks passed: `npm run lint`, `npm test` (78 tests), and
  `git diff --check`.
- Final ordinary `git status --short --untracked-files=all` was clean after
  implementation commits; `.trellis` task archives remain force-added in their
  dedicated archive commits because the repository ignores `.trellis/`.
