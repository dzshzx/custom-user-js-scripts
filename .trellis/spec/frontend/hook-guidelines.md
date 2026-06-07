# Hook Guidelines

> DOM lifecycle, browser event, and fetch patterns for userscripts.

---

## Overview

This project does not use React hooks. In this repository, "hook" means the
places where a userscript attaches to the host page: metadata `@run-at`,
DOMContentLoaded helpers, event listeners, resize handlers, pointer events,
userscript manager menu commands, and fetch wrappers.

---

## Lifecycle Patterns

The default userscript lifecycle is:

1. Put metadata at the top of `src/*.user.js`.
2. Use `@run-at document-idle` unless the feature explicitly needs earlier
   DOM access.
3. Wrap runtime code in an IIFE with `'use strict'`.
4. Create UI idempotently by checking for the root id before inserting DOM.

When a script needs to wait for the DOM, use the pattern in
`snippets/dom-ready.js`: if `document.readyState` is `loading`, listen once
for `DOMContentLoaded`; otherwise run immediately.

---

## Event Listener Patterns

Keep event listener installation in named functions. Current examples:

- `installDrag()` owns pointer events and pointer capture for the floating
  button.
- `installOutsideClose()` owns outside-click handling.
- `createUi()` owns root click delegation using `[data-action]`.
- A single `resize` listener keeps the floating button and panel within the
  viewport.

Prefer event delegation from the script root when multiple UI controls share
the same action model. Use `event.composedPath()` when available so outside
click detection works across composed DOM paths.

If a future script installs observers, intervals, or page-route hooks, keep
their cleanup function near the installer and avoid accumulating duplicate
listeners during SPA navigation.

For archive import/export actions that are infrequent and high-friction, prefer
userscript manager menu commands over adding every action to the injected panel.
Menu commands are a good fit for file-pick flows, explicit export actions, and
other operations that do not need to be visible during normal page use.

---

## Data Fetching

Use native `fetch` inside userscripts. Keep one helper responsible for
request options and error handling. The current reference is `apiGet(path)` in
`src/codex-quota-compass.user.js`, which:

- Uses `credentials: 'include'` for same-origin authenticated page APIs.
- Adds an Authorization header only after an access token is discovered.
- Checks `res.ok` before parsing success JSON.
- Reads a bounded error body snippet for non-401 failures.
- Throws a specific 401 message with recovery steps.

Do not log access tokens, cookies, raw session responses, or raw private API
payloads in normal mode.

---

## Naming Conventions

- Installer functions use `install*`, for example `installStyles()` and
  `installDrag()`.
- Render functions use `render*`, for example `renderResult(result)`.
- DOM creation entry points use `create*`, for example `createUi()`.
- Async operations use action names such as `runCompass()` or
  `runAndReport(options)`.
- Predicate helpers use `is*`, for example `isUsagePage()` and
  `isDebugEnabled()`.

---

## Common Mistakes

- Depending on page DOM before it exists.
- Installing duplicate listeners when a userscript reruns.
- Letting background fetches race and overwrite newer UI state.
- Calling private APIs without `res.ok` checks.
- Treating debug-only output as safe for normal users.
