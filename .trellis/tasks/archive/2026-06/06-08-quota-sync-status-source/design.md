# Design

## Module shape

Add one shared sync-status derivation function to `CodexQuotaCompassCoreLib`:

- `createSnapshotSyncStatus(backendInfo)`

The function returns:

- `backendId`
- `backendLabel`
- `crossDeviceCapable`
- `localOnly`
- `reason`

`createSnapshotSyncPort().getSyncStatus()` uses it. `createQuotaPanelViewModel()` uses it when it receives only storage backend information.

## Compatibility

Keep existing banner title/detail keys. This change should be behavior-preserving.
