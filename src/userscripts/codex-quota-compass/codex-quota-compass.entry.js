// ==UserScript==
// @name         Codex Quota Compass
// @name:zh-CN   Codex 配额统计
// @name:en      Codex Quota Compass
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.5.0
// @description  Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @description:zh-CN  在 chatgpt.com 展示 Codex 配额窗口、每日用量、客户端汇总和周额度估算。
// @description:en     Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @author       BlueSkyXN, dzshzx
// @match        https://chatgpt.com/*
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/dzshzx/custom-user-js-scripts
// @supportURL   https://github.com/dzshzx/custom-user-js-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/codex-quota-compass.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/codex-quota-compass.user.js
// @license      MIT
// ==/UserScript==

import { createQuotaCompassTranslator } from './codex-quota-compass-i18n.lib.js';
import * as CoreLib from './codex-quota-compass-core.lib.js';
import { createQuotaPanelViewModel } from './codex-quota-compass-panel-view-model.lib.js';
import { createQuotaRuntime, createDefaultQuotaRuntimeConfig } from './codex-quota-compass-runtime.lib.js';
import { createFloatingPanelShell } from './codex-quota-compass-panel-shell.lib.js';
import { createQuotaPanelRenderer } from './codex-quota-compass-panel-renderer.lib.js';
import { applyActiveView, readSyncFormValues, isSyncFormEditing } from './codex-quota-compass-panel-dom.lib.js';
import { createSnapshotArchiveStoragePort } from './codex-quota-compass-storage.lib.js';
import { normalizeSnapshotArchive, mergeSnapshots, createSnapshotArchiveStore } from './codex-quota-compass-archive.lib.js';
import { createRemoteSyncClient, planRemoteSyncSave } from './codex-quota-compass-remote-sync.lib.js';

(function () {
  'use strict';

  const SCRIPT_NAME = 'Codex Quota Compass';
  const DEBUG_KEY = '__codexQuotaCompassDebug';
  const LAST_RESULT_KEY = '__codexQuotaCompassLastResult';
  const RUNNING_KEY = '__codexQuotaCompassRunning';
  const ROOT_ID = 'codex-quota-compass-root';
  const SCRIPT_VERSION = '0.5.0';
  const BUTTON_POSITION_KEY = 'codexQuotaCompassButtonPosition';

  let statusNode;
  let contentNode;
  let activePanelView = 'details';
  let activeStatsPeriod = 'day';
  let statsDrill = null;
  let latestError;
  let latestResult = null;
  let latestLedgerCost = null;
  let latestPanelViewModel = null;
  let latestArchiveSummary = null;
  let latestRemoteSyncStatus = null;
  let latestImportReport = null;
  let pendingRunPromise = null;
  let floatingPanelShell = null;
  const { t } = createQuotaCompassTranslator({ navigator: globalThis.navigator });
  const panelRenderer = createQuotaPanelRenderer({
    t,
    debugKey: DEBUG_KEY,
  });
  const archiveStoragePort = createSnapshotArchiveStoragePort({
    scriptName: SCRIPT_NAME,
    normalizeArchive: normalizeSnapshotArchive,
    mergeArchives: (primaryArchive, fallbackArchive) => mergeSnapshots(
      primaryArchive,
      Array.isArray(fallbackArchive?.snapshots) ? fallbackArchive.snapshots : [],
    ),
  });
  const archiveStore = createSnapshotArchiveStore({
    read: archiveStoragePort.read,
    write: archiveStoragePort.write,
    scriptVersion: SCRIPT_VERSION,
  });
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

  const remoteSyncClient = createRemoteSyncClient({ archiveStore });

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

  async function refreshLedgerCostForResult(result) {
    if (!archiveStore?.queryLedgerCost) return null;
    latestLedgerCost = await archiveStore.queryLedgerCost({
      cycleStartDate: cycleStartDateFromResult(result),
    });
    return latestLedgerCost;
  }

  function refreshCurrentPanel() {
    // Avoid clobbering a token/gist id the user is actively typing in the sync form.
    if (isSyncFormEditing(contentNode, document.activeElement)) return;
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
    const viewModel = createQuotaPanelViewModel({
      result,
      ledgerCost: latestLedgerCost,
      archiveSummary: latestArchiveSummary,
      importReport: latestImportReport,
      storageBackend: archiveStoragePort.getBackendInfo(),
      syncStatus: createSnapshotSyncStatus(archiveStoragePort.getBackendInfo()),
      remoteSyncStatus: latestRemoteSyncStatus,
    });
    latestPanelViewModel = viewModel;
    const rendered = panelRenderer.renderResult(viewModel, panelRenderState());
    activePanelView = rendered.activePanelView;
    contentNode.innerHTML = rendered.html;
    schedulePanelResize();
  }

  // Shared render state for the renderer: the active top-level tab plus the
  // Statistics tab's sub-state (active period + current drill-down range).
  function panelRenderState(overrides = {}) {
    return {
      activePanelView,
      statsPeriod: activeStatsPeriod,
      statsDrill,
      ...overrides,
    };
  }

  function switchPanelView(nextView) {
    if (!contentNode || !latestPanelViewModel) return;
    // Leaving (or re-entering) a top-level tab drops any open drill-down so the
    // Statistics tab always reopens at its summary.
    statsDrill = null;
    const rendered = panelRenderer.renderActiveView(latestPanelViewModel, panelRenderState({ activePanelView: nextView }));
    activePanelView = applyActiveView(contentNode, rendered);
    schedulePanelResize();
  }

  // Re-render only the active view body after a Statistics sub-state change
  // (period switch or drill), reusing the in-place swap so metrics and the open
  // animation are never rebuilt.
  function rerenderActiveView() {
    if (!contentNode || !latestPanelViewModel) return;
    const rendered = panelRenderer.renderActiveView(latestPanelViewModel, panelRenderState());
    activePanelView = applyActiveView(contentNode, rendered);
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
      await refreshLedgerCostForResult(result);
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
      await refreshLedgerCostForResult(latestResult);
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

    const formValues = readSyncFormValues(contentNode);
    if (!formValues) return null;

    const current = await remoteSyncClient.getStatus();
    const decision = planRemoteSyncSave(formValues, { hasToken: current.hasToken });

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

    if (action === 'switch-stats-period' && latestPanelViewModel) {
      const nextPeriod = event.target?.closest?.('[data-period]')?.dataset?.period;
      if (nextPeriod) {
        activeStatsPeriod = nextPeriod;
        statsDrill = null;
        rerenderActiveView();
      }
      return;
    }

    if (action === 'stats-drill' && latestPanelViewModel) {
      const node = event.target?.closest?.('[data-from]');
      const from = node?.dataset?.from;
      const to = node?.dataset?.to;
      if (from && to) {
        statsDrill = { from, to, label: node?.dataset?.label || `${from} ~ ${to}` };
        rerenderActiveView();
      }
      return;
    }

    if (action === 'stats-drill-back' && latestPanelViewModel) {
      statsDrill = null;
      rerenderActiveView();
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
    panelRenderer.installStyles(document, ROOT_ID);

    floatingPanelShell = createFloatingPanelShell({
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
      return createQuotaRuntime({
        config: createDefaultQuotaRuntimeConfig({
          DEBUG: isDebugEnabled(),
        }),
        coreLib: CoreLib,
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
