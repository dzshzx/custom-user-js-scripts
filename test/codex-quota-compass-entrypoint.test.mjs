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

test('bundled entry preserves sync form focus and unsubmitted input during remote archive notifications', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://chatgpt.com/codex/cloud/settings/analytics#usage' });
  const values = new Map();
  let changed;
  window.structuredClone = structuredClone;
  window.GM_getValue = (key, fallback) => values.get(key) || fallback;
  window.GM_setValue = (key, value) => { values.set(key, value); };
  window.GM_addValueChangeListener = (_key, listener) => { changed = listener; return 1; };
  window.GM_removeValueChangeListener = () => {};
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
  try {
    window.eval(await readFile(new URL('../dist/codex-quota-compass.user.js', import.meta.url), 'utf8'));
    window.document.querySelector('.cqc-button').click();
    await until(() => window.document.querySelector('[data-view="archive"]'));
    window.document.querySelector('[data-view="archive"]').click();
    const token = window.document.querySelector('[data-field="token"]');
    token.focus();
    token.value = 'unsaved-test-input';
    token.dispatchEvent(new window.Event('input', { bubbles: true }));
    changed(DEFAULT_ARCHIVE_KEY, null, values.get(DEFAULT_ARCHIVE_KEY), true);
    await tick();
    await tick();
    assert.equal(window.document.activeElement, token);
    assert.equal(window.document.querySelector('[data-field="token"]'), token);
    assert.equal(token.value, 'unsaved-test-input');
    token.blur();
    changed(DEFAULT_ARCHIVE_KEY, null, values.get(DEFAULT_ARCHIVE_KEY), true);
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
