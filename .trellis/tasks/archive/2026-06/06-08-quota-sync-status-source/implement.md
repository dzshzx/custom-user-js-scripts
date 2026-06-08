# Implement

1. Add `createSnapshotSyncStatus(backendInfo)` in core lib without pushing the file over 1000 lines.
2. Replace duplicated status logic in `normalizePanelSyncStatus` and `createSnapshotSyncPort`.
3. Extend tests for pending/unavailable status.
4. Run:
   - `npm test`
   - `npm run lint`
5. Inspect diff for duplicated sync capability rules.
