(function attachCodexQuotaCompassSyncLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassSyncLib';

  function createSnapshotSyncStatus(backendInfo) {
    const backendId = backendInfo?.backendId || backendInfo?.id || 'unavailable';
    const backendLabel = backendInfo?.backendLabel || backendInfo?.label || backendId;
    const crossDeviceCapable = false;
    const localOnly = backendId === 'gm' || backendId === 'localStorage';
    const reason = (() => {
      if (backendId === 'gm') {
        return 'Userscript manager storage is local to this manager profile; use GitHub Gist sync for cross-device Snapshot Archive sync.';
      }
      if (backendId === 'localStorage') {
        return 'localStorage is browser-local and will not sync personal usage history across devices.';
      }
      if (backendId === 'pending') {
        return 'Snapshot Archive storage has not been loaded yet.';
      }
      return 'Snapshot Archive storage is unavailable.';
    })();

    return {
      backendId,
      backendLabel,
      crossDeviceCapable,
      localOnly,
      reason,
    };
  }

  function createSnapshotSyncPort({ archiveStore, getBackendInfo = () => null }) {
    function getSyncStatus() {
      const backendInfo = typeof getBackendInfo === 'function' ? getBackendInfo() : null;
      return createSnapshotSyncStatus(backendInfo);
    }

    async function getLocalSummary() {
      if (!archiveStore) return null;
      return archiveStore.summarizeArchive();
    }

    async function saveLocalSnapshot(result) {
      if (!archiveStore) return { summary: null, report: null, snapshot: null, archive: null };
      return archiveStore.saveSnapshot(result);
    }

    async function buildSyncPayload() {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      return archiveStore.buildExportDocument();
    }

    async function previewIncomingArchive(documentObject) {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      if (typeof archiveStore.previewImportArchiveDocument !== 'function') {
        throw new Error('Snapshot Archive preview interface is unavailable.');
      }
      return archiveStore.previewImportArchiveDocument(documentObject);
    }

    async function mergeIncomingArchive(documentObject) {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      return archiveStore.importArchiveDocument(documentObject);
    }

    async function queryUsage(query) {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      if (typeof archiveStore.queryArchiveUsage !== 'function') {
        throw new Error('Snapshot Archive query interface is unavailable.');
      }
      return archiveStore.queryArchiveUsage(query || {});
    }

    async function queryHistory(query) {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      if (typeof archiveStore.queryHistory === 'function') {
        return archiveStore.queryHistory(query || {});
      }
      return {
        day: await queryUsage({ ...(query || {}), mode: 'day' }),
        rolling: await queryUsage({ ...(query || {}), mode: 'rolling' }),
        month: await queryUsage({ ...(query || {}), mode: 'month' }),
        timeline: [],
      };
    }

    return {
      getLocalSummary,
      summarize: getLocalSummary,
      saveLocalSnapshot,
      saveLatestResult: saveLocalSnapshot,
      buildSyncPayload,
      exportArchive: buildSyncPayload,
      previewIncomingArchive,
      mergeIncomingArchive,
      importArchiveDocument: mergeIncomingArchive,
      getSyncStatus,
      queryUsage,
      queryHistory,
    };
  }

  globalObject[LIB_NAME] = {
    createSnapshotSyncStatus,
    createSnapshotSyncPort,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
