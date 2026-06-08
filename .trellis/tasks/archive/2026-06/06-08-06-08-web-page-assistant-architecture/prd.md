# Web Page Assistant architecture hardening

## Goal

Implement all four architecture review candidates for Web Page Assistant, with one child task and commit batch per candidate, then version and push.

## Requirements

- Implement the four candidates from `.scratch/reports/architecture-review-20260608-110720.html` in order.
- Use one child task per candidate and produce one commit batch per child task.
- Keep the work focused on Web Page Assistant and related userscript tooling; do not modify Codex Quota Compass code.
- Preserve the standalone userscript model: no bundler, no npm runtime imports in installable `.user.js` files.
- After all child tasks are complete, if `package.json` has a numeric `x.y.z` version, increment `z` by one.
- Push completed work to `origin`.
- If implementation happens on a non-main branch, merge it back to `master` before pushing final state.

## Acceptance Criteria

- [x] Candidate 1 deletes the wrong install entrypoint and enforces the canonical Web Page Assistant source.
- [x] Candidate 2 deepens the settings contract for normalization, scope resolution, storage, and mutations.
- [x] Candidate 3 separates UI state shaping from DOM rendering and action dispatch.
- [x] Candidate 4 creates an unlocker runtime with capability locality and adapter seams.
- [x] Each child task has its own implementation commit batch.
- [x] Final checks pass: `npm test` and `npm run lint`.
- [x] Patch version is incremented when current `package.json` version matches `x.y.z`.
- [x] Final branch is pushed to `origin/master`.

## Notes

- Parent task owns ordering, final version bump, and push.
- Child execution order:
  1. `.trellis/tasks/06-08-06-08-web-page-assistant-entrypoint`
  2. `.trellis/tasks/06-08-06-08-web-page-assistant-settings`
  3. `.trellis/tasks/06-08-06-08-web-page-assistant-ui-actions`
  4. `.trellis/tasks/06-08-06-08-web-page-assistant-unlocker-runtime`
- Child commits:
  - `511e536 fix: hard cut web page assistant entrypoint`
  - `4eead51 refactor: deepen web page assistant settings`
  - `6158f58 refactor: separate web page assistant ui actions`
  - `9cbf013 refactor: centralize web page assistant unlocker runtime`
- Version: `package.json` moved from `0.1.3` to `0.1.4`.
- Final validation: `npm test` passed 45 tests; `npm run lint` checked 4 userscript files; `node --check` passed for `src/web-page-assistant.user.js`, `src/web-page-assistant-settings.lib.js`, and `scripts/check-userscripts.mjs`.
