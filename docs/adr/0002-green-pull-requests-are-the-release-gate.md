# Green pull requests are the userscript release gate

- Status: superseded by [ADR-0007](./0007-land-publishes-only-a-green-exact-commit.md) (was: accepted; amended 2026-09-05, 2026-09-08, 2026-09-14, 2026-09-28, 2026-09-29, 2026-10-01)
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

## Amendment: version-plan approval gate (2026-09-14)

The task's existing release authorization covers only an exact next patch for
each installable userscript. Before a candidate push,
`scripts/version-plan.mjs` accepts read-only target proposals and compares the
complete target set with published versions on `origin/master`. Unchanged items
remain in the canonical plan. A minor, major, skipped patch, or another forward
transition needs explicit approval of that plan's SHA-256 summary, recorded as
exactly one `Version-Approval` trailer on the candidate commit and supplied to
`scripts/candidate.sh`.

The summary binds the normalized repository, every install identity, baseline,
and target. It checks plan consistency but does not authenticate the approver.
Changing a baseline or target invalidates the approval. Unknown baselines,
missing targets, invalid versions, downgrades, and mismatched bundled copies are
incomplete plans and cannot be approved through this mechanism.

The local candidate script checks before pushing. The promote workflow, loaded
from trusted `master`, fetches `origin/master` again after CI admission and
rechecks the candidate tree and commit trailer in the same step that performs
the fast-forward. It never executes candidate-owned guard code with its write
token.

## Amendment: agent-chosen versions (2026-09-28)

The 2026-09-14 version-plan approval gate is withdrawn. Stopping for the user
to confirm minor, major, or skipped-patch plans interrupted releases without
constraining them. The agent now chooses each target `@version` under the bump
levels in `PRODUCT.md` "Version Policy" (patch by default, minor for a
user-visible capability, major only when the user names it).

`scripts/version-plan.mjs` no longer computes a plan digest, and neither
`scripts/candidate.sh` nor the trusted promote step accepts or requires a
confirmation argument or `Version-Approval` trailer; trailers on older commits
are ignored. The remaining hard stops are unchanged: an unknown baseline, an
incomplete target set or invalid metadata, and a downgrade of an immutable
published version. Every other forward transition passes. The promote
workflow still rechecks the candidate from trusted `master` against a fresh
baseline immediately before the fast-forward.

## Amendment: land replaces promote (2026-09-29)

`promote.yml`, the `ci-runs-verdict` action, `scripts/candidate.sh` and
`scripts/promote-version-plan.sh` are removed. The gate stays "the exact commit
that reaches `master` has green CI"; only the client that walks it changes:

1. The global `land` command pushes `candidate/<sha>`, waits for that sha's
   `ci-ok` check (the summary job over every CI job), fast-forwards `master` to
   the exact sha and deletes the candidate. When `master` advanced meanwhile,
   `land` recuts the candidate on top of it and CI runs again.
2. The version-plan recheck moves into CI: every non-`master` run (candidate or
   pull request) runs `version-plan.mjs check` against the current
   `origin/master`. Publication still happens only by advancing `master`, so
   the fresh-baseline property holds through `land`'s re-test on recut.
3. The recheck now runs candidate-owned code with a read-only token instead of
   trusted `master` code with a write token. No workflow holds a write token
   over candidate code any more, and a single maintainer authors every
   candidate, so the trusted-loader split has nothing left to protect.
4. The `master` ruleset requires `ci-ok`. Dependabot pull requests (dependency
   updates only, no `@version` change) auto-merge by rebase once `ci-ok` is
   green; the rebase gives the landed commit a new sha, which is the one
   accepted exception to the exact-sha rule.

## Amendment: publication checks and manual dependency updates (2026-10-01)

Candidates and pull requests retain the full version-plan, build, lint and test
gate before their exact commit can reach `master`. The server-side `ci-ok`
requirement remains active. `master` pushes no longer start a second CI run;
the previous post-publication deduplication job is removed.

Dependabot continues to open grouped weekly updates with the existing three-day
cooldown. Automatic merging is disabled and its write-token workflow is retired.
The owner validates updates and lands them through the same candidate gate;
there is no automatic rebase exception to the admitted commit identity.

The `ci-ok` summary requires the verification job to succeed. Failure,
cancellation or a skipped verification cannot satisfy the gate. Userscript
metadata, install paths, version policy and publication authorization remain
owned by the existing release contract.
