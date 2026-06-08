# Installable userscript layout migration

## Goal

Move installable userscripts and their support modules into a clearer source layout, accepting repository-path migration while preserving userscript identity, persisted data, and verifiable installability.

## Requirements

- Choose a final source layout for installable scripts and related libraries, based on the responsibility map produced by `06-08-docs-spec-boundaries`.
- Move `.user.js` entrypoints and support modules only when the new layout improves locality and navigation.
- Update `scripts/check-userscripts.mjs` so lint discovers installable userscripts in the new layout.
- Update tests and helper loaders so moved modules and entrypoints still load correctly.
- Update README/docs/spec references to moved paths.
- Update `@downloadURL` and `@updateURL` intentionally for moved installable scripts, or document why a script does not use those metadata fields.
- Preserve `@name`, `@namespace`, target hosts, grants, storage keys, and user data unless a task explicitly plans a change.
- Provide manual reinstall/update notes for moved installable scripts because this is a single-user workspace and automatic bridge releases are not required by default.
- Do not bump `@version` unless explicitly requested.

## Acceptance Criteria

- [x] The final installable userscript layout is documented.
- [x] Every installable `.user.js` file is discoverable by `npm run lint`.
- [x] Tests pass after path updates.
- [x] README/docs/spec references point to the new paths.
- [x] Metadata URL changes are intentional and reviewed.
- [x] Manual migration notes exist for any moved installable script.
- [x] `npm run lint`, `npm test`, and `git diff --check` pass.

## Notes

- Parent task: `06-08-repository-structure-docs-governance`.
- Depends on `06-08-docs-spec-boundaries`.
- This child should complete before source-module split tasks.
- Completed migration layout: installable entrypoints and same-script support
  modules now live under `src/userscripts/<script-id>/`.
- `scripts/check-userscripts.mjs` did not need a code change because it already
  recursively scans `src/`; `npm run lint` verified all 4 installable
  `.user.js` files in the new layout.
- `@downloadURL`, `@updateURL`, and Codex Quota Compass `@require` metadata now
  point to the new raw GitHub paths where those metadata fields exist.
- Manual migration notes were added to `docs/scripts/installable-userscripts.md`
  for Web Page Assistant, Codex Quota Compass, and Feishu Preview Image Export.
- Validation on 2026-06-08: `npm run lint`, `npm test` (78 tests), and
  `git diff --check` passed.
