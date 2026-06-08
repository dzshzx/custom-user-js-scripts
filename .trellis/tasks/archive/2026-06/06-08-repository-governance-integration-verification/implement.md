# Implementation Plan

1. Confirm earlier child task statuses and read their completion notes.
2. Inspect final repository map:
   - `README.md`
   - `CONTEXT.md`
   - `docs/`
   - `.trellis/spec/frontend/`
   - `scripts/`
   - `src/`
   - `test/`
3. Search for stale references:
   - moved script paths;
   - old docs paths;
   - old userscript entrypoint names;
   - duplicated version guidance.
4. Verify metadata and versions:
   - no unintended `@version` change;
   - no unintended `package.json` version change;
   - install URLs point to the final documented entrypoints.
5. Run:
   - `npm run lint`
   - `npm test`
   - `git diff --check`
6. Update parent artifacts with final evidence.
7. Prepare final commit/archive sequence according to Trellis finish workflow.

## Risk Notes

- Do not turn the final integration child into a new cleanup bucket.
- If a new source issue is discovered, route it to a child task or document it as deferred.
