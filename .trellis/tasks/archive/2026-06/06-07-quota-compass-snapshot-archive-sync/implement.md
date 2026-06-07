# Implementation Plan

1. Read frontend state, type-safety, hook, and component guidelines.
2. Add failing tests for two-device convergence, idempotent re-import, invalid preview reporting, and sync status.
3. Implement archive preview helper without writing storage.
4. Deepen `createSnapshotSyncPort` with new sync methods and compatibility aliases.
5. Update the userscript storage port to expose sync-capability metadata.
6. Run `npm test`.
7. Run `npm run lint`.
8. Review diff for hidden fallback, second fact sources, and broad unrelated changes.
