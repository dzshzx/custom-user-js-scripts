import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/codex-quota-compass-core.lib.js');

const {
  buildQuotaSnapshotResult,
  rollingPeriodKey,
  createSnapshotSyncPort,
} = globalThis.CodexQuotaCompassCoreLib;

test('rollingPeriodKey returns the first matching rolling period key', () => {
  const key = rollingPeriodKey({
    配置: {},
    近7天: { 汇总: {} },
    近30天: { 汇总: {} },
  });

  assert.equal(key, '近7天');
});

test('buildQuotaSnapshotResult builds stable Quota Snapshot contract shape', () => {
  const result = buildQuotaSnapshotResult({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    diagnostics: { 浏览器本地时区: 'Asia/Shanghai' },
    windows: [{ 名称: '主限制 - 7天窗口', 已用百分比: 40 }],
    periods: {
      sinceReset: { summary: { 范围: 'A' }, weeklyEstimate: { 已用百分比: 40 }, rows: [], clients: [] },
      monthToDate: { summary: { 范围: 'B' }, rows: [], clients: [] },
      rolling: { summary: { 范围: 'C' }, rows: [], clients: [] },
    },
  });

  assert.equal(result.配置.ROLLING_DAYS, 30);
  assert.equal(result.主7天窗口_上次重置至今.反推周额度.已用百分比, 40);
  assert.equal(result.本月初至今.汇总.范围, 'B');
  assert.ok(result.近30天);
});

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
      summarizeArchive: async () => ({ snapshotCount: 2 }),
    },
  });

  const saved = await port.saveLatestResult({ 任意: true });
  const exported = await port.exportArchive();
  const imported = await port.importArchiveDocument({ format: 'x' });

  assert.equal(saved.summary.snapshotCount, 1);
  assert.equal(exported.snapshotCount, 1);
  assert.equal(imported.report.added, 1);
  assert.deepEqual(calls, ['save', 'export', 'import']);
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
  assert.equal(day.mode, 'day');
  assert.deepEqual(calls, ['day']);

  const unavailablePort = createSnapshotSyncPort({ archiveStore: null });
  await assert.rejects(
    () => unavailablePort.queryUsage({ mode: 'day', startDate: '2026-05-01', endDate: '2026-05-02' }),
    /Snapshot Archive library is unavailable/,
  );
});
