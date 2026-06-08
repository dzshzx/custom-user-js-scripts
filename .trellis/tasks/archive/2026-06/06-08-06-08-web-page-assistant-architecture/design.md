# Design

## Task tree

The parent task is an integration container. Each child task owns one architecture candidate and one commit batch.

## Integration rules

- Work directly on `master` unless the repository state forces a branch.
- Do not touch `src/codex-quota-compass*.js`.
- Keep `src/web-page-assistant.user.js` installable as a standalone userscript.
- Add local test coverage through Node's built-in test runner where a seam becomes testable outside the browser.
- Treat `scripts/check-userscripts.mjs` as the local tooling seam for metadata and install-entrypoint checks.

## Final release step

Read `package.json`. If `version` matches three numeric dot-separated segments, increment the patch segment and commit that version bump after the four child commits.
