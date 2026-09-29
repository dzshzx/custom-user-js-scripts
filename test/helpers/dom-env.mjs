// DOM environment helper for UI/UX tests.
//
// happy-dom is an exact-pinned devDependency (package.json, installed by
// `npm ci`, so CI always has it). Runtime userscripts still carry zero
// dependencies — this only affects tests.
//
// Tests that need a DOM import this helper and pass `{ skip: domSkip }`; if a
// checkout skipped `npm ci`, those tests skip cleanly instead of failing.

let happyDomModule = null;
try {
  happyDomModule = await import('happy-dom');
} catch {
  happyDomModule = null;
}

export const domAvailable = typeof happyDomModule?.Window === 'function';

export const domSkip = domAvailable
  ? false
  : 'DOM library not installed; run `npm install --no-save --no-package-lock happy-dom` to enable UI/UX tests.';

// Preact creates nodes through the global `document` (as it exists in a real
// userscript page). Modules that render with preact and are imported directly
// by a test need `globalDocument: true`; the latest window wins, and each test
// file runs in its own process, so the global never leaks across files.
export function createDomWindow({ url = 'https://chatgpt.com/', globalDocument = false } = {}) {
  if (!domAvailable) {
    throw new Error('happy-dom is not installed.');
  }
  const window = new happyDomModule.Window({ url });
  if (globalDocument) globalThis.document = window.document;
  return window;
}

export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}
