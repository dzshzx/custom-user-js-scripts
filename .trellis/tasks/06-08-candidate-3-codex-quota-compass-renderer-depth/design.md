# Design

`Codex Quota Compass` already has a script-scoped module graph. The renderer issue is local: `codex-quota-compass-panel-renderer.lib.js` has a stable external interface but too much implementation behind one file.

## Module Shape

Keep `createQuotaPanelRenderer` as the caller-facing interface. Move content CSS into a style module, and move archive/data-view rendering into helper modules only if the split reduces interface width rather than creating pass-through modules.

Expected module:

- `codex-quota-compass-panel-renderer-styles.lib.js`: exposes a style text factory or installer used by the renderer.

Optional module:

- `codex-quota-compass-panel-sections.lib.js`: owns data-view/archive section HTML if it produces a deeper interface than local helpers.

## Compatibility

The entrypoint should still call `panelRenderer.installStyles(document, ROOT_ID)` and `panelRenderer.renderResult(viewModel, state)` unless a better interface is clearly justified by the implementation.
