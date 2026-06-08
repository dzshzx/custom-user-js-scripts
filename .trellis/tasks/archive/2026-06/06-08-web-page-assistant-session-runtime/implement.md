# Implementation Plan

1. Search current action helpers and event handlers.
2. Add a marked `WEB_PAGE_ASSISTANT_SESSION_START/END` block around the session factory.
3. Move action mapping and state transition helpers behind the session factory.
4. Keep `handleRootClick` as a thin event adapter.
5. Add `test/web-page-assistant-session-runtime.test.mjs`.
6. Run `node --test test/web-page-assistant-session-runtime.test.mjs test/web-page-assistant-dialog-contract.test.mjs test/web-page-assistant-refresh-runtime.test.mjs`.
7. Run `npm run lint`.
