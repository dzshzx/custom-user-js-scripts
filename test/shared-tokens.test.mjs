import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

import { applyTheme, buildTokenCss, resolveTheme } from '../src/userscripts/shared/shared-tokens.lib.js';

function withStubbedMatchMedia(media, run) {
  const previous = globalThis.window;
  globalThis.window = { matchMedia: () => media };
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previous;
    }
  }
}

test('buildTokenCss scopes neutral tokens, accent and resets under the root selector', () => {
  const css = buildTokenCss({ rootSelector: '#wk-root', accent: '#10a37f' });

  assert.ok(css.includes('#wk-root {'));
  assert.ok(css.includes('--wk-surface: oklch(99.2% 0.002 250);'));
  assert.ok(css.includes('--wk-border-strong: oklch(24% 0.012 250 / 0.16);'));
  assert.ok(css.includes('--wk-accent: #10a37f;'));
  assert.ok(css.includes('--wk-shadow-panel: 0 24px 80px oklch(20% 0.02 250 / 0.22);'));
  assert.ok(css.includes('--wk-fs-hero: 28px;'));
  assert.ok(css.includes('--wk-radius-pill: 999px;'));
  assert.ok(css.includes('color-scheme: light dark;'));
  assert.ok(css.includes('#wk-root[data-wk-theme="dark"] {'));
  assert.ok(css.includes('--wk-surface: oklch(25% 0.012 250);'));
  assert.ok(css.includes('#wk-root *::after'));
  assert.ok(css.includes('#wk-root :focus-visible'));
  assert.ok(css.includes('outline: 2px solid var(--wk-accent);'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
});

test('buildTokenCss uses accentDark for the dark override, accent as fallback', () => {
  const css = buildTokenCss({ rootSelector: '#wk-root', accent: '#10a37f', accentDark: '#2dd4a8' });
  const darkBlock = css.split('#wk-root[data-wk-theme="dark"]')[1];
  assert.ok(darkBlock.includes('--wk-accent: #2dd4a8;'));

  const fallbackCss = buildTokenCss({ rootSelector: '#wk-root', accent: '#10a37f' });
  const fallbackDark = fallbackCss.split('#wk-root[data-wk-theme="dark"]')[1];
  assert.ok(fallbackDark.includes('--wk-accent: #10a37f;'));
});

test('buildTokenCss rejects values that could break out of the CSS block', () => {
  assert.throws(() => buildTokenCss({ rootSelector: '#wk-root', accent: 'red; } body { display: none' }));
  assert.throws(() => buildTokenCss({ rootSelector: '#wk-root } body', accent: '#fff' }));
  assert.throws(() => buildTokenCss({ accent: '#fff' }));
});

test('resolveTheme prefers the host probe result over the media query', () => {
  withStubbedMatchMedia({ matches: true }, () => {
    assert.equal(resolveTheme(() => 'light'), 'light');
    assert.equal(resolveTheme(() => 'dark'), 'dark');
  });
  withStubbedMatchMedia({ matches: false }, () => {
    assert.equal(resolveTheme(() => 'dark'), 'dark');
  });
});

test('resolveTheme falls back to matchMedia when the probe fails or returns null', () => {
  withStubbedMatchMedia({ matches: true }, () => {
    assert.equal(resolveTheme(() => null), 'dark');
    assert.equal(resolveTheme(() => {
      throw new Error('no host');
    }), 'dark');
  });
  withStubbedMatchMedia({ matches: false }, () => {
    assert.equal(resolveTheme(), 'light');
  });
});

test('resolveTheme defaults to light without a probe or matchMedia', () => {
  const previous = globalThis.window;
  delete globalThis.window;
  try {
    assert.equal(resolveTheme(), 'light');
  } finally {
    if (previous !== undefined) globalThis.window = previous;
  }
});

test('applyTheme sets data-wk-theme, re-resolves on media change and stops after cleanup', { skip: domSkip }, () => {
  const window = createDomWindow();
  const root = window.document.createElement('div');

  const listeners = new Set();
  const media = {
    matches: false,
    addEventListener: (type, listener) => listeners.add(listener),
    removeEventListener: (type, listener) => listeners.delete(listener),
  };

  withStubbedMatchMedia(media, () => {
    let probeCalls = 0;
    const cleanup = applyTheme(root, {
      detectHost: () => {
        probeCalls += 1;
        return null;
      },
    });
    assert.equal(root.dataset.wkTheme, 'light');
    assert.equal(listeners.size, 1);
    assert.equal(probeCalls, 1);

    media.matches = true;
    for (const listener of [...listeners]) listener();
    assert.equal(root.dataset.wkTheme, 'dark');
    assert.equal(probeCalls, 2);

    cleanup();
    assert.equal(listeners.size, 0);
    media.matches = false;
    for (const listener of [...listeners]) listener();
    assert.equal(root.dataset.wkTheme, 'dark');
    assert.equal(probeCalls, 2);
  });
});

test('applyTheme observeHost re-resolves when the host element class or style changes', { skip: domSkip }, async () => {
  const window = createDomWindow();
  const documentObject = window.document;
  const root = documentObject.createElement('div');
  documentObject.body.append(root);
  const flushObserver = () => new Promise((resolve) => setTimeout(resolve, 0));

  let hostTheme = null;
  const cleanup = applyTheme(root, {
    detectHost: () => hostTheme,
    observeHost: true,
  });
  const initialTheme = root.dataset.wkTheme;
  assert.ok(initialTheme === 'light' || initialTheme === 'dark');

  hostTheme = 'dark';
  documentObject.documentElement.setAttribute('class', 'dark');
  await flushObserver();
  assert.equal(root.dataset.wkTheme, 'dark');

  hostTheme = 'light';
  documentObject.documentElement.setAttribute('style', 'color-scheme: light');
  await flushObserver();
  assert.equal(root.dataset.wkTheme, 'light');

  cleanup();
  hostTheme = 'dark';
  documentObject.documentElement.setAttribute('class', 'dark again');
  await flushObserver();
  assert.equal(root.dataset.wkTheme, 'light');
});

test('applyTheme observeHost degrades cleanly when MutationObserver is unavailable', { skip: domSkip }, () => {
  const window = createDomWindow();
  const documentObject = window.document;
  const root = documentObject.createElement('div');
  documentObject.body.append(root);

  const previous = window.MutationObserver;
  window.MutationObserver = undefined;
  try {
    const cleanup = applyTheme(root, { observeHost: true });
    assert.ok(root.dataset.wkTheme);
    cleanup();
  } finally {
    window.MutationObserver = previous;
  }
});
