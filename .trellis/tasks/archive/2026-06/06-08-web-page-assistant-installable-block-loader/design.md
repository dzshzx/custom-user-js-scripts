# Design

## Helper interface

Add `test/helpers/installable-block-loader.mjs` with functions such as:

- `loadInstallableBlock({ blockName, prefixSource, returnExpression })`
- `readInstallableBlock(blockName)`

The helper derives marker names like `WEB_PAGE_ASSISTANT_<blockName>_START/END` and evaluates blocks with `vm.runInThisContext`.

## Callers

Update:

- `test/web-page-assistant-settings.test.mjs`
- `test/web-page-assistant-storage-port.test.mjs`
- `test/web-page-assistant-dialog-contract.test.mjs`
- `test/web-page-assistant-refresh-runtime.test.mjs`
- New Web Page Assistant runtime tests from this parent task if they use marker extraction.

## Compatibility

This is test-only. It does not change installable userscript behavior.
