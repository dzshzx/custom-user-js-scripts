# Implementation Plan

1. Read the completed docs/spec boundary outputs.
2. Inventory installable userscripts and support modules:
   - `src/*.user.js`
   - `src/*.lib.js`
   - `snippets/`
   - related tests and helper loaders.
3. Choose the final layout and record it in docs/spec before moving files.
4. Move files with path-aware updates:
   - installable `.user.js` files;
   - same-script support modules;
   - related imports or loader paths in tests;
   - README/docs/spec links.
5. Update `scripts/check-userscripts.mjs` discovery if the old `src/` flat scan is no longer enough.
6. Update `@downloadURL` / `@updateURL` for moved scripts where present.
7. Add manual migration notes for the user.
8. Run:
   - `npm run lint`
   - `npm test`
   - `git diff --check`
9. Search for stale paths:
   - `src/web-page-assistant.user.js`
   - `src/codex-quota-compass.user.js`
   - `src/feishu-preview-image-export.user.js`
   - `src/example.user.js`

## Risk Notes

- Do not hide broken path updates behind fallback discovery.
- Do not change userscript behavior while moving paths.
- Do not bump versions unless explicitly requested.
