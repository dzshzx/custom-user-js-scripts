# Web Page Assistant refresh runtime

## Goal

Move automatic refresh timer state and side effects behind a refresh runtime interface.

## Requirements

- Introduce `createRefreshRuntime`.
- Runtime state must cover active match, target time, remaining paused time, pause state, refresh-in-progress state, and interval cleanup.
- Runtime adapters must cover `now`, `setInterval`, `clearInterval`, `reload`, and state notifications.
- Entrypoint widget rendering should consume runtime state instead of owning timer internals.
- Add fake-clock tests for start, pause/resume, stop, and reload behavior.

## Acceptance Criteria

- [ ] Timer state is local to the refresh runtime.
- [ ] Existing widget countdown and pause behavior is preserved.
- [ ] `npm test -- test/web-page-assistant-refresh-runtime.test.mjs` passes.
- [ ] `npm run lint` passes.

## Notes

- Report candidate: `#candidate-refresh-runtime`.
