import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-sync.lib.js');

const {
  createSnapshotSyncStatus,
  createSnapshotSyncPort,
} = globalThis.CodexQuotaCompassSyncLib;

test('createSnapshotSyncPort routes save/export/import through archive store seam', async () => {
  const calls = [];
  const port = createSnapshotSyncPort({
    archiveStore: {
      saveSnapshot: async () => {
        calls.push('save');
        return { summary: { snapshotCount: 1 } };
      },
      buildExportDocument: async () => {
        calls.push('export');
        return { format: 'x', snapshotCount: 1 };
      },
      importArchiveDocument: async () => {
        calls.push('import');
        return { summary: { snapshotCount: 2 }, report: { added: 1, skipped: 0, invalid: 0 } };
      },
      previewImportArchiveDocument: async () => {
        calls.push('preview');
        return { summary: { snapshotCount: 2 }, report: { added: 1, skipped: 0, invalid: 0 } };
      },
      queryHistory: async () => {
        calls.push('history');
        return { day: { rows: [] }, rolling: { summary: {} }, month: { summary: {} }, timeline: [] };
      },
      summarizeArchive: async () => ({ snapshotCount: 2 }),
    },
    getBackendInfo: () => ({ id: 'gm', label: 'GM storage' }),
  });

  const saved = await port.saveLocalSnapshot({ 任意: true });
  const exported = await port.buildSyncPayload();
  const preview = await port.previewIncomingArchive({ format: 'x' });
  const imported = await port.mergeIncomingArchive({ format: 'x' });
  const history = await port.queryHistory({ periodDays: 30 });
  const status = port.getSyncStatus();

  assert.equal(saved.summary.snapshotCount, 1);
  assert.equal(exported.snapshotCount, 1);
  assert.equal(preview.report.added, 1);
  assert.equal(imported.report.added, 1);
  assert.equal(history.timeline.length, 0);
  assert.equal(status.backendId, 'gm');
  assert.equal(status.crossDeviceCapable, true);
  assert.deepEqual(calls, ['save', 'export', 'preview', 'import', 'history']);

  const compatibilitySaved = await port.saveLatestResult({ 任意: true });
  const compatibilityExported = await port.exportArchive();
  const compatibilityImported = await port.importArchiveDocument({ format: 'x' });

  assert.equal(compatibilitySaved.summary.snapshotCount, 1);
  assert.equal(compatibilityExported.snapshotCount, 1);
  assert.equal(compatibilityImported.report.added, 1);
});

test('createSnapshotSyncPort routes queryUsage and validates store availability', async () => {
  const calls = [];
  const port = createSnapshotSyncPort({
    archiveStore: {
      queryArchiveUsage: async (input) => {
        calls.push(input.mode);
        return { mode: input.mode, rows: [], summary: { totalCredits: 0 } };
      },
    },
  });

  const day = await port.queryUsage({ mode: 'day', startDate: '2026-05-01', endDate: '2026-05-02' });
  const month = await port.queryUsage({ mode: 'month' });
  assert.equal(day.mode, 'day');
  assert.equal(month.mode, 'month');
  assert.deepEqual(calls, ['day', 'month']);

  const unavailablePort = createSnapshotSyncPort({ archiveStore: null });
  await assert.rejects(
    () => unavailablePort.queryUsage({ mode: 'day', startDate: '2026-05-01', endDate: '2026-05-02' }),
    /Snapshot Archive library is unavailable/,
  );
});

test('createSnapshotSyncPort reports local-only fallback sync status', () => {
  const port = createSnapshotSyncPort({
    archiveStore: {},
    getBackendInfo: () => ({ id: 'localStorage', label: 'localStorage' }),
  });
  const status = port.getSyncStatus();

  assert.equal(status.backendId, 'localStorage');
  assert.equal(status.backendLabel, 'localStorage');
  assert.equal(status.crossDeviceCapable, false);
  assert.equal(status.localOnly, true);
  assert.match(status.reason, /local/i);
});

test('createSnapshotSyncStatus derives GM, localStorage, pending, and unavailable states', () => {
  assert.deepEqual(createSnapshotSyncStatus({ id: 'gm', label: 'GM storage' }), {
    backendId: 'gm',
    backendLabel: 'GM storage',
    crossDeviceCapable: true,
    localOnly: false,
    reason: 'Userscript manager storage is available; cross-device sync depends on the manager sync setting.',
  });
  assert.deepEqual(createSnapshotSyncStatus({ id: 'localStorage', label: 'localStorage' }), {
    backendId: 'localStorage',
    backendLabel: 'localStorage',
    crossDeviceCapable: false,
    localOnly: true,
    reason: 'localStorage is browser-local and will not sync personal usage history across devices.',
  });
  assert.deepEqual(createSnapshotSyncStatus({ id: 'pending', label: 'pending' }), {
    backendId: 'pending',
    backendLabel: 'pending',
    crossDeviceCapable: false,
    localOnly: false,
    reason: 'Snapshot Archive storage has not been loaded yet.',
  });
  assert.deepEqual(createSnapshotSyncStatus(null), {
    backendId: 'unavailable',
    backendLabel: 'unavailable',
    crossDeviceCapable: false,
    localOnly: false,
    reason: 'Snapshot Archive storage is unavailable.',
  });
});
