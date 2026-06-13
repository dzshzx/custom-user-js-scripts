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

  function hasSnapshots(archive) {
    return Array.isArray(archive?.snapshots) && archive.snapshots.length > 0;
  }

  function createArchiveMerger(options) {
    if (typeof options.mergeArchives === 'function') {
      return options.mergeArchives;
    }

    return null;
  }

  function createArchiveNormalizer(options) {
    if (typeof options.normalizeArchive === 'function') {
      return options.normalizeArchive;
    }

    return (archive) => archive;
  }

  function createSnapshotArchiveStoragePort(options = {}) {
    const archiveKey = options.archiveKey || DEFAULT_ARCHIVE_KEY;
    const fallbackKey = options.fallbackKey || DEFAULT_ARCHIVE_FALLBACK_KEY;
    const scriptName = options.scriptName || 'Codex Quota Compass';
    const logger = options.logger || globalObject.console;
    const localStorageObject = options.localStorage || globalObject.localStorage;
    const mergeArchives = createArchiveMerger(options);
    const normalizeArchive = createArchiveNormalizer(options);
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

    function mergeStorageArchives(primaryArchive, fallbackArchive) {
      const normalizedPrimary = normalizeArchive(primaryArchive);
      const normalizedFallback = normalizeArchive(fallbackArchive);

      if (!mergeArchives || !hasSnapshots(normalizedFallback)) {
        return { archive: normalizedPrimary, added: 0 };
      }

      if (!hasSnapshots(normalizedPrimary)) {
        return { archive: normalizedFallback, added: normalizedFallback.snapshots.length };
      }

      const merged = mergeArchives(normalizedPrimary, normalizedFallback);
      return {
        archive: merged?.archive || normalizedPrimary,
        added: Number(merged?.report?.added) || 0,
      };
    }

    function getGmValueChangeAdapter() {
      const gmAddValueChangeListener = options.gmAddValueChangeListener ||
        (typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : null);
      const gmRemoveValueChangeListener = options.gmRemoveValueChangeListener ||
        (typeof GM_removeValueChangeListener === 'function' ? GM_removeValueChangeListener : null);

      if (typeof gmAddValueChangeListener === 'function') {
        return {
          add: gmAddValueChangeListener,
          remove: typeof gmRemoveValueChangeListener === 'function' ? gmRemoveValueChangeListener : null,
        };
      }

      const gmApi = options.gm || (typeof GM !== 'undefined' ? GM : null);
      if (typeof gmApi?.addValueChangeListener === 'function') {
        return {
          add: gmApi.addValueChangeListener.bind(gmApi),
          remove: typeof gmApi.removeValueChangeListener === 'function'
            ? gmApi.removeValueChangeListener.bind(gmApi)
            : null,
        };
      }

      return null;
    }

    return {
      async read() {
        let gmArchive = null;
        let gmAvailable = false;

        try {
          gmArchive = await readFromGmStorage();
          gmAvailable = true;
          backendInfo = STORAGE_BACKENDS.gm;
        } catch (error) {
          logger?.warn?.(`${scriptName}: failed to read userscript archive storage.`, error);
        }

        let fallbackArchive = null;
        try {
          fallbackArchive = readFromLocalStorage();
        } catch (error) {
          logger?.warn?.(`${scriptName}: failed to read fallback archive storage.`, error);
        }

        if (gmAvailable) {
          const merged = mergeStorageArchives(gmArchive, fallbackArchive);
          if (merged.added > 0) {
            try {
              await writeToGmStorage(merged.archive);
            } catch (error) {
              logger?.warn?.(`${scriptName}: failed to migrate fallback archive into userscript storage.`, error);
            }
          }

          backendInfo = STORAGE_BACKENDS.gm;
          return merged.archive;
        }

        backendInfo = STORAGE_BACKENDS.localStorage;
        return fallbackArchive;
      },

      async write(nextArchive) {
        try {
          await writeToGmStorage(nextArchive);
          try {
            writeToLocalStorage(nextArchive);
          } catch (error) {
            logger?.warn?.(`${scriptName}: failed to mirror userscript archive storage to fallback storage.`, error);
          }
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

      subscribeToChanges(listener) {
        if (typeof listener !== 'function') return () => {};
        const adapter = getGmValueChangeAdapter();
        if (!adapter) return () => {};

        const listenerId = adapter.add(archiveKey, (key, oldValue, newValue, remote) => {
          listener({
            key,
            oldValue,
            newValue,
            remote: Boolean(remote),
            backendInfo: STORAGE_BACKENDS.gm,
          });
        });

        return () => {
          if (adapter.remove && listenerId !== undefined && listenerId !== null) {
            adapter.remove(listenerId);
          }
        };
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
