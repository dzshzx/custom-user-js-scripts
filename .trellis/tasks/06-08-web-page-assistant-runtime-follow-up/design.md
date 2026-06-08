# Design

## Task tree

The parent task owns ordering, cross-child acceptance criteria, final validation, patch version bump, archive, and push. Each child task owns one independently verifiable architecture candidate and one code commit batch.

Child order:

1. `.trellis/tasks/06-08-web-page-assistant-session-runtime`
2. `.trellis/tasks/06-08-web-page-assistant-widget-layout-runtime`
3. `.trellis/tasks/06-08-web-page-assistant-unlocker-capability-runtime`
4. `.trellis/tasks/06-08-web-page-assistant-installable-block-loader`

## Integration rules

- Work on `master` unless the repository state forces a branch.
- Stage by path for every commit so each child commit only contains its task files.
- Keep the installable userscript standalone. Testable factories can remain inside marked blocks in `src/web-page-assistant.user.js`.
- Use fake adapters for DOM, storage, timers, window geometry, and event listener side effects rather than adding browser-only tests.
- Do not introduce hidden fallbacks or duplicate rule sources. The goal is to concentrate rules in the new interfaces.

## Final release step

After all children are archived and committed, run full validation. Then read `package.json`. If the version is exactly three numeric dot-separated segments, increment the patch segment and commit the version bump with the parent archive or as the parent finish commit batch before pushing.
