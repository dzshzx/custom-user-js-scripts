# land publishes only the exact commit whose ci-ok is green

- Status: accepted
- Date: 2026-10-07
- Related: PRODUCT.md "Version Policy" (the rule text), README.md "开发与验证", .github/workflows/ci.yml, scripts/version-plan.mjs, GLOSSARY.md (Release Gate), fleet-state ADR 0053 (dependency updates)

## Context

Every `@downloadURL` / `@updateURL` reads `master`, so whatever reaches
`master` with a new `@version` is immediately offered to every installed copy,
and script managers treat a fetched version as immutable. Publication therefore
has to be decided before `master` moves, on the exact commit that will become
`master`, against the baseline that is current at that moment.

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
   `land --no-recut` command pushes `candidate/<sha>`, waits for that sha's
   `ci-ok`, fast-forwards `master` to the same sha and deletes the candidate.
   If `master` advanced meanwhile, `land --no-recut` stops so the branch can be
   rebased and checked again. External pull requests run the same CI and reach
   `master` through a candidate.
4. **Versions.** Bump levels, release authorization, the version-plan stop
   conditions and immutability of published versions are owned by
   `PRODUCT.md` "Version Policy": the next patch by default, minor and major
   only after the maintainer's confirmation.
5. **Dependency updates.** Local Renovate opens the update pull request; the
   userscripts adapter rebuilds, bumps the next patch of every userscript whose
   dist bundle changed (and only those), verifies the exact derived commit with
   `npm run verify`, and lands it with `land --no-recut --sha <commit>`, so it
   passes the same `ci-ok` gate. Only patch/minor updates eligible under
   fleet-state ADR 0053 land unattended; others are handled manually through the
   same gate. GitHub auto-merge stays off; Dependabot keeps alerts only
   (`open-pull-requests-limit: 0`).

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

## Decision history

- 2026-08-17: a release is judged green on the same commit before it is published (commit `e78c25d`).
- 2026-09-05: an existing explicit request to release covers the version bump and candidate preparation (commit `1fb7d6d`).
- 2026-09-28: targets default to the next patch; minor and major need the maintainer's confirmation (commit `b6fc697`).
- 2026-10-01: dependency updates move to local Renovate through the same gate; GitHub auto-merge stays off (commit `2d4d7c9`).
