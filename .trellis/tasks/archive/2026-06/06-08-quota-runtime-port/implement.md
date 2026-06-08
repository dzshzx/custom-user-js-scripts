# Implement

1. Add `src/codex-quota-compass-runtime.lib.js`.
2. Move runtime config, token discovery, and `apiGet` behavior into the new module.
3. Update `src/codex-quota-compass.user.js` to require and call the runtime module.
4. Add `test/codex-quota-compass-runtime.test.mjs`.
5. Run:
   - `npm test`
   - `npm run lint`
6. Inspect diff for secret logging, hidden fallback, and behavior drift.
