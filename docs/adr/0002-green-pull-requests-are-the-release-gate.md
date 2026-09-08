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

## Amendment: reuse release authorization (2026-09-05)

The authorization wording in decision 3 is superseded: an existing explicit
request to release covers the version bump and candidate preparation. When the
release decision is missing, complete the changes, validation, and PR before
asking for it at the merge boundary. The green PR, rebuilt artifacts, exact
candidate, and immutable published-version requirements remain in force.

## Amendment: candidate branches replace the pull request (2026-09-08)

The pull request was only the vehicle; the gate is "the exact commit that
reaches `master` has green CI". With a single maintainer the review half of a
PR is empty, so the vehicle changes and the gate becomes mechanical:

1. Push the clean, rebased commit as `candidate/<sha12>-<id>`
   (`scripts/candidate.sh`). CI runs on the candidate.
2. `promote.yml` (loaded from `master`, never executing candidate code) waits
   until every CI run for that sha is green, fast-forwards `master` to the
   exact sha and deletes the candidate branch.
3. The `master` ruleset requires the `verify` check on every pushed sha and
   refuses non-fast-forward pushes, so neither a direct push nor a merge can
   land an unverified commit. The gate is no longer procedural.

Decisions 1–3 stand with "pull request" read as "candidate". The PR template
is retired; external pull requests still run CI and are landed through a
candidate by the maintainer.
