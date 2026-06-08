# Candidate 1 Web Page Assistant startup module

## Goal

Implement report candidate 1 by turning Web Page Assistant marker seams into script-scoped support modules and slimming the installable entrypoint.

## Requirements

- Promote existing Web Page Assistant marker-tested runtime blocks into script-scoped support modules.
- Extract these modules from `web-page-assistant.user.js`:
  - `createWebPageAssistantSession`
  - `createWidgetLayoutRuntime`
  - `createUnlockerRuntime`
- Add metadata `@require` entries for the new support modules.
- Keep the installable entrypoint responsible for metadata, dependency checks, browser adapters, and startup wiring.
- Keep existing behavior for refresh settings, countdown restart, widget drag, and unlocker capabilities.
- Update tests to load the formal support modules instead of slicing those blocks from the installable entrypoint.
- Do not bump `@version` in this child task.

## Acceptance Criteria

- [x] New support modules are present under `src/userscripts/web-page-assistant/`.
- [x] `web-page-assistant.user.js` no longer contains the extracted marker blocks.
- [x] Existing tests for session, widget layout runtime, and unlocker runtime pass against formal modules.
- [x] `npm test` passes.
- [x] `npm run lint` passes.
- [x] Child changes are committed before child 2 starts.

## Notes

- This is report candidate 1 and must run before candidate 2.
