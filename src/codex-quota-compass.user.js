// ==UserScript==
// @name         Codex Quota Compass
// @name:zh-CN   Codex 配额统计
// @name:en      Codex Quota Compass
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.2.1
// @description  Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @description:zh-CN  在 chatgpt.com 展示 Codex 配额窗口、每日用量、客户端汇总和周额度估算。
// @description:en     Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @author       BlueSkyXN, dzshzx
// @match        https://chatgpt.com/*
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/codex-quota-compass-core.lib.js
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
  const SCRIPT_VERSION = '0.2.1';
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
      tabArchiveWorkspace: '归档同步',
      sectionOverviewSummary: '概览摘要',
      sectionArchiveOverview: '归档概况',
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
      metricHintMainSevenDayWindow: '主 7 天窗口',
      transferNote: '导入和导出可用于跨设备同步快照归档。',
      syncBannerGmTitle: '跨设备同步路径可用',
      syncBannerGmDetail: '正在使用 {backend}。如果用户脚本管理器同步已开启，个人用量历史可随脚本存储同步。',
      syncBannerLocalTitle: '当前设备本地归档',
      syncBannerLocalDetail: '正在使用 {backend} fallback；个人用量历史不会自动同步到其它设备。',
      syncBannerPendingTitle: '归档状态待加载',
      syncBannerPendingDetail: '打开或刷新统计后会读取 Snapshot Archive 状态。',
      loadingTitle: '正在计算 Codex 用量',
      loadingHint: '会请求 usage 和 daily analytics 接口，结果不会包含 token 或 cookie。',
      errorTitle: '计算失败',
      errorUnknown: '未知错误',
      archiveEmpty: '归档尚未加载。',
      archiveNoSnapshot: '还没有已记录的快照。',
      archiveLatestImport: '最近一次导入：新增 {added} 条，跳过 {skipped} 条，无效 {invalid} 条。',
      archiveExportAction: '导出归档',
      archiveImportAction: '导入归档',
      archiveSnapshotCount: '快照数',
      archiveEarliestCapturedAt: '最早采集',
      archiveLatestCapturedAt: '最近采集',
      archiveCapturedAt: '采集时间',
      archiveSnapshotId: '快照ID',
      archiveMonthlyCredits: '本月Credits',
      archiveWeeklyUsedPercent: '7天已用百分比',
      archiveStorageBackend: '存储后端',
      tableNoData: '暂无数据',
      tablePreviewHint: '仅显示前 {visible} 条，共 {total} 条。需要完整调试输出时，先设置 window.{debugKey} = true 后刷新。',
      resetCountdown: '距离重置',
      mainWindowFallback: '主 7 天窗口',
      menuRun: '运行 Codex Quota Compass',
      menuExport: '导出快照归档',
      menuImport: '导入快照归档',
      exportDone: '导出完成：{count} 条快照。',
      importDone: '导入完成：新增 {added} 条，跳过 {skipped} 条，无效 {invalid} 条。',
      syncPortUnavailable: 'Snapshot 同步端口不可用。',
      exportFailed: '导出失败：{error}',
      importFailed: '导入失败：{error}',
      saveArchiveFailed: '已完成计算，但写入 Snapshot Archive 失败：{error}',
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
      tabArchiveWorkspace: 'Archive Sync',
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
      metricHintMainSevenDayWindow: 'Primary 7-day window',
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
      mainWindowFallback: 'Primary 7-day window',
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
  const DEFAULT_BUTTON_POSITION = { top: 76, right: 24 };
  const BUTTON_FULL_WIDTH = 168;
  const BUTTON_HEIGHT = 42;
  const BUTTON_SAFE = 12;
  const BUTTON_DOCK_OFFSET = 8;
  const BUTTON_DOCK_THRESHOLD = 32;
  const PANEL_OPEN_ANIMATION_MS = 220;
  const PANEL_CLOSE_ANIMATION_MS = PANEL_OPEN_ANIMATION_MS * 2;
  const PANEL_OPEN_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const PANEL_CLOSE_EASING = 'cubic-bezier(0.64, 0, 0.78, 0)';
  const STORAGE_BACKENDS = {
    pending: { id: 'pending', label: 'pending' },
    gm: { id: 'gm', label: 'GM storage' },
    localStorage: { id: 'localStorage', label: 'localStorage' },
  };

  let root;
  let panel;
  let button;
  let statusNode;
  let contentNode;
  let isPanelOpen = false;
  let activePanelView = 'overview';
  let latestError;
  let latestResult = null;
  let latestHistoryUsage = null;
  let latestPanelViewModel = null;
  let latestArchiveSummary = null;
  let latestImportReport = null;
  let pendingRunPromise = null;
  let suppressNextButtonClick = false;
  let buttonDockSide = null;
  let panelCloseTimer = null;
  let floatingPanelShell = null;
  const coreLib = globalThis.CodexQuotaCompassCoreLib;
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
    const archiveActions = detailActionsHtml([
      { action: 'export-archive', label: t('archiveExportAction') },
      { action: 'import-archive', label: t('archiveImportAction') },
    ]);

    if (!model.isLoaded) {
      return `<div class="cqc-empty">${escapeHtml(t('archiveEmpty'))}</div>${archiveActions}`;
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

    return `${overview}${importReport}${recent}${archiveActions}`;
  }

  function loadButtonPosition() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BUTTON_POSITION_KEY) || 'null');
      if (
        parsed &&
        Number.isFinite(parsed.left) &&
        Number.isFinite(parsed.top)
      ) {
        const dockSide = isDockSide(parsed.dockSide)
          ? parsed.dockSide
          : detectDockSide(parsed.left);

        return {
          left: parsed.left,
          top: parsed.top,
          dockSide,
        };
      }
    } catch {
      // Ignore invalid persisted UI state.
    }

    return null;
  }

  function isDockSide(value) {
    return value === 'left' || value === 'right';
  }

  function persistButtonPosition(left, top, dockSide = buttonDockSide) {
    const value = {
      left: Math.round(left),
      top: Math.round(top),
    };

    if (isDockSide(dockSide)) {
      value.dockSide = dockSide;
    }

    localStorage.setItem(BUTTON_POSITION_KEY, JSON.stringify(value));
  }

  function setButtonDockSide(dockSide) {
    buttonDockSide = isDockSide(dockSide) ? dockSide : null;

    if (!button) return;

    button.classList.toggle('is-docked', Boolean(buttonDockSide));

    if (!buttonDockSide) {
      button.classList.remove('is-hover-locked');
    }

    if (buttonDockSide) {
      button.dataset.dockSide = buttonDockSide;
    } else {
      delete button.dataset.dockSide;
    }
  }

  function clampButtonPosition(left, top, options = {}) {
    const width = options.width || BUTTON_FULL_WIDTH;
    const height = options.height || BUTTON_HEIGHT;
    const safe = options.safe ?? BUTTON_SAFE;
    const maxLeft = Math.max(safe, window.innerWidth - width - safe);
    const maxTop = Math.max(safe, window.innerHeight - height - safe);

    return {
      left: Math.min(Math.max(safe, left), maxLeft),
      top: Math.min(Math.max(safe, top), maxTop),
    };
  }

  function dockedButtonPosition(dockSide, top) {
    const clamped = clampButtonPosition(0, top);

    return {
      left:
        dockSide === 'right'
          ? window.innerWidth - BUTTON_DOCK_OFFSET - BUTTON_FULL_WIDTH
          : BUTTON_DOCK_OFFSET,
      top: clamped.top,
    };
  }

  function detectDockSide(left) {
    if (left <= BUTTON_DOCK_THRESHOLD) return 'left';
    if (window.innerWidth - (left + BUTTON_FULL_WIDTH) <= BUTTON_DOCK_THRESHOLD) return 'right';
    return null;
  }

  function getExpandedButtonRect() {
    const rect = button?.getBoundingClientRect();
    const top = rect?.top ?? DEFAULT_BUTTON_POSITION.top;

    if (buttonDockSide === 'left') {
      return {
        left: BUTTON_DOCK_OFFSET,
        right: BUTTON_DOCK_OFFSET + BUTTON_FULL_WIDTH,
        top,
        bottom: top + BUTTON_HEIGHT,
        width: BUTTON_FULL_WIDTH,
        height: BUTTON_HEIGHT,
      };
    }

    if (buttonDockSide === 'right') {
      const right = window.innerWidth - BUTTON_DOCK_OFFSET;
      return {
        left: right - BUTTON_FULL_WIDTH,
        right,
        top,
        bottom: top + BUTTON_HEIGHT,
        width: BUTTON_FULL_WIDTH,
        height: BUTTON_HEIGHT,
      };
    }

    return rect;
  }

  function applyButtonPosition(position) {
    if (!button) return;

    if (position) {
      const dockSide = isDockSide(position.dockSide) ? position.dockSide : null;
      const clamped = dockSide
        ? dockedButtonPosition(dockSide, position.top)
        : clampButtonPosition(position.left, position.top);

      setButtonDockSide(dockSide);
      button.style.top = `${clamped.top}px`;

      if (dockSide === 'right') {
        button.style.left = 'auto';
        button.style.right = `${BUTTON_DOCK_OFFSET}px`;
      } else {
        button.style.left = `${clamped.left}px`;
        button.style.right = 'auto';
      }

      return;
    }

    setButtonDockSide(null);
    button.style.top = `${DEFAULT_BUTTON_POSITION.top}px`;
    button.style.right = `${DEFAULT_BUTTON_POSITION.right}px`;
    button.style.left = 'auto';
  }

  function setStatus(text, tone = 'idle') {
    if (!statusNode) return;
    statusNode.textContent = text;
    statusNode.dataset.tone = tone;
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

  function creditsMetricHint(value) {
    return `${formatMetricDecimal(value)} Credits`;
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

  function creditMetricHtml(label, usd, credits) {
    return metricHtml(label, usdMetricValue(usd), creditsMetricHint(credits));
  }

  function resetMetricHtml(windowRow) {
    return metricHtml(
      t('resetCountdown'),
      formatHoursDuration(windowRow?.距离重置小时),
      windowRow?.下次重置_本地 || t('mainWindowFallback'),
    );
  }

  function primaryMetricHtml(metric) {
    const label = metric?.labelKey ? t(metric.labelKey) : (metric?.label || '-');
    const hint = metric?.hintKey ? t(metric.hintKey) : metric?.hint;
    if (metric?.type === 'credit') {
      return creditMetricHtml(label, metric.usd, metric.credits);
    }
    if (metric?.type === 'reset') {
      return resetMetricHtml(metric.windowRow);
    }
    return metricHtml(label, metric?.value, hint);
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

  function openPanel() {
    if (!panel || !button) return;

    window.clearTimeout(panelCloseTimer);

    const sourceRect = getExpandedButtonRect();
    if (!sourceRect) return;

    isPanelOpen = true;
    button?.classList.add('is-active');
    panel.hidden = false;
    panel.classList.remove('is-open', 'is-closing');
    applyPanelRect(sourceRect, 999);
    button?.classList.add('is-panel-source-hidden');

    const targetRect = getPanelTargetRect(sourceRect);
    panel.style.transformOrigin = `${Math.round(targetRect.originX)}px ${Math.round(targetRect.originY)}px`;
    panel.dataset.placement = targetRect.placement;

    requestAnimationFrame(() => {
      if (!isPanelOpen) return;
      applyPanelRect(targetRect, 12);
      panel?.classList.add('is-open');
    });
  }

  function closePanel() {
    if (!panel) return;
    window.clearTimeout(panelCloseTimer);

    isPanelOpen = false;
    const sourceRect = getExpandedButtonRect();
    panel.classList.remove('is-open');
    panel.classList.add('is-closing');

    if (sourceRect) {
      applyPanelRect(sourceRect, 999);
      const panelRect = panel.getBoundingClientRect();
      const originX = sourceRect.left + sourceRect.width / 2 - panelRect.left;
      const originY = sourceRect.top + sourceRect.height / 2 - panelRect.top;
      panel.style.transformOrigin = `${Math.round(originX)}px ${Math.round(originY)}px`;
    }

    panelCloseTimer = window.setTimeout(() => {
      if (!isPanelOpen && panel) {
        panel.hidden = true;
        panel.classList.remove('is-closing');
        button?.classList.remove('is-active', 'is-panel-source-hidden');
        lockDockedButtonHover();
      }
    }, PANEL_CLOSE_ANIMATION_MS);
  }

  function lockDockedButtonHover() {
    if (!button || !buttonDockSide) return;
    button.blur();
    button.classList.toggle('is-hover-locked', button.matches(':hover'));
  }

  function unlockDockedButtonHover() {
    button?.classList.remove('is-hover-locked');
  }

  function getPanelTargetRect(sourceRect) {
    const safe = 12;
    const panelWidth = Math.min(560, window.innerWidth - safe * 2);
    const maxPanelHeight = Math.min(760, window.innerHeight - safe * 2);
    const panelHeight = getPreferredPanelHeight(
      maxPanelHeight,
      sourceRect.height,
      panelWidth,
    );

    const left = Math.min(
      Math.max(safe, sourceRect.right - panelWidth),
      window.innerWidth - panelWidth - safe,
    );
    const top = Math.min(
      Math.max(safe, sourceRect.top),
      window.innerHeight - panelHeight - safe,
    );
    const originX = Math.min(
      Math.max(sourceRect.left + sourceRect.width / 2 - left, 24),
      panelWidth - 24,
    );
    const originY = Math.min(
      Math.max(sourceRect.top + sourceRect.height / 2 - top, 24),
      panelHeight - 24,
    );

    return {
      left,
      top,
      width: panelWidth,
      height: panelHeight,
      originX,
      originY,
      placement:
        sourceRect.top + sourceRect.height / 2 < top + panelHeight / 2
          ? 'below'
          : 'above',
    };
  }

  function getPreferredPanelHeight(
    maxPanelHeight,
    fallbackHeight = BUTTON_HEIGHT,
    measureWidth,
  ) {
    const naturalHeight = measurePanelNaturalHeight(measureWidth);
    return Math.min(
      maxPanelHeight,
      Math.max(fallbackHeight, naturalHeight),
    );
  }

  function measurePanelNaturalHeight(measureWidth) {
    if (!panel || !Number.isFinite(measureWidth)) return BUTTON_HEIGHT;

    const clone = panel.cloneNode(true);
    clone.hidden = false;
    clone.classList.add('is-open');
    clone.classList.remove('is-closing');
    clone.style.cssText = [
      'position: fixed',
      'left: -9999px',
      'top: 0',
      `width: ${Math.round(measureWidth)}px`,
      'height: auto',
      'max-height: none',
      'min-height: 0',
      'visibility: hidden',
      'pointer-events: none',
      'opacity: 0',
      'transition: none',
      'transform: none',
    ].join(';');

    const cloneHeader = clone.querySelector('.cqc-panel-header');
    if (cloneHeader) {
      cloneHeader.style.opacity = '1';
      cloneHeader.style.transition = 'none';
    }

    const cloneContent = clone.querySelector('.cqc-content');
    if (cloneContent) {
      cloneContent.style.height = 'auto';
      cloneContent.style.maxHeight = 'none';
      cloneContent.style.overflow = 'visible';
      cloneContent.style.opacity = '1';
      cloneContent.style.transition = 'none';
    }

    (root || document.documentElement).append(clone);
    const measuredHeight = Math.ceil(clone.getBoundingClientRect().height);
    clone.remove();

    return measuredHeight || BUTTON_HEIGHT;
  }

  function applyPanelRect(rect, borderRadius) {
    if (!panel || !rect) return;

    panel.style.left = `${Math.round(rect.left)}px`;
    panel.style.top = `${Math.round(rect.top)}px`;
    panel.style.right = 'auto';
    panel.style.width = `${Math.round(rect.width)}px`;
    panel.style.height = `${Math.round(rect.height)}px`;
    panel.style.borderRadius = `${borderRadius}px`;
  }

  function positionPanelNearButton() {
    if (!panel || !button) return;

    const sourceRect = getExpandedButtonRect();
    if (!sourceRect) return;

    const targetRect = getPanelTargetRect(sourceRect);
    applyPanelRect(targetRect, 12);
    panel.style.transformOrigin = `${Math.round(targetRect.originX)}px ${Math.round(targetRect.originY)}px`;
    panel.dataset.placement = targetRect.placement;
  }

  function schedulePanelResize() {
    if (!isPanelOpen) return;
    requestAnimationFrame(() => {
      if (isPanelOpen) positionPanelNearButton();
    });
  }

  async function runAndRender() {
    setStatus(t('statusLoading'), 'loading');
    renderLoading();
    if (isPanelOpen) {
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
    if (isPanelOpen) {
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
      #${ROOT_ID} {
        color-scheme: light dark;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        --cqc-primary: #10a37f;
        --cqc-primary-soft: #34d399;
        --cqc-accent: #f59e0b;
        --cqc-surface: #ffffff;
        --cqc-surface-muted: #f8fafc;
        --cqc-text: #202123;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
      }

      #${ROOT_ID} * {
        box-sizing: border-box;
      }

      .cqc-button {
        position: fixed;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 8px;
        width: ${BUTTON_FULL_WIDTH}px;
        min-width: ${BUTTON_HEIGHT}px;
        height: 42px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 999px;
        padding: 0 14px;
        background: rgba(248, 250, 252, 0.95);
        color: var(--cqc-text);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
        cursor: grab;
        pointer-events: auto;
        user-select: none;
        backdrop-filter: blur(18px);
        overflow: hidden;
        transition:
          width 160ms ease,
          padding 160ms ease,
          opacity 160ms ease,
          background-color 160ms ease,
          border-color 160ms ease,
          box-shadow 160ms ease;
      }

      .cqc-button:active {
        cursor: grabbing;
      }

      .cqc-button.is-active {
        border-color: rgba(30, 64, 175, 0.45);
        box-shadow: 0 10px 32px rgba(30, 64, 175, 0.22);
      }

      .cqc-button:focus-visible,
      .cqc-refresh:focus-visible,
      .cqc-icon-button:focus-visible,
      .cqc-detail-footnote button:focus-visible {
        outline: 2px solid var(--cqc-primary-soft);
        outline-offset: 2px;
      }

      .cqc-button.is-docked {
        width: ${BUTTON_HEIGHT}px;
        gap: 0;
        padding: 0;
        justify-content: center;
        background: rgba(255, 255, 255, 0.62);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
        opacity: 0.72;
      }

      .cqc-button.is-docked:hover,
      .cqc-button.is-docked:focus-visible,
      .cqc-button.is-docked.is-active,
      .cqc-button.is-docked.is-dragging {
        width: ${BUTTON_FULL_WIDTH}px;
        gap: 8px;
        padding: 0 14px;
        justify-content: flex-start;
        background: rgba(255, 255, 255, 0.94);
        opacity: 1;
      }

      .cqc-button.is-panel-source-hidden,
      .cqc-button.is-docked.is-panel-source-hidden {
        opacity: 0;
        pointer-events: none;
      }

      .cqc-button.is-docked.is-hover-locked {
        width: ${BUTTON_HEIGHT}px;
        gap: 0;
        padding: 0;
        justify-content: center;
        background: rgba(255, 255, 255, 0.62);
        opacity: 0.72;
      }

      .cqc-button.is-docked.is-hover-locked .cqc-button-text {
        max-width: 0;
        opacity: 0;
        transform: translateX(-4px);
      }

      .cqc-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--cqc-primary);
        box-shadow: 0 0 0 4px rgba(30, 64, 175, 0.14);
        flex: 0 0 auto;
      }

      .cqc-button-text {
        display: grid;
        gap: 1px;
        text-align: left;
        line-height: 1.1;
        max-width: 116px;
        overflow: hidden;
        transition:
          max-width 160ms ease,
          opacity 140ms ease,
          transform 160ms ease;
      }

      .cqc-button.is-docked .cqc-button-text {
        max-width: 0;
        opacity: 0;
        transform: translateX(-4px);
      }

      .cqc-button.is-docked:hover .cqc-button-text,
      .cqc-button.is-docked:focus-visible .cqc-button-text,
      .cqc-button.is-docked.is-active .cqc-button-text,
      .cqc-button.is-docked.is-dragging .cqc-button-text {
        max-width: 116px;
        opacity: 1;
        transform: translateX(0);
      }

      .cqc-button-title {
        font-size: 13px;
        font-weight: 650;
      }

      .cqc-status {
        color: #6e6e80;
        font-size: 11px;
      }

      .cqc-status[data-tone="loading"] { color: #0f7f67; }
      .cqc-status[data-tone="success"] { color: var(--cqc-primary); }

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
      .cqc-status[data-tone="error"] { color: #d92d20; }

      .cqc-panel {
        position: fixed;
        z-index: 2;
        top: 88px;
        right: auto;
        width: min(560px, calc(100vw - 32px));
        height: auto;
        max-height: min(760px, calc(100vh - 24px));
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 12px;
        background: var(--cqc-surface);
        color: var(--cqc-text);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
        overflow: hidden;
        pointer-events: auto;
        opacity: 0;
        transition:
          left ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          top ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          width ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          height ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          border-radius ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          opacity 120ms ease;
      }

      .cqc-panel.is-open {
        opacity: 1;
      }

      .cqc-panel.is-closing {
        transition:
          left ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          top ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          width ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          height ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          border-radius ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          opacity ${PANEL_CLOSE_ANIMATION_MS}ms ease;
      }

      .cqc-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        background: #f7f7f8;
        opacity: 0;
        transition: opacity 120ms ease 80ms;
      }

      .cqc-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        font-size: 14px;
        font-weight: 650;
      }

      .cqc-panel-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .cqc-icon-button,
      .cqc-refresh {
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 8px;
        background: #ffffff;
        color: #202123;
        min-height: 32px;
        padding: 0 10px;
        font-size: 13px;
        cursor: pointer;
      }

      .cqc-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        width: 32px;
        height: 32px;
        min-height: 32px;
        padding: 0;
        font-size: 18px;
        line-height: 1;
      }

      .cqc-close-icon {
        position: relative;
        width: 14px;
        height: 14px;
        display: block;
        flex: 0 0 auto;
      }

      .cqc-close-icon::before,
      .cqc-close-icon::after {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        width: 14px;
        height: 2px;
        border-radius: 999px;
        background: currentColor;
        transform-origin: center;
      }

      .cqc-close-icon::before {
        transform: translate(-50%, -50%) rotate(45deg);
      }

      .cqc-close-icon::after {
        transform: translate(-50%, -50%) rotate(-45deg);
      }

      .cqc-refresh:hover,
      .cqc-icon-button:hover {
        background: #ececf1;
      }

      .cqc-content {
        height: calc(100% - 49px);
        overflow: auto;
        padding: 14px;
        opacity: 0;
        transition: opacity 120ms ease 100ms;
      }

      .cqc-panel.is-open .cqc-panel-header,
      .cqc-panel.is-open .cqc-content {
        opacity: 1;
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
        .cqc-button,
        .cqc-panel,
        .cqc-panel-header,
        .cqc-content,
        .cqc-spinner {
          transition: none !important;
          animation: none !important;
        }
      }

      @media (max-width: 720px) {
        .cqc-panel {
          width: calc(100vw - 24px);
          height: auto;
          max-height: calc(100vh - 24px);
        }

        .cqc-content {
          height: calc(100% - 49px);
        }

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
        .cqc-button,
        .cqc-panel,
        .cqc-metric,
        .cqc-section,
        .cqc-icon-button,
        .cqc-refresh,
        .cqc-table-wrap th {
          background: #2f2f2f;
          color: #ececf1;
          border-color: rgba(255, 255, 255, 0.14);
        }

        .cqc-button.is-docked {
          background: rgba(47, 47, 47, 0.64);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
        }

        .cqc-button.is-docked:hover,
        .cqc-button.is-docked:focus-visible,
        .cqc-button.is-docked.is-active,
        .cqc-button.is-docked.is-dragging {
          background: rgba(47, 47, 47, 0.96);
        }

        .cqc-panel-header,
        .cqc-section h3,
        .cqc-loading,
        .cqc-error {
          background: #212121;
          border-color: rgba(255, 255, 255, 0.12);
        }

        .cqc-status,
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

        .cqc-refresh:hover,
        .cqc-icon-button:hover {
          background: #3f3f3f;
        }

        .cqc-table-wrap th,
        .cqc-table-wrap td,
        .cqc-compact-row,
        .cqc-panel-header,
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

  function installDrag() {
    let dragState = null;

    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      unlockDockedButtonHover();

      const rect = getExpandedButtonRect() || button.getBoundingClientRect();
      button.classList.add('is-dragging');
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        moved: false,
      };
      button.setPointerCapture(event.pointerId);
    });

    button.addEventListener('pointermove', (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragState.moved = true;

      if (dragState.moved && buttonDockSide) {
        setButtonDockSide(null);
      }

      const next = clampButtonPosition(
        dragState.startLeft + dx,
        dragState.startTop + dy,
      );
      applyButtonPosition(next);
      if (isPanelOpen) positionPanelNearButton();
    });

    function finishDrag(event) {
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const moved = dragState.moved;
      dragState = null;
      button.classList.remove('is-dragging');

      if (button.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }

      const rect = button.getBoundingClientRect();

      if (moved) {
        const dockSide = detectDockSide(rect.left);
        const next = dockSide
          ? { ...dockedButtonPosition(dockSide, rect.top), dockSide }
          : clampButtonPosition(rect.left, rect.top);

        applyButtonPosition(next);
        persistButtonPosition(next.left, next.top, dockSide);

        if (isPanelOpen) positionPanelNearButton();
      } else {
        persistButtonPosition(rect.left, rect.top);
      }

      if (moved) {
        suppressNextButtonClick = true;
        window.setTimeout(() => {
          suppressNextButtonClick = false;
        }, 0);
      }
    }

    button.addEventListener('pointerup', finishDrag);
    button.addEventListener('pointercancel', finishDrag);
    button.addEventListener('pointerenter', unlockDockedButtonHover);
    button.addEventListener('pointerleave', unlockDockedButtonHover);
  }

  function eventContainsNode(event, node) {
    if (!node) return false;
    const path = event.composedPath?.();
    return Array.isArray(path) ? path.includes(node) : node.contains(event.target);
  }

  function installOutsideClose() {
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!isPanelOpen) return;
        if (eventContainsNode(event, root)) return;
        closePanel();
      },
      true,
    );
  }

  function floatingPanelMarkupHtml() {
    return `
      <button type="button" class="cqc-button" data-action="toggle" aria-label="${escapeHtml(t('buttonAriaOpen'))}">
        <span class="cqc-dot" aria-hidden="true"></span>
        <span class="cqc-button-text">
          <span class="cqc-button-title">${escapeHtml(t('buttonTitle'))}</span>
          <span class="cqc-status" data-tone="idle">${escapeHtml(t('statusIdle'))}</span>
        </span>
      </button>
      <div class="cqc-panel" hidden>
        <div class="cqc-panel-header">
          <div class="cqc-panel-title">
            <span class="cqc-dot" aria-hidden="true"></span>
            <span>${escapeHtml(t('panelTitle'))}</span>
          </div>
          <div class="cqc-panel-actions">
            <button type="button" class="cqc-refresh" data-action="refresh">${escapeHtml(t('actionRefresh'))}</button>
            <button type="button" class="cqc-icon-button" data-action="close" aria-label="Close">
              <span class="cqc-close-icon" aria-hidden="true"></span>
            </button>
          </div>
        </div>
        <div class="cqc-content"></div>
      </div>
    `;
  }

  function createFloatingPanelShell({
    rootId,
    markupHtml,
    installShellStyles,
    onMount,
    onAction,
    onResize,
  }) {
    function mount() {
      if (document.getElementById(rootId)) return null;

      installShellStyles();

      const shellRoot = document.createElement('div');
      shellRoot.id = rootId;
      shellRoot.innerHTML = markupHtml();

      document.documentElement.append(shellRoot);

      const refs = {
        root: shellRoot,
        button: shellRoot.querySelector('.cqc-button'),
        panel: shellRoot.querySelector('.cqc-panel'),
        statusNode: shellRoot.querySelector('.cqc-status'),
        contentNode: shellRoot.querySelector('.cqc-content'),
      };

      onMount(refs);

      shellRoot.addEventListener('click', (event) => {
        const actionNode = event.target?.closest?.('[data-action]');
        const action = actionNode?.dataset?.action;
        if (action) onAction(action, event, actionNode);
      });

      window.addEventListener('resize', () => {
        onResize(refs);
      });

      return {
        refs,
        setStatus,
        openPanel,
        closePanel,
        scheduleResize: schedulePanelResize,
      };
    }

    return { mount };
  }

  function handleShellAction(action, event) {
    if (action === 'toggle') {
      if (suppressNextButtonClick) {
        suppressNextButtonClick = false;
        return;
      }

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

  function handleShellResize() {
    if (!button) return;
    const rect = getExpandedButtonRect() || button.getBoundingClientRect();
    applyButtonPosition({
      left: rect.left,
      top: rect.top,
      dockSide: buttonDockSide,
    });
    if (isPanelOpen) positionPanelNearButton();
  }

  function createUi() {
    floatingPanelShell = createFloatingPanelShell({
      rootId: ROOT_ID,
      markupHtml: floatingPanelMarkupHtml,
      installShellStyles: installStyles,
      onMount(refs) {
        root = refs.root;
        button = refs.button;
        panel = refs.panel;
        statusNode = refs.statusNode;
        contentNode = refs.contentNode;

        applyButtonPosition(loadButtonPosition());
        installDrag();
        installOutsideClose();
        setStatus(t('statusIdle'), 'idle');
      },
      onAction: handleShellAction,
      onResize: handleShellResize,
    }).mount();
  }

  async function runCompass() {
    if (window[RUNNING_KEY]) {
      console.warn(`[${SCRIPT_NAME}] Already running.`);
      throw new Error(t('alreadyRunning'));
    }

    window[RUNNING_KEY] = true;

    try {
      // ============================================================
      // codex-quota-compass.js（发布版）
      // ============================================================
      // 用法：安装到 Tampermonkey 后，打开
      // https://chatgpt.com/codex/cloud/settings/analytics#usage 自动运行；
      // 或在任意 chatgpt.com 页面通过 Tampermonkey 菜单手动运行。
      //
      // 安全：
      // - 不打印 accessToken / cookie。
      // - 不返回 /usage 原始响应，避免泄露 email / user_id。
      // - MANUAL_ACCESS_TOKEN 默认留空；只有自动取不到 token 时，才在自己电脑临时填写。
      //
      // 说明：
      // - /backend-api/wham/usage 的 reset_at 是 epoch seconds，不受时区影响。
      // - daily-workspace-usage-counts 只接受 YYYY-MM-DD，且 group_by 只支持 day/week/month。
      // - 本脚本默认把用量日期桶按 UTC 解释；同时输出 UTC / 本地时区诊断。

      const CONFIG = {
        DEBUG: isDebugEnabled(),
        DATE_BUCKET_MODE: 'utc', // 推荐：'utc'；可改为 'local' 对比
        USD_PER_CREDIT: 40 / 1000, // 1000 credits = 40 USD
        ROLLING_DAYS: 30,

        // 不建议使用。只有自动取不到 accessToken 时，才在自己电脑临时填写 Bearer 后面的内容。
        // 发布脚本、截图、复制输出前，必须保持为空。
        MANUAL_ACCESS_TOKEN: '',

        USAGE_PATH: '/backend-api/wham/usage',
        DAILY_USAGE_PATH:
          '/backend-api/wham/analytics/daily-workspace-usage-counts',
      };

      if (location.hostname !== 'chatgpt.com') {
        throw new Error('请在 chatgpt.com 页面运行，例如 Codex Usage / Analytics 页面。');
      }

      const stripBearer = (s) =>
        String(s || '')
          .replace(/^Bearer\s+/i, '')
          .trim();

      const looksLikeJwt = (s) =>
        typeof s === 'string' && s.length > 100 && s.split('.').length >= 3;

      // ============================================================
      // Auth：自动从 session 中找 accessToken，不打印敏感信息
      // ============================================================

      function findAccessToken(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 8) return '';

        for (const [key, value] of Object.entries(obj)) {
          if (
            typeof value === 'string' &&
            /access/i.test(key) &&
            looksLikeJwt(value)
          ) {
            return value;
          }

          if (value && typeof value === 'object') {
            const found = findAccessToken(value, depth + 1);
            if (found) return found;
          }
        }

        return '';
      }

      async function getAccessToken() {
        const manual = stripBearer(CONFIG.MANUAL_ACCESS_TOKEN);
        if (manual) return manual;

        try {
          const res = await fetch('/api/auth/session', {
            credentials: 'include',
            headers: { accept: 'application/json' },
          });

          if (!res.ok) return '';

          return findAccessToken(await res.json());
        } catch {
          return '';
        }
      }

      const accessToken = await getAccessToken();

      const headers = {
        accept: 'application/json',
      };

      if (accessToken) {
        headers.authorization = `Bearer ${accessToken}`;
      }

      async function apiGet(path) {
        const res = await fetch(path, {
          method: 'GET',
          credentials: 'include',
          headers,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');

          if (res.status === 401) {
            throw new Error(
              [
                `HTTP 401 Unauthorized: ${path}`,
                '',
                '没有拿到有效 Authorization。',
                '处理方式：',
                '1. 先确认你已经登录 chatgpt.com，并在同一个页面运行脚本。',
                '2. 刷新 Codex Usage / Analytics 页面后重试。',
                '3. 仍失败时，可在 Network 面板找到成功的 /backend-api/wham/usage 请求，',
                '   复制 Authorization: Bearer 后面的 token，只在自己电脑临时填到 CONFIG.MANUAL_ACCESS_TOKEN。',
                '',
                '不要把 token、Cookie、填过 token 的脚本或截图发给任何人。',
              ].join('\n')
            );
          }

          throw new Error(
            `HTTP ${res.status} ${res.statusText}: ${path}\n${text.slice(0, 800)}`
          );
        }

        return res.json();
      }

      if (!coreLib?.createQuotaCalculator) {
        throw new Error('CodexQuotaCompassCoreLib calculator is unavailable.');
      }

      return coreLib.createQuotaCalculator({
        config: CONFIG,
        fetchUsage: () => apiGet(CONFIG.USAGE_PATH),
        fetchDailyUsage: (startDate, endExclusiveDate) => {
          const query = new URLSearchParams({
            start_date: startDate,
            end_date: endExclusiveDate,
            group_by: 'day',
          });
          return apiGet(`${CONFIG.DAILY_USAGE_PATH}?${query}`);
        },
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
