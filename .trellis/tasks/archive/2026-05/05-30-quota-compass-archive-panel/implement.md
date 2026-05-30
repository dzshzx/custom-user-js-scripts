# Implementation Plan

## Checklist

- [x] Add localized archive tab labels to `I18N_MESSAGES`.
- [x] Add archive-panel model helpers near the existing archive summary helper.
- [x] Replace raw recent-snapshot mapping in `archiveSummaryHtml()` with the
      display model.
- [x] Add an `archive` branch in `renderResult()` and remove archive overview
      rendering from the main overview branch.
- [x] Keep transfer/sync text available in the archive view or transfer flow
      without duplicating archive tables in the overview.
- [x] Add focused Node tests for the archive panel model/helper if practical
      without introducing a bundler.
- [x] Run `npm run lint`.
- [x] Run `npm test`.

## Validation Commands

```bash
npm run lint
npm test
```

## Rollback Points

- The changed userscript is isolated to `src/codex-quota-compass.user.js`.
- New or updated tests should be limited to `test/`.
- Do not edit archive storage internals unless implementation reveals an
  unavoidable contract gap.

## Risk Notes

- Because `src/codex-quota-compass.user.js` is an installable userscript, any
  helper used by tests must remain plain JavaScript and must not require npm
  imports in the userscript itself.
- UI strings must stay escaped before entering `innerHTML`.
- Focused Node tests for `createArchivePanelModel()` were not added because
  exposing an IIFE-internal userscript helper would require a new test seam or
  extraction beyond this task's no-build-step scope. Existing archive
  store/core seam tests cover the storage and sync contracts.
