(function attachCodexQuotaCompassStorageLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassStorageLib';
  const DEFAULT_ARCHIVE_KEY = 'codexQuotaCompassSnapshotArchive';
  const DEFAULT_ARCHIVE_FALLBACK_KEY = 'codexQuotaCompassSnapshotArchiveFallback';
  const STORAGE_BACKENDS = {
    pending: { id: 'pending', label: 'pending' },
    gm: { id: 'gm', label: 'GM storage' },
    localStorage: { id: 'localStorage', label: 'localStorage' },
  };

  function maybePromise(value) {
    return value && typeof value.then === 'function' ? value : Promise.resolve(value);
  }

  function createSnapshotArchiveStoragePort(options = {}) {
    const archiveKey = options.archiveKey || DEFAULT_ARCHIVE_KEY;
    const fallbackKey = options.fallbackKey || DEFAULT_ARCHIVE_FALLBACK_KEY;
    const scriptName = options.scriptName || 'Codex Quota Compass';
    const logger = options.logger || globalObject.console;
    const localStorageObject = options.localStorage || globalObject.localStorage;
    let backendInfo = STORAGE_BACKENDS.pending;

    async function readFromGmStorage() {
      const gmGetValue = options.gmGetValue || (typeof GM_getValue === 'function' ? GM_getValue : null);
      if (typeof gmGetValue === 'function') {
        return await maybePromise(gmGetValue(archiveKey, null));
      }

      const gmApi = options.gm || (typeof GM !== 'undefined' ? GM : null);
      if (typeof gmApi?.getValue === 'function') {
        return await gmApi.getValue(archiveKey, null);
      }

      throw new Error('GM storage is unavailable.');
    }

    async function writeToGmStorage(nextArchive) {
      const gmSetValue = options.gmSetValue || (typeof GM_setValue === 'function' ? GM_setValue : null);
      if (typeof gmSetValue === 'function') {
        await maybePromise(gmSetValue(archiveKey, nextArchive));
        return nextArchive;
      }

      const gmApi = options.gm || (typeof GM !== 'undefined' ? GM : null);
      if (typeof gmApi?.setValue === 'function') {
        await gmApi.setValue(archiveKey, nextArchive);
        return nextArchive;
      }

      throw new Error('GM storage is unavailable.');
    }

    function readFromLocalStorage() {
      if (!localStorageObject?.getItem) {
        throw new Error('localStorage is unavailable.');
      }
      return JSON.parse(localStorageObject.getItem(fallbackKey) || 'null');
    }

    function writeToLocalStorage(nextArchive) {
      if (!localStorageObject?.setItem) {
        throw new Error('localStorage is unavailable.');
      }
      localStorageObject.setItem(fallbackKey, JSON.stringify(nextArchive));
      return nextArchive;
    }

    return {
      async read() {
        try {
          const archive = await readFromGmStorage();
          backendInfo = STORAGE_BACKENDS.gm;
          return archive;
        } catch (error) {
          logger?.warn?.(`${scriptName}: failed to read userscript archive storage.`, error);
        }

        try {
          const archive = readFromLocalStorage();
          backendInfo = STORAGE_BACKENDS.localStorage;
          return archive;
        } catch (error) {
          logger?.warn?.(`${scriptName}: failed to read fallback archive storage.`, error);
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
          logger?.warn?.(`${scriptName}: failed to write userscript archive storage.`, error);
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

  globalObject[LIB_NAME] = {
    DEFAULT_ARCHIVE_KEY,
    DEFAULT_ARCHIVE_FALLBACK_KEY,
    STORAGE_BACKENDS,
    createSnapshotArchiveStoragePort,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
