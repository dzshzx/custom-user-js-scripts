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
// userscript page), and shared icons, toasts and the quota panel all render
// with preact, so every DOM window installs its document globally by default;
// the latest window wins, and each test file runs in its own process, so the
// global never leaks across files.
// @floating-ui/dom reads the global `window` and DOM constructors once a
// global window exists; tests that assert panel placement pass
// `globalWindow: true`.
export function createDomWindow({ url = 'https://chatgpt.com/', globalDocument = true, globalWindow = false } = {}) {
  if (!domAvailable) {
    throw new Error('happy-dom is not installed.');
  }
  const window = new happyDomModule.Window({ url });
  if (globalDocument) globalThis.document = window.document;
  if (globalWindow) {
    globalThis.window = window;
    for (const name of ['Element', 'HTMLElement', 'Node', 'ShadowRoot']) globalThis[name] = window[name];
    globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  }
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
