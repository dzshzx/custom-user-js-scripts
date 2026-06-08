# Architecture report implementation sequence

## Goal

Implement the first three architecture report candidates in order, one child task per candidate, then perform final version bump and push.

## Requirements

- Use the architecture report at `.scratch/reports/architecture-review-20260608-153312.html` as the source requirement set.
- Implement the first three report candidates in order:
  1. Web Page Assistant startup module.
  2. Web Page Assistant presentation kit.
  3. Codex Quota Compass renderer depth.
- Use one Trellis child task per candidate.
- Commit after each child task completes. A child may use one commit or a small batch of commits when the work splits naturally.
- After all three children are complete, if touched installable userscript versions are shaped as `x.y.z` with numeric parts, increment `z` by 1.
- Push the final branch to `origin`.
- If work happens on a non-mainline branch, merge the completed branch back to `master` before final push.
- Preserve standalone userscript installability; no bundler may be introduced.
- Preserve user data keys, `@name`, and `@namespace` unless a task explicitly calls out a migration.

## Acceptance Criteria

- [ ] Child task 1 is archived after implementation, validation, and commit.
- [ ] Child task 2 is archived after implementation, validation, and commit.
- [ ] Child task 3 is archived after implementation, validation, and commit.
- [ ] `npm test` passes after the child sequence.
- [ ] `npm run lint` passes after the child sequence.
- [ ] Relevant installable userscript `@version` fields are incremented exactly once at the end when they match `x.y.z`.
- [ ] Final changes are pushed to `origin/master`, or merged to `master` first if implemented from another branch.
- [ ] Parent task is archived after final integration and push.

## Notes

- User explicitly requested autonomous execution without additional questions.
