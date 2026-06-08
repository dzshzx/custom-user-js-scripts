# Design

## Module shape

Add explicit markers around the settings contract factory in both `src/web-page-assistant.user.js` and `src/web-page-assistant-settings.lib.js`.

Both paths expose a `createPageAssistantSettingsContract()` factory. The library assigns the factory result to `globalThis.WebPageAssistantSettingsLib`; the installable userscript keeps using the factory internally.

## Test interface

`test/web-page-assistant-settings.test.mjs` extracts the marked installable block, evaluates it with the same constants, and runs the same contract cases against:

- the library export;
- the installable userscript block.

This keeps the interface executable without adding a build step.

## Compatibility

Do not add runtime imports or `@require`. The installable script remains paste/install ready.
