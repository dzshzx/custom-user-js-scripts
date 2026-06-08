# Design

## Runtime interface

`createRefreshRuntime(adapters)` returns:

- `restart(activeMatch)`
- `stop()`
- `togglePause()`
- `getState()`

## Adapters

Production adapters use `Date.now`, `window.setInterval`, `window.clearInterval`, `location.reload`, and an `onStateChange` callback that updates widget countdown text and pause buttons.

Tests use a fake clock and captured interval callback.

## Compatibility

The runtime remains in the installable userscript. It does not change saved settings, metadata, or refresh interval semantics.
