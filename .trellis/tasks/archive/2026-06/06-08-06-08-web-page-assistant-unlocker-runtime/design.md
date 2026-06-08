# Design

## Runtime shape

Introduce an internal `UnlockerRuntime` module with:

- `createUnlockerRuntime(adapters)`;
- `install(setting)`;
- `uninstall()`;
- capability specs for selection, copy, context menu, drag, beforeunload, and selection CSS.

## Adapters

Adapters wrap `document`, `window`, style insertion, and event listener registration. Browser production uses real adapters; tests can use fake adapters.

## Compatibility

The runtime must preserve capture-phase event blocking and avoid touching the script root UI.
