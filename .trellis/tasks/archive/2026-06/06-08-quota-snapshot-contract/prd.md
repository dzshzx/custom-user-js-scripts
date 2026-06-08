# Converge Codex Quota snapshot contract

## Goal

Centralize access to the Quota Snapshot result shape so UI and archive code stop duplicating Chinese-key traversal and identity rules.

## Requirements

- Provide one module for rolling period lookup, main seven-day window identity, period access, and archive projection.
- Preserve the existing exported Snapshot Archive format and import compatibility.
- Keep existing domain vocabulary: Quota Snapshot, Snapshot Archive, Snapshot Export, Snapshot Import, Snapshot ID, Sync Path.
- Avoid hidden fallback or parallel contract rules.

## Acceptance Criteria

- [x] Core panel view model consumes the shared contract module for result access.
- [x] Archive snapshot creation consumes the shared contract module for projection.
- [x] Existing archive round-trip, legacy snapshot, and panel view model tests still pass.
- [x] `npm test` and `npm run lint` pass.

## Notes

- Candidate source: "收敛 Quota Snapshot 结果契约".
- Validation: `npm test` passed 25 tests; `npm run lint` checked 5 userscript files.
