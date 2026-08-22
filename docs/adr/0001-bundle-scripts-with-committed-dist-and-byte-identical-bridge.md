# Bundle multi-module scripts into a committed dist file with a byte-identical bridge

- Status: accepted
- Date: 2026-07-24 (decided, commits e6ea2ac / 59b7567 / 1cfcafd); bridge rule fixed 2026-07-25 (303ff01, 2790026); recorded 2026-08-23
- Related: CONTEXT.md (Entry, Lib Module, Dist Bundle, Bridge File), PRODUCT.md "Installability Principles", docs/script-template.md

## Context

The two scripts with large injected UIs (codex-quota-compass, web-page-assistant)
had grown into multi-file IIFE scripts glued together with `@require`. Script
managers cache `@require` targets and refresh them only on a `@version`
change, module boundaries were implicit globals, and missing dependencies
surfaced only at runtime. When the first bundled release replaced the legacy
`src/.../<id>.user.js` with a thin stub, installed copies that still held the
legacy download URL were stranded on the stub; 0.5.1 / 0.3.1 had to be shipped
to heal them.

## Decision

1. Source is ESM: `<id>.entry.js` owns the metadata block (no `@require`) and
   imports `<id>-*.lib.js` modules with named exports.
2. `npm run build` (esbuild, iife, unminified, utf8) produces the committed
   single-file `dist/<id>.user.js`; `@downloadURL` / `@updateURL` point at it.
3. The legacy `src/.../<id>.user.js` path is regenerated as a byte-identical
   copy of the dist bundle — the full script, never a stub — so either URL a
   manager holds installs a working script.
4. The build rejects `@require`, rejects an entry whose `SCRIPT_VERSION`
   constant disagrees with `@version`, and rejects orphan lib modules; lint
   pairs every bridge with its dist file by full content; CI fails when the
   committed dist or bridge is not the rebuilt output.

## Consequences

- Installed scripts keep zero runtime dependencies; esbuild and happy-dom are
  devDependencies only.
- Every source change to a bundled script commits three files (entry/lib,
  dist, bridge); the diff is noisy but auditable because the bundle is not
  minified.
- Rejected: keeping `@require` (cache and global-scope problems above); a stub
  bridge (strands installs); gitignoring dist (the install URL must resolve to
  a committed file).
