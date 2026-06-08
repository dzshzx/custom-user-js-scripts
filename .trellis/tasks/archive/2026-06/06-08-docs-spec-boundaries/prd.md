# Document and spec responsibility boundaries

## Goal

Define and apply the repository documentation responsibility model so README, docs, CONTEXT, and Trellis specs stop competing as overlapping fact sources.

## Requirements

- Keep `README.md` as a concise project entrypoint and navigation surface.
- Move or link detailed script runbooks into appropriate `docs/` pages instead of expanding README.
- Preserve `CONTEXT.md` as a domain glossary only.
- Preserve `docs/agents/*` as engineering-skill configuration and do not mix it with user-facing script docs.
- Update `.trellis/spec/frontend/` only with concrete implementation rules and repository-structure conventions, not user-facing runbook prose.
- Document the final responsibility map in at least one durable source and keep README links aligned with it.
- Define the target source-layout policy, including whether installable userscripts should remain flat or move into script-scoped folders.
- Do not physically rename or move installable userscript entrypoints in this child task; the migration child owns file moves.
- Do not bump userscript `@version` or package version.

## Acceptance Criteria

- [x] README clearly points to script docs, project conventions, and checks without embedding every detailed runbook.
- [x] A docs responsibility model exists and separates user-facing docs from `docs/agents/*`.
- [x] `CONTEXT.md` remains glossary-only; no repository governance prose is added there.
- [x] `.trellis/spec/frontend/` documents the implementation-facing repository structure policy without duplicating README.
- [x] No installable userscript files are moved or behavior-edited in this child.
- [x] `npm run lint`, `npm test`, and `git diff --check` pass after changes.

## Notes

- Parent task: `06-08-repository-structure-docs-governance`.
- This child should run before script/tooling and source-module governance children.
- Completed changes:
  - Slimmed `README.md` into a project entrypoint.
  - Added `docs/index.md`.
  - Added `docs/scripts/installable-userscripts.md`.
  - Added `docs/scripts/feishu-tools.md`.
  - Updated script template and frontend specs with documentation/source-layout responsibilities.
- Validation:
  - `npm run lint` passed, checked 4 userscript files.
  - `npm test` passed, 78 tests.
  - `git diff --check` passed.
