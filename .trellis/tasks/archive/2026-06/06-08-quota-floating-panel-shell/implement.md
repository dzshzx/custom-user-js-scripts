# Implement

1. Add `src/codex-quota-compass-panel-shell.lib.js`.
2. Move shell state, geometry, drag, close, resize, markup mounting, and CSS from the userscript into the module.
3. Update the userscript to pass translated labels and action callbacks to the shell.
4. Add focused tests for shell idempotency and action delegation where practical under Node.
5. Run:
   - `npm test`
   - `npm run lint`
6. Inspect diff for UI behavior drift and unescaped dynamic HTML.
