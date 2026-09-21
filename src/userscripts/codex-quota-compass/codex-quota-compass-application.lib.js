import { planRemoteSyncSave } from './codex-quota-compass-remote-sync.lib.js';

// One page instance owns complete operations and their public, credential-free view.
function createQuotaApplication({
  runtime, archiveStore, remoteSync, archiveChanges,
  clock = globalThis, runGuard = { acquire: () => true, release() {} },
  onChange = () => {},
}) {
  let disposed = false;
  let started;
  let running;
  let syncing;
  let timer = null;
  let unsubscribe = () => {};
  let revision = 0;
  let localRevision = 0;
  const state = {
    lifecycle: 'idle', result: null, calculationError: null,
    archiveSummary: null, ledgerCost: null, importReport: null,
    syncStatus: null, storageBackend: null, remoteState: 'idle',
    operations: { run: false, sync: false },
    errors: { calculation: null, persistence: null, sync: null, projection: null, settings: null },
  };
  const getState = () => structuredClone(state);
  function notify() {
    if (disposed) return;
    try { onChange(getState()); } catch { /* Observers cannot change an operation result. */ }
  }
  function errorMessage(error) { return error?.message || String(error); }
  function clearTimer() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }
  function schedule() {
    if (disposed || syncing || state.remoteState === 'unknown') return;
    clearTimer();
    timer = clock.setTimeout(() => { timer = null; void sync(); }, 5000);
  }
  function changedLocally() {
    localRevision += 1;
    schedule();
  }
  async function refresh() {
    const currentRevision = ++revision;
    try {
      const view = await archiveStore.readView();
      if (disposed || currentRevision !== revision) return false;
      state.archiveSummary = view.summary;
      state.ledgerCost = view.ledgerCost;
      state.storageBackend = archiveChanges?.getBackendInfo?.() || null;
      state.errors.projection = null;
      notify();
      return true;
    } catch (error) {
      if (!disposed && currentRevision === revision) {
        state.errors.projection = errorMessage(error);
        notify();
      }
      return false;
    }
  }
  async function readSyncStatus() {
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
  function sync() {
    if (disposed) return Promise.resolve({ status: 'skipped', reason: 'disposed' });
    clearTimer();
    if (syncing) return syncing;
    const atRevision = localRevision;
    state.operations.sync = true;
    notify();
    syncing = (async () => {
      let outcome;
      try {
        const result = await remoteSync.syncNow();
        state.syncStatus = result.settings;
        state.remoteState = result.status === 'synced' ? 'synced' : 'idle';
        state.errors.sync = null;
        outcome = { status: result.status === 'synced' ? 'ok' : 'skipped', reason: result.status, completed: result.status === 'synced' ? ['sync'] : [] };
      } catch (error) {
        state.errors.sync = errorMessage(error);
        if (error?.phase === 'persistence') state.errors.persistence = errorMessage(error);
        state.remoteState = error?.remoteState || 'failed';
        outcome = { status: error?.localMerged ? 'partial' : 'error', completed: error?.localMerged ? ['local-merge'] : [], error: state.errors.sync, remoteState: state.remoteState };
      }
      // A successful local merge remains visible even when the remote write failed.
      const refreshed = await refresh();
      if (!refreshed && outcome.status === 'ok') outcome = { ...outcome, status: 'partial', error: state.errors.projection };
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
  function run() {
    if (disposed) return Promise.resolve({ status: 'skipped', reason: 'disposed' });
    if (running) return running;
    if (!runGuard.acquire()) return Promise.resolve({ status: 'skipped', reason: 'already-running' });
    state.operations.run = true;
    state.calculationError = state.errors.calculation = null;
    state.errors.persistence = null;
    notify();
    running = (async () => {
      let result;
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
      return { status: refreshed ? 'ok' : 'partial', result, completed: ['calculation', 'persistence', ...(refreshed ? ['projection'] : [])], ...(refreshed ? {} : { error: state.errors.projection }) };
    })().finally(() => {
      runGuard.release();
      running = null;
      state.operations.run = false;
      notify();
    });
    return running;
  }
  async function importArchive(document) {
    if (disposed) return { status: 'skipped', reason: 'disposed' };
    try {
      const imported = await archiveStore.importArchiveDocument(document);
      state.importReport = imported.report;
      state.errors.persistence = null;
      changedLocally();
      const refreshed = await refresh();
      return { status: refreshed ? 'ok' : 'partial', completed: ['persistence', ...(refreshed ? ['projection'] : [])], report: imported.report };
    } catch (error) {
      state.errors.persistence = errorMessage(error);
      notify();
      return { status: 'error', error: state.errors.persistence, completed: [] };
    }
  }
  async function configureSync(formValues) {
    if (disposed) return { status: 'skipped', reason: 'disposed' };
    try {
      const decision = planRemoteSyncSave(formValues, await remoteSync.getStatus());
      if (!decision.ok) return { status: 'error', reason: decision.reason };
      state.syncStatus = await remoteSync.configure(decision.patch);
      if (!decision.syncAfter) clearTimer();
      state.errors.settings = null;
      notify();
      return decision.syncAfter ? sync() : { status: 'ok', completed: ['settings'] };
    } catch {
      state.errors.settings = 'GitHub Gist settings could not be saved.';
      notify();
      return { status: 'error', error: state.errors.settings, completed: [] };
    }
  }
  function start() {
    if (started) return started;
    if (disposed) return Promise.resolve({ status: 'skipped', reason: 'disposed' });
    state.lifecycle = 'starting';
    unsubscribe = archiveChanges?.subscribeToChanges?.(() => {
      // Self notifications need no network work. Revision checks coalesce stale reads.
      if (!disposed) void refresh();
    }) || (() => {});
    started = (async () => {
      const [refreshed] = await Promise.all([refresh(), readSyncStatus()]);
      if (disposed) return { status: 'skipped', reason: 'disposed' };
      state.lifecycle = 'ready';
      notify();
      if (state.remoteState === 'unknown') return { status: 'skipped', reason: 'remote-state-unknown', completed: ['start'] };
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
  return { start, run, importArchive, exportArchive: () => archiveStore.buildExportDocument(), configureSync, sync, getState, dispose };
}

export { createQuotaApplication };
