# Green pull requests are the userscript release gate

- Status: accepted
- Date: 2026-08-17 (commit e78c25d); recorded 2026-08-23
- Related: PRODUCT.md "Version Policy" (the rule text), README.md "开发与验证", .github/workflows/ci.yml, .github/pull_request_template.md, CONTEXT.md (Release Gate)

## Context

Every `@downloadURL` / `@updateURL` reads `master`, so whatever lands on
`master` with a new `@version` is immediately offered to every installed copy.
Until August releases were pushed straight to `master` and the push-triggered
CI decided afterwards whether the published version was valid — too late to
retract, because script managers treat a version as immutable once fetched.

## Decision

1. A releasing `@version` bump is made on a candidate branch together with the
   rebuilt dist/bridge; the pull request's CI (build → dist freshness → lint →
   test) must be green.
2. That exact green commit is merged to `master`; the merge is the external
   publication. No merge-first-then-wait-for-push-CI.
3. A version that reached `master` is immutable; any correction ships as the
   next patch version. Whether to release at all is still asked of the user
   before the bump.

## Consequences

- The gate is procedural (there is no branch protection); the PR template and
  CI make the expected sequence visible, and `README.md` / `PRODUCT.md` state
  it for public readers. The agent entry files (local) must describe the same
  flow — the 2026-08-23 audit found them still on the push-era wording.
- Non-releasing changes may merge without a bump; installed copies then stay on
  the prior version by design.
