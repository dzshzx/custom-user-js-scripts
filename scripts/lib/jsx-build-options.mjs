// One JSX configuration for the bundle and for node:test, so tests exercise
// the same transform the installed userscripts ship.
export const JSX_OPTIONS = { jsx: 'automatic', jsxImportSource: 'preact' };
