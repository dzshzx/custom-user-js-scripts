# Codex Quota Compass architecture candidates

## Goal

Implement every recommendation from the Codex Quota Compass architecture report as an ordered task tree, then complete the parent with version bump, commit, and remote push.

## Requirements

- Preserve current Codex Quota Compass behavior for calculation, panel rendering, Snapshot Archive import/export, and sync status copy.
- Implement report candidates in this order:
  1. Extract Codex Quota runtime port.
  2. Deepen Codex Quota floating panel shell.
  3. Converge Codex Quota snapshot contract.
  4. Unify Codex Quota sync status source.
- Use one child task per candidate and verify each independently before moving to the next child.
- Keep generated architecture reports in ignored `.scratch/` and do not stage them.
- After all children pass, if the userscript `@version` and `SCRIPT_VERSION` are both shaped like `x.y.z`, increment `z` by one.
- Commit the completed work, push to the remote, and keep `master` as the mainline target. If implementation moves onto another branch, merge it back to `master` before pushing.

## Acceptance Criteria

- [x] Parent task has four child tasks, one per report candidate.
- [x] Each child task has planning artifacts and is completed in the requested order.
- [x] New or changed modules keep userscript installability without a build step.
- [x] `npm run lint` passes.
- [x] `npm test` passes.
- [x] Final diff excludes `.scratch/` generated reports.
- [x] If version fields are semantic patch shaped, patch version is incremented once after child tasks complete.
- [x] Final changes are committed and pushed to the configured remote mainline.

## Notes

- Source report: `.scratch/reports/architecture-review-20260608-084731.html`.
- Current branch at planning time: `master`, ahead of `origin/master` by one existing local commit.
- Completed child order: runtime port, floating panel shell, snapshot contract, sync status source.
- Final validation: `npm test` passed 26 tests; `npm run lint` checked 5 userscript files.
- Version bump: `0.2.2` -> `0.2.3`.
