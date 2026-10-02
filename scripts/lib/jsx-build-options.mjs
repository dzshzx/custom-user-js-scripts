// One transform configuration for the bundle and for node:test, so tests
// exercise the same transform the installed userscripts ship.
//
// tsconfig.json drives type checking only; the TypeScript settings that change
// emitted code are pinned here instead, so tightening the checker never changes
// a shipped byte. In particular `strict` implies `alwaysStrict`, which would make
// esbuild prepend "use strict" to every bundle; the bundles have always run as
// sloppy-mode IIFEs, so that stays off until a release decides otherwise.
export const TRANSFORM_OPTIONS = {
  jsx: 'automatic',
  jsxImportSource: 'preact',
  tsconfigRaw: {
    compilerOptions: {
      alwaysStrict: false,
      useDefineForClassFields: true,
      verbatimModuleSyntax: true,
    },
  },
};
