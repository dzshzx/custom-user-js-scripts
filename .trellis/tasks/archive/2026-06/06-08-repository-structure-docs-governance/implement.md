# Implementation Plan

## Planning Gate

- [x] Confirm first-pass scope: user selected full governance (`C`).
- [x] Split physical moves and source refactors into child tasks before starting implementation.
- [ ] Review final `prd.md` and `design.md` before `task.py start`.

## Child Execution Order

1. `06-08-docs-spec-boundaries`
   - Establish the repository responsibility map first.
   - This creates the documentation/spec target that later children must follow.
2. `06-08-local-tooling-script-governance`
   - Apply script/tool placement and command-reference policy.
   - Must update README/docs/spec references if commands or paths move.
3. `06-08-installable-userscript-layout-migration`
   - Move installable userscripts and support modules into the chosen source layout.
   - Must update lint/test discovery, metadata URLs, README/docs/spec references, and manual migration notes.
4. `06-08-web-page-assistant-source-module-split`
   - Reduce the largest userscript file while preserving identity and persisted data under the new source layout.
   - Must run Web Page Assistant tests and full userscript lint.
5. `06-08-codex-quota-panel-module-governance`
   - Reduce remaining oversized Codex Quota Compass panel modules only where source-backed and testable.
   - Must avoid redoing completed architecture work unless current files still show friction.
6. `06-08-repository-governance-integration-verification`
   - Run final repository-wide checks and consistency review.
   - Owns the final parent-level acceptance evidence.

## Risky Files

- `README.md`: currently mixes overview, script runbooks, install notes, conventions, and Git author metadata.
- `.trellis/spec/frontend/directory-structure.md`: already contains source-backed layout guidance; avoid duplicating README text.
- `docs/agents/*`: paths are referenced by AGENTS.md and should remain stable.
- installable userscript paths: old `src/*.user.js` locations may change, but migration must intentionally update `@downloadURL`, `@updateURL`, docs, tests, and manual reinstall/update notes.
- `src/web-page-assistant.user.js`: 2460-line current installable entrypoint; extracting code must preserve metadata identity, grants, storage keys, and runtime behavior even if the path changes.
- `src/codex-quota-compass-panel-shell.lib.js` and `src/codex-quota-compass-panel-renderer.lib.js`: large panel modules that still need test-backed governance after recent architecture work.
- `scripts/*.mjs`: moving these can break README commands or local workflows; child task must update all references and validate commands.

## Parent Completion Checklist

- [ ] All child tasks are archived or explicitly deferred with reason.
- [ ] Final integration child passes `npm run lint` and `npm test`.
- [ ] Final diff has no unintended userscript `@version` or package version bump.
- [ ] README/docs/spec/CONTEXT responsibilities do not contradict each other.
- [ ] Installable userscript entrypoints live in the documented final layout and metadata URLs match their new locations.
- [ ] Manual install migration notes exist for any moved `.user.js` path.
- [ ] Any moved script command has updated documentation and validation evidence.

## Validation Notes

Because `.trellis/` is ignored, normal `git status --short` may not show task artifact changes unless forced or path-specific checks are used. Before committing task artifacts, verify staged paths intentionally.
