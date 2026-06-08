# Design

## Module shape

Add `src/codex-quota-compass-runtime.lib.js`.

Export through `globalThis.CodexQuotaCompassRuntimeLib`:

- `createDefaultQuotaRuntimeConfig(overrides)`
- `createQuotaRuntime(options)`

`createQuotaRuntime(options).run()` will:

- validate the target host;
- discover the access token from `/api/auth/session`;
- build request headers;
- fetch usage and daily analytics;
- call `coreLib.createQuotaCalculator(...)`;
- return the existing Quota Snapshot result shape.

## Interface

Callers provide adapters:

- `fetchImpl`
- `location`
- `coreLib`
- `now`
- `formatLocalTime`
- `getBrowserTimeZone`

The userscript passes browser adapters. Tests pass in-memory adapters.

## Compatibility

Add a userscript `@require` for the runtime lib. Keep the existing `runCompass()` name so UI orchestration does not change.
