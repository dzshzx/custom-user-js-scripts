import test from 'node:test';
import assert from 'node:assert/strict';

import { createDomWindow, domSkip } from './helpers/dom-env.mjs';
import { createWebPageAssistantSession } from '../src/userscripts/web-page-assistant/web-page-assistant-session.lib.js';
import { createWebPageAssistantView } from '../src/userscripts/web-page-assistant/web-page-assistant-view.lib.js';
import * as Settings from '../src/userscripts/web-page-assistant/web-page-assistant-settings.lib.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

function createHarness({ readSettings, writeSettings, initialPosition = null, preparedPosition } = {}) {
  const window = createDomWindow({ url: 'https://example.com/article?id=1' });
  const host = window.document.createElement('main');
  host.id = 'host';
  window.document.body.append(host);
  let view;
  let position = initialPosition;
  const writes = [];
  let stored = Settings.emptySettings();
  const storage = {
    readSettings: readSettings || (async () => JSON.parse(JSON.stringify(stored))),
    async writeSettings(value) {
      writes.push(value);
      if (writeSettings) await writeSettings(value);
      stored = JSON.parse(JSON.stringify(value));
    },
    async updateSettings(change) {
      const next = change(Settings.normalizeSettings(await storage.readSettings()));
      await storage.writeSettings(next);
      return next;
    },
  };
  const session = createWebPageAssistantSession({
    keys: { pageKey: 'https://example.com/article?id=1', siteKey: 'example.com' },
    storage,
    clock: {
      now: () => 1_000,
      setInterval: window.setInterval.bind(window),
      clearInterval: window.clearInterval.bind(window),
    },
    reload() {},
    unlocker: { install() {}, uninstall() {} },
    async ready() {
      if (preparedPosition !== undefined) position = preparedPosition;
    },
    onChange(snapshot, change) {
      view?.update(snapshot, change);
    },
  });
  const positions = {
    get: () => position,
    normalize(value) { return value; },
    async write(value) { return value; },
  };
  view = createWebPageAssistantView({
    session,
    keys: { pageKey: 'https://example.com/article?id=1', siteKey: 'example.com' },
    document: window.document,
    window,
    positions,
    ready: () => session.start(),
    clock: {
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    },
  });
  return { window, host, session, view, writes };
}

function dialogOf(window) {
  return window.document.querySelector('.part-backdrop');
}

test('open intents merge while initialization is pending and failure disables writes', { skip: domSkip }, async () => {
  const read = deferred();
  const harness = createHarness({ readSettings: () => read.promise });
  const first = harness.view.openSettings({ tab: 'refresh', scope: 'page' });
  const second = harness.view.openSettings({ tab: 'unlocker', scope: 'site' });
  assert.equal(first, second);
  read.resolve(Settings.emptySettings());
  assert.equal((await first).ok, true);
  const dialog = dialogOf(harness.window);
  assert.equal(dialog.querySelector('[data-part-tab="unlocker"]').getAttribute('aria-selected'), 'true');
  assert.equal(dialog.querySelector('input[name="part-scope"][value="site"]').checked, true);
  harness.view.dispose();
  harness.session.dispose();

  const failed = createHarness({ readSettings: async () => { throw new Error('read failed'); } });
  const result = await failed.view.openSettings({ tab: 'refresh' });
  assert.equal(result.ok, false);
  const failedDialog = dialogOf(failed.window);
  assert.match(failedDialog.querySelector('[data-part-role="message"]').textContent, /初始化失败/);
  assert.equal(failedDialog.querySelector('[data-part-action="save-custom"]').disabled, true);
  failed.view.dispose();
  failed.session.dispose();
});

test('dialog preserves pre-existing inert and relinquishes attributes changed by the host', { skip: domSkip }, async () => {
  const harness = createHarness();
  harness.host.setAttribute('inert', 'host-before-open');
  const sibling = harness.window.document.createElement('aside');
  harness.window.document.body.append(sibling);
  await harness.view.openSettings();
  assert.equal(harness.host.getAttribute('inert'), 'host-before-open');
  assert.equal(sibling.getAttribute('inert'), '');

  sibling.setAttribute('inert', 'host-during-open');
  dialogOf(harness.window).querySelector('[data-part-action="close-dialog"]').click();
  assert.equal(harness.host.getAttribute('inert'), 'host-before-open');
  assert.equal(sibling.getAttribute('inert'), 'host-during-open');
  harness.view.dispose();
  harness.session.dispose();
});

test('settings notification and save completion preserve edits made during the write', { skip: domSkip }, async () => {
  const write = deferred();
  const harness = createHarness({ writeSettings: () => write.promise });
  await harness.view.openSettings();
  const dialog = dialogOf(harness.window);
  const input = dialog.querySelector('[data-part-role="custom-value"]');
  input.value = '30';
  dialog.querySelector('[data-part-action="save-custom"]').click();
  await flush();
  input.value = '42';
  input.dispatchEvent(new harness.window.Event('input', { bubbles: true }));
  input.focus();
  write.resolve();
  await flush();
  await flush();

  assert.equal(dialogOf(harness.window), dialog);
  assert.equal(dialog.querySelector('[data-part-role="custom-value"]'), input);
  assert.equal(input.value, '42');
  assert.equal(harness.window.document.activeElement, input);
  assert.match(dialog.querySelector('[data-part-role="message"]').textContent, /已保存到当前页面/);
  const saveButton = dialog.querySelector('[data-part-action="save-custom"]');
  assert.equal(saveButton.disabled, false);
  assert.equal(saveButton.textContent, '保存自定义时间');
  saveButton.click();
  await flush();
  await flush();
  assert.equal(harness.writes.length, 2, 'the preserved form can save again');
  harness.view.dispose();
  harness.session.dispose();
});

test('a failed save preserves edits made after submission and reports the failure', { skip: domSkip }, async (t) => {
  t.mock.method(console, 'warn', () => {});
  const write = deferred();
  const harness = createHarness({ writeSettings: () => write.promise });
  await harness.view.openSettings();
  const dialog = dialogOf(harness.window);
  const input = dialog.querySelector('[data-part-role="custom-value"]');
  input.value = '30';
  dialog.querySelector('[data-part-action="save-custom"]').click();
  await flush();
  input.value = '42';
  input.dispatchEvent(new harness.window.Event('input', { bubbles: true }));
  write.reject(new Error('storage unavailable'));
  await flush();
  await flush();

  assert.equal(dialogOf(harness.window), dialog);
  assert.equal(input.value, '42');
  assert.match(dialog.querySelector('[data-part-role="message"]').textContent, /设置保存失败.*storage unavailable/);
  harness.view.dispose();
  harness.session.dispose();
});

test('a save from a closed dialog cannot rebuild a newly opened dialog', { skip: domSkip }, async () => {
  const write = deferred();
  const harness = createHarness({ writeSettings: () => write.promise });
  await harness.view.openSettings();
  dialogOf(harness.window).querySelector('[data-part-action="save-preset"]').click();
  await flush();
  dialogOf(harness.window).querySelector('[data-part-action="close-dialog"]').click();
  await harness.view.openSettings();
  const reopened = dialogOf(harness.window);
  const input = reopened.querySelector('[data-part-role="custom-value"]');
  input.value = '42';
  input.dispatchEvent(new harness.window.Event('input', { bubbles: true }));
  write.resolve();
  await flush();
  await flush();

  assert.equal(dialogOf(harness.window), reopened);
  assert.equal(reopened.querySelector('[data-part-role="custom-value"]'), input);
  assert.equal(input.value, '42');
  harness.view.dispose();
  harness.session.dispose();
});

test('a rejected dispatch clears pending state and cannot report into a reopened dialog', { skip: domSkip }, async (t) => {
  t.mock.method(console, 'warn', () => {});
  const rejected = deferred();
  const harness = createHarness();
  await harness.view.openSettings();
  harness.session.dispatch = () => rejected.promise;
  const original = dialogOf(harness.window);
  original.querySelector('[data-part-action="save-preset"]').click();
  await flush();
  original.querySelector('[data-part-action="close-dialog"]').click();
  await harness.view.openSettings();
  const reopened = dialogOf(harness.window);
  rejected.reject(new Error('transport rejected'));
  await flush();
  await flush();

  assert.equal(dialogOf(harness.window), reopened);
  assert.equal(reopened.querySelector('[data-part-role="message"]').textContent, '');
  harness.view.update(harness.session.getState(), { kind: 'settings', area: 'unlocker' });
  assert.notEqual(dialogOf(harness.window), reopened, 'dispatch rejection releases the pending update guard');
  harness.view.dispose();
  harness.session.dispose();
});

test('dispose settles an open intent whose initialization is still pending', { skip: domSkip }, async () => {
  const read = deferred();
  const harness = createHarness({ readSettings: () => read.promise });
  const opening = harness.view.openSettings();
  harness.view.dispose();
  assert.deepEqual(await opening, { ok: false, code: 'disposed' });
  harness.session.dispose();
});

test('the first widget mount uses the position prepared during session startup', { skip: domSkip }, async () => {
  const harness = createHarness({ preparedPosition: { left: 64, top: 72 } });
  await harness.session.start();
  const widget = harness.window.document.querySelector('.part-widget');
  assert.equal(widget.style.left, '64px');
  assert.equal(widget.style.top, '72px');
  harness.view.dispose();
  harness.session.dispose();
});

test('a write completing after disposal cannot restore the interface', { skip: domSkip }, async () => {
  const write = deferred();
  const harness = createHarness({ writeSettings: () => write.promise });
  await harness.view.openSettings();
  dialogOf(harness.window).querySelector('[data-part-action="save-preset"]').click();
  await flush();
  harness.view.dispose();
  harness.session.dispose();
  write.resolve();
  await flush();
  await flush();
  assert.equal(harness.window.document.getElementById('page-auto-refresh-timer-root'), null);
});
