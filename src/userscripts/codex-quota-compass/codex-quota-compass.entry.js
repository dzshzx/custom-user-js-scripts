// ==UserScript==
// @name         Codex Quota Compass
// @name:zh-CN   Codex 配额统计
// @name:en      Codex Quota Compass
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.5.6
// @description  Show Codex limit windows, daily usage, model summaries, reset credits, and a settled cost ledger on chatgpt.com.
// @description:zh-CN  在 chatgpt.com 展示 Codex 限制窗口、每日用量、模型汇总、重置券和已结算消耗统计。
// @description:en     Show Codex limit windows, daily usage, model summaries, reset credits, and a settled cost ledger on chatgpt.com.
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
import { createQuotaRuntime, createDefaultQuotaRuntimeConfig } from './codex-quota-compass-runtime.lib.js';
import { createSnapshotArchiveStoragePort } from './codex-quota-compass-storage.lib.js';
import { normalizeSnapshotArchive, mergeSnapshotArchives, createSnapshotArchiveStore } from './codex-quota-compass-archive.lib.js';
import { createRemoteSyncClient } from './codex-quota-compass-remote-sync.lib.js';
import { createQuotaApplication } from './codex-quota-compass-application.lib.js';
import { createQuotaPanelController, createBrowserQuotaFiles } from './codex-quota-compass-panel-controller.lib.js';

(function () {
  'use strict';

  const SCRIPT_NAME = 'Codex Quota Compass';
  const DEBUG_KEY = '__codexQuotaCompassDebug';
  const LAST_RESULT_KEY = '__codexQuotaCompassLastResult';
  const RUNNING_KEY = '__codexQuotaCompassRunning';
  const SCRIPT_VERSION = '0.5.6';
  const { t } = createQuotaCompassTranslator({ navigator: globalThis.navigator });
  const archiveStoragePort = createSnapshotArchiveStoragePort({
    scriptName: SCRIPT_NAME,
    normalizeArchive: normalizeSnapshotArchive,
    mergeArchives: mergeSnapshotArchives,
  });
  const archiveStore = createSnapshotArchiveStore({
    read: archiveStoragePort.read,
    write: archiveStoragePort.write,
    scriptVersion: SCRIPT_VERSION,
  });
  const remoteSyncClient = createRemoteSyncClient({ archiveStore });
  let panel;
  const application = createQuotaApplication({
    runtime: { run: () => createQuotaRuntime({
      config: createDefaultQuotaRuntimeConfig({ DEBUG: window[DEBUG_KEY] === true }),
      coreLib: CoreLib,
      fetchImpl: fetch.bind(globalThis),
      location: globalThis.location,
      now: () => Date.now(),
      formatLocalTime: (ms) => new Date(ms).toLocaleString(),
      getBrowserTimeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || '未知',
    }).run() },
    archiveStore,
    remoteSync: remoteSyncClient,
    archiveChanges: archiveStoragePort,
    runGuard: {
      acquire() {
        if (window[RUNNING_KEY]) return false;
        window[RUNNING_KEY] = true;
        return true;
      },
      release() { window[RUNNING_KEY] = false; },
    },
    onChange: (snapshot) => panel?.update(snapshot),
  });
  panel = createQuotaPanelController({
    application, document, window, storage: localStorage, t,
    files: createBrowserQuotaFiles({ document, window, t }),
    onRefreshSettled(outcome) {
      if (outcome.status === 'error' || outcome.status === 'skipped') {
        console.error(`[${SCRIPT_NAME}] Failed.`, outcome.error || outcome.reason);
      } else if (window[DEBUG_KEY] === true) {
        window[LAST_RESULT_KEY] = outcome.result;
        console.log(`[${SCRIPT_NAME}] Finished. Latest result is available at window.${LAST_RESULT_KEY}.`, outcome.result);
      } else {
        console.info(`[${SCRIPT_NAME}] Finished.`);
      }
    },
  });
  panel.update(application.getState());

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(t('menuRun'), () => { void panel.dispatch({ type: 'refresh', open: true }); });
    GM_registerMenuCommand(t('menuRemoteConfigure'), () => { void panel.dispatch({ type: 'open', view: 'archive' }); });
    GM_registerMenuCommand(t('menuRemoteSync'), () => { void panel.dispatch({ type: 'sync' }); });
    GM_registerMenuCommand(t('menuExport'), () => { void panel.dispatch({ type: 'export-archive' }); });
    GM_registerMenuCommand(t('menuImport'), () => { void panel.dispatch({ type: 'import-archive' }); });
  }
  void application.start();
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) {
      panel.dispose();
      application.dispose();
    }
  });

  if (location.hostname === 'chatgpt.com' && location.pathname === '/codex/cloud/settings/analytics' && location.hash === '#usage') {
    console.info(`[${SCRIPT_NAME}] Ready. Click the floating button to calculate usage.`);
  } else {
    console.info(`[${SCRIPT_NAME}] Open https://chatgpt.com/codex/cloud/settings/analytics#usage or use the floating button / Tampermonkey menu to run.`);
  }
})();
