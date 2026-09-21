import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';
import { DEFAULT_ARCHIVE_KEY } from '../src/userscripts/codex-quota-compass/codex-quota-compass-storage.lib.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await tick();
  }
  assert.ok(predicate(), 'expected entrypoint state was not reached');
}

function createEntrypointHarness() {
  const window = createDomWindow({ url: 'https://chatgpt.com/codex/cloud/settings/analytics#usage' });
  const values = new Map();
  let changed;
  let unsubscribed = 0;
  window.structuredClone = structuredClone;
  window.GM_getValue = (key, fallback) => values.get(key) || fallback;
  window.GM_setValue = (key, value) => { values.set(key, value); };
  window.GM_addValueChangeListener = (_key, listener) => { changed = listener; return 1; };
  window.GM_removeValueChangeListener = () => { unsubscribed++; };
  window.GM_registerMenuCommand = () => {};
  window.fetch = async (url) => {
    let body = { data: [] };
    if (url === '/api/auth/session') body = {};
    if (url === '/backend-api/wham/usage') body = {
      rate_limit: { secondary_window: {
        used_percent: 40, limit_window_seconds: 7 * 86400,
        reset_after_seconds: 86400, reset_at: Math.floor(Date.now() / 1000) + 86400,
      } },
    };
    return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return {
    window, values,
    notifyArchive: () => changed(DEFAULT_ARCHIVE_KEY, null, values.get(DEFAULT_ARCHIVE_KEY), true),
    unsubscribeCount: () => unsubscribed,
  };
}

test('bundled entry preserves sync form focus and unsubmitted input during remote archive notifications', { skip: domSkip }, async () => {
  const { window, values, notifyArchive } = createEntrypointHarness();
  try {
    window.eval(await readFile(new URL('../dist/codex-quota-compass.user.js', import.meta.url), 'utf8'));
    window.document.querySelector('.cqc-button').click();
    await until(() => window.document.querySelector('[data-view="archive"]'));
    window.document.querySelector('[data-view="archive"]').click();
    const token = window.document.querySelector('[data-field="token"]');
    token.focus();
    token.value = 'unsaved-test-input';
    token.dispatchEvent(new window.Event('input', { bubbles: true }));
    notifyArchive();
    await tick();
    await tick();
    assert.equal(window.document.activeElement, token);
    assert.equal(window.document.querySelector('[data-field="token"]'), token);
    assert.equal(token.value, 'unsaved-test-input');
    token.blur();
    notifyArchive();
    await tick();
    await tick();
    assert.equal(window.document.querySelector('[data-field="token"]').value, 'unsaved-test-input');
    assert.equal(JSON.stringify([...values]).includes('unsaved-test-input'), false);
    assert.equal(window.localStorage.getItem('codexQuotaCompassSnapshotArchiveFallback').includes('unsaved-test-input'), false);
  } finally {
    window.dispatchEvent(new window.Event('pagehide'));
    await window.happyDOM.abort();
    window.close();
  }
});

test('bundled entry resumes calculation after bfcache pagehide/pageshow and disposes on final departure', { skip: domSkip }, async () => {
  const { window, values, unsubscribeCount } = createEntrypointHarness();
  function transition(type, persisted) {
    const event = new window.Event(type);
    Object.defineProperty(event, 'persisted', { value: persisted });
    window.dispatchEvent(event);
  }
  const snapshots = () => values.get(DEFAULT_ARCHIVE_KEY)?.snapshots.length || 0;
  try {
    window.eval(await readFile(new URL('../dist/codex-quota-compass.user.js', import.meta.url), 'utf8'));
    window.document.querySelector('.cqc-button').click();
    await until(() => snapshots() === 1 && !window.__codexQuotaCompassRunning);
    for (let count = 2; count <= 3; count++) {
      transition('pagehide', true);
      assert.equal(unsubscribeCount(), 0);
      transition('pageshow', true);
      window.document.querySelector('[data-action="refresh"]').click();
      await until(() => snapshots() === count && !window.__codexQuotaCompassRunning);
    }
    transition('pagehide', false);
    assert.equal(unsubscribeCount(), 1, 'the persisted pagehide must not consume the final cleanup listener');
    window.document.querySelector('[data-action="refresh"]').click();
    await tick();
    await tick();
    assert.equal(snapshots(), 3);
  } finally {
    transition('pagehide', false);
    await window.happyDOM.abort();
    window.close();
  }
});
