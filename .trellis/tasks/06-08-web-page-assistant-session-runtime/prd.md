# Web Page Assistant Session runtime

## Goal

Introduce a Web Page Assistant Session module so user actions stop directly owning settings mutation, storage writes, refresh runtime updates, unlocker updates, and dialog feedback.

## Requirements

- Add a factory-shaped session module in `src/web-page-assistant.user.js`.
- The interface must accept action intent and injected adapters, not reach directly into DOM nodes.
- Preserve current behavior for refresh preset save, custom refresh save, refresh deletes, unlocker save/delete, and disable active refresh.
- Keep `handleRootClick` as DOM event routing only: resolve `data-part-action`, prevent event propagation, call the session/action interface, and surface errors.
- Add Node tests with fake adapters for successful actions and error/message behavior.

## Acceptance Criteria

- [ ] Session runtime tests cover refresh save/delete, unlocker save/delete, disable active, invalid interval handling, and action failure reporting.
- [ ] Existing Web Page Assistant tests pass.
- [ ] `npm run lint` passes.

## Notes

- Source report candidate: `candidate-session-runtime`.
