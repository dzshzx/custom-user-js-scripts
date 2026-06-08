# Design

## Scope Boundary

Treat this as a parent governance task. The parent owns the scope map, ordering, and final integration review. Direct implementation belongs in child tasks so each governance dimension remains reviewable and reversible.

The user selected full governance, so documentation/spec boundaries, script/tooling structure, installable userscript layout migration, and source-module large-file governance are all in scope. Historical cleanup and public architecture-report publishing remain out of scope unless explicitly requested later.

The installable script path is no longer treated as immovable. Because this is a single-user workspace, a clearer source layout can move `.user.js` files and support modules when the migration is documented and verified.

## Responsibility Map

### `README.md`

Role: public project entrypoint.

It should answer what this repository is, how to install or run the most common checks, where to find script-specific instructions, and which documents are canonical for deeper guidance.

It should not hold every detailed runbook. Detailed Feishu flows, long troubleshooting steps, and script-specific operational notes should move under `docs/` with README links.

### `CONTEXT.md`

Role: domain glossary.

It should define stable product/domain terms such as `Quota Snapshot` and `Snapshot Archive`. It should not contain implementation checklists, task status, changelog entries, or one-off script runbooks.

### `docs/`

Role: human-facing project documentation and runbooks.

Proposed sub-areas:

- `docs/scripts/` for script-specific usage notes and runbooks.
- `docs/guides/` or existing root docs for project-wide conventions that are useful to humans.
- `docs/agents/` remains engineering-skill configuration and should not mix with user-facing script documentation.

The exact subdirectory names can be adjusted during implementation, but the final model must keep user-facing docs separate from agent configuration.

### `.trellis/spec/`

Role: implementation rules for future coding tasks.

Rules here should be concrete, source-backed, and testable. They can refer to README/docs for human navigation, but they should not duplicate long user-facing instructions.

### `.trellis/tasks/`

Role: task planning and historical execution context.

Archived task artifacts are not project documentation. They can be referenced when reconstructing decisions, but README/docs/spec should not depend on readers browsing task archives.

### `scripts/`

Role: local Node tooling.

The governance rule should distinguish:

- repository validators that should be exposed through `package.json`;
- operational utilities that can remain direct `node scripts/*.mjs` commands;
- script families that may deserve grouping only when multiple related tools share setup, fixtures, or outputs.

### Installable userscript source layout

Role: installable userscripts, support modules, reusable snippets, and tests.

The final layout may replace flat `src/*.user.js` with script-scoped folders when that improves locality. A path migration must update lint/test discovery, docs, metadata URLs, and any manual reinstall instructions in the same child task.

## Child Task Map

### 1. `06-08-docs-spec-boundaries`

Define and apply README/docs/CONTEXT/spec boundaries. This should run first because later tooling and source tasks need stable documentation targets.

### 2. `06-08-local-tooling-script-governance`

Decide and apply local tooling placement. This may include package script exposure or script-directory grouping, but it must preserve existing commands or update every reference in the same child task.

### 3. `06-08-installable-userscript-layout-migration`

Move installable userscripts and support modules into the chosen repository layout. This child owns metadata URL updates, lint/test discovery, README/docs references, and manual migration notes.

### 4. `06-08-web-page-assistant-source-module-split`

Reduce the large Web Page Assistant installable script by extracting stable in-repo library modules under the new source layout. Preserve userscript identity and persisted settings, not necessarily the old path.

### 5. `06-08-codex-quota-panel-module-governance`

Reassess the remaining oversized Codex Quota Compass panel modules after recent architecture work and apply only source-backed, testable reductions.

### 6. `06-08-repository-governance-integration-verification`

Run the final cross-child verification: docs/spec consistency, command references, userscript installability, tests, lint, and final diff review.

## Compatibility

- Existing userscript install URLs may change only through the dedicated layout-migration child, with updated metadata and manual migration notes.
- Existing npm commands must keep working.
- Existing `docs/agents/*` paths should remain stable because AGENTS.md points to them.
- Hidden Trellis/agent files remain governed by `.gitignore`; if they are committed, staging must be intentional and path-scoped.

## Rollback

Each child task should produce a narrow commit or a narrow set of commits. If a child task moves files, that child owns the link-update and rollback plan. The parent rollback strategy is to revert child commits in reverse dependency order.
