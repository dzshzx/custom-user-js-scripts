import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/codex-quota-compass-storage.lib.js');

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
