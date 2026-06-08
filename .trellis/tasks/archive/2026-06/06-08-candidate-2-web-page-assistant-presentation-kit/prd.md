# Candidate 2 Web Page Assistant presentation kit

## Goal

Implement report candidate 2 by extracting Web Page Assistant UI presentation markup/styles/contract into support modules.

## Requirements

- Extract Web Page Assistant presentation responsibilities from the installable entrypoint behind a formal same-script module.
- Move dialog contract, widget/dialog rendering, and scoped assistant styles into support modules or one cohesive presentation kit.
- Keep the entrypoint responsible for state, adapters, and startup wiring.
- Preserve UI behavior, text, role selectors, actions, and host-page CSS scoping.
- Update tests so dialog and presentation behavior are tested through formal module interfaces where practical.
- Do not bump `@version` in this child task.

## Acceptance Criteria

- [x] `web-page-assistant.user.js` no longer owns the bulk of scoped CSS and dialog/widget markup.
- [x] Presentation module exposes a small interface that the entrypoint can use for rendering and role/action helpers.
- [x] Existing dialog contract and widget behavior tests pass.
- [x] `npm test` passes.
- [x] `npm run lint` passes.
- [ ] Child changes are committed before child 3 starts.

## Notes

- This is report candidate 2 and depends on child 1 extraction.
