# Implementation Plan

1. Start after `Snapshot Archive Sync` is complete.
2. Add core tests for readable sync and archive model output.
3. Extend `createQuotaPanelViewModel()` with sync and transfer fields.
4. Update `renderResult()`, archive view, and transfer view to use the model.
5. Run `npm test`.
6. Run `npm run lint`.
7. Review the UI diff for escaped HTML, local-only fallback copy, and no duplicated sync logic.
