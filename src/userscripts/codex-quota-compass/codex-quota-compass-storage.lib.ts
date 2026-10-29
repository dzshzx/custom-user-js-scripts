import { createGmFirstJsonStore } from '../shared/shared-gm-json-store.lib.ts';
import type { GmFirstUpdateResult, GmFirstWriteResult } from '../shared/shared-gm-json-store.lib.ts';
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
  logger?: Pick<Console, 'warn'>;
  localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
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
const GM_MIRROR_DEGRADED: StorageBackendInfo = {
  ...STORAGE_BACKENDS.gm,
  label: 'GM storage (mirror unavailable)',
  degraded: true,
  mirrorError: 'Snapshot Archive mirror write failed.',
};

function createSnapshotArchiveStoragePort(options: SnapshotArchiveStorageOptions = {}) {
  const scriptName = options.scriptName || 'Codex Quota Compass';
  const logger = options.logger || globalThis.console;
  const mergeArchives = options.mergeArchives ?? null;
  const normalizeArchive = options.normalizeArchive ?? ((archive: unknown) => archive);
  // The store hands back raw values; mergeStorageArchives normalizes the GM
  // and mirror copies before merging, and a fallback-only read stays raw.
  const store = createGmFirstJsonStore<unknown>({
    ...options,
    scriptName,
    logger,
    subject: 'archive',
    key: options.archiveKey || DEFAULT_ARCHIVE_KEY,
    fallbackKey: options.fallbackKey || DEFAULT_ARCHIVE_FALLBACK_KEY,
    mirror: true,
  });
  let backendInfo = STORAGE_BACKENDS.pending;
  // Whether the last GM write could refresh the mirror; a localStorage-only
  // write in between does not change it.
  let mirrorDegraded = false;
  const gmInfo = () => (mirrorDegraded ? GM_MIRROR_DEGRADED : STORAGE_BACKENDS.gm);
  function noteWrite(written: GmFirstWriteResult): StorageBackendInfo {
    if (written.backend !== 'gm') return STORAGE_BACKENDS.localStorage;
    mirrorDegraded = written.mirrorDegraded;
    return gmInfo();
  }

  function mergeStorageArchives(
    primaryArchive: unknown,
    fallbackArchive: unknown,
  ): { archive: unknown; changed: boolean } {
    const normalizedPrimary = normalizeArchive(primaryArchive);
    const merged = mergeArchives?.(normalizedPrimary, normalizeArchive(fallbackArchive));
    return {
      archive: merged?.archive || normalizedPrimary,
      changed: merged?.changed ?? Number(merged?.report?.added) > 0,
    };
  }

  return {
    // GM reads merge the localStorage mirror back in and migrate the result
    // to GM (ADR-0003); the migration write refreshes the mirror as well.
    async read(): Promise<unknown> {
      let mergedArchive: unknown = null;
      let result: GmFirstUpdateResult<unknown>;
      try {
        result = await store.update((current) => {
          if (current.backend !== 'gm') return undefined;
          const merged = mergeStorageArchives(current.value, mergeArchives ? current.fallback() : null);
          mergedArchive = merged.archive;
          return merged.changed ? merged.archive : undefined;
        });
      } catch (error) {
        // A throwing merger is the caller's error; a failed migration write is not: the merged value is still the answer.
        if (mergedArchive === null) throw error;
        logger.warn(`${scriptName}: failed to migrate fallback archive into userscript storage.`, error);
        result = { backend: 'gm', value: mergedArchive };
      }

      if (result.backend === 'none') throw new Error('Both Snapshot Archive storage reads failed.');
      if (result.backend === 'localStorage') {
        backendInfo = STORAGE_BACKENDS.localStorage;
        return result.value;
      }
      // A GM read answers "GM storage" even when the migration write had to land in localStorage.
      if (result.written?.backend === 'gm') mirrorDegraded = result.written.mirrorDegraded;
      backendInfo = gmInfo();
      return mergedArchive;
    },

    async write(nextArchive: unknown): Promise<unknown> {
      backendInfo = noteWrite(await store.write(nextArchive));
      return nextArchive;
    },

    getBackendInfo(): StorageBackendInfo {
      return backendInfo;
    },

    subscribeToChanges(listener: (change: ArchiveStorageChange) => void): () => void {
      if (typeof listener !== 'function') return () => {};
      return store.subscribe(({ backend, ...change }) =>
        listener({ ...change, backendInfo: STORAGE_BACKENDS[backend] }),
      );
    },
  };
}

export { DEFAULT_ARCHIVE_KEY, DEFAULT_ARCHIVE_FALLBACK_KEY, createSnapshotArchiveStoragePort };
