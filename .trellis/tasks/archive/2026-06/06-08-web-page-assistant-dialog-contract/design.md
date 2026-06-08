# Design

## Contract interface

`createPageAssistantDialogContract(adapters)` returns:

- `roles`
- `tabs`
- `actions`
- `roleSelector(role)`
- `normalizeTab(value, fallback)`
- `focusRoleForTab(tab)`
- `createViewModel(input)`
- `readUnlockerFormSetting(dialog)`

## Callers

`renderDialog` keeps DOM construction but consumes contract-produced model values and selectors. Action handlers keep dispatching actions but stop owning field names or unlocker form parsing.

## Tests

Tests extract the marked factory block from the installable userscript and use fake dialog nodes to verify form reading.
