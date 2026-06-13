// ==UserScript==
// @name         Codex Quota Compass
// @name:zh-CN   Codex 配额统计
// @name:en      Codex Quota Compass
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.2.11
// @description  Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @description:zh-CN  在 chatgpt.com 展示 Codex 配额窗口、每日用量、客户端汇总和周额度估算。
// @description:en     Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @author       BlueSkyXN, dzshzx
// @match        https://chatgpt.com/*
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-contract.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-i18n.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-core.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-view-model.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-runtime.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell-markup.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell-styles.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-renderer-styles.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-renderer.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-storage.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-archive.lib.js
// @require      https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-sync.lib.js
// @grant        GM_getValue
// @grant        GM_setValue
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
  const SCRIPT_VERSION = '0.2.11';
  const BUTTON_POSITION_KEY = 'codexQuotaCompassButtonPosition';

  let statusNode;
  let contentNode;
  let activePanelView = 'details';
  let latestError;
  let latestResult = null;
  let latestHistoryUsage = null;
  let latestPanelViewModel = null;
  let latestArchiveSummary = null;
  let latestImportReport = null;
  let pendingRunPromise = null;
  let floatingPanelShell = null;
  const i18nLib = globalThis.CodexQuotaCompassI18nLib;
  const coreLib = globalThis.CodexQuotaCompassCoreLib;
  const panelViewModelLib = globalThis.CodexQuotaCompassPanelViewModelLib;
  const runtimeLib = globalThis.CodexQuotaCompassRuntimeLib;
  const panelShellLib = globalThis.CodexQuotaCompassPanelShellLib;
  const panelRendererLib = globalThis.CodexQuotaCompassPanelRendererLib;
  const storageLib = globalThis.CodexQuotaCompassStorageLib;
  const archiveLib = globalThis.CodexQuotaCompassArchiveLib;
  const syncLib = globalThis.CodexQuotaCompassSyncLib;
  if (!i18nLib?.createQuotaCompassTranslator) {
    throw new Error('CodexQuotaCompassI18nLib translator is unavailable.');
  }
  const { t } = i18nLib.createQuotaCompassTranslator({ navigator: globalThis.navigator });
  if (!panelRendererLib?.createQuotaPanelRenderer) {
    throw new Error('CodexQuotaCompassPanelRendererLib renderer is unavailable.');
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
  const syncPort = syncLib?.createSnapshotSyncPort
    ? syncLib.createSnapshotSyncPort({ archiveStore, getBackendInfo: archiveStoragePort.getBackendInfo })
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
    if (!syncPort) return null;
    latestArchiveSummary = await syncPort.summarize();
    return latestArchiveSummary;
  }

  function refreshArchiveViewAfterStorageChange() {
    refreshArchiveSummary()
      .then(() => {
        if (latestResult && !latestError) {
          renderResult(latestResult);
        }
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
      archiveSummary: latestArchiveSummary,
      importReport: latestImportReport,
      storageBackend: archiveStoragePort.getBackendInfo(),
      syncStatus: syncPort?.getSyncStatus ? syncPort.getSyncStatus() : null,
    });
    latestPanelViewModel = viewModel;
    const rendered = panelRenderer.renderResult(viewModel, { activePanelView });
    activePanelView = rendered.activePanelView;
    contentNode.innerHTML = rendered.html;
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
  archiveStoragePort.subscribeToChanges?.(() => {
    refreshArchiveViewAfterStorageChange();
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
