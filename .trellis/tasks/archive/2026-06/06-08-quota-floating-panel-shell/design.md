# Design

## Module shape

Add `src/codex-quota-compass-panel-shell.lib.js`.

Export through `globalThis.CodexQuotaCompassPanelShellLib`:

- `createFloatingPanelShell(options)`

The module owns:

- root mounting and idempotency;
- button position persistence;
- dock detection and clamping;
- panel open/close geometry;
- drag handling;
- outside close;
- resize handling;
- injected shell CSS.

The userscript supplies:

- localized markup labels;
- content renderer callbacks;
- action handlers for refresh, tab switching, export, and import.

## Compatibility

Keep DOM class names stable (`cqc-*`) so CSS and tests remain understandable.

The shell module is loaded by `@require`; no bundler is introduced.
