import assert from 'node:assert/strict';
import test from 'node:test';

import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

test('the final Compass release only shows a dismissible uninstall notice', { skip: domSkip }, async () => {
  const window = createDomWindow({ url: 'https://chatgpt.com/' });
  const { RETIRED_MESSAGE, RETIRED_NOTICE_ID, showRetiredNotice } =
    await import('../src/userscripts/codex-quota-compass/codex-quota-compass.entry.ts');
  const notice = window.document.getElementById(RETIRED_NOTICE_ID);
  assert.ok(notice, 'loading the script shows the notice');
  assert.equal(RETIRED_MESSAGE, 'Codex Quota Compass 已停止维护，请在脚本管理器里卸载。');
  assert.match(notice.textContent, /已停止维护，请在脚本管理器里卸载/);
  assert.equal(showRetiredNotice(window.document), notice, 'a second call reuses the notice');
  assert.equal(window.document.querySelectorAll(`#${RETIRED_NOTICE_ID}`).length, 1);
  notice.querySelector('button').click();
  assert.equal(window.document.getElementById(RETIRED_NOTICE_ID), null, 'closing removes it');
});

test('the final Compass bundle keeps no former feature code', async () => {
  const { readFile } = await import('node:fs/promises');
  const bundle = await readFile(new URL('../dist/codex-quota-compass.user.js', import.meta.url), 'utf8');
  assert.match(bundle, /@version\s+0\.5\.31/);
  assert.match(bundle, /@grant\s+none/);
  assert.doesNotMatch(bundle, /GM_xmlhttpRequest|api\.github\.com|Snapshot Archive/);
  assert.ok(bundle.length < 4000, `bundle stays minimal (${bundle.length} bytes)`);
});
