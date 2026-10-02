import { planRemoteSyncSave } from './codex-quota-compass-remote-sync.lib.ts';
import type {
  RemoteSyncClient,
  RemoteSyncFailure,
  RemoteSyncFormValues,
  RemoteSyncStatus,
} from './codex-quota-compass-remote-sync.lib.ts';
import type {
  ArchiveMergeReport,
  LedgerCostViews,
  SnapshotArchiveStore,
  SnapshotArchiveSummary,
} from './codex-quota-compass-archive.lib.ts';
import type { StorageBackendInfo } from './codex-quota-compass-storage.lib.ts';
import type { QuotaSnapshotResult } from './codex-quota-compass-core.lib.ts';

export type QuotaLifecycle = 'idle' | 'starting' | 'ready' | 'disposed';
export type QuotaRemoteState = 'idle' | 'synced' | 'failed' | 'unknown';
export interface QuotaApplicationErrors {
  calculation: string | null;
  persistence: string | null;
  sync: string | null;
  projection: string | null;
  settings: string | null;
}
/** Public, credential-free application state handed to observers (a structured clone). */
export interface QuotaApplicationState {
  lifecycle: QuotaLifecycle;
  result: QuotaSnapshotResult | null;
  calculationError: string | null;
  archiveSummary: SnapshotArchiveSummary | null;
  ledgerCost: LedgerCostViews | null;
  importReport: ArchiveMergeReport | null;
  syncStatus: RemoteSyncStatus | null;
  storageBackend: StorageBackendInfo | null;
  remoteState: QuotaRemoteState;
  operations: { run: boolean; sync: boolean };
  errors: QuotaApplicationErrors;
}
export type QuotaOperationStatus = 'ok' | 'partial' | 'error' | 'skipped';
export type QuotaCompletedStep =
  'calculation' | 'persistence' | 'projection' | 'sync' | 'local-merge' | 'settings' | 'start';
/** Outcome of one application operation (run, sync, import, configure, start). */
export interface QuotaOperationOutcome {
  status: QuotaOperationStatus;
  reason?: string;
  completed?: QuotaCompletedStep[];
  error?: string | null;
  result?: QuotaSnapshotResult;
  report?: ArchiveMergeReport;
  remoteState?: QuotaRemoteState;
}
export interface QuotaClock {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(id: number): void;
}
export interface QuotaRunGuard {
  acquire(): boolean;
  release(): void;
}
export interface QuotaArchiveChanges {
  getBackendInfo?(): StorageBackendInfo | null;
  subscribeToChanges?(listener: () => void): () => void;
}
export interface QuotaApplicationDeps {
  runtime: { run(): Promise<QuotaSnapshotResult> };
  archiveStore: Pick<
    SnapshotArchiveStore,
    'readView' | 'saveSnapshot' | 'importArchiveDocument' | 'buildExportDocument'
  >;
  remoteSync: Pick<RemoteSyncClient, 'getStatus' | 'syncNow' | 'configure'>;
  archiveChanges?: QuotaArchiveChanges | null;
  clock?: QuotaClock;
  runGuard?: QuotaRunGuard;
  onChange?: (state: QuotaApplicationState) => void;
}
export type QuotaApplication = ReturnType<typeof createQuotaApplication>;
type SyncError = Partial<RemoteSyncFailure> | null | undefined;

// One page instance owns complete operations and their public, credential-free view.
function createQuotaApplication({
  runtime,
  archiveStore,
  remoteSync,
  archiveChanges,
  clock = globalThis,
  runGuard = { acquire: () => true, release() {} },
  onChange = () => {},
}: QuotaApplicationDeps) {
  let disposed = false;
  let started: Promise<QuotaOperationOutcome> | undefined;
  let running: Promise<QuotaOperationOutcome> | null | undefined;
  let syncing: Promise<QuotaOperationOutcome> | null | undefined;
  let timer: number | null = null;
  let unsubscribe = () => {};
  let revision = 0;
  let latestRefresh: Promise<boolean>;
  let localRevision = 0;
  const state: QuotaApplicationState = {
    lifecycle: 'idle',
    result: null,
    calculationError: null,
    archiveSummary: null,
    ledgerCost: null,
    importReport: null,
    syncStatus: null,
    storageBackend: null,
    remoteState: 'idle',
    operations: { run: false, sync: false },
    errors: { calculation: null, persistence: null, sync: null, projection: null, settings: null },
  };
  const getState = () => structuredClone(state);
  function notify() {
    if (disposed) return;
    try {
      onChange(getState());
    } catch {
      /* Observers cannot change an operation result. */
    }
  }
  function errorMessage(error: unknown): string {
    return (error as Error | null)?.message || String(error);
  }
  function clearTimer() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }
  function schedule() {
    if (disposed || syncing || state.remoteState === 'unknown') return;
    clearTimer();
    timer = clock.setTimeout(() => {
      timer = null;
      void sync();
    }, 5000);
  }
  function changedLocally() {
    localRevision += 1;
    schedule();
  }
  function refresh(): Promise<boolean> {
    const currentRevision = ++revision;
    // Install the promise before reading: storage migration may synchronously
    // notify subscribers and request a newer projection.
    latestRefresh = Promise.resolve().then(() => readProjection(currentRevision));
    return latestRefresh;
  }
  async function readProjection(currentRevision: number): Promise<boolean> {
    try {
      const view = await archiveStore.readView();
      if (disposed) return false;
      if (currentRevision !== revision) return latestRefresh;
      state.archiveSummary = view.summary;
      state.ledgerCost = view.ledgerCost;
      state.storageBackend = archiveChanges?.getBackendInfo?.() || null;
      state.errors.projection = null;
      notify();
      return true;
    } catch (error) {
      if (disposed) return false;
      if (currentRevision !== revision) return latestRefresh;
      state.errors.projection = errorMessage(error);
      notify();
      return false;
    }
  }
  async function readSyncStatus(): Promise<void> {
    try {
      const status = await remoteSync.getStatus();
      if (!disposed) {
        state.syncStatus = status;
        if (status.remoteState === 'unknown') state.remoteState = 'unknown';
        state.errors.settings = null;
      }
    } catch {
      state.errors.settings = 'GitHub Gist settings are unavailable.';
    }
    notify();
  }
  function sync(): Promise<QuotaOperationOutcome> {
    if (disposed) return Promise.resolve({ status: 'skipped', reason: 'disposed' });
    clearTimer();
    if (syncing) return syncing;
    const atRevision = localRevision;
    state.operations.sync = true;
    notify();
    syncing = (async (): Promise<QuotaOperationOutcome> => {
      let outcome: QuotaOperationOutcome;
      try {
        const result = await remoteSync.syncNow();
        state.syncStatus = result.settings;
        state.remoteState = result.status === 'synced' ? 'synced' : 'idle';
        state.errors.sync = null;
        outcome = {
          status: result.status === 'synced' ? 'ok' : 'skipped',
          reason: result.status,
          completed: result.status === 'synced' ? ['sync'] : [],
        };
      } catch (error) {
        state.errors.sync = errorMessage(error);
        if ((error as SyncError)?.phase === 'persistence') state.errors.persistence = errorMessage(error);
        state.remoteState = (error as SyncError)?.remoteState || 'failed';
        outcome = {
          status: (error as SyncError)?.localMerged ? 'partial' : 'error',
          completed: (error as SyncError)?.localMerged ? ['local-merge'] : [],
          error: state.errors.sync,
          remoteState: state.remoteState,
        };
      }
      // A successful local merge remains visible even when the remote write failed.
      const refreshed = await refresh();
      if (!refreshed && outcome.status === 'ok')
        outcome = { ...outcome, status: 'partial', error: state.errors.projection };
      await readSyncStatus();
      return outcome;
    })().finally(() => {
      syncing = null;
      state.operations.sync = false;
      if (localRevision !== atRevision) schedule();
      notify();
    });
    return syncing;
  }
  function run(): Promise<QuotaOperationOutcome> {
    if (disposed) return Promise.resolve({ status: 'skipped', reason: 'disposed' });
    if (running) return running;
    if (!runGuard.acquire()) return Promise.resolve({ status: 'skipped', reason: 'already-running' });
    state.operations.run = true;
    state.calculationError = state.errors.calculation = null;
    state.errors.persistence = null;
    notify();
    running = (async (): Promise<QuotaOperationOutcome> => {
      let result: QuotaSnapshotResult;
      try {
        result = await runtime.run();
        state.result = result;
        state.importReport = null;
      } catch (error) {
        state.calculationError = state.errors.calculation = errorMessage(error);
        return { status: 'error', error: state.calculationError, completed: [] };
      }
      try {
        await archiveStore.saveSnapshot(result);
        changedLocally();
      } catch (error) {
        state.errors.persistence = errorMessage(error);
        return { status: 'partial', result, completed: ['calculation'], error: state.errors.persistence };
      }
      const refreshed = await refresh();
      return {
        status: refreshed ? 'ok' : 'partial',
        result,
        completed: ['calculation', 'persistence', ...(refreshed ? ['projection' as const] : [])],
        ...(refreshed ? {} : { error: state.errors.projection }),
      };
    })().finally(() => {
      runGuard.release();
      running = null;
      state.operations.run = false;
      notify();
    });
    return running;
  }
  async function importArchive(document: unknown): Promise<QuotaOperationOutcome> {
    if (disposed) return { status: 'skipped', reason: 'disposed' };
    try {
      const imported = await archiveStore.importArchiveDocument(document);
      state.importReport = imported.report;
      state.errors.persistence = null;
      changedLocally();
      const refreshed = await refresh();
      return {
        status: refreshed ? 'ok' : 'partial',
        completed: ['persistence', ...(refreshed ? ['projection' as const] : [])],
        report: imported.report,
        ...(refreshed ? {} : { error: state.errors.projection }),
      };
    } catch (error) {
      state.errors.persistence = errorMessage(error);
      notify();
      return { status: 'error', error: state.errors.persistence, completed: [] };
    }
  }
  async function configureSync(formValues: RemoteSyncFormValues): Promise<QuotaOperationOutcome> {
    if (disposed) return { status: 'skipped', reason: 'disposed' };
    try {
      const decision = planRemoteSyncSave(formValues, await remoteSync.getStatus());
      if (!decision.ok) return { status: 'error', reason: decision.reason };
      state.syncStatus = await remoteSync.configure(decision.patch);
      if (!decision.syncAfter) clearTimer();
      state.errors.settings = null;
      notify();
      if (!decision.syncAfter) return { status: 'ok', completed: ['settings'] };
      const synced = await sync();
      return {
        ...synced,
        status: synced.status === 'ok' ? 'ok' : 'partial',
        completed: ['settings', ...(synced.completed || [])],
      };
    } catch {
      state.errors.settings = 'GitHub Gist settings could not be saved.';
      notify();
      return { status: 'error', error: state.errors.settings, completed: [] };
    }
  }
  function start(): Promise<QuotaOperationOutcome> {
    if (started) return started;
    if (disposed) return Promise.resolve({ status: 'skipped', reason: 'disposed' });
    state.lifecycle = 'starting';
    unsubscribe =
      archiveChanges?.subscribeToChanges?.(() => {
        // Self notifications need no network work. Revision checks coalesce stale reads.
        if (!disposed) void refresh();
      }) || (() => {});
    started = (async (): Promise<QuotaOperationOutcome> => {
      const [refreshed] = await Promise.all([refresh(), readSyncStatus()]);
      if (disposed) return { status: 'skipped', reason: 'disposed' };
      state.lifecycle = 'ready';
      notify();
      if (state.remoteState === 'unknown')
        return { status: 'skipped', reason: 'remote-state-unknown', completed: ['start'] };
      if (refreshed && state.syncStatus?.enabled && state.syncStatus?.configured) return sync();
      return { status: refreshed ? 'ok' : 'partial', completed: ['start'] };
    })();
    return started;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    state.lifecycle = 'disposed';
    revision += 1;
    clearTimer();
    unsubscribe();
  }
  return {
    start,
    run,
    importArchive,
    exportArchive: () => archiveStore.buildExportDocument(),
    configureSync,
    sync,
    getState,
    dispose,
  };
}

export { createQuotaApplication };
