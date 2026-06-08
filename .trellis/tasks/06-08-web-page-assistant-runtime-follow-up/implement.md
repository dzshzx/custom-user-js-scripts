# Implementation Plan

1. Start child 1, load applicable frontend specs, implement `createWebPageAssistantSession`, add focused tests, run target tests plus lint, commit, archive.
2. Start child 2, implement `createWidgetLayoutRuntime`, add geometry and drag tests, run target tests plus lint, commit, archive.
3. Start child 3, refine `createUnlockerRuntime` into a capability runtime with adapters, add event/style/uninstall tests, run target tests plus lint, commit, archive.
4. Start child 4, add a shared test helper for installable block loading, update existing marker-based tests to use it, run target tests plus lint, commit, archive.
5. Run final `npm test` and `npm run lint`.
6. Increment `package.json` patch version when it matches numeric `x.y.z`.
7. Commit final parent changes, archive parent, record session journal, and push `master` to `origin`.

## Validation

- `node --test test/web-page-assistant-session-runtime.test.mjs`
- `node --test test/web-page-assistant-widget-layout-runtime.test.mjs`
- `node --test test/web-page-assistant-unlocker-capability-runtime.test.mjs`
- `node --test test/web-page-assistant-*.test.mjs`
- `npm test`
- `npm run lint`
