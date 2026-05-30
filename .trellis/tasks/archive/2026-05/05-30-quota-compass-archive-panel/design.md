# Design

## Boundary

Keep this as a single-file userscript change plus focused tests. The
installable userscript model has no bundler, so the new archive panel seam
lives as named helpers inside `src/codex-quota-compass.user.js` rather than as
an imported module.

The Snapshot Archive storage and Sync Path remain unchanged:

- `archiveStore` still owns archive normalization, merge, export, import, and
  usage queries.
- `syncPort` still adapts the userscript to archive-store operations.
- The UI only reads summary/import state and triggers existing export/import
  commands.

## Rendering Shape

Add an `archive` panel tab. `renderResult()` remains the root result renderer,
but it should delegate archive-specific display to a named archive-view helper.

The main overview branch should stop rendering `sectionArchiveOverview`. Its
job is current quota status plus the details entry point.

The archive branch should render:

- archive summary metrics or the archive empty state
- latest import note when present
- recent snapshot table or the no-snapshot empty state
- export action
- existing sync note, because JSON export/import remains the supported Sync
  Path

## Content Contract

Introduce a small adapter that converts raw `latestArchiveSummary` into a
stable display model:

```text
createArchivePanelModel(summary, importReport)
  -> {
       isLoaded,
       snapshotCount,
       earliestCapturedAt,
       latestCapturedAt,
       recentSnapshots: [
         { capturedAt, snapshotId, monthlyCredits, weeklyUsedPercent }
       ],
       importReport
     }
```

The panel renderer consumes this model instead of raw summary rows. This keeps
field fallback and row naming in one place and makes future CSV/filter/page
work local to the archive panel.

## Compatibility

Do not rename storage keys, change export document shape, change archive
normalization, or bump `@version`.

When import changes archive state, keep the current behavior: update
`latestArchiveSummary` and `latestImportReport`, then re-render if there is a
cached `latestResult`.

## Documentation Decision

No `CONTEXT.md` update is needed for this task because the existing glossary
already defines the domain terms used by the report. No ADR is needed because
the decision is local, reversible, and aligned with the current userscript
architecture.
