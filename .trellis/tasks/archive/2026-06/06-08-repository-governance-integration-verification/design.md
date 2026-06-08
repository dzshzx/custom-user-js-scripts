# Design

## Verification Scope

This child is a final integration gate. It should not start new architecture work. If it finds a substantial new problem, create or reopen a child task instead of hiding the fix here.

## Checks

- Documentation consistency: README, docs, CONTEXT, and `.trellis/spec/frontend/`.
- Command/path consistency: package scripts, README commands, docs commands, and actual files.
- Userscript installability: metadata and final documented `.user.js` entrypoints.
- Source tests: Web Page Assistant and Codex Quota Compass test suites.
- Task evidence: parent and child artifacts reflect what was actually done.

## Rollback

If integration exposes a regression, rollback or fix the responsible child commit. The integration child should not mask a child-level regression with broad cleanup.
