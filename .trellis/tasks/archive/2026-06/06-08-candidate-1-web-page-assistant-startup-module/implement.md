# Implementation Plan

- [x] Read relevant frontend specs before editing.
- [x] Add `web-page-assistant-session.lib.js` from the existing session block.
- [x] Add `web-page-assistant-widget-layout.lib.js` from the existing widget layout block.
- [x] Add `web-page-assistant-unlocker.lib.js` from the existing unlocker runtime block.
- [x] Update `web-page-assistant.user.js` metadata `@require` order and replace inline factory definitions with library references.
- [x] Update affected tests to import libraries directly.
- [x] Run targeted Web Page Assistant tests.
- [x] Run `npm test`.
- [x] Run `npm run lint`.
- [x] Review diff and commit child 1.
