import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/codex-quota-compass-contract.lib.js');
await import('../src/codex-quota-compass-core.lib.js');

const {
  buildQuotaSnapshotResult,
  createQuotaCalculator,
  createQuotaPanelViewModel,
  rollingPeriodKey,
} = globalThis.CodexQuotaCompassCoreLib;

test('rollingPeriodKey returns the first matching rolling period key', () => {
  const key = rollingPeriodKey({
    配置: {},
    近7天: { 汇总: {} },
    近30天: { 汇总: {} },
  });

  assert.equal(key, '近7天');
});

test('core exports quota calculation and panel interfaces only', () => {
  assert.equal(Object.hasOwn(globalThis.CodexQuotaCompassCoreLib, 'createSnapshotSyncPort'), false);
  assert.equal(Object.hasOwn(globalThis.CodexQuotaCompassCoreLib, 'createSnapshotSyncStatus'), false);
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
  assert.equal(result.限制窗口概览[1].窗口Key, 'main.sevenDayWindow');
  assert.equal(result.限制窗口概览[1].后端字段, 'secondary_window');
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
    windows: [{ 窗口Key: 'main.sevenDayWindow', 名称: '主限制 - 7天窗口', 距离重置小时: 12 }],
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
    syncStatus: {
      backendId: 'gm',
      backendLabel: 'GM storage',
      crossDeviceCapable: true,
      localOnly: false,
      reason: 'Userscript manager storage is available.',
    },
  });

  assert.equal(model.rollingKey, '近30天');
  assert.equal(model.weekly.已用百分比, 40);
  assert.equal(model.mainSevenDayWindow.距离重置小时, 12);
  assert.equal(model.history.dayRows.length, 1);
  assert.equal(model.history.rollingSummary.totalCredits, 200);
  assert.equal(model.archive.snapshotCount, 1);
  assert.equal(model.archive.storageBackend.label, 'GM storage');
  assert.equal(model.archive.importReport.added, 1);
  assert.equal(model.syncBanner.tone, 'success');
  assert.equal(model.syncBanner.titleKey, 'syncBannerGmTitle');
  assert.equal(model.archiveHealth.snapshotCount, 1);
  assert.equal(model.archiveHealth.hasSnapshots, true);
  assert.deepEqual(model.transfer.actions.map((action) => action.action), ['export-archive', 'import-archive']);
  assert.deepEqual(model.tabs.map((tab) => tab.id), ['overview', 'history', 'details', 'archive']);
  assert.equal(model.tabs.some((tab) => tab.id === 'transfer'), false);
  assert.equal(model.views.overview.sections.length > 0, true);
  assert.equal(model.views.details.sections[2].id, 'details-windows');
  assert.equal(
    model.views.details.sections[2].columns.find((column) => column.key === '本轮开始_本地').truncate,
    true,
  );
  assert.deepEqual(model.views.archive.actionIds, ['export-archive', 'import-archive']);
  assert.deepEqual(model.primaryMetrics.map((metric) => metric.id), [
    'remainingUsdIncludingReset',
    'remainingUsdExcludingReset',
    'weeklyTotalIncludingReset',
    'weeklyTotalExcludingReset',
    'sevenDayUsedPercent',
    'sinceResetTotal',
    'monthTotal',
    'resetCountdown',
  ]);
  assert.equal(model.primaryMetrics.find((metric) => metric.id === 'resetCountdown').hours, 12);
  for (const metric of model.primaryMetrics) {
    assert.equal(Object.hasOwn(metric, 'credits'), false, `${metric.id} exposes secondary credits`);
    assert.equal(Object.hasOwn(metric, 'hint'), false, `${metric.id} exposes secondary hint`);
    assert.equal(Object.hasOwn(metric, 'hintKey'), false, `${metric.id} exposes secondary hint key`);
    assert.equal(Object.hasOwn(metric, 'windowRow'), false, `${metric.id} exposes raw reset window`);
  }
});

test('createQuotaPanelViewModel marks localStorage archive as local-only sync', () => {
  const model = createQuotaPanelViewModel({
    result: buildQuotaSnapshotResult({
      config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
      diagnostics: {},
      windows: [],
      periods: {
        sinceReset: { summary: {}, weeklyEstimate: {}, rows: [], clients: [] },
        monthToDate: { summary: {}, rows: [], clients: [] },
        rolling: { summary: {}, rows: [], clients: [] },
      },
    }),
    syncStatus: {
      backendId: 'localStorage',
      backendLabel: 'localStorage',
      crossDeviceCapable: false,
      localOnly: true,
      reason: 'localStorage is browser-local.',
    },
    archiveSummary: null,
    storageBackend: { id: 'localStorage', label: 'localStorage' },
  });

  assert.equal(model.syncBanner.tone, 'warning');
  assert.equal(model.syncBanner.titleKey, 'syncBannerLocalTitle');
  assert.equal(model.archiveHealth.hasSnapshots, false);
  assert.equal(model.transfer.syncStatus.localOnly, true);
  assert.equal(model.tabs.some((tab) => tab.id === 'archive'), true);
  assert.equal(model.views.archive.kind, 'archiveWorkspace');
});

test('panel mobile regression contract gives every tab content and compact long fields', () => {
  const model = createQuotaPanelViewModel({
    result: buildQuotaSnapshotResult({
      config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
      diagnostics: {},
      windows: [{
        窗口Key: 'main.sevenDayWindow',
        名称: '主限制 - 7天窗口',
        本轮开始_本地: '2026/05/30 18:00:00',
        下次重置_本地: '2026/06/06 18:00:00',
        距离重置小时: 12,
      }],
      periods: {
        sinceReset: {
          summary: { 范围: '上次重置至今近似 2026-05-30 ~ 2026-06-06', 累计Credits: 20, 累计折算USD: 0.8 },
          weeklyEstimate: { 已用百分比: 40, 包含重置日_已用折算USD: 0.8, 反推周总USD_包含重置日: 2, 剩余USD_包含重置日口径: 1.2 },
          rows: [],
          clients: [],
        },
        monthToDate: { summary: { 累计Credits: 100, 累计折算USD: 4 }, rows: [], clients: [] },
        rolling: { summary: { 累计Credits: 200, 累计折算USD: 8 }, rows: [], clients: [] },
      },
    }),
    historyUsage: {
      day: { rows: [{ date: '2026-05-30', credits: 20, usd: 0.8 }], summary: { totalCredits: 20 } },
      rolling: { summary: { totalCredits: 200, totalUsd: 8 } },
      month: { summary: { totalCredits: 100, totalUsd: 4 } },
    },
    archiveSummary: {
      snapshotCount: 1,
      earliestCapturedAt: '2026-05-30T10:00:00.000Z',
      latestCapturedAt: '2026-05-30T10:00:00.000Z',
      recentSnapshots: [{
        snapshotId: '60497965-2364-4e37-ace5-long-snapshot-id',
        capturedAt: '2026-05-30T10:00:00.000Z',
      }],
    },
    storageBackend: { id: 'gm', label: 'GM storage' },
    syncStatus: {
      backendId: 'gm',
      backendLabel: 'GM storage',
      crossDeviceCapable: true,
      localOnly: false,
    },
  });

  for (const tab of model.tabs) {
    const view = model.views[tab.id];
    assert.ok(view, `missing view for ${tab.id}`);
    assert.ok(Array.isArray(view.sections) && view.sections.length > 0, `empty sections for ${tab.id}`);
  }

  const dataViews = Object.values(model.views)
    .flatMap((view) => view.sections)
    .filter((section) => section.type === 'dataView');

  assert.ok(dataViews.length > 0);
  assert.equal(dataViews.every((section) => section.compactOnMobile !== false), true);
  assert.equal(
    dataViews.some((section) => section.columns.some((column) => column.truncate || column.wrap)),
    true,
  );
});
