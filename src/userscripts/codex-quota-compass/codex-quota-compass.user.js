// ==UserScript==
// @name         Codex Quota Compass
// @name:zh-CN   Codex 配额统计
// @name:en      Codex Quota Compass
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.4.0
// @description  Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @description:zh-CN  在 chatgpt.com 展示 Codex 配额窗口、每日用量、客户端汇总和周额度估算。
// @description:en     Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @author       BlueSkyXN, dzshzx
// @match        https://chatgpt.com/*
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-contract.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-i18n.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-core.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-view-model.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-runtime.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell-styles.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-renderer-styles.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-renderer.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-dom.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-storage.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-ledger.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-archive.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-remote-sync.lib.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/dzshzx/custom-user-js-scripts
// @supportURL   https://github.com/dzshzx/custom-user-js-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass.user.js
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_NAME = 'Codex Quota Compass';
  const DEBUG_KEY = '__codexQuotaCompassDebug';
  const LAST_RESULT_KEY = '__codexQuotaCompassLastResult';
  const RUNNING_KEY = '__codexQuotaCompassRunning';
  const ROOT_ID = 'codex-quota-compass-root';
  const SCRIPT_VERSION = '0.3.1';
  const BUTTON_POSITION_KEY = 'codexQuotaCompassButtonPosition';

  let statusNode;
  let contentNode;
  let activePanelView = 'details';
  let latestError;
  let latestResult = null;
  let latestHistoryUsage = null;
  let latestLedgerCost = null;
  let latestPanelViewModel = null;
  let latestArchiveSummary = null;
  let latestRemoteSyncStatus = null;
  let latestImportReport = null;
  let pendingRunPromise = null;
  let floatingPanelShell = null;
  const i18nLib = globalThis.CodexQuotaCompassI18nLib;
  const coreLib = globalThis.CodexQuotaCompassCoreLib;
  const panelViewModelLib = globalThis.CodexQuotaCompassPanelViewModelLib;
  const runtimeLib = globalThis.CodexQuotaCompassRuntimeLib;
  const panelShellLib = globalThis.CodexQuotaCompassPanelShellLib;
  const panelRendererLib = globalThis.CodexQuotaCompassPanelRendererLib;
  const panelDomLib = globalThis.CodexQuotaCompassPanelDomLib;
  const storageLib = globalThis.CodexQuotaCompassStorageLib;
  const archiveLib = globalThis.CodexQuotaCompassArchiveLib;
  const remoteSyncLib = globalThis.CodexQuotaCompassRemoteSyncLib;
  if (!i18nLib?.createQuotaCompassTranslator) {
    throw new Error('CodexQuotaCompassI18nLib translator is unavailable.');
  }
  const { t } = i18nLib.createQuotaCompassTranslator({ navigator: globalThis.navigator });
  if (!panelRendererLib?.createQuotaPanelRenderer) {
    throw new Error('CodexQuotaCompassPanelRendererLib renderer is unavailable.');
  }
  if (!panelDomLib?.applyActiveView) {
    throw new Error('CodexQuotaCompassPanelDomLib is unavailable.');
  }
  const panelRenderer = panelRendererLib.createQuotaPanelRenderer({
    t,
    debugKey: DEBUG_KEY,
  });
  if (!panelViewModelLib?.createQuotaPanelViewModel) {
    throw new Error('CodexQuotaCompassPanelViewModelLib view model is unavailable.');
  }
  if (!storageLib?.createSnapshotArchiveStoragePort) {
    throw new Error('CodexQuotaCompassStorageLib storage port is unavailable.');
  }
  const archiveStoragePort = storageLib.createSnapshotArchiveStoragePort({
    scriptName: SCRIPT_NAME,
    normalizeArchive: archiveLib?.normalizeSnapshotArchive || null,
    mergeArchives: archiveLib?.mergeSnapshots
      ? (primaryArchive, fallbackArchive) => archiveLib.mergeSnapshots(
        primaryArchive,
        Array.isArray(fallbackArchive?.snapshots) ? fallbackArchive.snapshots : [],
      )
      : null,
  });
  const archiveStore = archiveLib
    ? archiveLib.createSnapshotArchiveStore({
      read: archiveStoragePort.read,
      write: archiveStoragePort.write,
      scriptVersion: SCRIPT_VERSION,
    })
    : null;
  function createSnapshotSyncStatus(backendInfo) {
    const backendId = backendInfo?.backendId || backendInfo?.id || 'unavailable';
    const backendLabel = backendInfo?.backendLabel || backendInfo?.label || backendId;
    const localOnly = backendId === 'gm' || backendId === 'localStorage';
    const reason = (() => {
      if (backendId === 'gm') return 'Userscript manager storage is local to this manager profile; use GitHub Gist sync for cross-device Snapshot Archive sync.';
      if (backendId === 'localStorage') return 'localStorage is browser-local and will not sync personal usage history across devices.';
      if (backendId === 'pending') return 'Snapshot Archive storage has not been loaded yet.';
      return 'Snapshot Archive storage is unavailable.';
    })();
    return { backendId, backendLabel, crossDeviceCapable: false, localOnly, reason };
  }

  const remoteSyncClient = remoteSyncLib?.createRemoteSyncClient && archiveStore
    ? remoteSyncLib.createRemoteSyncClient({ archiveStore })
    : null;

  function isUsagePage() {
    return (
      location.hostname === 'chatgpt.com' &&
      location.pathname === '/codex/cloud/settings/analytics' &&
      location.hash === '#usage'
    );
  }

  function isDebugEnabled() {
    return window[DEBUG_KEY] === true;
  }

  async function refreshArchiveSummary() {
    if (!archiveStore) return null;
    latestArchiveSummary = await archiveStore.summarizeArchive();
    return latestArchiveSummary;
  }

  async function refreshRemoteSyncStatus() {
    if (!remoteSyncClient) {
      latestRemoteSyncStatus = null;
      return null;
    }

    latestRemoteSyncStatus = await remoteSyncClient.getStatus();
    return latestRemoteSyncStatus;
  }

  function cycleStartDateFromResult(result) {
    const windows = Array.isArray(result?.限制窗口概览) ? result.限制窗口概览 : [];
    const win = windows.find((entry) => entry?.窗口Key === 'main.sevenDayWindow')
      || windows.find((entry) => /7\s*天/.test(String(entry?.名称 || '')));
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(win?.['本轮开始_UTC'] || ''));
    return match ? match[1] : null;
  }

  async function refreshHistoryUsageForResult(result) {
    const sinceResetSummary = result?.主7天窗口_上次重置至今?.汇总 || {};
    if (!archiveStore?.queryHistory) return null;
    latestHistoryUsage = await archiveStore.queryHistory({
      startDate: sinceResetSummary?.API_start_date,
      endDate: sinceResetSummary?.API_end_date_排他,
      periodDays: result?.配置?.ROLLING_DAYS,
    });
    if (archiveStore?.queryLedgerCost) {
      latestLedgerCost = await archiveStore.queryLedgerCost({
        cycleStartDate: cycleStartDateFromResult(result),
      });
    }
    return latestHistoryUsage;
  }

  function refreshCurrentPanel() {
    // Avoid clobbering a token/gist id the user is actively typing in the sync form.
    if (panelDomLib.isSyncFormEditing(contentNode, document.activeElement)) return;
    if (latestResult && !latestError) {
      renderResult(latestResult);
    }
  }

  function refreshArchiveViewAfterStorageChange() {
    Promise.all([refreshArchiveSummary(), refreshRemoteSyncStatus()])
      .then(() => {
        refreshCurrentPanel();
      })
      .catch((error) => {
        console.warn(`${SCRIPT_NAME}: failed to refresh archive summary after storage change.`, error);
      });
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

  function renderResult(result) {
    if (!contentNode) return;
    const viewModel = panelViewModelLib.createQuotaPanelViewModel({
      result,
      historyUsage: latestHistoryUsage,
      ledgerCost: latestLedgerCost,
      archiveSummary: latestArchiveSummary,
      importReport: latestImportReport,
      storageBackend: archiveStoragePort.getBackendInfo(),
      syncStatus: createSnapshotSyncStatus(archiveStoragePort.getBackendInfo()),
      remoteSyncStatus: latestRemoteSyncStatus,
    });
    latestPanelViewModel = viewModel;
    const rendered = panelRenderer.renderResult(viewModel, { activePanelView });
    activePanelView = rendered.activePanelView;
    contentNode.innerHTML = rendered.html;
    schedulePanelResize();
  }

  function switchPanelView(nextView) {
    if (!contentNode || !latestPanelViewModel) return;
    const rendered = panelRenderer.renderActiveView(latestPanelViewModel, { activePanelView: nextView });
    activePanelView = panelDomLib.applyActiveView(contentNode, rendered);
    schedulePanelResize();
  }

  function renderLoading() {
    if (!contentNode) return;
    contentNode.innerHTML = panelRenderer.renderLoading();
    schedulePanelResize();
  }

  function renderError(error) {
    if (!contentNode) return;
    latestError = error;
    contentNode.innerHTML = panelRenderer.renderError(error);
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
      await refreshHistoryUsageForResult(result);
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

  async function syncRemoteArchive(options = {}) {
    if (!remoteSyncClient) {
      throw new Error(t('syncPortUnavailable'));
    }

    if (!options.silent) setStatus(t('statusLoading'), 'loading');
    const synced = await remoteSyncClient.syncNow();
    latestRemoteSyncStatus = synced.settings || await remoteSyncClient.getStatus();

    if (synced.status !== 'synced') {
      refreshCurrentPanel();
      if (!options.silent) {
        alert(`${SCRIPT_NAME} ${t('remoteSyncSkipped', { status: synced.status })}`);
        setStatus(t('statusUpdated'), 'success');
      }
      return synced;
    }

    latestArchiveSummary = synced.summary || await refreshArchiveSummary();
    if (latestResult && !latestError) {
      await refreshHistoryUsageForResult(latestResult);
    }
    refreshCurrentPanel();

    // Quiet feedback only: the button status line and the in-panel sync form's
    // "last synced" line already reflect success — no modal popup.
    if (!options.silent) {
      setStatus(t('statusUpdated'), 'success');
    }
    return synced;
  }

  function scheduleRemoteArchiveSync() {
    if (!remoteSyncClient) return;
    remoteSyncClient.scheduleSync({
      onComplete: async (result) => {
        latestRemoteSyncStatus = result.settings || await remoteSyncClient.getStatus();
        if (result.status === 'synced') {
          latestArchiveSummary = result.summary || await refreshArchiveSummary();
        }
        refreshCurrentPanel();
      },
      onError: async (error) => {
        try {
          await refreshRemoteSyncStatus();
          refreshCurrentPanel();
        } catch (statusError) {
          console.warn(`${SCRIPT_NAME}: failed to refresh remote sync status after sync error.`, statusError);
        }
        console.warn(`${SCRIPT_NAME}: remote sync failed.`, error);
      },
    });
  }

  async function saveRemoteSyncFromForm() {
    if (!remoteSyncClient) {
      throw new Error(t('syncPortUnavailable'));
    }

    const formValues = panelDomLib.readSyncFormValues(contentNode);
    if (!formValues) return null;

    const current = await remoteSyncClient.getStatus();
    const decision = remoteSyncLib.planRemoteSyncSave(formValues, { hasToken: current.hasToken });

    if (!decision.ok) {
      setStatus(t('statusFailed'), 'error');
      alert(`${SCRIPT_NAME} ${t('remoteSyncTokenRequired')}`);
      return null;
    }

    await remoteSyncClient.configure(decision.patch);
    await refreshRemoteSyncStatus();
    refreshCurrentPanel();

    // Sync immediately after enabling so the form reflects a real result instead
    // of forcing a second manual click.
    if (decision.syncAfter) {
      await syncRemoteArchive();
    } else {
      setStatus(t('statusUpdated'), 'success');
    }
    return latestRemoteSyncStatus;
  }

  function openSyncSettings() {
    activePanelView = 'archive';
    if (latestResult && !latestError) {
      renderResult(latestResult);
      if (!isPanelCurrentlyOpen()) openPanel();
    } else {
      runAndRender().catch(() => {});
    }
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
        switchPanelView(nextView);
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

    if (action === 'save-remote-sync') {
      saveRemoteSyncFromForm().catch((error) => {
        console.error(`[${SCRIPT_NAME}] Save remote sync failed.`, error);
        alert(`${SCRIPT_NAME} ${t('remoteSyncFailed', { error: error?.message || error })}`);
        setStatus(t('statusFailed'), 'error');
      });
      return;
    }

    if (action === 'sync-remote') {
      syncRemoteArchive().catch((error) => {
        console.error(`[${SCRIPT_NAME}] Remote sync failed.`, error);
        alert(`${SCRIPT_NAME} ${t('remoteSyncFailed', { error: error?.message || error })}`);
        setStatus(t('statusFailed'), 'error');
      });
      return;
    }
  }

  function createUi() {
    if (!panelShellLib?.createFloatingPanelShell) {
      throw new Error('CodexQuotaCompassPanelShellLib shell is unavailable.');
    }

    panelRenderer.installStyles(document, ROOT_ID);

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

      if (archiveStore) {
        try {
          const saved = await archiveStore.saveSnapshot(result);
          latestArchiveSummary = saved.summary;
          scheduleRemoteArchiveSync();
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
    if (!archiveStore) {
      throw new Error(t('syncPortUnavailable'));
    }

    const exportDocument = await archiveStore.buildExportDocument();
    downloadTextFile(
      'codex-quota-compass-snapshot-archive.v1.json',
      JSON.stringify(exportDocument, null, 2),
    );
    latestArchiveSummary = await archiveStore.summarizeArchive();
    refreshCurrentPanel();
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
    if (!archiveStore) {
      throw new Error(t('syncPortUnavailable'));
    }

    const fileText = await chooseImportFileText();
    const importDocument = JSON.parse(fileText);
    const imported = await archiveStore.importArchiveDocument(importDocument);
    latestArchiveSummary = imported.summary;
    latestImportReport = imported.report;
    scheduleRemoteArchiveSync();
    refreshCurrentPanel();
    alert(`${SCRIPT_NAME} ${t('importDone', {
      added: imported.report.added,
      skipped: imported.report.skipped,
      invalid: imported.report.invalid,
    })}`);
  }

  createUi();
  Promise.all([refreshArchiveSummary(), refreshRemoteSyncStatus()])
    .then(() => {
      if (latestRemoteSyncStatus?.enabled && latestRemoteSyncStatus?.configured) {
        return syncRemoteArchive({ silent: true });
      }
      return null;
    })
    .catch((error) => {
      console.warn(`${SCRIPT_NAME}: failed to load archive or remote sync state.`, error);
    });
  archiveStoragePort.subscribeToChanges?.(() => {
    refreshArchiveViewAfterStorageChange();
  });

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(t('menuRun'), () => {
      runAndRender().catch(() => {});
    });
    GM_registerMenuCommand(t('menuRemoteConfigure'), () => {
      openSyncSettings();
    });
    GM_registerMenuCommand(t('menuRemoteSync'), () => {
      syncRemoteArchive().catch((error) => {
        console.error(`[${SCRIPT_NAME}] Remote sync failed.`, error);
        alert(`${SCRIPT_NAME} ${t('remoteSyncFailed', { error: error?.message || error })}`);
        setStatus(t('statusFailed'), 'error');
      });
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
