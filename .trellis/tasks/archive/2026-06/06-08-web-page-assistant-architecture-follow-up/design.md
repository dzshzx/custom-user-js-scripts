# Design

## Task tree

The parent task owns ordering, cross-child acceptance, final validation, version bump, archive, and push. Each child owns one independently verifiable architecture candidate and one commit batch.

Child order:

1. `.trellis/tasks/06-08-web-page-assistant-settings-contract-sync`
2. `.trellis/tasks/06-08-web-page-assistant-storage-port`
3. `.trellis/tasks/06-08-web-page-assistant-dialog-contract`
4. `.trellis/tasks/06-08-web-page-assistant-refresh-runtime`

## Integration rules

- Work on `master` unless the repository state forces a branch.
- Stage by path for every commit so existing dirty paths stay untouched.
- Do not introduce a bundler or npm runtime imports into installable userscripts.
- Use Node tests for extracted or factory-shaped modules. Browser-only side effects should be represented by fake adapters where possible.
- Keep the installable userscript standalone. When a testable library and installable block must both exist, add an executable sync or equivalence check.

## Final release step

After all children are archived and committed, read `package.json`. If the version is exactly three numeric dot-separated segments, increment the patch segment and commit that bump with the parent archive. Then push the final `master` state to `origin`.
