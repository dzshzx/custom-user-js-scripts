# Design

## Port interface

`createWebPageAssistantStoragePort(adapters)` returns:

- `readSettings()`
- `writeSettings(nextSettings)`
- `readWidgetPosition()`
- `writeWidgetPosition(position)`
- `registerSettingsMenu(label, callback)`

## Adapters

The production adapter supplies GM legacy functions, GM promise functions, `localStorage`, logger, settings contract, widget position normalizer, and storage key names.

Tests pass fake adapters so the storage priority and fallback behavior can be verified without a browser userscript manager.

## Compatibility

The port stays inside `src/web-page-assistant.user.js` for standalone installability. Tests extract the marked factory block from the installable file.
