# Unify Codex Quota sync status source

## Goal

Make Snapshot Archive sync status a single source of truth instead of deriving backend capability in multiple places.

## Requirements

- Preserve user-visible sync banner behavior for GM storage, localStorage fallback, pending, and unavailable states.
- Keep storage adapters responsible only for reporting backend identity.
- Move backend capability and reason derivation into one shared function.
- Avoid adding a second permission or storage policy model.

## Acceptance Criteria

- [x] `createSnapshotSyncPort().getSyncStatus()` and panel view model normalization use the same status derivation.
- [x] Tests cover GM, localStorage, pending, and unavailable status.
- [x] `npm test` and `npm run lint` pass.

## Notes

- Candidate source: "把同步状态变成单一事实源".
- Validation: `npm test` passed 26 tests; `npm run lint` checked 5 userscript files.
