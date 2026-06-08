# State Management

> State patterns for standalone browser userscripts.

---

## Overview

There is no state management library in this repository. Userscript state is
plain JavaScript inside the script IIFE, browser-local persistence through
`localStorage` when needed, and debug-only globals on `window`.

Do not introduce a global state library unless the project also introduces a
bundling/runtime model that justifies it.

---

## State Categories

### Module State

Use module-scope `let` variables inside the IIFE for UI references and
page-lifetime state. The Codex Quota Compass userscript uses this for
`root`, `panel`, `button`, `isPanelOpen`, `isDetailsOpen`, `latestError`,
`latestResult`, `pendingRunPromise`, and related UI flags.

### Persistent Browser State

Use `localStorage` only for non-sensitive preferences or UI state. Namespace
keys to the script, for example `codexQuotaCompassButtonPosition`. Wrap
parsing in `try/catch` and validate the parsed shape before using it, as
`loadButtonPosition()` does.

For userscripts that apply across many sites and need one shared settings
store, prefer userscript manager storage (`GM_getValue` / `GM_setValue`, or
the `GM.getValue` / `GM.setValue` promise API) over page `localStorage`.
Declare the matching metadata grants, keep a `localStorage` fallback only for
managers that do not expose GM storage, and normalize the stored object before
using it. Page `localStorage` is origin-scoped, so it cannot reliably remember
one script's settings across different websites.

For larger structured archives that need export/import or long-lived history,
store one versioned top-level object instead of scattering many ad-hoc keys.
Keep one userscript-manager key as the primary archive location, one
script-scoped `localStorage` fallback key for compatibility, and a dedicated
normalization helper that upgrades legacy shapes when reading. The current
reference is the Codex Quota Compass Snapshot Archive.

When a long-lived archive is also a personal multi-device sync surface, keep
the sync contract separate from the UI. The sync module should expose preview,
merge, export payload, local summary, and storage status methods; callers
should not duplicate merge or dedupe rules. The UI should treat userscript
manager storage as sync-capable only when that manager syncs script values, and
should label `localStorage` fallback as local-only.

When a userscript storage schema changes, keep migration inside the
normalization helper that reads storage. For example, if an old shape stored
`pages` and `sites` at the root and the new shape stores them under
`refresh.pages` and `refresh.sites`, `normalizeSettings()` should accept both
shapes and return one current in-memory shape. This preserves existing user
settings until the next write persists the upgraded shape.

### Debug Globals

Use globals only for intentional debug controls or inspection. Current
examples are `window.__codexQuotaCompassDebug`,
`window.__codexQuotaCompassLastResult`, and
`window.__codexQuotaCompassRunning`. Keep names script-specific and avoid
generic globals.

### Derived State

Compute derived data from API responses in plain helper functions such as
`summarizeRows()`, `summarizeClients()`, and `buildWeeklyEstimate()`. Avoid
persisting derived values unless users need them after reload.

---

## When to Persist State

Persist state only when losing it on reload would hurt the user experience and
the value is safe to store. Current acceptable examples:

- Floating button position.
- Non-sensitive user display preference.

Do not persist access tokens, cookies, Authorization headers, private API raw
responses, account identifiers, or screenshots of private data.

When persisting a history/archive feature, save sanitized computed results
rather than raw private API payloads. Export/import should operate on the same
sanitized archive shape, so a downloaded file can round-trip back into storage
without reconstructing secrets or session data.

---

## Server State

Server state is fetched on demand. Cache only sanitized computed results in
memory for UI reuse. `latestResult` lets the panel reopen without immediately
re-fetching, and `pendingRunPromise` prevents concurrent duplicate runs.

If debug mode is enabled, `window.__codexQuotaCompassLastResult` may expose
the latest computed result for inspection. Keep debug exports opt-in and avoid
including tokens or raw auth/session payloads.

---

## Common Mistakes

- Using `localStorage` for secrets or private API payloads.
- Reusing generic window keys that another script could overwrite.
- Not validating parsed persisted JSON before applying it to the UI.
- Starting multiple overlapping requests for the same button click.
- Persisting computed data that can become stale or misleading.
