# Implement Codex Quota Compass personal sync architecture

## Goal

Implement the architecture report candidates in order: Snapshot Archive Sync, Quota Panel Readability Model, and Floating Panel Shell. Bump userscript version and push the completed branch.

## Requirements

- Implement the three architecture-report candidates in this order:
  1. Snapshot Archive Sync.
  2. Quota Panel Readability Model.
  3. Floating Panel Shell.
- Keep each candidate independently verifiable through one child Trellis task.
- Preserve standalone userscript installability: no bundler, no npm imports in installable `.user.js` files, and runtime code remains browser JavaScript.
- Treat user personal usage history as the product goal: personal `Snapshot Archive` data must sync across devices by validated merge semantics, not by overwrite.
- Bump the Codex Quota Compass userscript version exactly once for the completed feature set.
- Push the completed implementation branch to the remote.

## Acceptance Criteria

- [x] Child task `06-07-quota-compass-snapshot-archive-sync` is implemented and archived.
- [x] Child task `06-07-quota-compass-readability-model` is implemented and archived.
- [x] Child task `06-07-quota-compass-floating-panel-shell` is implemented and archived.
- [x] `npm test` passes.
- [x] `npm run lint` passes.
- [x] The final diff includes one userscript version bump.
- [x] The final branch is pushed to `origin`.

## Notes

- Source report: `.scratch/reports/architecture-review-20260607-223430.html`.
- User explicitly requested direct execution without additional questions.
