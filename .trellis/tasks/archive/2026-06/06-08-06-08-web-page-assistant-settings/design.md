# Design

## Module shape

Add a non-installable browser-compatible library such as `src/web-page-assistant-settings.lib.js`.

The library attaches `globalThis.WebPageAssistantSettingsLib` and exports:

- constants for supported intervals;
- `emptySettings`;
- `normalizeSettings`;
- `normalizeRefreshSetting`;
- `normalizeUnlockerSetting`;
- `resolveActiveRefreshSetting`;
- `resolveActiveUnlockerSetting`;
- `setScopedSetting`;
- `deleteScopedSetting`;
- `createSettingsStore`.

## Userscript integration

Because this repository has no bundler and standalone scripts cannot import local modules at runtime, copy the same settings module block into `src/web-page-assistant.user.js` or load it through an explicit `@require` only if install behavior remains acceptable. Prefer keeping the installable script standalone.

## Tests

Node tests load the library file in a VM context and assert the pure contract.
