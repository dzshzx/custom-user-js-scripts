# Bundle multi-module scripts into a committed dist file with a byte-identical bridge

- Status: accepted
- Date: 2026-07-24 (commits e6ea2ac / 59b7567 / 1cfcafd); bridge rule 2026-07-25 (303ff01, 2790026)
- Related: GLOSSARY.md (Entry, Lib Module, Dist Bundle, Bridge File), PRODUCT.md "Installability Principles", docs/script-template.md

## Context

Multi-file scripts glued together with `@require` broke in practice: managers
refresh `@require` targets only on a `@version` change, module boundaries were
implicit globals, and missing dependencies surfaced only at runtime. A thin stub
at the legacy `src/.../<id>.user.js` path stranded installs that still held that
URL (0.5.1 / 0.3.1 shipped to heal them).

## Decision

1. Source is ESM: `<id>.entry.ts` owns the metadata block (no `@require`) and
   imports `<id>-*.lib.ts(x)` modules with named exports.
2. `npm run build` (esbuild, iife, unminified, utf8) produces the committed
   single-file `dist/<id>.user.js`; `@downloadURL` / `@updateURL` point at it.
   Runtime npm dependencies are allowed: lib modules import them and esbuild
   bundles them into dist, so the installed script stays self-contained.
3. The legacy `src/.../<id>.user.js` path is regenerated as a byte-identical
   copy of the dist bundle — the full script, never a stub — so either URL a
   manager holds installs a working script.
4. The build rejects `@require`, rejects an entry whose `SCRIPT_VERSION`
   constant disagrees with `@version`, and rejects orphan lib modules; lint
   pairs every bridge with its dist file by full content; CI fails when the
   committed dist or bridge is not the rebuilt output.

## Consequences

- Every source change to a bundled script commits three files (entry/lib,
  dist, bridge); the diff is noisy but auditable because the bundle is not
  minified.
- Rejected: keeping `@require` (cache and global-scope problems above); a stub
  bridge (strands installs); gitignoring dist (the install URL must resolve to
  a committed file).

## Amendments

- 2026-09-08: runtime npm dependencies are welcome when esbuild bundles them into dist.
- 2026-10-02: sources became TypeScript (ADR-0006).
