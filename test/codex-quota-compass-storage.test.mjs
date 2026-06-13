import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-storage.lib.js');

const {
  DEFAULT_ARCHIVE_KEY,
  DEFAULT_ARCHIVE_FALLBACK_KEY,
  createSnapshotArchiveStoragePort,
} = globalThis.CodexQuotaCompassStorageLib;

function createLocalStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    value(key) {
      return values.get(key);
    },
  };
}

test('createSnapshotArchiveStoragePort prefers GM storage for read and write', async () => {
  const writes = [];
  const port = createSnapshotArchiveStoragePort({
    gmGetValue: async (key, fallback) => {
      assert.equal(key, DEFAULT_ARCHIVE_KEY);
      assert.equal(fallback, null);
      return { snapshots: [{ snapshotId: 'gm-1' }] };
    },
    gmSetValue: async (key, archive) => {
      writes.push({ key, archive });
    },
    logger: { warn() {} },
  });

  const archive = await port.read();
  await port.write({ snapshots: [{ snapshotId: 'gm-2' }] });

  assert.equal(archive.snapshots[0].snapshotId, 'gm-1');
  assert.deepEqual(writes, [{
    key: DEFAULT_ARCHIVE_KEY,
    archive: { snapshots: [{ snapshotId: 'gm-2' }] },
  }]);
  assert.deepEqual(port.getBackendInfo(), { id: 'gm', label: 'GM storage' });
});

test('createSnapshotArchiveStoragePort falls back to localStorage when GM read fails', async () => {
  const warnings = [];
  const localStorage = createLocalStorage({
    [DEFAULT_ARCHIVE_FALLBACK_KEY]: JSON.stringify({ snapshots: [{ snapshotId: 'local-1' }] }),
  });
  const port = createSnapshotArchiveStoragePort({
    gmGetValue: async () => {
      throw new Error('blocked');
    },
    localStorage,
    logger: {
      warn(message) {
        warnings.push(message);
      },
    },
  });

  const archive = await port.read();

  assert.equal(archive.snapshots[0].snapshotId, 'local-1');
  assert.deepEqual(port.getBackendInfo(), { id: 'localStorage', label: 'localStorage' });
  assert.deepEqual(warnings, ['Codex Quota Compass: failed to read userscript archive storage.']);
});

test('createSnapshotArchiveStoragePort merges fallback archive into GM storage when both exist', async () => {
  const writes = [];
  const localStorage = createLocalStorage({
    [DEFAULT_ARCHIVE_FALLBACK_KEY]: JSON.stringify({ snapshots: [{ snapshotId: 'local-1' }] }),
  });
  const port = createSnapshotArchiveStoragePort({
    gmGetValue: async () => ({ snapshots: [{ snapshotId: 'gm-1' }] }),
    gmSetValue: async (key, archive) => {
      writes.push({ key, archive });
    },
    localStorage,
    mergeArchives(primaryArchive, incomingArchive) {
      return {
        archive: {
          snapshots: [
            ...primaryArchive.snapshots,
            ...incomingArchive.snapshots.filter((snapshot) => snapshot.snapshotId !== 'gm-1'),
          ],
        },
        report: { added: 1, skipped: 0, invalid: 0 },
      };
    },
    logger: { warn() {} },
  });

  const archive = await port.read();

  assert.deepEqual(archive.snapshots.map((snapshot) => snapshot.snapshotId), ['gm-1', 'local-1']);
  assert.deepEqual(writes, [{
    key: DEFAULT_ARCHIVE_KEY,
    archive: { snapshots: [{ snapshotId: 'gm-1' }, { snapshotId: 'local-1' }] },
  }]);
  assert.deepEqual(port.getBackendInfo(), { id: 'gm', label: 'GM storage' });
});

test('createSnapshotArchiveStoragePort normalizes legacy fallback archive before GM migration', async () => {
  const legacySnapshot = { snapshotId: 'legacy-1', capturedAt: '2026-06-13T00:00:00.000Z' };
  const writes = [];
  const localStorage = createLocalStorage({
    [DEFAULT_ARCHIVE_FALLBACK_KEY]: JSON.stringify([legacySnapshot]),
  });
  const port = createSnapshotArchiveStoragePort({
    gmGetValue: async () => null,
    gmSetValue: async (key, archive) => {
      writes.push({ key, archive });
    },
    localStorage,
    normalizeArchive(archive) {
      return Array.isArray(archive) ? { snapshots: archive } : (archive || { snapshots: [] });
    },
    mergeArchives(primaryArchive, incomingArchive) {
      return {
        archive: { snapshots: [...primaryArchive.snapshots, ...incomingArchive.snapshots] },
        report: { added: incomingArchive.snapshots.length, skipped: 0, invalid: 0 },
      };
    },
    logger: { warn() {} },
  });

  const archive = await port.read();

  assert.deepEqual(archive, { snapshots: [legacySnapshot] });
  assert.deepEqual(writes, [{
    key: DEFAULT_ARCHIVE_KEY,
    archive: { snapshots: [legacySnapshot] },
  }]);
  assert.deepEqual(port.getBackendInfo(), { id: 'gm', label: 'GM storage' });
});

test('createSnapshotArchiveStoragePort writes localStorage fallback when GM write fails', async () => {
  const localStorage = createLocalStorage();
  const port = createSnapshotArchiveStoragePort({
    gmSetValue: async () => {
      throw new Error('blocked');
    },
    localStorage,
    logger: { warn() {} },
  });

  await port.write({ snapshots: [{ snapshotId: 'local-2' }] });

  assert.equal(
    localStorage.value(DEFAULT_ARCHIVE_FALLBACK_KEY),
    JSON.stringify({ snapshots: [{ snapshotId: 'local-2' }] }),
  );
  assert.deepEqual(port.getBackendInfo(), { id: 'localStorage', label: 'localStorage' });
});

test('createSnapshotArchiveStoragePort mirrors successful GM writes to fallback storage', async () => {
  const localStorage = createLocalStorage();
  const port = createSnapshotArchiveStoragePort({
    gmSetValue: async () => {},
    localStorage,
    logger: { warn() {} },
  });

  await port.write({ snapshots: [{ snapshotId: 'gm-2' }] });

  assert.equal(
    localStorage.value(DEFAULT_ARCHIVE_FALLBACK_KEY),
    JSON.stringify({ snapshots: [{ snapshotId: 'gm-2' }] }),
  );
  assert.deepEqual(port.getBackendInfo(), { id: 'gm', label: 'GM storage' });
});

test('createSnapshotArchiveStoragePort returns null when both read paths fail', async () => {
  const warnings = [];
  const port = createSnapshotArchiveStoragePort({
    gmGetValue: async () => {
      throw new Error('blocked');
    },
    localStorage: {
      getItem() {
        throw new Error('bad json');
      },
    },
    logger: {
      warn(message) {
        warnings.push(message);
      },
    },
  });

  const archive = await port.read();

  assert.equal(archive, null);
  assert.deepEqual(port.getBackendInfo(), { id: 'localStorage', label: 'localStorage' });
  assert.deepEqual(warnings, [
    'Codex Quota Compass: failed to read userscript archive storage.',
    'Codex Quota Compass: failed to read fallback archive storage.',
  ]);
});

test('createSnapshotArchiveStoragePort subscribes to GM archive storage changes', () => {
  const events = [];
  const removed = [];
  const port = createSnapshotArchiveStoragePort({
    gmAddValueChangeListener(key, listener) {
      assert.equal(key, DEFAULT_ARCHIVE_KEY);
      listener(key, { snapshots: [] }, { snapshots: [{ snapshotId: 'remote-1' }] }, true);
      return 7;
    },
    gmRemoveValueChangeListener(listenerId) {
      removed.push(listenerId);
    },
    logger: { warn() {} },
  });

  const unsubscribe = port.subscribeToChanges((event) => {
    events.push(event);
  });
  unsubscribe();

  assert.equal(events.length, 1);
  assert.equal(events[0].key, DEFAULT_ARCHIVE_KEY);
  assert.equal(events[0].remote, true);
  assert.deepEqual(events[0].backendInfo, { id: 'gm', label: 'GM storage' });
  assert.deepEqual(removed, [7]);
});
