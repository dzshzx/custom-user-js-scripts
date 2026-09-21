import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotaApplication } from '../src/userscripts/codex-quota-compass/codex-quota-compass-application.lib.js';
import { createSnapshotArchiveStore, mergeSnapshotArchives, mergeSnapshots, EXPORT_FORMAT } from '../src/userscripts/codex-quota-compass/codex-quota-compass-archive.lib.js';
import { createSnapshotArchiveStoragePort, DEFAULT_ARCHIVE_FALLBACK_KEY } from '../src/userscripts/codex-quota-compass/codex-quota-compass-storage.lib.js';
import { createRemoteSyncClient, normalizeSettings, GIST_FILENAME } from '../src/userscripts/codex-quota-compass/codex-quota-compass-remote-sync.lib.js';

const now = () => '2026-09-21T12:00:00.000Z';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function archive(date, credits = 10) {
  return { snapshots: [], ledger: { [date]: { date, credits, usd: credits * 0.04, settled: true, settledAt: now() } } };
}
function document(value) { return { format: EXPORT_FORMAT, version: 2, ...value }; }
function fixture(options = {}) {
  let data = options.data || null;
  let writes = 0;
  let ids = 0;
  let listener;
  const timers = new Map();
  let timerId = 0;
  const clock = {
    setTimeout(fn, delay) { assert.equal(delay, 5000); timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  const store = createSnapshotArchiveStore({
    read: options.read || (async () => data),
    write: async (next) => { await options.beforeWrite?.(); writes++; data = next; },
    now, createId: () => String(++ids),
  });
  const remoteSync = options.remoteSync || {
    getStatus: async () => ({ enabled: false, configured: false }),
    syncNow: async () => ({ status: 'disabled', settings: { enabled: false, configured: false } }),
  };
  const app = createQuotaApplication({
    archiveStore: store, runtime: options.runtime || { run: async () => ({}) }, remoteSync,
    clock, runGuard: options.runGuard,
    archiveChanges: {
      subscribeToChanges(fn) { listener = fn; return () => { listener = null; }; },
      getBackendInfo: () => ({ id: 'gm' }),
    },
    onChange: options.onChange,
  });
  return { app, store, timers, data: () => data, writes: () => writes, ids: () => ids, notify: () => listener?.({ remote: true }) };
}

test('concurrent run shares the complete calculation/save/projection and holds its guard', async () => {
  const computation = deferred();
  const saving = deferred();
  let calls = 0;
  let held = false;
  const f = fixture({
    runtime: { run() { calls++; return computation.promise; } },
    beforeWrite: () => saving.promise,
    runGuard: { acquire() { held = true; return true; }, release() { held = false; } },
  });
  const first = f.app.run();
  assert.equal(first, f.app.run());
  assert.equal(held, true);
  computation.resolve({});
  await tick();
  assert.equal(held, true);
  assert.equal(f.ids(), 1);
  saving.resolve();
  assert.equal((await first).status, 'ok');
  assert.equal(calls, 1);
  assert.equal(f.writes(), 1);
  assert.equal(held, false);
  assert.equal(f.timers.size, 1);
  assert.equal(f.app.getState().archiveSummary.snapshotCount, 1);
});

test('foreign guard remains held; calculation failure retains the latest successful result', async () => {
  let releases = 0;
  const blocked = fixture({ runGuard: { acquire: () => false, release: () => releases++ } });
  assert.equal((await blocked.app.run()).status, 'skipped');
  assert.equal(releases, 0);
  let fail = false;
  const f = fixture({ runtime: { run: async () => { if (fail) throw Error('calculate'); return { marker: 1 }; } } });
  await f.app.run();
  fail = true;
  assert.equal((await f.app.run()).status, 'error');
  assert.equal(f.app.getState().result.marker, 1);
  assert.equal(f.writes(), 1);
});

test('persistence failure is partial, schedules nothing, and does not poison subsequent operations', async () => {
  let fail = true;
  const f = fixture({ beforeWrite: () => { if (fail) throw Error('disk'); } });
  const result = await f.app.run();
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.completed, ['calculation']);
  assert.equal(f.timers.size, 0);
  fail = false;
  assert.equal((await f.app.run()).status, 'ok');
});

test('FIFO save/import uses the latest archive and keeps ledger-only history', async () => {
  const f = fixture();
  await Promise.all([f.store.saveSnapshot({}), f.app.importArchive(document(archive('2026-09-10')))]);
  assert.equal(f.data().snapshots.length, 1);
  assert.equal(f.data().ledger['2026-09-10'].credits, 10);
  assert.equal(f.app.getState().ledgerCost.allTime.totalCredits, 10);
});

test('complete archive merge preserves both ledgers and folds before snapshot retention', () => {
  const snapshots = Array.from({ length: 9 }, (_, n) => ({
    snapshotId: String(n), capturedAt: '2026-09-' + String(n + 1).padStart(2, '0') + 'T00:00:00Z',
    periodDetails: { rolling: { dailyBuckets: [{ 日期桶: '2026-08-' + String(n + 1).padStart(2, '0'), Credits: n + 1 }] } },
  }));
  const primary = { ...archive('2026-07-01'), snapshots };
  assert.equal(mergeSnapshots(primary, []).archive.ledger['2026-07-01'].credits, 10);
  const merged = mergeSnapshotArchives(primary, archive('2026-07-02'), { nowMs: Date.parse(now()) });
  assert.equal(merged.archive.snapshots.length, 5);
  assert.equal(Object.keys(merged.archive.ledger).length, 11);
  assert.equal(merged.changed, true);
  assert.equal(mergeSnapshotArchives(merged.archive, merged.archive, { nowMs: Date.parse(now()) }).changed, false);
});

test('GM and mirror merge ledger-only dates once, including equal snapshots', async () => {
  for (const withSnapshots of [false, true]) {
    const snapshot = { snapshotId: 'same', capturedAt: now() };
    let gm = { ...archive('2026-09-01'), snapshots: withSnapshots ? [snapshot] : [] };
    const mirror = { ...archive('2026-09-02'), snapshots: withSnapshots ? [snapshot] : [] };
    let writes = 0;
    const port = createSnapshotArchiveStoragePort({
      gmGetValue: () => gm,
      gmSetValue: (_key, value) => { writes++; gm = value; },
      localStorage: { getItem: () => JSON.stringify(mirror) },
      mergeArchives: (a, b) => mergeSnapshotArchives(a, b, { nowMs: Date.parse(now()) }),
    });
    assert.equal(Object.keys((await port.read()).ledger).length, 2);
    await port.read();
    assert.equal(writes, 1);
  }
});

test('both storage reads failing prevents writes; successful GM with failed mirror is degraded', async () => {
  let writes = 0;
  const port = createSnapshotArchiveStoragePort({
    gmGetValue: () => { throw Error('read'); }, gmSetValue: () => writes++,
    localStorage: { getItem() { throw Error('read'); }, setItem() { throw Error('mirror'); } },
    logger: { warn() {} },
  });
  const store = createSnapshotArchiveStore({ read: port.read, write: port.write, now });
  await assert.rejects(store.saveSnapshot({}), /Both/);
  assert.equal(writes, 0);
  await port.write(archive('2026-09-01'));
  assert.equal(writes, 1);
  assert.equal(port.getBackendInfo().id, 'gm');
  assert.equal(port.getBackendInfo().degraded, true);
});

test('manual sync consumes debounce; changes during network wait schedule exactly one follow-up', async () => {
  const waiting = deferred();
  let calls = 0;
  const f = fixture({ remoteSync: {
    getStatus: async () => ({ enabled: true, configured: true }),
    syncNow: async () => { calls++; if (calls === 1) await waiting.promise; return { status: 'synced', settings: {} }; },
  } });
  await f.app.run();
  const sync = f.app.sync();
  assert.equal(f.timers.size, 0);
  await f.app.importArchive(document(archive('2026-09-01')));
  await f.app.run();
  assert.equal(f.timers.size, 0);
  waiting.resolve();
  await sync;
  assert.equal(f.timers.size, 1);
  const [id, callback] = [...f.timers][0];
  f.timers.delete(id);
  callback();
  await tick();
  assert.equal(calls, 2);
  assert.equal(f.timers.size, 0);
  assert.equal(f.app.getState().ledgerCost.allTime.totalCredits, 10);
});

test('start is idempotent, notifications refresh costs without sync loops, dispose cancels scheduling', async () => {
  let observations = 0;
  const f = fixture({ onChange() { observations++; } });
  assert.equal(f.app.start(), f.app.start());
  await f.app.start();
  await f.store.importArchiveDocument(document(archive('2026-09-02')));
  f.notify();
  await tick();
  assert.equal(f.app.getState().ledgerCost.allTime.totalCredits, 10);
  assert.equal(f.timers.size, 0);
  await f.app.run();
  f.app.dispose();
  f.app.dispose();
  assert.equal(f.timers.size, 0);
  const before = observations;
  f.notify();
  await tick();
  assert.equal(observations, before);
  assert.equal((await f.app.run()).reason, 'disposed');
});

test('local merge stays visible after remote write fails; unknown state prevents automatic replay', async () => {
  let f;
  f = fixture({ remoteSync: {
    getStatus: async () => ({ enabled: true, configured: true }),
    syncNow: async () => {
      await f.store.importArchiveDocument(document(archive('2026-09-01')));
      await f.app.run();
      throw Object.assign(Error('uncertain'), { localMerged: true, remoteState: 'unknown' });
    },
  } });
  const result = await f.app.sync();
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.completed, ['local-merge']);
  assert.equal(f.app.getState().ledgerCost.allTime.totalCredits, 10);
  assert.equal(f.timers.size, 0);
  await f.app.run();
  assert.equal(f.timers.size, 0);
});

test('sync serializes configuration, merges into latest local history, and redacts token failures', async () => {
  const f = fixture({ data: archive('2026-09-01') });
  const waiting = deferred();
  let settings = normalizeSettings({ enabled: true, token: 'private-test-token', gistId: 'existing' });
  const client = createRemoteSyncClient({
    archiveStore: f.store,
    settingsStore: { read: async () => settings, write: async (next) => { settings = next; return next; } },
    requestJson: async ({ method }) => {
      if (method === 'GET') {
        await waiting.promise;
        return { id: 'existing', files: { [GIST_FILENAME]: { content: JSON.stringify(document(archive('2026-09-02'))) } } };
      }
      throw Error('network private-test-token');
    }, now,
  });
  const sync = client.syncNow();
  await tick();
  const configure = client.configure({ token: 'replacement', enabled: false, gistId: 'new' });
  await f.store.importArchiveDocument(document(archive('2026-09-03')));
  waiting.resolve();
  await assert.rejects(sync, (error) => {
    assert.equal(error.localMerged, true);
    assert.equal(error.remoteState, 'unknown');
    assert.equal(error.message.includes('private-test-token'), false);
    return true;
  });
  const publicStatus = await configure;
  assert.equal(settings.token, 'replacement');
  assert.equal(settings.gistId, 'new');
  assert.equal(publicStatus.token, undefined);
  assert.equal(Object.keys(f.data().ledger).length, 3);
  assert.equal(JSON.stringify(await f.store.buildExportDocument()).includes('replacement'), false);
});

test('settings failure cannot block local start/run; snapshots and observer failures are isolated', async () => {
  const f = fixture({
    remoteSync: { getStatus: async () => { throw Error('private settings'); } },
    onChange() { throw Error('observer'); },
  });
  await f.app.start();
  assert.equal((await f.app.run()).status, 'ok');
  const state = f.app.getState();
  state.result.injected = true;
  assert.equal(f.app.getState().result.injected, undefined);
  assert.equal(state.errors.settings, 'GitHub Gist settings are unavailable.');
});

test('ledger-only fallback migrates into an empty primary without changing storage keys', async () => {
  let saved;
  const port = createSnapshotArchiveStoragePort({
    gmGetValue: () => null, gmSetValue: (_key, value) => { saved = value; },
    localStorage: { getItem(key) { assert.equal(key, DEFAULT_ARCHIVE_FALLBACK_KEY); return JSON.stringify(archive('2026-09-01')); } },
    mergeArchives: mergeSnapshotArchives,
  });
  await port.read();
  assert.equal(saved.ledger['2026-09-01'].credits, 10);
});

test('startup and timed sync both project the imported ledger', async () => {
  let f;
  let count = 0;
  f = fixture({ remoteSync: {
    getStatus: async () => ({ enabled: true, configured: true }),
    syncNow: async () => {
      count++;
      await f.store.importArchiveDocument(document(archive('2026-09-0' + count)));
      return { status: 'synced', settings: { enabled: true, configured: true } };
    },
  } });
  await f.app.start();
  assert.equal(f.app.getState().ledgerCost.allTime.totalCredits, 10);
  await f.app.run();
  const [id, callback] = [...f.timers][0];
  f.timers.delete(id);
  callback();
  await tick();
  assert.equal(f.app.getState().ledgerCost.allTime.totalCredits, 20);
});

test('persisted unknown remote outcome prevents startup replay and dispose keeps the in-flight guard until completion', async () => {
  let calls = 0;
  const f = fixture({ remoteSync: {
    getStatus: async () => ({ enabled: true, configured: true, remoteState: 'unknown' }),
    syncNow: async () => { calls++; },
  } });
  assert.equal((await f.app.start()).reason, 'remote-state-unknown');
  await f.app.run();
  assert.equal(calls, 0);
  assert.equal(f.timers.size, 0);

  const waiting = deferred();
  let held = false;
  const active = fixture({
    runtime: { run: () => waiting.promise },
    runGuard: { acquire() { held = true; return true; }, release() { held = false; } },
  });
  const running = active.app.run();
  active.app.dispose();
  assert.equal(held, true);
  waiting.resolve({});
  await running;
  assert.equal(held, false);
  assert.equal(active.timers.size, 0);
});

test('derived-view failure reports the completed persistence phase separately', async () => {
  let reads = 0;
  const f = fixture({ read: async () => { if (++reads > 1) throw Error('projection read'); return null; } });
  const result = await f.app.run();
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.completed, ['calculation', 'persistence']);
  assert.equal(f.writes(), 1);
  assert.equal(f.app.getState().errors.persistence, null);
  assert.equal(f.app.getState().errors.projection, 'projection read');
});

test('import projection failure retains the committed import stage and error', async () => {
  let reads = 0;
  const f = fixture({ read: async () => { if (++reads > 2) throw Error('projection read'); return null; } });
  await f.app.start();
  const outcome = await f.app.importArchive(document(archive('2026-09-01')));
  assert.equal(outcome.status, 'partial');
  assert.deepEqual(outcome.completed, ['persistence']);
  assert.equal(outcome.error, 'projection read');
  assert.equal(f.writes(), 1);
});

test('settings saved before remote failure is reported as a partial completion', async () => {
  let configured = 0;
  const f = fixture({ remoteSync: {
    getStatus: async () => ({ enabled: false, configured: false, hasToken: false }),
    configure: async () => { configured++; return { enabled: true, configured: true, hasToken: true }; },
    syncNow: async () => { throw Error('remote failed'); },
  } });
  const outcome = await f.app.configureSync({ enabled: true, token: 'test-token', gistId: '' });
  assert.equal(configured, 1);
  assert.equal(outcome.status, 'partial');
  assert.deepEqual(outcome.completed, ['settings']);
  assert.equal(outcome.error, 'remote failed');
  assert.equal(JSON.stringify(outcome).includes('test-token'), false);
});

test('startup waits for the newest projection after synchronous GM migration notifications', async () => {
  for (const failLatestRead of [false, true]) {
    let gm = null;
    let listener;
    let writes = 0;
    let reads = 0;
    let syncs = 0;
    const port = createSnapshotArchiveStoragePort({
      gmGetValue() {
        reads++;
        if (failLatestRead && writes) throw Error('GM read failed');
        return gm;
      },
      gmSetValue(key, value) {
        const previous = gm;
        gm = value;
        writes++;
        listener(key, previous, value, false);
      },
      gmAddValueChangeListener(_key, callback) { listener = callback; return 1; },
      gmRemoveValueChangeListener() {},
      localStorage: {
        getItem() {
          if (failLatestRead && writes) throw Error('mirror read failed');
          return JSON.stringify(archive('2026-09-01'));
        },
      },
      mergeArchives: mergeSnapshotArchives,
      logger: { warn() {} },
    });
    const store = createSnapshotArchiveStore({ read: port.read, write: port.write, now });
    const status = { enabled: true, configured: true };
    const app = createQuotaApplication({
      runtime: { run: async () => ({}) }, archiveStore: store, archiveChanges: port,
      remoteSync: {
        getStatus: async () => status,
        syncNow: async () => { syncs++; return { status: 'synced', settings: status }; },
      },
    });
    try {
      const result = await app.start();
      assert.equal(result.status, failLatestRead ? 'partial' : 'ok');
      assert.equal(syncs, failLatestRead ? 0 : 1);
      assert.equal(writes, 1);
      assert.equal(Boolean(app.getState().errors.projection), failLatestRead);
      if (!failLatestRead) {
        assert.equal(app.getState().ledgerCost.allTime.totalCredits, 10);
        listener('archive', gm, gm, true);
        await tick();
        assert.equal(syncs, 1);
        assert.equal(writes, 1);
        assert.ok(reads <= 4, 'migration notifications must converge');
      }
    } finally { app.dispose(); }
  }
});
