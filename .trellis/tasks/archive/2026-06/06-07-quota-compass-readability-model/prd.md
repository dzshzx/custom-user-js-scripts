# Implement Quota Panel Readability Model

## Goal

Deepen panel view model so personal sync, archive health, import preview, and readable panel sections are testable before DOM rendering.

## Requirements

- Add a testable panel readability model that makes personal sync state visible before DOM rendering.
- Return stable sections, metrics, sync banner data, archive health, and import preview data from core logic.
- Keep DOM rendering in `src/codex-quota-compass.user.js` thin and focused on drawing model output.
- Preserve current overview, history, details, archive, and transfer views.
- Improve the transfer view so it explains current storage capability and exposes import/export actions from model data.

## Acceptance Criteria

- [x] Core tests verify sync banner, archive health, primary metrics, and transfer actions.
- [x] The panel shows whether the current archive backend is cross-device capable or local-only.
- [x] Import/export actions still work from the panel and menu commands.
- [x] Existing quota metrics and detail tables still render.
- [x] `npm test` and `npm run lint` pass.

## Notes

- This task depends on `Snapshot Archive Sync` sync status methods.
