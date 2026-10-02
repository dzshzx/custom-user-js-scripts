import { resolveGmApi } from '../shared/shared-gm.lib.ts';
import type { GmOverrides } from '../shared/shared-gm.lib.ts';

export type StorageBackendId = 'pending' | 'gm' | 'localStorage';
export interface StorageBackendInfo {
  id: StorageBackendId;
  label: string;
  degraded?: boolean;
  mirrorError?: string;
}
export interface ArchiveStorageMergeResult {
  archive?: unknown;
  changed?: boolean;
  report?: { added?: number };
}
export type ArchiveStorageMerger = (
  primaryArchive: unknown,
  fallbackArchive: unknown,
) => ArchiveStorageMergeResult | null | undefined;
export interface ArchiveStorageChange {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  remote: boolean;
  backendInfo: StorageBackendInfo;
}
export interface SnapshotArchiveStorageOptions extends GmOverrides {
  archiveKey?: string;
  fallbackKey?: string;
  scriptName?: string;
  logger?: Pick<Console, 'warn'> | null;
  localStorage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  mergeArchives?: ArchiveStorageMerger | null;
  normalizeArchive?: ((archive: unknown) => unknown) | null;
}
export type SnapshotArchiveStoragePort = ReturnType<typeof createSnapshotArchiveStoragePort>;

const DEFAULT_ARCHIVE_KEY = 'codexQuotaCompassSnapshotArchive';
const DEFAULT_ARCHIVE_FALLBACK_KEY = 'codexQuotaCompassSnapshotArchiveFallback';
const STORAGE_BACKENDS: Record<StorageBackendId, StorageBackendInfo> = {
  pending: { id: 'pending', label: 'pending' },
  gm: { id: 'gm', label: 'GM storage' },
  localStorage: { id: 'localStorage', label: 'localStorage' },
};

function maybePromise(value: unknown): Promise<unknown> {
  return value && typeof (value as PromiseLike<unknown>).then === 'function'
    ? (value as Promise<unknown>)
    : Promise.resolve(value);
}

function createArchiveMerger(options: SnapshotArchiveStorageOptions): ArchiveStorageMerger | null {
  if (typeof options.mergeArchives === 'function') {
    return options.mergeArchives;
  }

  return null;
}

function createArchiveNormalizer(options: SnapshotArchiveStorageOptions): (archive: unknown) => unknown {
  if (typeof options.normalizeArchive === 'function') {
    return options.normalizeArchive;
  }

  return (archive: unknown) => archive;
}

function createSnapshotArchiveStoragePort(options: SnapshotArchiveStorageOptions = {}) {
  const archiveKey = options.archiveKey || DEFAULT_ARCHIVE_KEY;
  const fallbackKey = options.fallbackKey || DEFAULT_ARCHIVE_FALLBACK_KEY;
  const scriptName = options.scriptName || 'Codex Quota Compass';
  const logger = options.logger || globalThis.console;
  const localStorageObject = options.localStorage || globalThis.localStorage;
  const mergeArchives = createArchiveMerger(options);
  const normalizeArchive = createArchiveNormalizer(options);
  let backendInfo = STORAGE_BACKENDS.pending;
  let mirrorDegraded = false;
  function gmBackendInfo(): StorageBackendInfo {
    return mirrorDegraded
      ? {
          ...STORAGE_BACKENDS.gm,
          label: 'GM storage (mirror unavailable)',
          degraded: true,
          mirrorError: 'Snapshot Archive mirror write failed.',
        }
      : STORAGE_BACKENDS.gm;
  }

  async function readFromGmStorage(): Promise<unknown> {
    const { getValue } = resolveGmApi(options);
    if (getValue) {
      return await maybePromise(getValue(archiveKey, null));
    }

    throw new Error('GM storage is unavailable.');
  }

  async function writeToGmStorage(nextArchive: unknown): Promise<unknown> {
    const { setValue } = resolveGmApi(options);
    if (setValue) {
      await maybePromise(setValue(archiveKey, nextArchive as Tampermonkey.StorageValue));
      return nextArchive;
    }

    throw new Error('GM storage is unavailable.');
  }

  function readFromLocalStorage(): unknown {
    if (!localStorageObject?.getItem) {
      throw new Error('localStorage is unavailable.');
    }
    return JSON.parse(localStorageObject.getItem(fallbackKey) || 'null');
  }

  function writeToLocalStorage(nextArchive: unknown): unknown {
    if (!localStorageObject?.setItem) {
      throw new Error('localStorage is unavailable.');
    }
    localStorageObject.setItem(fallbackKey, JSON.stringify(nextArchive));
    return nextArchive;
  }

  function mergeStorageArchives(
    primaryArchive: unknown,
    fallbackArchive: unknown,
  ): { archive: unknown; changed: boolean } {
    const normalizedPrimary = normalizeArchive(primaryArchive);
    const normalizedFallback = normalizeArchive(fallbackArchive);

    if (!mergeArchives) {
      return { archive: normalizedPrimary, changed: false };
    }

    const merged = mergeArchives(normalizedPrimary, normalizedFallback);
    return {
      archive: merged?.archive || normalizedPrimary,
      changed: merged?.changed ?? Number(merged?.report?.added) > 0,
    };
  }

  function getGmValueChangeAdapter() {
    return resolveGmApi(options).valueChange;
  }

  return {
    async read(): Promise<unknown> {
      let gmArchive: unknown = null;
      let gmAvailable = false;

      try {
        gmArchive = await readFromGmStorage();
        gmAvailable = true;
        backendInfo = gmBackendInfo();
      } catch (error) {
        logger?.warn?.(`${scriptName}: failed to read userscript archive storage.`, error);
      }

      let fallbackArchive: unknown = null;
      let fallbackAvailable = false;
      try {
        fallbackArchive = readFromLocalStorage();
        fallbackAvailable = true;
      } catch (error) {
        logger?.warn?.(`${scriptName}: failed to read fallback archive storage.`, error);
      }

      if (gmAvailable) {
        const merged = mergeStorageArchives(gmArchive, fallbackArchive);
        if (merged.changed) {
          try {
            await writeToGmStorage(merged.archive);
          } catch (error) {
            logger?.warn?.(`${scriptName}: failed to migrate fallback archive into userscript storage.`, error);
          }
        }

        backendInfo = gmBackendInfo();
        return merged.archive;
      }

      if (!fallbackAvailable) throw new Error('Both Snapshot Archive storage reads failed.');
      backendInfo = STORAGE_BACKENDS.localStorage;
      return fallbackArchive;
    },

    async write(nextArchive: unknown): Promise<unknown> {
      try {
        await writeToGmStorage(nextArchive);
        try {
          writeToLocalStorage(nextArchive);
          mirrorDegraded = false;
        } catch (error) {
          mirrorDegraded = true;
          logger?.warn?.(`${scriptName}: failed to mirror userscript archive storage to fallback storage.`, error);
        }
        backendInfo = gmBackendInfo();
        return nextArchive;
      } catch (error) {
        logger?.warn?.(`${scriptName}: failed to write userscript archive storage.`, error);
      }

      writeToLocalStorage(nextArchive);
      backendInfo = STORAGE_BACKENDS.localStorage;
      return nextArchive;
    },

    getBackendInfo(): StorageBackendInfo {
      return backendInfo;
    },

    subscribeToChanges(listener: (change: ArchiveStorageChange) => void): () => void {
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
          adapter.remove(listenerId as number);
        }
      };
    },
  };
}

export { DEFAULT_ARCHIVE_KEY, DEFAULT_ARCHIVE_FALLBACK_KEY, STORAGE_BACKENDS, createSnapshotArchiveStoragePort };
