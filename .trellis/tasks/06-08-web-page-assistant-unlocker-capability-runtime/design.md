# Design

## Runtime interface

Refine `createUnlockerRuntime(adapters)` so it returns:

- `install(setting)`
- `uninstall()`
- `describe(setting, scopeLabel)`
- optional `getCapabilitySpecs()` for tests if needed

## Adapters

Production supplies `document`, `window`, `rootContainsTarget`, `styleId`, `rootId`, and settings contract capability predicate.

Tests supply fake targets that record capture listeners and fake style insertion/removal.

## Compatibility

No storage schema changes. Existing unlocker settings still come from `PageAssistantSettings`.
