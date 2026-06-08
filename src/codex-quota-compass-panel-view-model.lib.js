(function attachCodexQuotaCompassPanelViewModelLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelViewModelLib';
  const contractLib = globalObject.CodexQuotaCompassContractLib;

  if (!contractLib?.createQuotaSnapshotAccess) {
    throw new Error('CodexQuotaCompassContractLib is required before CodexQuotaCompassPanelViewModelLib.');
  }

  const { createQuotaSnapshotAccess } = contractLib;

  function normalizePanelSyncStatus(syncStatus, storageBackend) {
    const source = syncStatus || storageBackend || { id: 'pending', label: 'pending' };
    const backendId = source.backendId || source.id || 'pending';
    const backendLabel = source.backendLabel || source.label || backendId;

    return {
      backendId,
      backendLabel,
      crossDeviceCapable: Boolean(source.crossDeviceCapable),
      localOnly: Boolean(source.localOnly),
      reason: source.reason || '',
    };
  }

  function createSyncBanner(syncStatus) {
    if (syncStatus.crossDeviceCapable) {
      return {
        tone: 'success',
        titleKey: 'syncBannerGmTitle',
        detailKey: 'syncBannerGmDetail',
        backendLabel: syncStatus.backendLabel,
      };
    }

    if (syncStatus.localOnly) {
      return {
        tone: 'warning',
        titleKey: 'syncBannerLocalTitle',
        detailKey: 'syncBannerLocalDetail',
        backendLabel: syncStatus.backendLabel,
      };
    }

    return {
      tone: 'muted',
      titleKey: 'syncBannerPendingTitle',
      detailKey: 'syncBannerPendingDetail',
      backendLabel: syncStatus.backendLabel,
    };
  }

  function dataColumn(key, options = {}) {
    return {
      key,
      label: options.label || key,
      labelKey: options.labelKey || '',
      priority: options.priority || 'secondary',
      truncate: Boolean(options.truncate),
      wrap: Boolean(options.wrap),
      compact: options.compact !== false,
    };
  }

  function dataView(id, titleKey, rows, columns, options = {}) {
    return {
      type: 'dataView',
      id,
      titleKey,
      rows: Array.isArray(rows) ? rows : [],
      columns,
      emptyKey: options.emptyKey || 'tableNoData',
      compactOnMobile: options.compactOnMobile !== false,
      limit: options.limit,
    };
  }

  function createHistorySections(historyUsage) {
    const dayRows = historyUsage?.day?.rows || [];
    const daySummary = historyUsage?.day?.summary || {};
    const rollingSummary = historyUsage?.rolling?.summary || {};
    const monthSummary = historyUsage?.month?.summary || {};

    return [
      dataView('history-daily', 'sectionDailyQuery', dayRows.map((row) => ({
        date: row.date,
        credits: row.credits,
        usd: row.usd,
      })), [
        dataColumn('date', { labelKey: 'columnDateBucket', priority: 'primary' }),
        dataColumn('credits', { label: 'Credits', priority: 'primary' }),
        dataColumn('usd', { labelKey: 'columnUsd', priority: 'primary' }),
      ]),
      dataView('history-period-summary', 'sectionPeriodSummary', [{
        rollingCredits: rollingSummary.totalCredits,
        rollingUsd: rollingSummary.totalUsd,
        monthCredits: monthSummary.totalCredits,
        monthUsd: monthSummary.totalUsd,
        dayCredits: daySummary.totalCredits,
      }], [
        dataColumn('rollingCredits', { labelKey: 'columnRollingCredits', priority: 'primary' }),
        dataColumn('rollingUsd', { labelKey: 'columnRollingUsd', priority: 'primary' }),
        dataColumn('monthCredits', { labelKey: 'columnMonthCredits', priority: 'primary' }),
        dataColumn('monthUsd', { labelKey: 'columnMonthUsd', priority: 'secondary' }),
        dataColumn('dayCredits', { labelKey: 'columnDailyCredits', priority: 'secondary' }),
      ]),
    ];
  }

  function createDetailsSections({ weekly, sinceReset, month, rolling, windows }) {
    return [
      dataView('details-weekly-estimate', 'sectionWeeklyEstimate', [weekly], [
        dataColumn('已用百分比', { priority: 'primary' }),
        dataColumn('剩余比例小数', { priority: 'secondary' }),
        dataColumn('包含重置日_已用折算USD', { labelKey: 'columnIncludedResetUsd', priority: 'primary' }),
        dataColumn('反推周总USD_包含重置日', { labelKey: 'columnIncludedResetTotalUsd', priority: 'primary' }),
        dataColumn('剩余USD_包含重置日口径', { labelKey: 'columnIncludedResetRemainingUsd', priority: 'primary' }),
        dataColumn('包含重置日_已用Credits', { priority: 'secondary' }),
        dataColumn('剩余Credits_包含重置日口径', { priority: 'secondary' }),
        dataColumn('排除重置日_已用折算USD', { priority: 'secondary' }),
        dataColumn('剩余USD_排除重置日口径', { priority: 'secondary' }),
        dataColumn('排除重置日_已用Credits', { priority: 'debug' }),
        dataColumn('剩余Credits_排除重置日口径', { priority: 'debug' }),
        dataColumn('误差说明', { priority: 'debug', wrap: true }),
      ]),
      dataView('details-range-summary', 'sectionRangeSummary', [sinceReset, month, rolling], [
        dataColumn('范围', { priority: 'primary', wrap: true }),
        dataColumn('累计折算USD', { priority: 'primary' }),
        dataColumn('累计Credits', { priority: 'primary' }),
        dataColumn('返回日期桶数', { priority: 'secondary' }),
        dataColumn('累计Token', { priority: 'debug' }),
        dataColumn('累计线程数', { priority: 'debug' }),
        dataColumn('累计轮数', { priority: 'debug' }),
      ]),
      dataView('details-windows', 'sectionWindows', windows, [
        dataColumn('名称', { priority: 'primary', wrap: true }),
        dataColumn('已用百分比', { priority: 'primary' }),
        dataColumn('窗口天数', { priority: 'secondary' }),
        dataColumn('本轮开始_本地', { priority: 'secondary', truncate: true }),
        dataColumn('下次重置_本地', { priority: 'secondary', truncate: true }),
        dataColumn('距离重置小时', { priority: 'primary' }),
      ]),
    ];
  }

  function createPanelViews({ weekly, sinceReset, month, rolling, windows, historyUsage, transfer }) {
    const tabs = [
      { id: 'details', labelKey: 'tabDetails' },
      { id: 'history', labelKey: 'tabHistory' },
      { id: 'archive', labelKey: 'tabArchiveWorkspace' },
    ];

    return {
      tabs,
      views: {
        history: {
          id: 'history',
          labelKey: 'tabHistory',
          kind: 'sections',
          sections: createHistorySections(historyUsage),
        },
        details: {
          id: 'details',
          labelKey: 'tabDetails',
          kind: 'sections',
          sections: createDetailsSections({ weekly, sinceReset, month, rolling, windows }),
        },
        archive: {
          id: 'archive',
          labelKey: 'tabArchiveWorkspace',
          kind: 'archiveWorkspace',
          actionIds: transfer.actions.map((action) => action.action),
          sections: [
            { type: 'syncBanner' },
            { type: 'archiveSummary' },
            { type: 'note', noteKey: transfer.noteKey },
            { type: 'actions', actions: transfer.actions },
          ],
        },
      },
    };
  }

  function createPrimaryMetrics({ weekly, sinceReset, month, mainSevenDayWindow }) {
    return [
      {
        id: 'remainingUsdIncludingReset',
        type: 'credit',
        labelKey: 'metricRemainingUsdIncludingReset',
        label: '剩余 USD · 含重置日',
        usd: weekly.剩余USD_包含重置日口径,
      },
      {
        id: 'remainingUsdExcludingReset',
        type: 'credit',
        labelKey: 'metricRemainingUsdExcludingReset',
        label: '剩余 USD · 排除重置日',
        usd: weekly.剩余USD_排除重置日口径,
      },
      {
        id: 'weeklyTotalIncludingReset',
        type: 'credit',
        labelKey: 'metricWeeklyTotalIncludingReset',
        label: '周总额度 · 含重置日',
        usd: weekly.反推周总USD_包含重置日,
      },
      {
        id: 'weeklyTotalExcludingReset',
        type: 'credit',
        labelKey: 'metricWeeklyTotalExcludingReset',
        label: '周总额度 · 排除重置日',
        usd: weekly.反推周总USD_排除重置日,
      },
      {
        id: 'sevenDayUsedPercent',
        type: 'value',
        labelKey: 'metricSevenDayUsedPercent',
        label: '7 天已用',
        value: weekly.已用百分比 !== undefined ? `${weekly.已用百分比}%` : '-',
      },
      {
        id: 'sinceResetTotal',
        type: 'credit',
        labelKey: 'metricSinceResetTotal',
        label: '上次重置至今',
        usd: sinceReset.累计折算USD,
      },
      {
        id: 'monthTotal',
        type: 'credit',
        labelKey: 'metricMonthTotal',
        label: '本月累计',
        usd: month.累计折算USD,
      },
      {
        id: 'resetCountdown',
        type: 'reset',
        hours: mainSevenDayWindow?.距离重置小时,
      },
    ];
  }

  function createQuotaPanelViewModel({
    result,
    historyUsage,
    archiveSummary,
    importReport,
    storageBackend,
    syncStatus,
  }) {
    const snapshotAccess = createQuotaSnapshotAccess(result);
    const rollingKey = snapshotAccess.rollingKey;
    const weekly = snapshotAccess.sinceReset.weeklyEstimate;
    const sinceReset = snapshotAccess.sinceReset.summary;
    const month = snapshotAccess.monthToDate.summary;
    const rolling = snapshotAccess.rolling.summary;
    const mainSevenDayWindow = snapshotAccess.mainSevenDayWindow;
    const recentSnapshots = Array.isArray(archiveSummary?.recentSnapshots)
      ? archiveSummary.recentSnapshots.slice(0, 5).map((row) => ({
        capturedAt: row?.capturedAt || '-',
        snapshotId: row?.snapshotId || 'legacy',
        monthlyCredits: row?.monthlyCredits,
        weeklyUsedPercent: row?.weeklyUsedPercent,
      }))
      : [];
    const normalizedSyncStatus = normalizePanelSyncStatus(syncStatus, storageBackend);
    const archiveHealth = {
      isLoaded: Boolean(archiveSummary),
      snapshotCount: archiveSummary?.snapshotCount || 0,
      hasSnapshots: Boolean((archiveSummary?.snapshotCount || 0) > 0),
      earliestCapturedAt: archiveSummary?.earliestCapturedAt || null,
      latestCapturedAt: archiveSummary?.latestCapturedAt || null,
      storageBackendLabel: normalizedSyncStatus.backendLabel,
      importReport,
    };

    const transfer = {
      noteKey: 'transferNote',
      syncStatus: normalizedSyncStatus,
      actions: [
        { action: 'export-archive', labelKey: 'archiveExportAction' },
        { action: 'import-archive', labelKey: 'archiveImportAction' },
      ],
    };
    const panelViews = createPanelViews({
      weekly,
      sinceReset,
      month,
      rolling,
      windows: snapshotAccess.windows,
      historyUsage,
      transfer,
    });

    return {
      rollingKey,
      weekly,
      sinceReset,
      month,
      rolling,
      syncStatus: normalizedSyncStatus,
      syncBanner: createSyncBanner(normalizedSyncStatus),
      archiveHealth,
      transfer,
      tabs: panelViews.tabs,
      views: panelViews.views,
      primaryMetrics: createPrimaryMetrics({
        weekly,
        sinceReset,
        month,
        mainSevenDayWindow,
      }),
      rollingRows: snapshotAccess.rolling.dailyRows,
      sinceResetRows: snapshotAccess.sinceReset.dailyRows,
      sinceResetClients: snapshotAccess.sinceReset.clientSummaries,
      mainSevenDayWindow,
      history: {
        dayRows: historyUsage?.day?.rows || [],
        daySummary: historyUsage?.day?.summary || {},
        rollingSummary: historyUsage?.rolling?.summary || {},
        monthSummary: historyUsage?.month?.summary || {},
      },
      archive: {
        isLoaded: Boolean(archiveSummary),
        snapshotCount: archiveSummary?.snapshotCount || 0,
        earliestCapturedAt: archiveSummary?.earliestCapturedAt || null,
        latestCapturedAt: archiveSummary?.latestCapturedAt || null,
        recentSnapshots,
        storageBackend,
        importReport,
      },
    };
  }

  globalObject[LIB_NAME] = Object.freeze({
    createQuotaPanelViewModel,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
