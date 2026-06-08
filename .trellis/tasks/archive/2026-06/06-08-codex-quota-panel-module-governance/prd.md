# Codex Quota Compass panel module governance

## Goal

Govern the remaining oversized Codex Quota Compass panel modules so panel shell and renderer code stay navigable, testable, and aligned with the existing Snapshot Archive domain language.

## Requirements

- Reassess current files before changing them; do not assume previous architecture report candidates still apply.
- Focus on oversized current modules:
  - `src/codex-quota-compass-panel-shell.lib.js` at 950 lines.
  - `src/codex-quota-compass-panel-renderer.lib.js` at 813 lines.
- Work from the post-migration Codex Quota Compass path and preserve it as the only Codex Quota Compass installable entrypoint.
- Preserve `CONTEXT.md` terms: `Quota Snapshot`, `Snapshot Archive`, `Snapshot Export`, `Snapshot Import`, and `Sync Path`.
- Avoid reopening completed child tasks unless current source shows real remaining friction.
- Do not bump `@version` unless explicitly requested.

## Acceptance Criteria

- [x] The task identifies current panel-module friction from source and tests, not only from older report history.
- [x] Any extraction or consolidation produces smaller, clearer panel modules with focused tests.
- [x] Existing Codex Quota Compass tests pass.
- [x] `npm run lint`, `npm test`, and `git diff --check` pass.
- [x] No user-visible panel behavior, userscript identity metadata, storage key, or path URL changes are introduced accidentally.

## Notes

- Parent task: `06-08-repository-structure-docs-governance`.
- Related archived tasks already split several Codex Quota Compass modules. This child should be evidence-led and narrow.
- Source reassessment on 2026-06-08 found the current panel shell at 950
  lines, with a large inline CSS generator mixed into DOM mounting, drag,
  docking, and panel open/close state.
- Completed extraction: shell markup and shell styles now live in focused
  same-script libraries loaded before `codex-quota-compass-panel-shell.lib.js`
  through `@require`.
- The shell module line count dropped from 950 to 576 lines. Renderer remains
  unchanged because the current source review found a smaller, safer shell
  extraction candidate first.
- Added direct tests for shell markup escaping/action stability and style
  generation constants, while existing shell, renderer, and view-model tests
  continue to pass.
- Metadata review: `@name`, `@namespace`, `@version`, `@match`, `@grant`,
  `@downloadURL`, and `@updateURL` stayed stable; only intentional `@require`
  lines were added for the new same-script support libraries.
- Validation on 2026-06-08: Codex panel targeted tests passed, then
  `npm run lint`, `npm test` (78 tests), and `git diff --check` passed.
