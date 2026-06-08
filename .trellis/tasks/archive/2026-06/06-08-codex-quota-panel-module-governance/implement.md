# Implementation Plan

1. Load `trellis-before-dev` and read applicable frontend specs.
2. Read current panel files and tests:
   - `src/codex-quota-compass-panel-shell.lib.js`
   - `src/codex-quota-compass-panel-renderer.lib.js`
   - `src/codex-quota-compass-panel-view-model.lib.js`
   - panel, runtime, archive, and sync tests.
3. Identify actual remaining friction and choose the smallest extraction candidate.
4. Extract one focused module or consolidate duplicated logic only when it improves locality and testability.
5. Add or update tests for the module interface.
6. Run targeted Codex Quota Compass tests.
7. Run:
   - `npm run lint`
   - `npm test`
   - `git diff --check`
8. Review for accidental metadata, domain-language, or panel behavior drift.
9. Confirm any path metadata still matches the post-migration layout.

## Risk Notes

- Do not re-implement view-model decisions in renderer code.
- Do not introduce hidden fallback UI behavior.
- Do not expand `CONTEXT.md` unless a real domain term is resolved.
