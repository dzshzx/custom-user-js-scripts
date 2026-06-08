# Design

## Session interface

Add `createWebPageAssistantSession(adapters)` with methods for:

- `dispatch(action, actionNode)`
- `getSelectedScope()`
- `parseCustomInterval()`
- `saveSetting(scope, intervalMs)`
- `deleteSetting(scope)`
- `saveUnlockerSetting(scope, unlockerSetting)`
- `deleteUnlockerSetting(scope)`
- `restartActiveCountdown()`
- `refreshUnlockerState()`

The exact returned surface can be smaller if `dispatch` covers the public test surface and private helpers stay internal.

## Adapters

Production supplies settings getters/setters, `storagePort`, `refreshRuntime`, `renderDialog`, `setMessage`, `formatInterval`, `scopeLabel`, `dialogContract`, current keys, and logger.

Tests supply fake settings, fake storage, fake refresh/unlocker callbacks, fake dialog callbacks, and fake action nodes.

## Compatibility

No userscript metadata changes. No build step. The module remains inside the installable file with a marked block for tests.
