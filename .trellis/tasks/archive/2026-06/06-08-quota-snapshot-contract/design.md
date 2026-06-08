# Design

## Module shape

Add `src/codex-quota-compass-contract.lib.js`.

Export through `globalThis.CodexQuotaCompassContractLib`:

- `rollingPeriodKey(result)`
- `isMainSevenDayWindow(row)`
- `createQuotaSnapshotAccess(result)`
- `projectQuotaSnapshotForArchive(result)`

## Data flow

`createQuotaCalculator()` continues to build the existing result shape.

The contract module becomes the only reader for:

- rolling period key selection;
- main seven-day window identity;
- `sinceReset`, `monthToDate`, and `rolling` period access;
- archive projection fields.

Core and archive libs require this contract module before attaching their exports.

## Compatibility

Snapshot Export stays version `1`; storage schema stays version `1`.
