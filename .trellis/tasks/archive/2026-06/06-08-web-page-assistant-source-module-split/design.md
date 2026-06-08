# Design

## Module Boundary

The installable entrypoint remains the single Web Page Assistant `.user.js` file, but its path may have changed in `06-08-installable-userscript-layout-migration`. Extracted modules should sit near that entrypoint under the new source layout.

Candidate extraction areas must be chosen after reading the current file and tests. Likely candidates include settings contracts, storage/runtime ports, dialog behavior, refresh/session runtime, unlocker capability runtime, or installable block loading if they are still implemented inline.

## Constraints

- Keep userscript manager identity metadata stable.
- Keep storage keys and persisted settings compatible.
- Keep behavior covered by existing tests before moving more code.
- Do not introduce a bundler unless a separate decision task approves it.

## Test Surface

Use current Web Page Assistant tests as the external behavior guard:

- `test/web-page-assistant-dialog-contract.test.mjs`
- `test/web-page-assistant-refresh-runtime.test.mjs`
- `test/web-page-assistant-session-runtime.test.mjs`
- `test/web-page-assistant-settings.test.mjs`
- `test/web-page-assistant-storage-port.test.mjs`
- `test/web-page-assistant-unlocker-capability-runtime.test.mjs`
- `test/web-page-assistant-widget-layout-runtime.test.mjs`

Add focused tests for any newly extracted module when existing tests do not already exercise its interface.

## Rollback

Rollback is the child commit. If extraction affects several modules, keep changes ordered so the entrypoint can be restored without touching unrelated governance children or undoing the earlier path migration.
