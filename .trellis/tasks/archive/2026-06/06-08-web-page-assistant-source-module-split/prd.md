# Web Page Assistant source module split

## Goal

Reduce the Web Page Assistant installable script from a 2460-line monolith into a smaller entrypoint plus focused in-repo modules, using the source layout established by the migration child and preserving userscript identity, persisted data, and user-visible behavior.

## Requirements

- Work from the post-migration Web Page Assistant path, not necessarily the old `src/web-page-assistant.user.js` path.
- Preserve userscript identity (`@name` + `@namespace`), grants, match behavior, storage keys, and menu commands unless a specific change is planned and tested.
- Treat path metadata such as `@downloadURL` and `@updateURL` as already handled by the layout-migration child unless this child creates another path change.
- Extract only stable behavior with existing or new Node tests.
- Prefer existing local module style used by other userscript support files, such as `*.lib.js` loaded by tests and attached to a script-specific global when needed.
- Do not bump `@version` unless explicitly requested.
- Avoid redesigning UI; this child is about module shape and testability.

## Acceptance Criteria

- [x] The Web Page Assistant installable entrypoint is materially smaller and remains the only Web Page Assistant installable script.
- [x] Extracted modules have focused responsibilities and tests.
- [x] Existing Web Page Assistant tests pass.
- [x] `npm run lint` and `npm test` pass.
- [x] No metadata identity, storage key, or path URL changes are introduced accidentally.
- [x] `git diff --check` passes.

## Notes

- Parent task: `06-08-repository-structure-docs-governance`.
- Depends on documentation/spec governance and installable-userscript layout migration for final module-placement rules.
- Completed split: the installable entrypoint now depends on same-directory
  settings, storage, and refresh support modules through `@require`.
- Entry line count changed from 2460 lines to 1982 lines while remaining the
  only Web Page Assistant `.user.js` installable script.
- The settings, storage, and refresh tests now import the extracted libraries
  directly and assert the entrypoint metadata requires each library.
- Metadata review: `@name`, `@namespace`, `@version`, `@match`, `@grant`,
  `@downloadURL`, and `@updateURL` stayed stable; only intentional `@require`
  lines were added.
- Validation on 2026-06-08: Web Page Assistant targeted tests passed, then
  `npm run lint`, `npm test` (76 tests), and `git diff --check` passed.
