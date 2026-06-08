# Local tooling and script directory governance

## Goal

Define and apply a clear policy for local Node tools under `scripts/`, including when tools stay as direct commands, when they become package scripts, and when related tools deserve subdirectories.

## Requirements

- Classify existing tools:
  - `scripts/check-userscripts.mjs` is a repository validator behind `npm run lint`.
- `scripts/feishu/login-qr.mjs` and `scripts/feishu/export-image.mjs` are operational Feishu Playwright utilities grouped by platform.
- Move Feishu utilities under `scripts/feishu/` and update every reference in the same child task.
- If paths move, update every README/docs/spec/package reference in the same child task.
- Keep existing tool behavior intact unless a behavior change is explicitly required and tested.
- Do not change userscript source behavior or metadata versions in this child task.

## Acceptance Criteria

- [x] `scripts/` placement rules are documented in docs or spec.
- [x] Existing tools are classified by responsibility.
- [x] Moved Feishu tools have all command references updated.
- [x] `npm run lint` still works.
- [x] Feishu utility help commands still work after any path changes.
- [x] `npm test` and `git diff --check` pass.

## Notes

- Parent task: `06-08-repository-structure-docs-governance`.
- Depends on `06-08-docs-spec-boundaries` for final documentation targets.
- Completed changes:
  - Kept `scripts/check-userscripts.mjs` at `scripts/` root as the repository validator behind `npm run lint`.
  - Moved Feishu operational tools to `scripts/feishu/login-qr.mjs` and `scripts/feishu/export-image.mjs`.
  - Updated docs, spec, help output, and parent task facts for the new paths.
- Validation:
  - `npm run lint` passed, checked 4 userscript files.
  - `npm test` passed, 78 tests.
  - `node scripts/feishu/login-qr.mjs --help` passed.
  - `node scripts/feishu/export-image.mjs --help` passed.
  - `git diff --check` passed.
