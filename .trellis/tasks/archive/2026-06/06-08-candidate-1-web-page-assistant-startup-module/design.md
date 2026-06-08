# Design

`web-page-assistant.user.js` already has testable seams marked with comments. Those seams are real modules hiding inside the installable entrypoint. The change turns them into same-script libraries loaded by `@require`.

## New Modules

- `web-page-assistant-session.lib.js`: attaches `WebPageAssistantSessionLib` with `createWebPageAssistantSession`.
- `web-page-assistant-widget-layout.lib.js`: attaches `WebPageAssistantWidgetLayoutLib` with `createWidgetLayoutRuntime`.
- `web-page-assistant-unlocker.lib.js`: attaches `WebPageAssistantUnlockerLib` with `createUnlockerRuntime`.

## Entry Interface

The entrypoint imports the new globals, checks that required factories exist, then passes the same adapters it already uses today. The extracted implementations should not read global browser state directly except through their adapter inputs.

## Tests

Existing marker-loader tests are migrated to import the new libraries. `test/helpers/installable-block-loader.mjs` remains available for later tasks until all marker seams are removed.
