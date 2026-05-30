# Quota Compass Archive Panel Refactor

## Goal

Move Codex Quota Compass Snapshot Archive review out of the main overview path
and into a dedicated archive panel view, while preserving the existing manual
JSON export/import Sync Path.

The architecture report
`/home/ubuntu/.codex/attachments/21a9fc42-4106-4964-bcdd-56e9f78c036c/architecture-review-20260530-183843.html`
is the source requirement. Its top recommendation is to establish a clear
rendering seam before doing deeper visual polish.

## Confirmed Facts

- `CONTEXT.md` already defines `Quota Snapshot`, `Snapshot Archive`,
  `Snapshot Export`, `Snapshot Import`, `Snapshot ID`, and `Sync Path`.
- `src/codex-quota-compass.user.js` currently renders `archiveSummaryHtml()`
  from `renderResult()` in both overview and transfer branches.
- `panelTabsHtml()` currently exposes `overview`, `history`, `details`, and
  `transfer`; there is no dedicated archive view.
- Snapshot Archive data remains local userscript state through
  `archiveStore` and `syncPort`; the task must not add a backend or change the
  primary Sync Path.
- Existing tests cover archive storage/query behavior and core sync port
  behavior, but not the userscript archive-panel rendering seam.

## Requirements

- Add a dedicated Snapshot Archive panel view to Codex Quota Compass.
- Keep the overview view focused on current quota metrics and detail entry
  points; do not render the archive overview table in the main overview path.
- Keep sync/export/import behavior available from the dedicated archive view
  and existing userscript menu commands.
- Introduce a small content contract or adapter for archive summary display so
  panel rendering does not depend directly on raw archive row field names.
- Keep all injected UI scoped under the existing `cqc-*` class pattern.
- Do not change userscript metadata version unless separately requested.
- Do not introduce a bundler, npm UI dependency, backend, or cloud sync path.

## Acceptance Criteria

- [ ] The panel has a dedicated archive tab/view using localized zh-CN and en
      labels.
- [ ] The overview tab no longer includes the Snapshot Archive overview table.
- [ ] The archive view shows the archive empty state, summary metrics, recent
      snapshot rows, latest import note, and export action when relevant.
- [ ] Archive summary row rendering goes through a named adapter/content
      contract instead of ad hoc row mapping inside the main result renderer.
- [ ] Export and import still update archive summary/import state and re-render
      the visible panel when a cached result is present.
- [ ] Existing Snapshot Archive storage/query tests continue to pass.
- [ ] `npm run lint` and `npm test` pass.

## Notes

- `grill-with-docs` terminology pass found no glossary conflict: the report's
  terms match the existing domain language in `CONTEXT.md`.
- Candidate 3 from the report, broad visual-token/style centralization, is out
  of scope for this task except for minimal styles required by the new archive
  view.
