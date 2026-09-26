import test from 'node:test';
import assert from 'node:assert/strict';

import * as Settings from '../src/userscripts/web-page-assistant/web-page-assistant-settings.lib.js';
import { createWebPageAssistantStoragePort } from '../src/userscripts/web-page-assistant/web-page-assistant-storage.lib.js';
import { createWebPageAssistantSession } from '../src/userscripts/web-page-assistant/web-page-assistant-session.lib.js';

const STORAGE_KEY = 'pageAutoRefreshTimerSettings';
const FALLBACK_KEY = `__${STORAGE_KEY}`;
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const settle = () => new Promise((resolve) => { setTimeout(resolve, 5); });

// One GM storage shared by every tab of the script, as a userscript manager
// keeps it. Change listeners fire asynchronously with remote=true in the other
// tabs only; `notify: false` models a manager without change events.
function createSharedGmStorage({ notify = true } = {}) {
  const values = new Map();
  const listeners = new Map();
  let nextId = 1;
  return {
    values,
    tab(tabId, { failReads = false } = {}) {
      return {
        gmGetValue(key, fallbackValue) {
          if (failReads) throw new Error('GM read failed');
          return values.has(key) ? clone(values.get(key)) : fallbackValue;
        },
        gmSetValue(key, value) {
          const oldValue = clone(values.get(key));
          values.set(key, clone(value));
          if (!notify) return;
          for (const listener of listeners.values()) {
            if (listener.key !== key) continue;
            setTimeout(() => listener.callback(key, oldValue, clone(value), listener.tabId !== tabId));
          }
        },
        gmAddValueChangeListener(key, callback) {
          const id = nextId++;
          listeners.set(id, { key, callback, tabId });
          return id;
        },
        gmRemoveValueChangeListener(id) {
          listeners.delete(id);
        },
      };
    },
  };
}

// Same-origin page localStorage shared by tabs; `storage` events reach the
// other tabs only, as in browsers.
function createSharedLocalStorage() {
  const values = new Map();
  const targets = new Set();
  return {
    values,
    tab() {
      const handlers = new Set();
      const target = {
        addEventListener(type, handler) { if (type === 'storage') handlers.add(handler); },
        removeEventListener(type, handler) { handlers.delete(handler); },
        handlers,
      };
      targets.add(target);
      const adapter = {
        getItem: (key) => (values.has(key) ? values.get(key) : null),
        setItem(key, value) {
          values.set(key, String(value));
          for (const other of targets) {
            if (other === target) continue;
            for (const handler of other.handlers) setTimeout(() => handler({ key }));
          }
        },
      };
      return { adapter, target };
    },
  };
}

function openTab({ gm, local, keys = { pageKey: 'https://a.test/one', siteKey: 'a.test' }, tabId, failReads } = {}) {
  let time = 1_000;
  let installs = 0;
  const timers = new Map();
  const pageStorage = local ? local.tab() : { adapter: { getItem: () => null, setItem() {} }, target: null };
  const storage = createWebPageAssistantStoragePort({
    scriptName: 'Web Page Assistant',
    settingsContract: Settings,
    normalizeWidgetPosition: (value) => value,
    storageKey: STORAGE_KEY,
    widgetPositionKey: 'position',
    fallbackStorageKey: FALLBACK_KEY,
    fallbackWidgetPositionKey: '__position',
    ...(gm ? gm.tab(tabId, { failReads }) : {}),
    localStorageAdapter: pageStorage.adapter,
    eventTarget: pageStorage.target,
    logger: { warn() {} },
  });
  const session = createWebPageAssistantSession({
    keys,
    storage,
    clock: {
      now: () => time,
      setInterval: (handler) => { const id = Symbol('timer'); timers.set(id, handler); return id; },
      clearInterval: (id) => timers.delete(id),
    },
    reload() {},
    unlocker: { install() { installs++; }, uninstall() {} },
  });
  return {
    session,
    advance(ms) { time += ms; },
    get installs() { return installs; },
    state: () => session.getState(),
  };
}

const saveRefresh = (scope, intervalMs) => ({ type: 'save-refresh', scope, intervalMs });
const saveUnlocker = (scope, enabled = true) => ({ type: 'save-unlocker', scope, setting: { enabled } });
const storedSettings = (gm) => Settings.normalizeSettings(gm.values.get(STORAGE_KEY));

for (const notify of [false, true]) {
  const label = notify ? 'with change events' : 'without change events';

  test(`audit scenario ${label}: an older tab's unrelated save keeps the rule another tab added`, async () => {
    const gm = createSharedGmStorage({ notify });
    const a = openTab({ gm, tabId: 'A', keys: { pageKey: 'https://a.test/one', siteKey: 'a.test' } });
    const b = openTab({ gm, tabId: 'B', keys: { pageKey: 'https://b.test/two', siteKey: 'b.test' } });
    await a.session.start();
    await b.session.start();

    assert.equal((await b.session.dispatch(saveRefresh('site', 30_000))).ok, true);
    await settle();
    assert.equal((await a.session.dispatch(saveUnlocker('page'))).ok, true);

    const stored = storedSettings(gm);
    assert.equal(stored.refresh.sites['b.test'].intervalMs, 30_000);
    assert.equal(stored.unlocker.pages['https://a.test/one'].enabled, true);
    assert.equal(a.state().settings.refresh.sites['b.test'].intervalMs, 30_000);
  });

  test(`interleaved add, modify and delete ${label} keep each tab's own change`, async () => {
    const gm = createSharedGmStorage({ notify });
    const a = openTab({ gm, tabId: 'A', keys: { pageKey: 'https://a.test/one', siteKey: 'a.test' } });
    const b = openTab({ gm, tabId: 'B', keys: { pageKey: 'https://a.test/two', siteKey: 'a.test' } });
    await a.session.start();
    await b.session.start();

    // Add: both tabs add different rules from their startup copies.
    await a.session.dispatch(saveRefresh('page', 10_000));
    await b.session.dispatch(saveRefresh('page', 20_000));
    // Modify: both change the shared site rule; the later write wins.
    await a.session.dispatch(saveRefresh('site', 40_000));
    b.advance(1);
    await b.session.dispatch(saveRefresh('site', 50_000));
    // Delete: B removes A's page rule; A's next unrelated save must not revive it.
    const deletion = openTab({ gm, tabId: 'C', keys: { pageKey: 'https://a.test/one', siteKey: 'a.test' } });
    await deletion.session.start();
    await deletion.session.dispatch({ type: 'delete-refresh', scope: 'page' });
    await a.session.dispatch(saveUnlocker('site'));

    const stored = storedSettings(gm);
    assert.deepEqual(Object.keys(stored.refresh.pages), ['https://a.test/two']);
    assert.equal(stored.refresh.pages['https://a.test/two'].intervalMs, 20_000);
    assert.equal(stored.refresh.sites['a.test'].intervalMs, 50_000);
    assert.equal(stored.unlocker.sites['a.test'].enabled, true);
    // A's own view of the result matches storage after its write.
    assert.deepEqual(a.state().settings, stored);
    assert.equal(a.state().refresh.activeMatch.scope, 'site');
    assert.equal(a.state().refresh.activeMatch.setting.intervalMs, 50_000);
  });
}

test('change events refresh an idle tab and apply only capabilities whose match changed', async () => {
  const gm = createSharedGmStorage();
  const keys = { pageKey: 'https://a.test/one', siteKey: 'a.test' };
  const a = openTab({ gm, tabId: 'A', keys });
  const b = openTab({ gm, tabId: 'B', keys: { pageKey: 'https://a.test/two', siteKey: 'a.test' } });
  await a.session.start();
  await b.session.start();
  await a.session.dispatch(saveRefresh('page', 30_000));
  await settle();
  const installsBefore = a.installs;
  a.advance(5_000);
  const remainingBefore = a.state().refresh.remainingMs;

  // A rule for another page does not restart A's countdown or reinstall unlocker.
  await b.session.dispatch(saveRefresh('page', 20_000));
  await settle();
  assert.equal(a.state().settings.refresh.pages['https://a.test/two'].intervalMs, 20_000);
  assert.equal(a.state().refresh.remainingMs, remainingBefore);
  assert.equal(a.installs, installsBefore);

  // A site unlocker rule matching A is applied without restarting refresh.
  await b.session.dispatch(saveUnlocker('site'));
  await settle();
  assert.equal(a.state().appliedUnlocker.scope, 'site');
  assert.equal(a.installs, installsBefore + 1);
  assert.equal(a.state().refresh.remainingMs, remainingBefore);

  // Deleting A's page refresh rule elsewhere stops A's countdown.
  const other = openTab({ gm, tabId: 'C', keys });
  await other.session.start();
  await other.session.dispatch({ type: 'delete-refresh', scope: 'page' });
  await settle();
  assert.equal(a.state().refresh.activeMatch, null);

  // Disposed tabs stop listening.
  a.session.dispose();
  await b.session.dispatch(saveRefresh('site', 60_000));
  await settle();
  assert.equal(a.state().settings.refresh.sites['a.test'], undefined);
});

test('fallback localStorage gives the same guarantees through storage events', async () => {
  const local = createSharedLocalStorage();
  const a = openTab({ local, keys: { pageKey: 'https://a.test/one', siteKey: 'a.test' } });
  const b = openTab({ local, keys: { pageKey: 'https://a.test/two', siteKey: 'a.test' } });
  await a.session.start();
  await b.session.start();

  await b.session.dispatch(saveRefresh('page', 30_000));
  await settle();
  assert.equal(a.state().settings.refresh.pages['https://a.test/two'].intervalMs, 30_000);
  await a.session.dispatch(saveUnlocker('page'));

  const stored = Settings.normalizeSettings(JSON.parse(local.values.get(FALLBACK_KEY)));
  assert.equal(stored.refresh.pages['https://a.test/two'].intervalMs, 30_000);
  assert.equal(stored.unlocker.pages['https://a.test/one'].enabled, true);
});

test('a failed primary read never overwrites primary settings with fallback data', async () => {
  const gm = createSharedGmStorage();
  const seeded = Settings.setRefreshSetting(Settings.emptySettings(), 'site', 'b.test', 30_000, 1);
  gm.values.set(STORAGE_KEY, seeded);
  const local = createSharedLocalStorage();
  const a = openTab({ gm, local, tabId: 'A', failReads: true });
  await a.session.start();

  assert.equal((await a.session.dispatch(saveUnlocker('page'))).ok, true);
  assert.deepEqual(storedSettings(gm), seeded);
  const fallback = Settings.normalizeSettings(JSON.parse(local.values.get(FALLBACK_KEY)));
  assert.equal(fallback.unlocker.pages['https://a.test/one'].enabled, true);
});
