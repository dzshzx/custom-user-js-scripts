import { createGmFirstJsonStore } from '../shared/shared-gm-json-store.lib.ts';
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

function createSnapshotArchiveStoragePort(options: SnapshotArchiveStorageOptions = {}) {
  const archiveKey = options.archiveKey || DEFAULT_ARCHIVE_KEY;
  const fallbackKey = options.fallbackKey || DEFAULT_ARCHIVE_FALLBACK_KEY;
  const scriptName = options.scriptName || 'Codex Quota Compass';
  const logger = options.logger || globalThis.console;
  const mergeArchives = options.mergeArchives ?? null;
  const normalizeArchive = options.normalizeArchive ?? ((archive: unknown) => archive);
  // The store hands back raw values; mergeStorageArchives normalizes the GM
  // and mirror copies before merging, and a fallback-only read stays raw.
  const store = createGmFirstJsonStore<unknown>({
    ...options,
    scriptName,
    subject: 'archive',
    key: archiveKey,
    fallbackKey,
    localStorage: options.localStorage || undefined,
    normalize: (archive) => archive,
    mirror: true,
    logger,
  });
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

  return {
    async read(): Promise<unknown> {
      const primary = await store.read();

      if (primary.backend === 'gm') {
        const merged = mergeStorageArchives(primary.value, store.readFallback().value);
        if (merged.changed) {
          try {
            const migrated = await store.write(merged.archive);
            if (migrated.backend === 'gm') mirrorDegraded = migrated.mirrorDegraded;
          } catch (error) {
            logger?.warn?.(`${scriptName}: failed to migrate fallback archive into userscript storage.`, error);
          }
        }

        backendInfo = gmBackendInfo();
        return merged.archive;
      }

      if (primary.backend === 'none') throw new Error('Both Snapshot Archive storage reads failed.');
      backendInfo = STORAGE_BACKENDS.localStorage;
      return primary.value;
    },

    async write(nextArchive: unknown): Promise<unknown> {
      const result = await store.write(nextArchive);
      if (result.backend === 'gm') {
        mirrorDegraded = result.mirrorDegraded;
        backendInfo = gmBackendInfo();
      } else {
        backendInfo = STORAGE_BACKENDS.localStorage;
      }
      return nextArchive;
    },

    getBackendInfo(): StorageBackendInfo {
      return backendInfo;
    },

    subscribeToChanges(listener: (change: ArchiveStorageChange) => void): () => void {
      if (typeof listener !== 'function') return () => {};
      return store.subscribe((change) => {
        listener({
          key: change.key,
          oldValue: change.oldValue,
          newValue: change.newValue,
          remote: change.remote,
          backendInfo: STORAGE_BACKENDS[change.backend],
        });
      });
    },
  };
}

export { DEFAULT_ARCHIVE_KEY, DEFAULT_ARCHIVE_FALLBACK_KEY, createSnapshotArchiveStoragePort };
