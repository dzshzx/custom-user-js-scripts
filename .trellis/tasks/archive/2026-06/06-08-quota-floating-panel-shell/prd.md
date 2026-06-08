# Deepen Codex Quota floating panel shell

## Goal

Turn the floating panel shell into a deeper module that owns panel mounting, geometry, drag, resize, and injected shell styles.

## Requirements

- Preserve the current floating button, panel animation, drag/dock behavior, outside-close behavior, resize behavior, and responsive/dark-mode styling.
- Move shell-level implementation out of the main userscript behind a small interface.
- Keep Codex-specific content rendering in the userscript or view model layer.
- Do not introduce a build step or framework.

## Acceptance Criteria

- [x] Main userscript delegates shell lifecycle and geometry to a panel shell module.
- [x] The panel shell module can be tested without calling private ChatGPT endpoints.
- [x] Existing panel view model tests still pass.
- [x] `npm test` and `npm run lint` pass.

## Notes

- Candidate source: "深化浮动面板 UI 壳".
- Validation: `npm test` passed 23 tests; `npm run lint` checked 5 userscript files.
