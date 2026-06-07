# Design: Quota Panel Readability Model

## Module Shape

Deepen `createQuotaPanelViewModel()` instead of adding a new UI framework. The function should return view-ready data that the userscript shell can render without re-deciding sync semantics.

## Model Additions

- `syncStatus`: normalized result from the sync port.
- `syncBanner`: compact status text and tone.
- `archiveHealth`: archive count and last capture summary.
- `transfer`: note text plus import/export actions.
- `primaryMetrics`: ordered hero metrics.

## Rendering

Keep the userscript renderer as plain string/DOM helpers for now. Replace scattered sync/transfer decisions with model reads.

## Compatibility

Existing fields such as `weekly`, `sinceReset`, `month`, `rolling`, `history`, and `archive` remain available.
