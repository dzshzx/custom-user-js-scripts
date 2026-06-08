# Implement

1. Add `src/codex-quota-compass-contract.lib.js`.
2. Update `@require` order so contract loads before core and archive.
3. Update core panel view model to use `createQuotaSnapshotAccess`.
4. Update archive snapshot creation and dedupe identity to use contract helpers.
5. Update tests to import the contract before dependent libs.
6. Run:
   - `npm test`
   - `npm run lint`
7. Inspect diff for duplicate contract logic or export-format drift.
