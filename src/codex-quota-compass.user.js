// ==UserScript==
// @name         Codex Quota Compass
// @name:zh-CN   Codex 配额统计
// @name:en      Codex Quota Compass
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.2.3
// @description  Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @description:zh-CN  在 chatgpt.com 展示 Codex 配额窗口、每日用量、客户端汇总和周额度估算。
// @description:en     Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @author       BlueSkyXN, dzshzx
// @match        https://chatgpt.com/*
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/codex-quota-compass-contract.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/codex-quota-compass-core.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/codex-quota-compass-runtime.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/codex-quota-compass-panel-shell.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/codex-quota-compass-archive.lib.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/dzshzx/custom-user-js-scripts
// @supportURL   https://github.com/dzshzx/custom-user-js-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/codex-quota-compass.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/codex-quota-compass.user.js
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_NAME = 'Codex Quota Compass';
  const DEBUG_KEY = '__codexQuotaCompassDebug';
  const LAST_RESULT_KEY = '__codexQuotaCompassLastResult';
  const RUNNING_KEY = '__codexQuotaCompassRunning';
  const ROOT_ID = 'codex-quota-compass-root';
  const SCRIPT_VERSION = '0.2.3';
  const DEFAULT_LOCALE = 'zh-CN';
  const I18N_MESSAGES = {
    'zh-CN': {
      panelTitle: 'Codex 配额统计',
      buttonTitle: '配额统计',
      buttonAriaOpen: '打开 Codex 配额统计',
      statusIdle: '点击计算',
      statusLoading: '计算中',
      statusUpdated: '已更新',
      statusFailed: '失败',
      statusCached: '已缓存',
      actionRefresh: '刷新',
      actionRetry: '重试',
      tabOverview: '概览',
      tabHistory: '历史',
      tabDetails: '详情',
      tabArchiveWorkspace: '同步',
      sectionOverviewSummary: '概览摘要',
      sectionArchiveOverview: '数据概况',
      sectionDailyQuery: '按日查询',
      sectionPeriodSummary: '周期汇总',
      sectionWeeklyEstimate: '周额度估算',
      sectionRangeSummary: '区间汇总',
      sectionWindows: '限制窗口',
      columnItem: '项目',
      columnValue: '值',
      columnDetail: '说明',
      columnDateBucket: '日期桶',
      columnUsd: '折算USD',
      columnRollingCredits: '近30天Credits',
      columnRollingUsd: '近30天USD',
      columnMonthCredits: '本月Credits',
      columnMonthUsd: '本月USD',
      columnDailyCredits: '日查询Credits',
      columnIncludedResetUsd: '含重置日已用USD',
      columnIncludedResetTotalUsd: '含重置日周总USD',
      columnIncludedResetRemainingUsd: '含重置日剩余USD',
      metricRemainingUsdIncludingReset: '剩余 USD · 含重置日',
      metricRemainingUsdExcludingReset: '剩余 USD · 排除重置日',
      metricWeeklyTotalIncludingReset: '周总额度 · 含重置日',
      metricWeeklyTotalExcludingReset: '周总额度 · 排除重置日',
      metricSevenDayUsedPercent: '7 天已用',
      metricSinceResetTotal: '上次重置至今',
      metricMonthTotal: '本月累计',
      transferNote: '可通过导出、导入在不同设备间同步用量记录。',
      syncBannerGmTitle: '可跨设备同步',
      syncBannerGmDetail: '当前存储：{backend}。开启脚本管理器同步后，用量记录会一起同步。',
      syncBannerLocalTitle: '仅保存在本机',
      syncBannerLocalDetail: '当前存储：{backend}。这台设备上的记录不会自动同步到其他设备。',
      syncBannerPendingTitle: '同步状态待加载',
      syncBannerPendingDetail: '打开或刷新统计后会读取本地记录状态。',
      loadingTitle: '正在计算 Codex 用量',
      loadingHint: '会请求 usage 和 daily analytics 接口，结果不会包含 token 或 cookie。',
      errorTitle: '计算失败',
      errorUnknown: '未知错误',
      archiveEmpty: '记录尚未加载。',
      archiveNoSnapshot: '还没有保存过用量记录。',
      archiveLatestImport: '上次导入：新增 {added} 条，跳过 {skipped} 条，无效 {invalid} 条。',
      archiveExportAction: '导出记录',
      archiveImportAction: '导入记录',
      archiveSnapshotCount: '记录数',
      archiveEarliestCapturedAt: '最早记录',
      archiveLatestCapturedAt: '最近记录',
      archiveCapturedAt: '记录时间',
      archiveSnapshotId: '记录ID',
      archiveMonthlyCredits: '本月用量',
      archiveWeeklyUsedPercent: '7 天已用',
      archiveStorageBackend: '存储位置',
      tableNoData: '暂无数据',
      tablePreviewHint: '仅显示前 {visible} 条，共 {total} 条。需要完整调试输出时，先设置 window.{debugKey} = true 后刷新。',
      resetCountdown: '距离重置',
      menuRun: '运行 Codex Quota Compass',
      menuExport: '导出用量记录',
      menuImport: '导入用量记录',
      exportDone: '导出完成：{count} 条记录。',
      importDone: '导入完成：新增 {added} 条，跳过 {skipped} 条，无效 {invalid} 条。',
      syncPortUnavailable: '同步功能暂不可用。',
      exportFailed: '导出失败：{error}',
      importFailed: '导入失败：{error}',
      saveArchiveFailed: '已完成计算，但保存用量记录失败：{error}',
      importNoFile: '未选择导入文件。',
      importReadFailed: '读取导入文件失败。',
      alreadyRunning: 'Codex Quota Compass 正在运行，请等待当前计算完成后再刷新。',
    },
    en: {
      panelTitle: 'Codex Quota Compass',
      buttonTitle: 'Quota Stats',
      buttonAriaOpen: 'Open Codex quota stats',
      statusIdle: 'Click to run',
      statusLoading: 'Running',
      statusUpdated: 'Updated',
      statusFailed: 'Failed',
      statusCached: 'Cached',
      actionRefresh: 'Refresh',
      actionRetry: 'Retry',
      tabOverview: 'Overview',
      tabHistory: 'History',
      tabDetails: 'Details',
      tabArchiveWorkspace: 'Sync',
      sectionOverviewSummary: 'Overview Summary',
      sectionArchiveOverview: 'Archive Overview',
      sectionDailyQuery: 'Daily Query',
      sectionPeriodSummary: 'Period Summary',
      sectionWeeklyEstimate: 'Weekly Estimate',
      sectionRangeSummary: 'Range Summary',
      sectionWindows: 'Limit Windows',
      columnItem: 'Item',
      columnValue: 'Value',
      columnDetail: 'Detail',
      columnDateBucket: 'Date Bucket',
      columnUsd: 'USD',
      columnRollingCredits: 'Last 30d Credits',
      columnRollingUsd: 'Last 30d USD',
      columnMonthCredits: 'Month Credits',
      columnMonthUsd: 'Month USD',
      columnDailyCredits: 'Daily Credits',
      columnIncludedResetUsd: 'Used USD incl reset day',
      columnIncludedResetTotalUsd: 'Weekly USD incl reset day',
      columnIncludedResetRemainingUsd: 'Remaining USD incl reset day',
      metricRemainingUsdIncludingReset: 'Remaining USD · incl reset day',
      metricRemainingUsdExcludingReset: 'Remaining USD · excl reset day',
      metricWeeklyTotalIncludingReset: 'Weekly total · incl reset day',
      metricWeeklyTotalExcludingReset: 'Weekly total · excl reset day',
      metricSevenDayUsedPercent: '7-day used',
      metricSinceResetTotal: 'Since reset',
      metricMonthTotal: 'Month total',
      transferNote: 'Import and export can sync snapshot archives across devices.',
      syncBannerGmTitle: 'Cross-device sync path available',
      syncBannerGmDetail: 'Using {backend}. If userscript-manager sync is enabled, personal usage history can sync with script storage.',
      syncBannerLocalTitle: 'Current device local archive',
      syncBannerLocalDetail: 'Using {backend} fallback; personal usage history will not automatically sync to other devices.',
      syncBannerPendingTitle: 'Archive status pending',
      syncBannerPendingDetail: 'Open or refresh stats to load Snapshot Archive status.',
      loadingTitle: 'Calculating Codex usage',
      loadingHint: 'This requests usage and daily analytics endpoints, and does not expose token or cookie.',
      errorTitle: 'Calculation Failed',
      errorUnknown: 'Unknown error',
      archiveEmpty: 'Archive not loaded yet.',
      archiveNoSnapshot: 'No snapshot has been recorded yet.',
      archiveLatestImport: 'Latest import: {added} added, {skipped} skipped, {invalid} invalid.',
      archiveExportAction: 'Export Archive',
      archiveImportAction: 'Import Archive',
      archiveSnapshotCount: 'Snapshots',
      archiveEarliestCapturedAt: 'Earliest Captured',
      archiveLatestCapturedAt: 'Latest Captured',
      archiveCapturedAt: 'Captured At',
      archiveSnapshotId: 'Snapshot ID',
      archiveMonthlyCredits: 'Monthly Credits',
      archiveWeeklyUsedPercent: '7-day Used Percent',
      archiveStorageBackend: 'Storage Backend',
      tableNoData: 'No data',
      tablePreviewHint: 'Showing first {visible} of {total} rows. For full debug output, set window.{debugKey} = true and refresh.',
      resetCountdown: 'Reset in',
      menuRun: 'Run Codex Quota Compass',
      menuExport: 'Export Snapshot Archive',
      menuImport: 'Import Snapshot Archive',
      exportDone: 'Export complete: {count} snapshots.',
      importDone: 'Import complete: {added} added, {skipped} skipped, {invalid} invalid.',
      syncPortUnavailable: 'Snapshot sync port is unavailable.',
      exportFailed: 'Export failed: {error}',
      importFailed: 'Import failed: {error}',
      saveArchiveFailed: 'Calculation finished, but writing Snapshot Archive failed: {error}',
      importNoFile: 'No import file selected.',
      importReadFailed: 'Failed to read import file.',
      alreadyRunning: 'Codex Quota Compass is already running. Please wait and retry.',
    },
  };
  const BUTTON_POSITION_KEY = 'codexQuotaCompassButtonPosition';
  const SNAPSHOT_ARCHIVE_KEY = 'codexQuotaCompassSnapshotArchive';
  const SNAPSHOT_ARCHIVE_FALLBACK_KEY = 'codexQuotaCompassSnapshotArchiveFallback';
  const STORAGE_BACKENDS = {
    pending: { id: 'pending', label: 'pending' },
    gm: { id: 'gm', label: 'GM storage' },
    localStorage: { id: 'localStorage', label: 'localStorage' },
  };

  let statusNode;
  let contentNode;
  let activePanelView = 'overview';
  let latestError;
  let latestResult = null;
  let latestHistoryUsage = null;
  let latestPanelViewModel = null;
  let latestArchiveSummary = null;
  let latestImportReport = null;
  let pendingRunPromise = null;
  let floatingPanelShell = null;
  const coreLib = globalThis.CodexQuotaCompassCoreLib;
  const runtimeLib = globalThis.CodexQuotaCompassRuntimeLib;
  const panelShellLib = globalThis.CodexQuotaCompassPanelShellLib;
  const archiveLib = globalThis.CodexQuotaCompassArchiveLib;
  const archiveStoragePort = createSnapshotArchiveStoragePort();
  const archiveStore = archiveLib
    ? archiveLib.createSnapshotArchiveStore({
      read: archiveStoragePort.read,
      write: archiveStoragePort.write,
      scriptVersion: SCRIPT_VERSION,
    })
    : null;
  const syncPort = coreLib?.createSnapshotSyncPort
    ? coreLib.createSnapshotSyncPort({ archiveStore, getBackendInfo: archiveStoragePort.getBackendInfo })
    : null;

  function isUsagePage() {
    return (
      location.hostname === 'chatgpt.com' &&
      location.pathname === '/codex/cloud/settings/analytics' &&
      location.hash === '#usage'
    );
  }

  function resolveLocale() {
    const navLang = String(globalThis.navigator?.language || '').toLowerCase();
    if (navLang.startsWith('en')) return 'en';
    return DEFAULT_LOCALE;
  }

  function t(key, variables = {}) {
    const locale = resolveLocale();
    const template = I18N_MESSAGES[locale]?.[key]
      || I18N_MESSAGES[DEFAULT_LOCALE]?.[key]
      || key;
    return Object.entries(variables).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      template,
    );
  }

  function isDebugEnabled() {
    return window[DEBUG_KEY] === true;
  }

  function maybePromise(value) {
    return value && typeof value.then === 'function' ? value : Promise.resolve(value);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
    return String(value);
  }

  function safeRows(rows, limit = 12) {
    return Array.isArray(rows) ? rows.slice(0, limit) : [];
  }

  function createSnapshotArchiveStoragePort() {
    let backendInfo = STORAGE_BACKENDS.pending;

    async function readFromGmStorage() {
      if (typeof GM_getValue === 'function') {
        return await maybePromise(GM_getValue(SNAPSHOT_ARCHIVE_KEY, null));
      }

      if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') {
        return await GM.getValue(SNAPSHOT_ARCHIVE_KEY, null);
      }

      throw new Error('GM storage is unavailable.');
    }

    async function writeToGmStorage(nextArchive) {
      if (typeof GM_setValue === 'function') {
        await maybePromise(GM_setValue(SNAPSHOT_ARCHIVE_KEY, nextArchive));
        return nextArchive;
      }

      if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') {
        await GM.setValue(SNAPSHOT_ARCHIVE_KEY, nextArchive);
        return nextArchive;
      }

      throw new Error('GM storage is unavailable.');
    }

    function readFromLocalStorage() {
      return JSON.parse(localStorage.getItem(SNAPSHOT_ARCHIVE_FALLBACK_KEY) || 'null');
    }

    function writeToLocalStorage(nextArchive) {
      localStorage.setItem(SNAPSHOT_ARCHIVE_FALLBACK_KEY, JSON.stringify(nextArchive));
      return nextArchive;
    }

    return {
      async read() {
        try {
          const archive = await readFromGmStorage();
          backendInfo = STORAGE_BACKENDS.gm;
          return archive;
        } catch (error) {
          console.warn(`${SCRIPT_NAME}: failed to read userscript archive storage.`, error);
        }

        try {
          const archive = readFromLocalStorage();
          backendInfo = STORAGE_BACKENDS.localStorage;
          return archive;
        } catch (error) {
          console.warn(`${SCRIPT_NAME}: failed to read fallback archive storage.`, error);
          backendInfo = STORAGE_BACKENDS.localStorage;
          return null;
        }
      },

      async write(nextArchive) {
        try {
          await writeToGmStorage(nextArchive);
          backendInfo = STORAGE_BACKENDS.gm;
          return nextArchive;
        } catch (error) {
          console.warn(`${SCRIPT_NAME}: failed to write userscript archive storage.`, error);
        }

        writeToLocalStorage(nextArchive);
        backendInfo = STORAGE_BACKENDS.localStorage;
        return nextArchive;
      },

      getBackendInfo() {
        return backendInfo;
      },
    };
  }

  async function refreshArchiveSummary() {
    if (!syncPort) return null;
    latestArchiveSummary = await syncPort.summarize();
    return latestArchiveSummary;
  }

  function createArchivePanelModel(summary, importReport = latestImportReport) {
    if (!summary) {
      return {
        isLoaded: false,
        snapshotCount: 0,
        earliestCapturedAt: null,
        latestCapturedAt: null,
        recentSnapshots: [],
        storageBackend: archiveStoragePort.getBackendInfo(),
        importReport,
      };
    }

    return {
      isLoaded: true,
      snapshotCount: summary.snapshotCount,
      earliestCapturedAt: summary.earliestCapturedAt || null,
      latestCapturedAt: summary.latestCapturedAt || null,
      storageBackend: archiveStoragePort.getBackendInfo(),
      recentSnapshots: safeRows(summary.recentSnapshots || [], 5).map((row) => ({
        capturedAt: row?.capturedAt || '-',
        snapshotId: row?.snapshotId || 'legacy',
        monthlyCredits: row?.monthlyCredits,
        weeklyUsedPercent: row?.weeklyUsedPercent,
      })),
      importReport,
    };
  }

  function archiveSummaryHtml(model = createArchivePanelModel(latestArchiveSummary, latestImportReport)) {
    if (!model.isLoaded) {
      return `<div class="cqc-empty">${escapeHtml(t('archiveEmpty'))}</div>`;
    }

    const overviewColumns = [
      t('archiveSnapshotCount'),
      t('archiveEarliestCapturedAt'),
      t('archiveLatestCapturedAt'),
      t('archiveStorageBackend'),
    ];
    const recentColumns = [
      t('archiveCapturedAt'),
      t('archiveSnapshotId'),
      t('archiveMonthlyCredits'),
      t('archiveWeeklyUsedPercent'),
    ];
    const overview = dataViewHtml({
      id: 'archive-overview',
      rows: [
        {
          [overviewColumns[0]]: model.snapshotCount,
          [overviewColumns[1]]: model.earliestCapturedAt || '-',
          [overviewColumns[2]]: model.latestCapturedAt || '-',
          [overviewColumns[3]]: model.storageBackend?.label || '-',
        },
      ],
      columns: overviewColumns.map((column) => ({
        key: column,
        label: column,
        priority: column === t('archiveSnapshotCount') ? 'primary' : 'secondary',
        truncate: column !== t('archiveSnapshotCount'),
      })),
      limit: 1,
    });

    const recent = model.recentSnapshots.length
      ? dataViewHtml({
        id: 'archive-recent',
        rows: model.recentSnapshots.map((row) => ({
          [recentColumns[0]]: row.capturedAt,
          [recentColumns[1]]: row.snapshotId,
          [recentColumns[2]]: row.monthlyCredits,
          [recentColumns[3]]: row.weeklyUsedPercent,
        })),
        columns: recentColumns.map((column) => ({
          key: column,
          label: column,
          priority: column === t('archiveSnapshotId') ? 'primary' : 'secondary',
          truncate: column === t('archiveSnapshotId') || column === t('archiveCapturedAt'),
        })),
      })
      : `<div class="cqc-empty">${escapeHtml(t('archiveNoSnapshot'))}</div>`;

    const importReport = model.importReport
      ? `<div class="cqc-table-note">${escapeHtml(t('archiveLatestImport', { added: model.importReport.added, skipped: model.importReport.skipped, invalid: model.importReport.invalid }))}</div>`
      : '';

    return `${overview}${importReport}${recent}`;
  }

  function archiveTransferActionsHtml() {
    return detailActionsHtml([
      { action: 'export-archive', label: t('archiveExportAction') },
      { action: 'import-archive', label: t('archiveImportAction') },
    ]);
  }

  function setStatus(text, tone = 'idle') {
    floatingPanelShell?.setStatus(text, tone);
  }

  function openPanel() {
    floatingPanelShell?.openPanel();
  }

  function closePanel() {
    floatingPanelShell?.closePanel();
  }

  function positionPanelNearButton() {
    floatingPanelShell?.positionPanelNearButton();
  }

  function schedulePanelResize() {
    floatingPanelShell?.schedulePanelResize();
  }

  function isPanelCurrentlyOpen() {
    return Boolean(floatingPanelShell?.isOpen());
  }

  function normalizeDataColumns(rows, columns) {
    if (Array.isArray(columns) && columns.length) {
      return columns.map((column) => (
        typeof column === 'string'
          ? { key: column, label: column, priority: 'secondary', compact: true }
          : {
            key: column.key || column.label || '',
            label: column.label || column.key || '',
            labelKey: column.labelKey || '',
            priority: column.priority || 'secondary',
            truncate: Boolean(column.truncate),
            wrap: Boolean(column.wrap),
            compact: column.compact !== false,
          }
      )).filter((column) => column.key);
    }

    return [...new Set(rows.flatMap((row) => Object.keys(row || {})))]
      .map((key) => ({ key, label: key, priority: 'secondary', compact: true }));
  }

  function columnLabel(column) {
    return column.labelKey ? t(column.labelKey) : column.label;
  }

  function dataCellHtml(row, column) {
    const value = formatValue(row?.[column.key]);
    const classes = [
      column.truncate ? 'is-truncated' : '',
      column.wrap ? 'is-wrappable' : '',
      column.priority ? `is-${column.priority}` : '',
    ].filter(Boolean).join(' ');
    const title = column.truncate ? ` title="${escapeHtml(value)}"` : '';
    return `<td class="${escapeHtml(classes)}"${title}>${escapeHtml(value)}</td>`;
  }

  function compactValueHtml(row, column) {
    const value = formatValue(row?.[column.key]);
    const classes = [
      'cqc-compact-value',
      column.truncate ? 'is-truncated' : '',
      column.wrap ? 'is-wrappable' : '',
    ].filter(Boolean).join(' ');
    const title = column.truncate ? ` title="${escapeHtml(value)}"` : '';
    return `
      <div class="cqc-compact-field">
        <dt>${escapeHtml(columnLabel(column))}</dt>
        <dd class="${escapeHtml(classes)}"${title}>${escapeHtml(value)}</dd>
      </div>
    `;
  }

  function dataViewHtml(view = {}) {
    const rows = Array.isArray(view.rows) ? view.rows : [];
    const visibleRows = safeRows(rows, view.limit ?? 12);
    const columns = normalizeDataColumns(visibleRows, view.columns);

    if (!visibleRows.length || !columns.length) {
      return `<div class="cqc-empty">${escapeHtml(t(view.emptyKey || 'tableNoData'))}</div>`;
    }

    const head = columns
      .map((column) => `<th>${escapeHtml(columnLabel(column))}</th>`)
      .join('');
    const body = visibleRows
      .map((row) => (
        `<tr>${columns
          .map((column) => dataCellHtml(row, column))
          .join('')}</tr>`
      ))
      .join('');
    const compactColumns = columns.filter((column) => column.compact && column.priority !== 'debug');
    const compact = visibleRows
      .map((row) => `
        <dl class="cqc-compact-row">
          ${compactColumns.map((column) => compactValueHtml(row, column)).join('')}
        </dl>
      `)
      .join('');
    const more = rows.length > visibleRows.length
      ? `<div class="cqc-table-note">${escapeHtml(t('tablePreviewHint', { visible: visibleRows.length, total: rows.length, debugKey: DEBUG_KEY }))}</div>`
      : '';

    return `
      <div class="cqc-data-view" data-view-id="${escapeHtml(view.id || '')}" data-compact="${view.compactOnMobile === false ? 'false' : 'true'}">
        <div class="cqc-table-wrap cqc-data-table">
          <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
        </div>
        <div class="cqc-compact-list">${compact}</div>
      </div>
      ${more}
    `;
  }

  function tableHtml(rows, options = {}) {
    return dataViewHtml({
      id: options.id || '',
      rows,
      columns: options.columns,
      limit: options.limit,
      compactOnMobile: options.compactOnMobile,
    });
  }

  function metricHtml(label, value, hint = '') {
    return `
      <div class="cqc-metric">
        <div class="cqc-metric-label">${escapeHtml(label)}</div>
        <div class="cqc-metric-value">${escapeHtml(formatValue(value))}</div>
        ${hint ? `<div class="cqc-metric-hint">${escapeHtml(hint)}</div>` : ''}
      </div>
    `;
  }

  function usdValue(value) {
    return value === null || value === undefined || value === ''
      ? '-'
      : `$${formatValue(value)}`;
  }

  function formatMetricDecimal(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return '-';
    return numericValue.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function usdMetricValue(value) {
    return value === null || value === undefined || value === ''
      ? '-'
      : `$${formatMetricDecimal(value)}`;
  }

  function formatHoursDuration(hours) {
    const numericHours = Number(hours);
    if (!Number.isFinite(numericHours)) return '-';

    const totalMinutes = Math.max(0, Math.round(numericHours * 60));
    const days = Math.floor(totalMinutes / (24 * 60));
    const remainingHours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days} 天 ${remainingHours} 小时`;
    if (remainingHours > 0) return `${remainingHours} 小时 ${minutes} 分钟`;
    return `${minutes} 分钟`;
  }

  function creditMetricHtml(label, usd) {
    return metricHtml(label, usdMetricValue(usd));
  }

  function resetMetricHtml(hours) {
    return metricHtml(t('resetCountdown'), formatHoursDuration(hours));
  }

  function primaryMetricHtml(metric) {
    const label = metric?.labelKey ? t(metric.labelKey) : (metric?.label || '-');
    if (metric?.type === 'credit') {
      return creditMetricHtml(label, metric.usd);
    }
    if (metric?.type === 'reset') {
      return resetMetricHtml(metric.hours);
    }
    return metricHtml(label, metric?.value);
  }

  function syncBannerHtml(banner) {
    if (!banner) return '';
    const variables = { backend: banner.backendLabel || '-' };
    return `
      <div class="cqc-sync-banner" data-tone="${escapeHtml(banner.tone || 'muted')}">
        <strong>${escapeHtml(t(banner.titleKey, variables))}</strong>
        <span>${escapeHtml(t(banner.detailKey, variables))}</span>
      </div>
    `;
  }

  function sectionHtml(title, body) {
    return `
      <section class="cqc-section">
        <h3>${escapeHtml(title)}</h3>
        ${body}
      </section>
    `;
  }

  function detailActionsHtml(actions) {
    return `
      <div class="cqc-detail-footnote">
        ${actions.map((item) => `
          <button type="button" data-action="${escapeHtml(item.action)}">${escapeHtml(item.label)}</button>
        `).join('')}
      </div>
    `;
  }

  function panelTabsHtml(model = latestPanelViewModel) {
    const tabs = Array.isArray(model?.tabs) && model.tabs.length
      ? model.tabs
      : [
        { id: 'overview', labelKey: 'tabOverview' },
        { id: 'history', labelKey: 'tabHistory' },
        { id: 'details', labelKey: 'tabDetails' },
        { id: 'archive', labelKey: 'tabArchiveWorkspace' },
      ];
    return `
      <div class="cqc-tabs">
        ${tabs.map((tab) => `
          <button
            type="button"
            class="cqc-tab${activePanelView === tab.id ? ' is-active' : ''}"
            data-action="switch-view"
            data-view="${tab.id}"
          >${escapeHtml(tab.labelKey ? t(tab.labelKey) : tab.label)}</button>
        `).join('')}
      </div>
    `;
  }

  function sectionFromModelHtml(section) {
    if (!section) return '';
    if (section.type === 'dataView') {
      return sectionHtml(t(section.titleKey), dataViewHtml(section));
    }
    if (section.type === 'syncBanner') {
      return syncBannerHtml(latestPanelViewModel?.syncBanner);
    }
    if (section.type === 'archiveSummary') {
      return sectionHtml(t('sectionArchiveOverview'), archiveSummaryHtml(latestPanelViewModel?.archive));
    }
    if (section.type === 'note') {
      return `<div class="cqc-transfer-note">${escapeHtml(t(section.noteKey || 'transferNote'))}</div>`;
    }
    if (section.type === 'actions') {
      const actions = Array.isArray(section.actions)
        ? section.actions.map((item) => ({
          action: item.action,
          label: item.labelKey ? t(item.labelKey) : item.label,
        }))
        : [];
      return actions.length ? detailActionsHtml(actions) : '';
    }
    return '';
  }

  function sectionsViewHtml(view) {
    return (view?.sections || []).map(sectionFromModelHtml).join('');
  }

  function historyViewHtml(model = latestPanelViewModel) {
    const view = model?.views?.history;
    if (view) return sectionsViewHtml(view);
    const dayRows = model?.history?.dayRows || [];
    const daySummary = model?.history?.daySummary || {};
    const rollingSummary = model?.history?.rollingSummary || {};
    const monthSummary = model?.history?.monthSummary || {};
    return `
      ${sectionHtml(t('sectionDailyQuery'), tableHtml(dayRows.map((row) => ({
        日期桶: row.date,
        Credits: row.credits,
        折算USD: row.usd,
      })), { columns: ['日期桶', 'Credits', '折算USD'] }))}
      ${sectionHtml(t('sectionPeriodSummary'), tableHtml([{
        近30天Credits: rollingSummary.totalCredits,
        近30天USD: rollingSummary.totalUsd,
        本月Credits: monthSummary.totalCredits,
        本月USD: monthSummary.totalUsd,
        日查询Credits: daySummary.totalCredits,
      }], { columns: ['近30天Credits', '近30天USD', '本月Credits', '本月USD', '日查询Credits'] }))}
    `;
  }

  function archiveViewHtml(model = latestPanelViewModel) {
    const view = model?.views?.archive;
    if (view) return sectionsViewHtml(view);
    return `
      ${syncBannerHtml(model?.syncBanner)}
      ${sectionHtml(t('sectionArchiveOverview'), archiveSummaryHtml(model?.archive))}
      <div class="cqc-transfer-note">${escapeHtml(t('transferNote'))}</div>
      ${archiveTransferActionsHtml()}
    `;
  }

  function activeViewHtml(viewModel) {
    const tabs = Array.isArray(viewModel?.tabs) ? viewModel.tabs : [];
    if (tabs.length && !tabs.some((tab) => tab.id === activePanelView)) {
      activePanelView = tabs[0].id;
    }

    const view = viewModel?.views?.[activePanelView] || viewModel?.views?.overview;
    if (view?.kind === 'archiveWorkspace') {
      return archiveViewHtml(viewModel);
    }
    if (view?.kind === 'sections') {
      return sectionsViewHtml(view);
    }
    return historyViewHtml(viewModel);
  }

  function renderResult(result) {
    if (!contentNode) return;
    if (!coreLib?.createQuotaPanelViewModel) {
      throw new Error('CodexQuotaCompassCoreLib panel view model is unavailable.');
    }

    const viewModel = coreLib.createQuotaPanelViewModel({
      result,
      historyUsage: latestHistoryUsage,
      archiveSummary: latestArchiveSummary,
      importReport: latestImportReport,
      storageBackend: archiveStoragePort.getBackendInfo(),
      syncStatus: syncPort?.getSyncStatus ? syncPort.getSyncStatus() : null,
    });
    latestPanelViewModel = viewModel;
    const viewBody = activeViewHtml(viewModel);

    contentNode.innerHTML = `
      <div class="cqc-metrics">
        ${viewModel.primaryMetrics.map(primaryMetricHtml).join('')}
      </div>
      ${panelTabsHtml(viewModel)}
      <div class="cqc-details">
        ${viewBody}
      </div>
    `;
    schedulePanelResize();
  }

  function renderLoading() {
    if (!contentNode) return;
    contentNode.innerHTML = `
      <div class="cqc-loading">
        <div class="cqc-spinner"></div>
        <div>
          <strong>${escapeHtml(t('loadingTitle'))}</strong>
          <span>${escapeHtml(t('loadingHint'))}</span>
        </div>
      </div>
    `;
    schedulePanelResize();
  }

  function renderError(error) {
    if (!contentNode) return;
    latestError = error;
    contentNode.innerHTML = `
      <div class="cqc-error">
        <strong>${escapeHtml(t('errorTitle'))}</strong>
        <p>${escapeHtml(error?.message || error || t('errorUnknown'))}</p>
        <button type="button" class="cqc-refresh" data-action="refresh">${escapeHtml(t('actionRetry'))}</button>
      </div>
    `;
    schedulePanelResize();
  }

  async function runAndRender() {
    setStatus(t('statusLoading'), 'loading');
    renderLoading();
    if (isPanelCurrentlyOpen()) {
      positionPanelNearButton();
    } else {
      openPanel();
    }

    try {
      const result = await runAndReport({ silentAlert: true });
      const sinceResetSummary = result?.主7天窗口_上次重置至今?.汇总 || {};
      if (syncPort?.queryHistory) {
        latestHistoryUsage = await syncPort.queryHistory({
          startDate: sinceResetSummary?.API_start_date,
          endDate: sinceResetSummary?.API_end_date_排他,
          periodDays: result?.配置?.ROLLING_DAYS,
        });
      }
      renderResult(result);
      setStatus(t('statusUpdated'), 'success');
      return result;
    } catch (error) {
      renderError(error);
      setStatus(t('statusFailed'), 'error');
      throw error;
    }
  }

  function activateCompassButton() {
    if (isPanelCurrentlyOpen()) {
      closePanel();
    } else if (latestResult && !latestError) {
      renderResult(latestResult);
      setStatus(t('statusCached'), 'success');
      openPanel();
    } else {
      runAndRender().catch(() => {});
    }
  }

  function installStyles() {
    if (document.getElementById(`${ROOT_ID}-style`)) return;

    const style = document.createElement('style');
    style.id = `${ROOT_ID}-style`;
    style.textContent = `
      .cqc-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 14px 0;
      }

      .cqc-tab {
        border: 1px solid rgba(16, 163, 127, 0.22);
        background: #ffffff;
        color: #334155;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .cqc-tab.is-active {
        background: rgba(16, 163, 127, 0.12);
        border-color: rgba(16, 163, 127, 0.58);
        color: #0f766e;
      }

      .cqc-transfer-note {
        margin-top: 8px;
        color: #64748b;
        font-size: 12px;
      }

      .cqc-sync-banner {
        display: grid;
        gap: 4px;
        margin: 0 0 12px;
        padding: 10px 12px;
        border: 1px solid rgba(100, 116, 139, 0.22);
        border-radius: 10px;
        background: #f8fafc;
        color: #334155;
        font-size: 12px;
        line-height: 1.45;
      }

      .cqc-sync-banner strong {
        color: #202123;
        font-size: 13px;
      }

      .cqc-sync-banner[data-tone="success"] {
        border-color: rgba(16, 163, 127, 0.28);
        background: rgba(16, 163, 127, 0.08);
        color: #0f766e;
      }

      .cqc-sync-banner[data-tone="warning"] {
        border-color: rgba(245, 158, 11, 0.3);
        background: rgba(245, 158, 11, 0.1);
        color: #92400e;
      }

      .cqc-sync-banner[data-tone="success"] strong {
        color: #0f766e;
      }

      .cqc-sync-banner[data-tone="warning"] strong {
        color: #92400e;
      }

      .cqc-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin: 0 0 12px;
      }

      .cqc-metric,
      .cqc-section {
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 10px;
        background: #ffffff;
      }

      .cqc-metric {
        min-width: 0;
        padding: 12px;
      }

      .cqc-metric-label,
      .cqc-metric-hint {
        color: #6e6e80;
        font-size: 12px;
        line-height: 1.3;
      }

      .cqc-metric-value {
        margin: 6px 0 4px;
        font-size: 20px;
        font-weight: 700;
        line-height: 1.15;
        overflow-wrap: anywhere;
      }

      .cqc-detail-footnote {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
        justify-content: center;
        margin: 10px 0 2px;
      }

      .cqc-detail-footnote button {
        border: 0;
        background: transparent;
        color: var(--cqc-primary);
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        padding: 6px 8px;
      }

      .cqc-detail-footnote button:hover {
        text-decoration: underline;
      }

      .cqc-section {
        margin-top: 12px;
        overflow: hidden;
      }

      .cqc-section h3 {
        margin: 0;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        background: #f7f7f8;
        font-size: 14px;
        line-height: 1.3;
      }

      .cqc-table-wrap {
        overflow: auto;
      }

      .cqc-table-wrap table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .cqc-table-wrap th,
      .cqc-table-wrap td {
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        padding: 9px 10px;
        text-align: left;
        vertical-align: top;
        white-space: nowrap;
      }

      .cqc-table-wrap td.is-wrappable {
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .cqc-table-wrap td.is-truncated {
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .cqc-table-wrap td.is-debug,
      .cqc-table-wrap th.is-debug {
        color: #6e6e80;
      }

      .cqc-compact-list {
        display: none;
      }

      .cqc-compact-row {
        display: grid;
        gap: 8px;
        margin: 0;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      }

      .cqc-compact-row:last-child {
        border-bottom: 0;
      }

      .cqc-compact-field {
        display: grid;
        grid-template-columns: minmax(92px, 38%) minmax(0, 1fr);
        gap: 8px;
        align-items: start;
      }

      .cqc-compact-field dt,
      .cqc-compact-field dd {
        margin: 0;
        min-width: 0;
        font-size: 12px;
        line-height: 1.35;
      }

      .cqc-compact-field dt {
        color: #6e6e80;
        font-weight: 650;
      }

      .cqc-compact-value {
        color: #202123;
        overflow-wrap: anywhere;
      }

      .cqc-compact-value.is-truncated {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .cqc-table-wrap tbody tr:hover {
        background: rgba(30, 64, 175, 0.05);
      }

      .cqc-table-wrap th {
        color: #6e6e80;
        background: #ffffff;
        font-weight: 650;
        position: sticky;
        top: 0;
      }

      .cqc-table-note,
      .cqc-empty {
        color: #6e6e80;
        font-size: 12px;
        padding: 10px 12px;
      }

      .cqc-loading,
      .cqc-error {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding: 18px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 10px;
        background: #f7f7f8;
      }

      .cqc-loading span,
      .cqc-error p {
        display: block;
        margin: 4px 0 0;
        color: #6e6e80;
        font-size: 13px;
        line-height: 1.45;
        white-space: pre-wrap;
      }

      .cqc-error {
        display: block;
        border-color: rgba(217, 45, 32, 0.24);
      }

      .cqc-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(16, 163, 127, 0.2);
        border-top-color: #10a37f;
        border-radius: 50%;
        animation: cqc-spin 0.8s linear infinite;
        flex: 0 0 auto;
      }

      @keyframes cqc-spin {
        to { transform: rotate(360deg); }
      }

      @media (prefers-reduced-motion: reduce) {
        .cqc-spinner {
          transition: none !important;
          animation: none !important;
        }
      }

      @media (max-width: 720px) {
        .cqc-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .cqc-data-view[data-compact="true"] .cqc-data-table {
          display: none;
        }

        .cqc-data-view[data-compact="true"] .cqc-compact-list {
          display: block;
        }

      }

      @media (prefers-color-scheme: dark) {
        .cqc-metric,
        .cqc-section,
        .cqc-table-wrap th {
          background: #2f2f2f;
          color: #ececf1;
          border-color: rgba(255, 255, 255, 0.14);
        }

        .cqc-section h3,
        .cqc-loading,
        .cqc-error {
          background: #212121;
          border-color: rgba(255, 255, 255, 0.12);
        }

        .cqc-metric-label,
        .cqc-metric-hint,
        .cqc-table-note,
        .cqc-empty,
        .cqc-sync-banner,
        .cqc-loading span,
        .cqc-error p {
          color: #b4b4b4;
        }

        .cqc-sync-banner {
          background: #212121;
          border-color: rgba(255, 255, 255, 0.12);
        }

        .cqc-sync-banner strong {
          color: #ececf1;
        }

        .cqc-table-wrap th,
        .cqc-table-wrap td,
        .cqc-compact-row,
        .cqc-section h3 {
          border-bottom-color: rgba(255, 255, 255, 0.1);
        }

        .cqc-compact-value {
          color: #ececf1;
        }

        .cqc-detail-footnote button {
          color: #19c37d;
        }
      }
    `;
    document.head.append(style);
  }

  function handleShellAction(action, event) {
    if (action === 'toggle') {
      activateCompassButton();
      return;
    }

    if (action === 'close') {
      closePanel();
      return;
    }

    if (action === 'refresh') {
      runAndRender().catch(() => {});
      return;
    }

    if (action === 'switch-view' && latestResult) {
      const nextView = event.target?.closest?.('[data-view]')?.dataset?.view;
      if (nextView) {
        activePanelView = nextView;
        renderResult(latestResult);
      }
      return;
    }

    if (action === 'export-archive') {
      exportSnapshotArchive().catch((error) => {
        console.error(`[${SCRIPT_NAME}] Export Snapshot Archive failed.`, error);
        alert(`${SCRIPT_NAME} ${t('exportFailed', { error: error?.message || error })}`);
      });
      return;
    }

    if (action === 'import-archive') {
      importSnapshotArchive().catch((error) => {
        console.error(`[${SCRIPT_NAME}] Import Snapshot Archive failed.`, error);
        alert(`${SCRIPT_NAME} ${t('importFailed', { error: error?.message || error })}`);
      });
      return;
    }

  }

  function createUi() {
    if (!panelShellLib?.createFloatingPanelShell) {
      throw new Error('CodexQuotaCompassPanelShellLib shell is unavailable.');
    }

    installStyles();

    floatingPanelShell = panelShellLib.createFloatingPanelShell({
      rootId: ROOT_ID,
      labels: {
        panelTitle: t('panelTitle'),
        buttonTitle: t('buttonTitle'),
        buttonAriaOpen: t('buttonAriaOpen'),
        statusIdle: t('statusIdle'),
        actionRefresh: t('actionRefresh'),
        closeAria: 'Close',
      },
      positionKey: BUTTON_POSITION_KEY,
      onAction: handleShellAction,
      document,
      window,
      storage: localStorage,
    });
    const mountedShell = floatingPanelShell.mount();
    if (!mountedShell) return;

    const refs = mountedShell.refs();
    statusNode = refs.statusNode;
    contentNode = refs.contentNode;
  }

  async function runCompass() {
    if (window[RUNNING_KEY]) {
      console.warn(`[${SCRIPT_NAME}] Already running.`);
      throw new Error(t('alreadyRunning'));
    }

    window[RUNNING_KEY] = true;

    try {
      if (!runtimeLib?.createQuotaRuntime || !runtimeLib?.createDefaultQuotaRuntimeConfig) {
        throw new Error('CodexQuotaCompassRuntimeLib runtime is unavailable.');
      }

      return runtimeLib.createQuotaRuntime({
        config: runtimeLib.createDefaultQuotaRuntimeConfig({
          DEBUG: isDebugEnabled(),
        }),
        coreLib,
        fetchImpl: fetch.bind(globalThis),
        location: globalThis.location,
        now: () => Date.now(),
        formatLocalTime: (ms) => new Date(ms).toLocaleString(),
        getBrowserTimeZone: () => (
          Intl.DateTimeFormat().resolvedOptions().timeZone || '未知'
        ),
      }).run();
    } finally {
      window[RUNNING_KEY] = false;
    }
  }

  async function runAndReport(options = {}) {
    try {
      pendingRunPromise = pendingRunPromise || runCompass();
      const result = await pendingRunPromise;
      latestResult = result;
      latestError = null;
      latestImportReport = null;

      if (syncPort) {
        try {
          const saved = await syncPort.saveLatestResult(result);
          latestArchiveSummary = saved.summary;
        } catch (archiveError) {
          console.error(`[${SCRIPT_NAME}] Snapshot Archive save failed.`, archiveError);
          if (!options.silentAlert) {
            alert(`${SCRIPT_NAME} ${t('saveArchiveFailed', { error: archiveError?.message || archiveError })}`);
          }
        }
      }

      if (isDebugEnabled()) {
        window[LAST_RESULT_KEY] = result;
        console.log(
          `[${SCRIPT_NAME}] Finished. Latest result is available at window.${LAST_RESULT_KEY}.`,
          result,
        );
      } else {
        console.info(`[${SCRIPT_NAME}] Finished.`);
      }

      return result;
    } catch (error) {
      console.error(`[${SCRIPT_NAME}] Failed.`, error);
      latestError = error;
      if (!options.silentAlert) {
        alert(`${SCRIPT_NAME} failed: ${error?.message || error}`);
      }
      throw error;
    } finally {
      pendingRunPromise = null;
    }
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function exportSnapshotArchive() {
    if (!syncPort) {
      throw new Error(t('syncPortUnavailable'));
    }

    const exportDocument = await syncPort.exportArchive();
    downloadTextFile(
      'codex-quota-compass-snapshot-archive.v1.json',
      JSON.stringify(exportDocument, null, 2),
    );
    latestArchiveSummary = await syncPort.summarize();
    if (latestResult && !latestError) {
      renderResult(latestResult);
    }
    alert(`${SCRIPT_NAME} ${t('exportDone', { count: exportDocument.snapshotCount })}`);
  }

  function chooseImportFileText() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) {
          input.remove();
          reject(new Error(t('importNoFile')));
          return;
        }

        const reader = new FileReader();
        reader.onerror = () => {
          input.remove();
          reject(new Error(t('importReadFailed')));
        };
        reader.onload = () => {
          input.remove();
          resolve(String(reader.result || ''));
        };
        reader.readAsText(file, 'utf-8');
      }, { once: true });

      input.click();
    });
  }

  async function importSnapshotArchive() {
    if (!syncPort) {
      throw new Error(t('syncPortUnavailable'));
    }

    const fileText = await chooseImportFileText();
    const importDocument = JSON.parse(fileText);
    const imported = await syncPort.importArchiveDocument(importDocument);
    latestArchiveSummary = imported.summary;
    latestImportReport = imported.report;
    if (latestResult && !latestError) {
      renderResult(latestResult);
    }
    alert(`${SCRIPT_NAME} ${t('importDone', {
      added: imported.report.added,
      skipped: imported.report.skipped,
      invalid: imported.report.invalid,
    })}`);
  }

  createUi();
  refreshArchiveSummary().catch((error) => {
    console.warn(`${SCRIPT_NAME}: failed to load archive summary.`, error);
  });

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(t('menuRun'), () => {
      runAndRender().catch(() => {});
    });
    GM_registerMenuCommand(t('menuExport'), () => {
      exportSnapshotArchive().catch((error) => {
        console.error(`[${SCRIPT_NAME}] Export Snapshot Archive failed.`, error);
        alert(`${SCRIPT_NAME} ${t('exportFailed', { error: error?.message || error })}`);
      });
    });
    GM_registerMenuCommand(t('menuImport'), () => {
      importSnapshotArchive().catch((error) => {
        console.error(`[${SCRIPT_NAME}] Import Snapshot Archive failed.`, error);
        alert(`${SCRIPT_NAME} ${t('importFailed', { error: error?.message || error })}`);
      });
    });
  }

  if (isUsagePage()) {
    console.info(`[${SCRIPT_NAME}] Ready. Click the floating button to calculate usage.`);
  } else {
    console.info(
      `[${SCRIPT_NAME}] Open https://chatgpt.com/codex/cloud/settings/analytics#usage or use the floating button / Tampermonkey menu to run.`,
    );
  }
})();
