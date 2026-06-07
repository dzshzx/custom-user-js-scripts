# Implement Snapshot Archive Sync

## Goal

Deepen personal multi-device Snapshot Archive synchronization with testable merge, preview, status, and adapter semantics.

## Requirements

- Add a testable personal multi-device sync contract for Codex Quota Compass usage history.
- Support previewing an incoming `Snapshot Export` before committing it.
- Preserve merge semantics: valid new snapshots are added, duplicates are skipped, invalid entries are reported, and local archive data is not overwritten.
- Expose sync status that tells the UI whether the current backend is preferred userscript-manager storage or local-only fallback storage.
- Keep manual JSON export/import as the primary sync path and userscript-manager storage as an enhancement.
- Do not add a custom backend, account system, network sync API, or cloud source of truth.

## Acceptance Criteria

- [x] Two simulated device archives can exchange exports and converge to the same snapshot set.
- [x] Re-importing the same export is idempotent and reports skipped duplicates.
- [x] Invalid incoming entries are reported and do not pollute the archive.
- [x] Sync status reports backend id, backend label, whether it is cross-device capable, and a clear reason.
- [x] Existing archive save/export/import behavior remains compatible.
- [x] `npm test` passes for archive and core tests.

## Notes

- This is the first implementation child.
