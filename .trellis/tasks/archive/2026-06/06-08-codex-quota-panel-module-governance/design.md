# Design

## Current Boundary

Codex Quota Compass already has several library modules:

- `src/codex-quota-compass-core.lib.js`
- `src/codex-quota-compass-archive.lib.js`
- `src/codex-quota-compass-contract.lib.js`
- `src/codex-quota-compass-i18n.lib.js`
- `src/codex-quota-compass-panel-view-model.lib.js`
- `src/codex-quota-compass-panel-renderer.lib.js`
- `src/codex-quota-compass-panel-shell.lib.js`
- `src/codex-quota-compass-runtime.lib.js`
- `src/codex-quota-compass-storage.lib.js`
- `src/codex-quota-compass-sync.lib.js`

This child should not collapse those boundaries. It should inspect the remaining large panel files and extract only if the new module has a smaller interface and clearer tests.

## Candidate Areas

Candidate areas must be confirmed from source before implementation. Likely areas:

- panel shell event wiring versus state transition logic;
- rendering helpers versus layout descriptors;
- action binding versus presentational HTML;
- mobile/responsive rendering behavior if still mixed with general renderer logic.

## Constraints

- Keep the installable entrypoint identity unchanged; its repository path may already have changed in the layout-migration child.
- Keep Snapshot Archive terminology aligned with `CONTEXT.md`.
- Do not add a bundler.
- Do not duplicate view-model logic in renderer or shell modules.

## Rollback

Rollback is the child commit. Prefer incremental extraction so a failed candidate can be reverted without undoing unrelated panel governance work.
