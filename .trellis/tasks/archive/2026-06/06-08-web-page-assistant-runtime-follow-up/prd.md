# Web Page Assistant architecture runtime follow-up

## Goal

Implement the four architecture candidates from `.scratch/reports/architecture-review-20260608-125717.html` in report order. Each candidate is owned by one child task and one commit batch. After all child tasks are complete, finish the parent by validating the full repository, incrementing the patch version when `package.json` has a numeric `x.y.z` version, and pushing the final `master` state to `origin`.

## Requirements

- Candidate 1: introduce a Web Page Assistant Session module so user action intent, settings mutation, storage writes, refresh/unlocker updates, and dialog feedback sit behind one interface.
- Candidate 2: introduce a Widget Layout Runtime module so widget position clamping, panel placement, drag lifecycle, expansion suppression, and position persistence have one testable interface.
- Candidate 3: deepen the unlocker capability runtime so capability specs, event capture, style insertion, root exclusion, and uninstall cleanup are verified through one interface.
- Candidate 4: introduce a shared installable block loader for tests that extract marked factory blocks from the installable userscript.
- Preserve the standalone userscript model: no bundler, no npm runtime imports, and no `@require` added to installable `.user.js` files.
- Do not modify Codex Quota Compass code except through repository-wide tests if needed.
- Keep unrelated dirty paths untouched.
- Because `src/web-page-assistant.user.js` is already over 1000 lines, each candidate should reduce repeated implementation or concentrate logic behind narrower interfaces rather than expanding the file unnecessarily.
- If implementation work happens on a branch, merge it back to `master` before final push.
- If `package.json` version is exactly numeric `x.y.z`, increment `z` by one after all child tasks pass and are archived.

## Acceptance Criteria

- [x] Child 1 is implemented, validated, committed, and archived.
- [x] Child 2 is implemented, validated, committed, and archived.
- [x] Child 3 is implemented, validated, committed, and archived.
- [x] Child 4 is implemented, validated, committed, and archived.
- [x] Final `npm test` passes.
- [x] Final `npm run lint` passes.
- [x] Patch version is incremented when `package.json` version matches numeric `x.y.z`.
- [x] Parent task is archived after final validation and version bump.
- [x] Final `master` state is pushed to `origin`.

## Notes

- Source report: `.scratch/reports/architecture-review-20260608-125717.html`.
- Work starts on `master`; initial `git status --short --branch` showed `master...origin/master` with a clean worktree.
