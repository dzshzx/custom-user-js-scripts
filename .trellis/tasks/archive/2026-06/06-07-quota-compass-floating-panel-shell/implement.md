# Implementation Plan

1. Start after readability model is complete.
2. Identify current shell mechanics in `src/codex-quota-compass.user.js`.
3. Extract a local `createFloatingPanelShell()` factory.
4. Rewire existing UI creation and action handling through the shell.
5. Keep public behavior unchanged.
6. Run `npm test`.
7. Run `npm run lint`.
8. Review diff for unrelated visual changes and event-listener regressions.
