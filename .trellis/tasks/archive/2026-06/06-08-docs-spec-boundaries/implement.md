# Implementation Plan

1. Load `trellis-before-dev` and read applicable frontend specs.
2. Inspect README, docs, CONTEXT, and `.trellis/spec/frontend/` for duplicated responsibilities.
3. Update README into a concise entrypoint.
4. Create or update docs pages for relocated script-specific content.
5. Update `.trellis/spec/frontend/` with the implementation-facing responsibility map.
6. Define the target source layout for installable userscripts and support modules.
7. Verify `CONTEXT.md` remains glossary-only.
8. Run:
   - `npm run lint`
   - `npm test`
   - `git diff --check`
9. Review changed docs/specs for duplicate facts, stale links, and unintended version changes.

## Risk Notes

- Do not turn README into another index that duplicates every docs heading.
- Do not move scripts or source files here; the installable-userscript migration and tooling children own moves.
