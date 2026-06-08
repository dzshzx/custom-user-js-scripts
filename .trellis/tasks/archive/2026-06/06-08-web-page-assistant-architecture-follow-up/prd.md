# Web Page Assistant architecture follow-up

## Goal

Implement the four follow-up architecture candidates from `.scratch/reports/architecture-review-20260608-121753.html` in report order, using one child task and one commit batch per candidate, then complete the parent with final validation, patch version bump, and push.

## Requirements

- Candidate 1: make the Web Page Assistant settings contract copy verifiable between the installable userscript and the testable library.
- Candidate 2: introduce a Web Page Assistant storage port for settings, widget position, GM storage, localStorage fallback, and menu registration.
- Candidate 3: introduce a dialog content contract so tab, field, selector, and form-intent rules stop leaking across rendering and action handlers.
- Candidate 4: introduce a refresh runtime module so timer state, pause/resume, fake clock testing, and reload side effects sit behind one interface.
- Preserve the standalone userscript model: no bundler and no npm runtime imports in installable `.user.js` files.
- Do not modify Codex Quota Compass code.
- Keep existing unrelated dirty paths untouched and out of all commits.
- Because `src/web-page-assistant.user.js` is already over 1000 lines, each candidate should avoid expanding it; prefer moving repeated behavior behind narrower interfaces or reducing repeated implementation.
- After all children finish, if `package.json` has a numeric `x.y.z` version, increment `z` by one.
- If work remains on `master`, push `master` to `origin`. If a branch is created, merge it back to `master` before final push.

## Acceptance Criteria

- [x] Child 1 is implemented, validated, archived, and committed.
- [x] Child 2 is implemented, validated, archived, and committed.
- [x] Child 3 is implemented, validated, archived, and committed.
- [x] Child 4 is implemented, validated, archived, and committed.
- [x] Final `npm test` and `npm run lint` pass.
- [x] Patch version is incremented when `package.json` version matches `x.y.z`.
- [x] Parent task is archived and included in the final commit batch.
- [x] Final state is pushed to `origin/master`.

## Notes

- Source report: `.scratch/reports/architecture-review-20260608-121753.html`.
- Work starts on `master`; `origin/master...HEAD` was `0 1` before implementation, so the local branch was ahead and the remote was not ahead.
