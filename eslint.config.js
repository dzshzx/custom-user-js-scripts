import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// `_`-prefixed bindings mark deliberately unused slots (rest-omit
// destructuring, positional callback args); best-effort catch blocks
// may ignore the error.
const UNUSED_VARS_OPTIONS = { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' };

export default [
  {
    ignores: ['dist/**', 'src/userscripts/*/*.user.js', '.scratch/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', UNUSED_VARS_OPTIONS],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // TypeScript sources: typescript-eslint's recommended set; `tsc --noEmit`
  // (part of `npm run lint`) owns type checking.
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.{ts,tsx}'] })),
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', UNUSED_VARS_OPTIONS],
      // `interface X extends Array<Y> {}` is how a recursive JSON type stays shallow for tsc.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // typescript-eslint's eslint-recommended layer adds these two style rules
      // for TS files only. Rewriting `var`/`let` changes the shipped bundle, so
      // TS sources keep the same rule set the JavaScript sources had.
      'no-var': 'off',
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/**'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.greasemonkey },
    },
  },
];
