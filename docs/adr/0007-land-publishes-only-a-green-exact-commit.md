# land publishes only the exact commit whose ci-ok is green

- Status: accepted (supersedes ADR-0002)
- Date: 2026-10-07
- Related: PRODUCT.md "Version Policy" (the rule text), README.md "开发与验证", .github/workflows/ci.yml, scripts/version-plan.mjs, CONTEXT.md (Release Gate), fleet-state ADR 0053 (dependency updates)

## Context

Every `@downloadURL` / `@updateURL` reads `master`, so whatever reaches
`master` with a new `@version` is immediately offered to every installed copy,
and script managers treat a fetched version as immutable. Publication therefore
has to be decided before `master` moves, on the exact commit that will become
`master`, against the baseline that is current at that moment.

Owner decisions this contract rests on:

- 2026-09-05: an existing explicit request to release covers the version bump
  and candidate preparation (commit `1fb7d6d`).
- 2026-09-28: each target `@version` defaults to the next patch; a minor (a
  capability the user can notice) or a major (including `0.x` → `1.0.0`)
  needs the user's confirmation first (commit `b6fc697`, following the
  owner's workspace-wide version rule).
- 2026-10-01: dependency updates move to the owner's local Renovate service and
  land through the same gate; GitHub auto-merge stays off (commit `2d4d7c9`;
  fleet-state ADR 0053).

## Decision

1. **The gate.** `master` advances only by fast-forward to a commit whose
   `ci-ok` check is green. The `master` ruleset requires `ci-ok` (GitHub
   Actions), refuses non-fast-forward pushes and deletion, and has no bypass, so
   neither a direct push nor a merge can publish an unverified commit.
2. **CI.** `.github/workflows/ci.yml` runs on pushes to `candidate/**` and on
   pull requests to `master`; `master` pushes start no run. The `verify` job
   runs `npm ci`, `npm run test:prepare`, `version-plan.mjs check` against the
   current `origin/master`, and `npm run verify` (build, artifact freshness,
   metadata lint, `tsc`, ESLint, all tests). `ci-ok` succeeds only when
   `verify` succeeded; failure, cancellation or a skipped verification cannot
   satisfy it.
3. **The client is `land`.** A releasing change bumps `@version` on the task
   branch together with the rebuilt dist and bridge files, then the global
   `land` command pushes `candidate/<sha>`, waits for that sha's `ci-ok`,
   fast-forwards `master` to the same sha and deletes the candidate. If
   `master` advanced meanwhile, `land` either recuts the candidate onto it and
   CI runs again, or, with `--no-recut`, stops so the branch can be rebased and
   rechecked; either way the version plan is checked against the baseline that
   the published commit sits on. External pull requests run the same CI and
   reach `master` through a candidate.
4. **Versions.** Before changing versions, refresh `origin/master` and run
   `version-plan.mjs plan` over every installable script. The task's release
   authorization covers the exact next patch; minor and major need the user's
   confirmation first; when the release decision itself is missing, prepare and
   validate on the task branch and ask before pushing the candidate. The script
   stops on an unknown baseline, an incomplete or duplicate target set, a
   missing script, invalid metadata, an orphan dist installable, mismatched
   entry/bridge/dist versions, or a downgrade; every other forward transition
   passes. A version that reached `master` is immutable; corrections ship as the
   next patch. A change may keep its version only when the user chose not to
   release it yet.
5. **Dependency updates.** Local Renovate opens the update pull request; the
   userscripts adapter rebuilds, bumps the next patch of every userscript whose
   dist bundle changed (and only those), verifies the exact derived commit with
   `npm run verify`, and lands it with `land --no-recut --sha <commit>`, so it
   passes the same `ci-ok` gate. Only patch/minor updates eligible under
   fleet-state ADR 0053 land unattended; others are handled manually through the
   same gate. Dependabot keeps alerts only (`open-pull-requests-limit: 0`).

## Considered Options

- **Push to `master`, then let CI judge**: publication happens before the
  verdict, and a published version cannot be retracted. Rejected.
- **A workflow that holds a write token and promotes candidates**: it has to
  run trusted-loader code over candidate content. With one maintainer authoring
  every candidate, a local client under the server-side `ci-ok` requirement
  gives the same guarantee with no write token in CI. Rejected.
- **Platform auto-merge of dependency pull requests**: a rebase merge lands a
  commit other than the one CI verified, and dependency bumps that change dist
  must also bump `@version`. Rejected in favour of the Renovate adapter above.

## Consequences

- Publication is mechanical: the server-side rule, not procedure, keeps
  unverified commits off `master`.
- Non-releasing changes (including dependency updates that leave dist
  unchanged) land without a bump; installed copies stay on the prior version.
- The agent entry files are local (ADR-0005) and must describe the same flow.
