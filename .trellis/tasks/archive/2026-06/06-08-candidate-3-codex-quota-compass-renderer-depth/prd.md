# Candidate 3 Codex Quota Compass renderer depth

## Goal

Implement report candidate 3 by narrowing Codex Quota Compass panel renderer and moving style/view responsibilities behind deeper modules.

## Requirements

- Narrow `codex-quota-compass-panel-renderer.lib.js` by moving style and/or view rendering responsibilities behind deeper modules.
- Keep `createQuotaPanelRenderer` as the stable external renderer interface used by the entrypoint.
- Preserve Codex Quota Compass result rendering, loading state, error state, archive workspace actions, compact mobile tables, and style installation behavior.
- Add or update `@require` metadata for any new support modules.
- Keep Snapshot Archive and Sync Path domain behavior unchanged.
- Do not bump `@version` in this child task.

## Acceptance Criteria

- [x] `codex-quota-compass-panel-renderer.lib.js` is materially smaller and below the 600-line soft target when practical.
- [x] Renderer style/view responsibilities are behind named script-scoped modules.
- [x] Existing panel renderer and panel view model tests pass.
- [x] `npm test` passes.
- [x] `npm run lint` passes.
- [ ] Child changes are committed before parent final integration.

## Notes

- This is report candidate 3 and runs after both Web Page Assistant children.
