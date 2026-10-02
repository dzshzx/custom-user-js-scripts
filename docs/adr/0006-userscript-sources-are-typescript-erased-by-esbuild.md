# Userscript sources are TypeScript, erased by esbuild

- Status: accepted
- Date: 2026-10-02
- Related: ADR-0001 (bundle + bridge), tsconfig.json, scripts/lib/jsx-build-options.mjs, eslint.config.js, README.md "开发与验证"

## Context

About 12.6k lines of hand-written userscript source had no type checking: only
ESLint's recommended rules and valibot validation at the storage and sync
boundaries. The repository owner chose a full move to TypeScript for long-term
maintainability. Installed copies update by `@version`, so the migration must
not change what users run.

## Decision

1. Sources under `src/userscripts/` are TypeScript: `<id>.entry.ts`,
   `<id>-*.lib.ts`, and `.lib.tsx` for JSX. Relative imports carry the `.ts` /
   `.tsx` extension; types use `import type`. Only erasable syntax is allowed
   (`erasableSyntaxOnly`, `verbatimModuleSyntax`), so the same files run under
   esbuild and Node's built-in type stripping.
2. esbuild keeps bundling and erases the types. The TypeScript settings that
   change emitted code are pinned in `scripts/lib/jsx-build-options.mjs`
   (`tsconfigRaw`), shared by the build and the test loader; `tsconfig.json`
   drives type checking only. Tightening the checker therefore cannot change a
   shipped byte. In particular `strict` would imply `alwaysStrict` and make
   esbuild prepend `"use strict"` to the IIFE bundles, which have always run in
   sloppy mode; that stays off unless a release decides otherwise.
3. `tsc` runs in `strict` mode with no emit as part of `npm run lint` and
   `npm run verify`. typescript-eslint's recommended rules lint `.ts`/`.tsx`;
   its extra `no-var` / `prefer-const` style rules are off because satisfying
   them would rewrite shipped code.
4. Tests (`test/*.mjs`) and tooling (`scripts/*.mjs`) stay JavaScript. Tests
   import TypeScript sources through `scripts/jsx-loader.mjs` (esbuild, same
   options as the build). `engines.node` is `>=22.18` because
   `scripts/browser-tools/export-image.mjs` imports `.ts` sources directly and
   22.18 is the first Node 22 with type stripping on by default.
5. The inventory and version plan accept both `.entry.ts` and `.entry.js`, so
   a pre-migration Git ref still forms a complete version baseline.

## Rejected alternatives

- JSDoc types with `checkJs`: keeps `.js` but makes types verbose and second
  class; the owner chose real TypeScript.
- Migrating tests and tooling in the same change: about 15k more lines with no
  shipped-behaviour benefit, and Node 22.15–22.17 could not run them without a
  flag; can follow separately.
- TypeScript 7 (native compiler): typescript-eslint 8.x supports TypeScript
  `<6.1`, so the checker is pinned to 6.0.x until it does.
- Letting `strict` emit `"use strict"`: a runtime change in every installed
  script, out of scope for a language migration.

## Consequences

- The migration commits rebuild dist and bridge files whose only change is the
  esbuild module-path comments (`// src/.../*.lib.ts`); no `@version` moves.
- New code must type-check under `strict`; `any` and `@ts-expect-error` need a
  reason at the use site.
