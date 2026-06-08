import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-contract.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-core.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-view-model.lib.js');

const { buildQuotaSnapshotResult } = globalThis.CodexQuotaCompassCoreLib;
const { createQuotaPanelViewModel } = globalThis.CodexQuotaCompassPanelViewModelLib;

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
  assert.deepEqual(model.tabs.map((tab) => tab.id), ['details', 'history', 'archive']);
  assert.equal(model.tabs.some((tab) => tab.id === 'transfer'), false);
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
