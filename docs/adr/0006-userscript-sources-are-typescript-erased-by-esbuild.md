# Userscripts are TypeScript sources bundled by esbuild into a committed dist file with a byte-identical bridge

- Status: accepted
- Date: 2026-07-24 (bundling, e6ea2ac / 59b7567 / 1cfcafd; bridge rule 303ff01, 2790026); 2026-10-02 (TypeScript)
- Related: GLOSSARY.md (Entry, Lib Module, Dist Bundle, Bridge File), PRODUCT.md "Installability Principles", docs/script-template.md, tsconfig.json, scripts/lib/jsx-build-options.mjs, eslint.config.js, README.md "开发与验证"

## Context

Multi-file scripts glued together with `@require` broke in practice: managers
refresh `@require` targets only on a `@version` change, module boundaries were
implicit globals, and missing dependencies surfaced only at runtime. A thin stub
at the legacy `src/.../<id>.user.js` path stranded installs that still held that
URL (0.5.1 / 0.3.1 shipped to heal them). Later the maintainer chose
TypeScript for long-term maintainability; installed copies update by
`@version`, so the language move must not change what users run.

## Decision

1. Sources under `src/userscripts/` are TypeScript ES modules:
   `<id>.entry.ts` owns the metadata block (no `@require`) and imports
   `<id>-*.lib.ts` (`.lib.tsx` for JSX) modules with named exports. Relative
   imports carry the `.ts` / `.tsx` extension; types use `import type`. Only
   erasable syntax is allowed (`erasableSyntaxOnly`, `verbatimModuleSyntax`), so
   the same files run under esbuild and Node's built-in type stripping.
2. `npm run build` (esbuild, iife, unminified, utf8) erases the types and
   produces the committed single-file `dist/<id>.user.js`; `@downloadURL` /
   `@updateURL` point at it. Runtime npm dependencies are allowed: lib modules
   import them and esbuild bundles them, so the installed script stays
   self-contained.
3. The legacy `src/.../<id>.user.js` path is regenerated as a byte-identical
   copy of the dist bundle — the full script, never a stub — so either URL a
   manager holds installs a working script.
4. The build rejects `@require`, an entry whose `SCRIPT_VERSION` disagrees with
   `@version`, and orphan lib modules; lint pairs every bridge with its dist
   file by full content; CI fails when the committed dist or bridge is not the
   rebuilt output.
5. The TypeScript settings that change emitted code are pinned in
   `scripts/lib/jsx-build-options.mjs` (`tsconfigRaw`), shared by the build and
   the test loader; `tsconfig.json` drives type checking only, so tightening the
   checker cannot change a shipped byte. In particular `strict` would imply
   `alwaysStrict` and prepend `"use strict"` to bundles that have always run in
   sloppy mode; that stays off unless a release decides otherwise.
6. `tsc` runs in `strict` mode with no emit in `npm run lint` and
   `npm run verify`; typescript-eslint's recommended rules lint `.ts`/`.tsx`,
   with `no-var` / `prefer-const` off because satisfying them would rewrite
   shipped code. New code must type-check under `strict`; `any` and
   `@ts-expect-error` need a reason at the use site.
7. Tests (`test/*.mjs`) and tooling (`scripts/*.mjs`) stay JavaScript; tests
   import TypeScript through `scripts/jsx-loader.mjs` with the build's options.
   `engines.node` is `>=22.18`, the first Node 22 with type stripping on by
   default. The inventory and version plan accept both `.entry.ts` and
   `.entry.js`, so a pre-migration Git ref still forms a complete baseline.

## Rejected alternatives

- Keeping `@require`: the cache and global-scope problems above. A stub bridge:
  strands installs. Gitignoring dist: the install URL must resolve to a
  committed file.
- JSDoc types with `checkJs`: verbose, second-class types. Migrating tests and
  tooling too: about 15k more lines with no shipped-behaviour benefit.
- TypeScript 7: typescript-eslint 8.x supports TypeScript `<6.1`, so the checker
  stays on 6.0.x until it does. Letting `strict` emit `"use strict"`: a runtime
  change in every installed script.

## Consequences

- Every source change to a bundled script commits three files (entry/lib, dist,
  bridge); the diff is noisy but auditable because the bundle is not minified.

## Amendments

- 2026-09-08: runtime npm dependencies are welcome when esbuild bundles them into dist.
- 2026-10-02: sources became TypeScript.
- 2026-11-03: ADR-0001 (bundle and bridge) folded in and deleted.
