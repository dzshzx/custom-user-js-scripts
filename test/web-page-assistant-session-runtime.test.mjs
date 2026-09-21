import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebPageAssistantSession } from '../src/userscripts/web-page-assistant/web-page-assistant-session.lib.js';
import * as Settings from '../src/userscripts/web-page-assistant/web-page-assistant-settings.lib.js';

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function harness(overrides = {}) {
  let time = 100;
  let reads = 0;
  let installs = 0;
  const timers = new Map();
  const writes = [];
  const events = [];
  const storage = {
    async readSettings() { reads++; return overrides.seed || Settings.emptySettings(); },
    async writeSettings(value) { writes.push(value); return value; },
    ...overrides.storage,
  };
  const session = createWebPageAssistantSession({
    keys: { pageKey: 'page', siteKey: 'site' }, storage,
    clock: { now: () => time, setInterval: (f) => { const id = Symbol(); timers.set(id, f); return id; }, clearInterval: (id) => timers.delete(id) },
    reload() {},
    unlocker: { install() { installs++; }, uninstall() {}, ...overrides.unlocker },
    ready: overrides.ready,
    onChange(state, event) { events.push({ state, ...event }); overrides.onChange?.(); },
  });
  return { session, storage, writes, events, timers, get reads() { return reads; }, get installs() { return installs; }, tick() { time += 1000; for (const f of timers.values()) f(); } };
}
const save = (scope = 'page', intervalMs = 30000) => ({ type: 'save-refresh', scope, intervalMs });

test('start is idempotent, waits for readiness, and snapshots isolate committed settings', async () => {
  const ready = deferred();
  const h = harness({ ready: () => ready.promise });
  const first = h.session.start();
  assert.equal(first, h.session.start());
  assert.equal(h.reads, 1);
  assert.equal(h.installs, 0);
  ready.resolve();
  await first;
  assert.equal(h.installs, 1);
  await h.session.dispatch(save());
  h.session.getState().settings.refresh.pages.page.intervalMs = 1;
  assert.equal(h.session.getState().refresh.activeMatch.setting.intervalMs, 30000);
});

test('FIFO writes use the latest committed settings and failure does not poison the queue', async () => {
  const h = harness(); await h.session.start();
  const gate = deferred(); let calls = 0;
  h.storage.writeSettings = async (value) => { if (++calls === 1) { await gate.promise; throw Error('disk'); } h.writes.push(value); };
  const a = h.session.dispatch(save());
  const b = h.session.dispatch(save('site', 60000));
  gate.resolve();
  assert.equal((await a).code, 'storage-failed');
  assert.equal((await b).ok, true);
  await Promise.all([h.session.dispatch(save()), h.session.dispatch({ type: 'save-unlocker', scope: 'site', setting: { enabled: true } })]);
  assert.ok(h.session.getState().settings.refresh.pages.page);
  assert.ok(h.session.getState().settings.refresh.sites.site);
  assert.ok(h.session.getState().settings.unlocker.sites.site);
});

test('pause is immediate during a pending write and successful refresh changes restart countdown', async () => {
  const h = harness(); await h.session.start(); await h.session.dispatch(save());
  const gate = deferred(); h.storage.writeSettings = () => gate.promise;
  const pending = h.session.dispatch(save('site'));
  await h.session.dispatch({ type: 'toggle-pause' });
  assert.equal(h.session.getState().refresh.isPaused, true);
  assert.equal(h.timers.size, 0);
  gate.resolve(); await pending;
  assert.equal(h.session.getState().refresh.isPaused, false);
});

test('failed disable keeps active state; successful delete rematches the site rule', async () => {
  const h = harness(); await h.session.start();
  await h.session.dispatch(save('site', 60000)); await h.session.dispatch(save());
  h.storage.writeSettings = async () => { throw Error('disk'); };
  assert.equal((await h.session.dispatch({ type: 'disable-active' })).persisted, false);
  assert.equal(h.session.getState().refresh.activeMatch.scope, 'page');
  h.storage.writeSettings = async () => {};
  await h.session.dispatch({ type: 'disable-active' });
  assert.equal(h.session.getState().refresh.activeMatch.scope, 'site');
});

test('unlocker fallback uses real Settings and does not restart refresh', async () => {
  const h = harness(); await h.session.start(); await h.session.dispatch(save());
  h.tick(); const remaining = h.session.getState().refresh.remainingMs;
  await h.session.dispatch({ type: 'save-unlocker', scope: 'site', setting: { enabled: true } });
  await h.session.dispatch({ type: 'save-unlocker', scope: 'page', setting: { enabled: false } });
  assert.equal(h.session.getState().appliedUnlocker.scope, 'site');
  assert.equal(h.session.getState().refresh.remainingMs, remaining);
  await h.session.dispatch({ type: 'delete-unlocker', scope: 'site' });
  assert.equal(h.session.getState().appliedUnlocker, null);
});

test('persisted application failure retains settings, cleans installation and reports actual state', async () => {
  let cleanup = 0;
  const h = harness({ unlocker: { install(setting) { if (setting) throw Error('installation'); }, uninstall() { cleanup++; } } });
  await h.session.start();
  const result = await h.session.dispatch({ type: 'save-unlocker', scope: 'page', setting: { enabled: true } });
  assert.equal(result.code, 'application-failed'); assert.equal(result.persisted, true);
  assert.ok(result.state.matchedUnlocker); assert.equal(result.state.appliedUnlocker, null);
  assert.equal(cleanup, 1);
  await h.session.dispatch(save());
  assert.equal(h.session.getState().applicationErrors.unlocker, 'installation');
  assert.ok(h.session.getState().refresh.activeMatch);
});

test('disposal settles startup even when storage hangs and prevents late effects', async () => {
  const gate = deferred(); const h = harness({ storage: { readSettings: () => gate.promise } });
  const pending = h.session.start(); h.session.dispose(); h.session.dispose();
  assert.equal((await pending).code, 'disposed');
  gate.resolve(Settings.setRefreshSetting(Settings.emptySettings(), 'page', 'page', 30000));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.timers.size, 0); assert.equal(h.installs, 0);
});

test('disposal cancels queued commands and late writes cannot reinstall capabilities', async () => {
  const h = harness(); await h.session.start();
  const gate = deferred(); let writes = 0;
  h.storage.writeSettings = async () => { writes++; await gate.promise; };
  const first = h.session.dispatch(save());
  const second = h.session.dispatch(save('site'));
  await Promise.resolve(); h.session.dispose();
  assert.equal((await second).code, 'disposed');
  gate.resolve();
  const result = await first;
  assert.equal(result.code, 'disposed'); assert.equal(result.persisted, true);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(writes, 1); assert.equal(h.timers.size, 0); assert.equal(h.installs, 1);
});

test('invalid/not-ready commands and observer errors do not mutate or block settings', async () => {
  const h = harness({ onChange() { throw Error('observer'); } });
  assert.equal((await h.session.dispatch(save())).code, 'not-ready');
  await h.session.start();
  assert.equal((await h.session.dispatch(save('bad'))).code, 'invalid-input');
  assert.equal((await h.session.dispatch(save('page', 1))).code, 'invalid-input');
  assert.equal((await h.session.dispatch(save())).ok, true);
  const before = h.events.length; h.tick();
  assert.equal(h.events.length, before + 1); assert.equal(h.events.at(-1).kind, 'countdown');
});

test('disable-active determines its scope when each queued command executes', async () => {
  const h = harness(); await h.session.start();
  await h.session.dispatch(save('site')); await h.session.dispatch(save());
  const results = await Promise.all([
    h.session.dispatch({ type: 'disable-active' }),
    h.session.dispatch({ type: 'disable-active' }),
  ]);
  assert.deepEqual(results.map((r) => r.scope), ['page', 'site']);
  assert.equal(h.session.getState().refresh.activeMatch, null);
});

test('dispose during readiness prevents startup installation and stops notifications', async () => {
  const gate = deferred(); const h = harness({ ready: () => gate.promise });
  const pending = h.session.start(); await Promise.resolve();
  h.session.dispose(); const notifications = h.events.length;
  assert.equal((await pending).code, 'disposed');
  gate.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.installs, 0); assert.equal(h.events.length, notifications);
  assert.equal((await h.session.dispatch(save())).code, 'disposed');
  assert.equal((await h.session.start()).code, 'disposed');
});
