import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/codex-quota-compass-core.lib.js');

const {
  buildQuotaSnapshotResult,
  createQuotaCalculator,
  createQuotaPanelViewModel,
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

test('createQuotaCalculator computes quota result through injected fetch adapters', async () => {
  const usageCalls = [];
  const dailyCalls = [];
  const calculator = createQuotaCalculator({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    formatLocalTime: (ms) => `local:${new Date(ms).toISOString()}`,
    getBrowserTimeZone: () => 'Asia/Shanghai',
    fetchUsage: async () => {
      usageCalls.push('usage');
      return {
        rate_limit: {
          primary_window: {
            used_percent: 20,
            limit_window_seconds: 5 * 60 * 60,
            reset_after_seconds: 60 * 60,
            reset_at: Date.parse('2026-05-31T00:00:00.000Z') / 1000,
          },
          secondary_window: {
            used_percent: 40,
            limit_window_seconds: 7 * 24 * 60 * 60,
            reset_after_seconds: 24 * 60 * 60,
            reset_at: Date.parse('2026-05-31T00:00:00.000Z') / 1000,
          },
        },
      };
    },
    fetchDailyUsage: async (startDate, endDate) => {
      dailyCalls.push([startDate, endDate]);
      return {
        data: [
          {
            date: startDate,
            totals: {
              credits: 10,
              users: 1,
              threads: 2,
              turns: 3,
              text_total_tokens: 100,
            },
            clients: [
              {
                client_id: 'chatgpt-web',
                credits: 10,
                threads: 2,
                turns: 3,
                text_total_tokens: 100,
              },
            ],
          },
        ],
      };
    },
  });

  const result = await calculator.run();

  assert.deepEqual(usageCalls, ['usage']);
  assert.deepEqual(dailyCalls, [
    ['2026-05-24', '2026-05-31'],
    ['2026-05-01', '2026-05-31'],
    ['2026-05-01', '2026-05-31'],
  ]);
  assert.equal(result.时区诊断.浏览器本地时区, 'Asia/Shanghai');
  assert.equal(result.限制窗口概览.length, 2);
  assert.equal(result.主7天窗口_上次重置至今.汇总.累计Credits, 10);
  assert.equal(result.主7天窗口_上次重置至今.反推周额度.反推周总Credits_包含重置日, 25);
  assert.equal(result.主7天窗口_上次重置至今.客户端汇总[0].客户端, 'chatgpt-web');
  assert.equal(result.本月初至今.汇总.API_start_date, '2026-05-01');
  assert.ok(result.近30天);
});

test('createQuotaPanelViewModel maps result, history, and archive state', () => {
  const result = buildQuotaSnapshotResult({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    diagnostics: {},
    windows: [{ 名称: '主限制 - 7天窗口', 距离重置小时: 12 }],
    periods: {
      sinceReset: {
        summary: { 累计Credits: 20 },
        weeklyEstimate: { 已用百分比: 40 },
        rows: [{ 日期桶: '2026-05-30', Credits: 20 }],
        clients: [{ 客户端: 'chatgpt-web' }],
      },
      monthToDate: { summary: { 累计Credits: 100 }, rows: [], clients: [] },
      rolling: { summary: { 累计Credits: 200 }, rows: [{ 日期桶: '2026-05-29' }], clients: [] },
    },
  });

  const model = createQuotaPanelViewModel({
    result,
    historyUsage: {
      day: { rows: [{ date: '2026-05-30', credits: 20, usd: 0.8 }], summary: { totalCredits: 20 } },
      rolling: { summary: { totalCredits: 200, totalUsd: 8 } },
      month: { summary: { totalCredits: 100, totalUsd: 4 } },
    },
    archiveSummary: {
      snapshotCount: 1,
      earliestCapturedAt: '2026-05-30T10:00:00.000Z',
      latestCapturedAt: '2026-05-30T10:00:00.000Z',
      recentSnapshots: [{ snapshotId: 'snapshot-1', capturedAt: '2026-05-30T10:00:00.000Z' }],
    },
    importReport: { added: 1, skipped: 0, invalid: 0 },
    storageBackend: { id: 'gm', label: 'GM storage' },
  });

  assert.equal(model.rollingKey, '近30天');
  assert.equal(model.weekly.已用百分比, 40);
  assert.equal(model.mainSevenDayWindow.距离重置小时, 12);
  assert.equal(model.history.dayRows.length, 1);
  assert.equal(model.history.rollingSummary.totalCredits, 200);
  assert.equal(model.archive.snapshotCount, 1);
  assert.equal(model.archive.storageBackend.label, 'GM storage');
  assert.equal(model.archive.importReport.added, 1);
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
      queryHistory: async () => {
        calls.push('history');
        return { day: { rows: [] }, rolling: { summary: {} }, month: { summary: {} }, timeline: [] };
      },
      summarizeArchive: async () => ({ snapshotCount: 2 }),
    },
  });

  const saved = await port.saveLatestResult({ 任意: true });
  const exported = await port.exportArchive();
  const imported = await port.importArchiveDocument({ format: 'x' });
  const history = await port.queryHistory({ periodDays: 30 });

  assert.equal(saved.summary.snapshotCount, 1);
  assert.equal(exported.snapshotCount, 1);
  assert.equal(imported.report.added, 1);
  assert.equal(history.timeline.length, 0);
  assert.deepEqual(calls, ['save', 'export', 'import', 'history']);
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
