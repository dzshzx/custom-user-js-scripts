# Design: Codex Quota Compass Personal Sync Architecture

## Boundaries

- Parent task owns ordering, shared acceptance criteria, version bump, and final push.
- Child tasks own implementation work:
  - `Snapshot Archive Sync`: sync contract, merge preview, storage status, tests.
  - `Quota Panel Readability Model`: testable panel display model for sync and archive status.
  - `Floating Panel Shell`: reusable panel geometry and interaction shell.

## Shared Contracts

- `Snapshot Archive` remains the durable local personal history.
- `Snapshot Export` / `Snapshot Import` remain versioned JSON transfer contracts.
- `Snapshot ID` remains the primary dedupe key.
- `localStorage` remains a compatibility fallback and must be presented as local-only.
- Userscript manager storage remains the preferred cross-device storage path when the manager syncs script values.

## Rollout Shape

- Keep changes in the current standalone userscript architecture.
- Add tests around new pure helpers before relying on UI behavior.
- Bump `@version` and `SCRIPT_VERSION` after all child work is complete.
