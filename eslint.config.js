import js from '@eslint/js';
import globals from 'globals';

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
      // `_`-prefixed bindings mark deliberately unused slots (rest-omit
      // destructuring, positional callback args); best-effort catch blocks
      // may ignore the error.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['src/**'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.greasemonkey },
    },
  },
];
