// DOM environment helper for UI/UX tests.
//
// happy-dom is intentionally NOT a recorded dependency of this repository — it
// is installed locally on demand so the repo stays dependency-free:
//
//   npm install --no-save --no-package-lock happy-dom
//
// Tests that need a DOM import this helper and pass `{ skip: domSkip }`. When
// happy-dom is not installed (clean clone, CI), those tests skip cleanly and
// `npm test` still runs the dependency-free suite.

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

export function createDomWindow({ url = 'https://chatgpt.com/' } = {}) {
  if (!domAvailable) {
    throw new Error('happy-dom is not installed.');
  }
  return new happyDomModule.Window({ url });
}

export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}
