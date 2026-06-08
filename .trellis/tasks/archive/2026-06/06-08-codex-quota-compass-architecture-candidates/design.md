# Design

## Architecture

The parent task owns sequencing and final integration. Actual implementation lives in child tasks.

Child modules should deepen existing seams without introducing a build step:

- Runtime port: new installable library that owns ChatGPT host validation, session-token discovery, authenticated fetch, request errors, and handoff to `createQuotaCalculator`.
- Floating panel shell: new installable library that owns panel DOM mounting, geometry, drag, outside close, resize, and injected CSS. The userscript supplies translated markup/content and action callbacks.
- Snapshot contract: new installable library that owns result-field access, rolling period lookup, main seven-day window identity, and archive projection.
- Sync status source: one shared function decides backend label, cross-device capability, local-only status, and reason. Callers stop recomputing the same rules.

## Compatibility

- Userscript remains plain JavaScript with `@require` dependencies from this repository.
- New libs attach to `globalThis` like existing `CodexQuotaCompassCoreLib` and `CodexQuotaCompassArchiveLib`.
- Tests import libraries explicitly in dependency order.
- Version bump happens after all behavior changes are integrated.

## Rollback

- Each child task is small enough to inspect with `git diff`.
- If a child introduces regressions, revert that child's code changes before starting the next child.
