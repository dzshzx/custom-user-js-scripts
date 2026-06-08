# Implementation Plan

- [x] Confirm no active dirty source changes before starting child 1.
- [x] Start and complete child 1, then commit its changes.
- [x] Start and complete child 2, then commit its changes.
- [ ] Start and complete child 3, then commit its changes.
- [ ] Run full `npm test` and `npm run lint` after all child work.
- [ ] Increment touched installable userscript `@version` patch numbers when shaped as `x.y.z`.
- [ ] Re-run full validation after version bump.
- [ ] Commit final version and Trellis parent changes.
- [ ] Push to `origin/master`; merge back to `master` first if work is on another branch.
- [ ] Archive parent task after push.
