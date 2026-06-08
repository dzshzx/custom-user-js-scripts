# Implementation Plan

1. Read current unlocker status and runtime code.
2. Move capability labels and event specs into the runtime.
3. Add adapters for target lookup, style management, and root exclusion.
4. Update `unlockerStatusText`, `installUnlocker`, and `refreshUnlockerState` to use the runtime interface.
5. Add `test/web-page-assistant-unlocker-capability-runtime.test.mjs`.
6. Run unlocker target test plus existing Web Page Assistant tests.
7. Run `npm run lint`.
