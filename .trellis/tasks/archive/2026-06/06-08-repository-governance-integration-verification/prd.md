# Repository governance integration verification

## Goal

Verify the full repository governance result after child tasks complete, ensuring documentation, specs, scripts, source entrypoints, and tests are consistent.

## Requirements

- Run after the docs/spec, tooling, Web Page Assistant, and Codex Quota Compass governance children are complete or explicitly deferred.
- Verify README/docs/spec/CONTEXT responsibilities do not conflict.
- Verify command references match actual file paths.
- Verify installable userscript entrypoints live in the documented final source layout.
- Verify no unintended userscript `@version` or package version bump occurred.
- Run the repository checks and inspect final diff.

## Acceptance Criteria

- [x] `npm run lint` passes.
- [x] `npm test` passes.
- [x] `git diff --check` passes.
- [x] No stale script path references remain after any moves.
- [x] README, docs, and `.trellis/spec/frontend/` do not duplicate long facts inconsistently.
- [x] `CONTEXT.md` remains glossary-only.
- [x] Userscript metadata identity is preserved; install URLs match the documented final paths unless a child task explicitly planned another change.
- [x] Parent task artifacts are updated with completion evidence.

## Notes

- Parent task: `06-08-repository-structure-docs-governance`.
- This child should be last.
- Verified final layout: installable entrypoints are under
  `src/userscripts/<script-id>/<script-id>.user.js`, with same-script
  support modules beside their entrypoints.
- Stale-path search only found intentional old-path migration notes, a spec
  bridge-release example, and a test fixture.
- README, `docs/index.md`, script docs, and `.trellis/spec/frontend/` now
  separate navigation, human runbooks, implementation rules, and task evidence.
- `CONTEXT.md` remains a glossary for Codex Quota Compass domain terms and
  does not contain runbooks, implementation plans, or task notes.
- Metadata review: package version remains `0.1.6`; installable userscript
  versions remain Web Page Assistant `0.2.6`, Codex Quota Compass `0.2.7`,
  Feishu Preview Image Export `0.1.0`, and example `0.1.0`.
- Feishu tool help was verified at `scripts/feishu/login-qr.mjs --help` and
  `scripts/feishu/export-image.mjs --help`.
- Final validation on 2026-06-08: `npm run lint`, `npm test` (78 tests), and
  `git diff --check` passed; normal `git status --short --untracked-files=all`
  was clean.
