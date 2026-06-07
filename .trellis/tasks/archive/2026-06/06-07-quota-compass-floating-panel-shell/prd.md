# Implement Floating Panel Shell

## Goal

Extract reusable floating panel shell behavior from the Codex Quota Compass userscript while preserving standalone userscript installability.

## Requirements

- Extract reusable floating panel shell behavior from `src/codex-quota-compass.user.js` without changing installation model.
- Keep Codex Quota Compass runtime as standalone userscript code.
- Preserve button position persistence, docking behavior, open/close animation, resize clamping, outside-click close, and delegated root actions.
- Keep UI behavior compatible for current users.
- Avoid introducing a bundler or npm dependency.

## Acceptance Criteria

- [x] Floating panel geometry and interaction behavior are owned by a named shell module/function.
- [x] Codex Quota Compass userscript wires shell actions instead of owning all panel mechanics inline.
- [x] Existing button, panel, refresh, close, tab, import, export, detail, and drag behavior remains available.
- [x] `npm test` and `npm run lint` pass.

## Notes

- This is the third implementation child and should not refactor business sync logic.
