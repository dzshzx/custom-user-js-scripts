import test from 'node:test';
import assert from 'node:assert/strict';

import { createDomWindow, domSkip } from './helpers/dom-env.mjs';
import { createWebPageAssistantSession } from '../src/userscripts/web-page-assistant/web-page-assistant-session.lib.ts';
import { createWebPageAssistantView } from '../src/userscripts/web-page-assistant/web-page-assistant-view.lib.ts';
import * as Settings from '../src/userscripts/web-page-assistant/web-page-assistant-settings.lib.ts';
import { deferred, flush } from './helpers/async.mjs';

function createHarness({ readSettings, writeSettings, initialPosition = null, preparedPosition, ready } = {}) {
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
    normalize(value) {
      return value;
    },
    async write(value) {
      return value;
    },
  };
  view = createWebPageAssistantView({
    session,
    keys: { pageKey: 'https://example.com/article?id=1', siteKey: 'example.com' },
    document: window.document,
    window,
    positions,
    ready: ready ? () => ready(session) : () => session.start(),
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

  const failed = createHarness({
    readSettings: async () => {
      throw new Error('read failed');
    },
  });
  const result = await failed.view.openSettings({ tab: 'refresh' });
  assert.equal(result.ok, false);
  const failedDialog = dialogOf(failed.window);
  assert.match(failedDialog.querySelector('[data-part-role="message"]').textContent, /初始化失败/);
  assert.equal(failedDialog.querySelector('[data-part-action="save-custom"]').disabled, true);
  failed.view.dispose();
  failed.session.dispose();
});

test(
  'dialog preserves pre-existing inert and relinquishes attributes changed by the host',
  { skip: domSkip },
  async () => {
    const harness = createHarness();
    harness.host.setAttribute('inert', 'host-before-open');
    const sibling = harness.window.document.createElement('aside');
    harness.window.document.body.append(sibling);
    await harness.view.openSettings();
    assert.equal(harness.host.getAttribute('inert'), 'host-before-open');
    assert.equal(sibling.hasAttribute('inert'), false, 'the native modal dialog never writes inert');

    sibling.setAttribute('inert', 'host-during-open');
    dialogOf(harness.window).querySelector('[data-part-action="close-dialog"]').click();
    assert.equal(dialogOf(harness.window), null);
    assert.equal(harness.host.getAttribute('inert'), 'host-before-open');
    assert.equal(sibling.getAttribute('inert'), 'host-during-open');
    harness.view.dispose();
    harness.session.dispose();
  },
);

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

test(
  'a rejected dispatch clears pending state and cannot report into a reopened dialog',
  { skip: domSkip },
  async (t) => {
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
  },
);

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
  // Saved positions are the former 154x48 box corner; the button sat 114px
  // right of and 8px below it.
  assert.equal(widget.style.left, '178px');
  assert.equal(widget.style.top, '80px');
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

test('the view removes only the styles it installed when disposed', { skip: domSkip }, async () => {
  const harness = createHarness();
  const { document } = harness.window;
  const hostDialogStyle = document.createElement('style');
  hostDialogStyle.id = 'page-auto-refresh-timer-root-dialog-style';
  document.head.append(hostDialogStyle);
  await harness.view.openSettings();
  const ownedIds = ['page-auto-refresh-timer-root-token-style', 'page-auto-refresh-timer-root-style'];
  for (const id of ownedIds) assert.equal(document.getElementById(id)?.parentNode, document.documentElement);
  assert.equal(document.querySelectorAll('#page-auto-refresh-timer-root-dialog-style').length, 1);
  harness.view.dispose();
  harness.session.dispose();
  for (const id of ownedIds) assert.equal(document.getElementById(id), null);
  assert.equal(document.getElementById('page-auto-refresh-timer-root-dialog-style'), hostDialogStyle);
});

test('delete and unlocker actions write the change for the scope they name', { skip: domSkip }, async (t) => {
  const pageKey = 'https://example.com/article?id=1';
  const siteKey = 'example.com';
  let seeded = Settings.emptySettings();
  for (const [scope, key] of [
    ['page', pageKey],
    ['site', siteKey],
  ]) {
    seeded = Settings.setRefreshSetting(seeded, scope, key, 30_000, 1);
    seeded = Settings.setUnlockerSetting(seeded, scope, key, Settings.defaultUnlockerSetting({ allowCopy: true }), 1);
  }
  // Every write starts from the seeded settings, so each action's change is checked on its own.
  const harness = createHarness({ readSettings: async () => JSON.parse(JSON.stringify(seeded)) });
  // The seeded refresh rule starts an interval; dispose even when an assertion fails.
  t.after(() => {
    harness.view.dispose();
    harness.session.dispose();
  });
  const rules = (settings) =>
    [
      ['refresh:page', Settings.getRefreshSetting(settings, 'page', pageKey)],
      ['refresh:site', Settings.getRefreshSetting(settings, 'site', siteKey)],
      ['unlocker:page', Settings.getUnlockerSetting(settings, 'page', pageKey)],
      ['unlocker:site', Settings.getUnlockerSetting(settings, 'site', siteKey)],
    ]
      .filter(([, setting]) => setting)
      .map(([rule]) => rule);
  const click = async (action) => {
    dialogOf(harness.window).querySelector(`[data-part-action="${action}"]`).click();
    await flush();
    await flush();
  };
  await harness.view.openSettings();
  const all = rules(seeded);
  for (const [action, removed] of [
    ['delete-page', 'refresh:page'],
    ['delete-site', 'refresh:site'],
    ['delete-unlocker-page', 'unlocker:page'],
    ['delete-unlocker-site', 'unlocker:site'],
  ]) {
    const before = harness.writes.length;
    await click(action);
    assert.equal(harness.writes.length, before + 1, action);
    assert.deepEqual(
      rules(harness.writes.at(-1)),
      all.filter((rule) => rule !== removed),
      action,
    );
  }

  // The last delete left the site scope selected; save-unlocker writes the form's options there.
  const dialog = dialogOf(harness.window);
  assert.equal(dialog.querySelector('input[name="part-scope"][value="site"]').checked, true);
  dialog.querySelector('[data-part-role="unlocker-drag"]').checked = true;
  const before = harness.writes.length;
  await click('save-unlocker');
  assert.equal(harness.writes.length, before + 1);
  assert.equal(Settings.getUnlockerSetting(harness.writes.at(-1), 'site', siteKey).allowDrag, true);
  assert.equal(Settings.getUnlockerSetting(harness.writes.at(-1), 'page', pageKey).allowDrag, false);
});

test('only a click that lands on the backdrop itself closes the dialog', { skip: domSkip }, async () => {
  const harness = createHarness();
  await harness.view.openSettings();
  const dialog = dialogOf(harness.window);
  // Identity checks compare booleans: a failing assert on DOM nodes would render the whole happy-dom graph.
  dialog.querySelector('[data-part-role="status"]').click();
  assert.equal(dialogOf(harness.window) === dialog, true, 'a click inside the dialog keeps it open');
  dialog.click();
  assert.equal(dialogOf(harness.window) === null, true, 'a click on the backdrop closes the dialog');
  harness.view.dispose();
  harness.session.dispose();
});

test('a rejected dispatch reports its error in the dialog it came from', { skip: domSkip }, async (t) => {
  t.mock.method(console, 'warn', () => {});
  const harness = createHarness();
  await harness.view.openSettings();
  harness.session.dispatch = async () => {
    throw new Error('transport rejected');
  };
  const dialog = dialogOf(harness.window);
  dialog.querySelector('[data-part-action="save-preset"]').click();
  await flush();
  await flush();
  assert.equal(dialogOf(harness.window) === dialog, true, 'the dialog stays open');
  const message = dialog.querySelector('[data-part-role="message"]');
  assert.equal(message.textContent, '操作失败：transport rejected');
  assert.equal(message.dataset.tone, 'error');
  harness.view.dispose();
  harness.session.dispose();
});

test(
  'opening settings adopts the startup state and fails only while the session is not ready',
  { skip: domSkip },
  async () => {
    const broken = createHarness({
      ready: async () => {
        throw new Error('ready broke');
      },
    });
    assert.deepEqual(await broken.view.openSettings(), { ok: false, code: 'storage-failed' });
    const brokenDialog = dialogOf(broken.window);
    assert.equal(brokenDialog.querySelector('[data-part-role="message"]').textContent, '初始化失败：ready broke');
    assert.equal(brokenDialog.querySelector('[data-part-action="save-custom"]').disabled, true);
    broken.view.dispose();
    broken.session.dispose();

    // A failed outcome whose session state is already ready opens the dialog normally.
    const applied = createHarness({
      ready: async (session) => ({
        ok: false,
        code: 'application-failed',
        state: { ...session.getState(), lifecycle: 'ready' },
      }),
    });
    assert.deepEqual(await applied.view.openSettings(), { ok: true });
    assert.equal(dialogOf(applied.window).querySelector('[data-part-action="save-custom"]').disabled, false);
    applied.view.dispose();
    applied.session.dispose();
  },
);
