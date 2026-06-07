# Design: Snapshot Archive Sync

## Module Shape

Deepen `createSnapshotSyncPort` in `src/codex-quota-compass-core.lib.js` while keeping `src/codex-quota-compass-archive.lib.js` as the archive merge authority.

## Interfaces

- Archive library:
  - Add `previewImportArchiveDocument(currentArchive, documentObject)` as a pure validation and merge-preview helper.
  - Keep `importArchiveDocument()` as the write path.
- Sync port:
  - Add `getLocalSummary()`.
  - Add `saveLocalSnapshot(result)`.
  - Keep `saveLatestResult(result)` as a compatibility alias.
  - Add `buildSyncPayload()`.
  - Keep `exportArchive()` as a compatibility alias.
  - Add `previewIncomingArchive(documentObject)`.
  - Add `mergeIncomingArchive(documentObject)`.
  - Keep `importArchiveDocument(documentObject)` as a compatibility alias.
  - Add `getSyncStatus()`.

## Backend Status

Use backend metadata supplied by the userscript storage port:

- `gm`: preferred and sync-capable when the userscript manager syncs values.
- `localStorage`: local-only fallback.
- `pending`: not loaded yet.

The core sync module should not know Tampermonkey implementation details. It only receives backend metadata and converts it into user-facing sync semantics.

## Compatibility

Existing menu commands and panel actions can keep calling compatibility methods until the readability model child rewires UI display.
