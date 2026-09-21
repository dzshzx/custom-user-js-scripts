import { createQuotaPanelViewModel } from './codex-quota-compass-panel-view-model.lib.js';
import { createQuotaPanelRenderer } from './codex-quota-compass-panel-renderer.lib.js';
import { createFloatingPanelShell } from './codex-quota-compass-panel-shell.lib.js';
import { applyActiveView, isSyncFormEditing, readSyncFormValues } from './codex-quota-compass-panel-dom.lib.js';
import { buildTokenCss } from '../shared/shared-tokens.lib.js';
import { createToaster } from '../shared/shared-toast.lib.js';

const ROOT_ID = 'codex-quota-compass-root';
const EXPORT_NAME = 'codex-quota-compass-snapshot-archive.v1.json';

function createSnapshotSyncStatus(backendInfo) {
  const backendId = backendInfo?.backendId || backendInfo?.id || 'unavailable';
  const backendLabel = backendInfo?.backendLabel || backendInfo?.label || backendId;
  const localOnly = backendId === 'gm' || backendId === 'localStorage';
  const reason = backendId === 'gm'
    ? 'Userscript manager storage is local to this manager profile; use GitHub Gist sync for cross-device Snapshot Archive sync.'
    : backendId === 'localStorage'
      ? 'localStorage is browser-local and will not sync personal usage history across devices.'
      : backendId === 'pending'
        ? 'Snapshot Archive storage has not been loaded yet.'
        : 'Snapshot Archive storage is unavailable.';
  return { backendId, backendLabel, crossDeviceCapable: false, localOnly, reason };
}

// Browser file resources are owned by one adapter. Abort settles a pending
// picker and removes its reader/input; a late change can no longer import.
function createBrowserQuotaFiles({ document, window, t }) {
  const activeUrls = new Set();
  const activePickers = new Set();
  function chooseText({ signal } = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { resolve({ status: 'cancelled' }); return; }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.style.display = 'none';
      document.body.append(input);
      let reader;
      let settled = false;
      let pickerActive = true;
      let focusTimer;
      function finish(value, error) {
        if (settled) return;
        settled = true;
        input.removeEventListener('change', changed);
        input.removeEventListener('cancel', cancelled);
        signal?.removeEventListener('abort', aborted);
        window.removeEventListener('focus', focused);
        if (focusTimer != null) window.clearTimeout(focusTimer);
        if (reader?.readyState === 1) reader.abort();
        input.remove();
        activePickers.delete(aborted);
        if (error) reject(error);
        else resolve(value);
      }
      function aborted() { finish({ status: 'cancelled' }); }
      function cancelled() { finish({ status: 'cancelled' }); }
      function focused() {
        // Browsers without a native cancel event restore focus after the picker
        // closes. Let a pending change event run before treating it as cancel.
        if (pickerActive) focusTimer = window.setTimeout(() => {
          if (!settled && !input.files?.length) cancelled();
        }, 250);
      }
      function changed() {
        pickerActive = false;
        const file = input.files?.[0];
        if (!file) { cancelled(); return; }
        reader = new window.FileReader();
        reader.onerror = () => finish(null, Object.assign(new Error(t('importReadFailed')), { stage: 'read' }));
        reader.onload = () => finish({ status: 'selected', text: String(reader.result || '') });
        try { reader.readAsText(file, 'utf-8'); }
        catch (error) { finish(null, Object.assign(error, { stage: 'read' })); }
      }
      input.addEventListener('change', changed);
      input.addEventListener('cancel', cancelled);
      signal?.addEventListener('abort', aborted, { once: true });
      activePickers.add(aborted);
      window.addEventListener('focus', focused);
      try { input.click(); }
      catch (error) { finish(null, Object.assign(error, { stage: 'select' })); }
    });
  }
  function downloadText(filename, content) {
    const url = window.URL.createObjectURL(new window.Blob([content], { type: 'application/json;charset=utf-8' }));
    activeUrls.add(url);
    const anchor = document.createElement('a');
    try {
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => {
        if (activeUrls.delete(url)) window.URL.revokeObjectURL(url);
      }, 0);
    }
  }
  function dispose() {
    for (const abort of [...activePickers]) abort();
    for (const url of activeUrls) window.URL.revokeObjectURL(url);
    activeUrls.clear();
  }
  return { chooseText, downloadText, dispose };
}

function createQuotaPanelController({ application, document, window, storage, t, files, onRefreshSettled = () => {} }) {
  let disposed = false;
  let snapshot = null;
  let activePanelView = 'details';
  let activeStatsPeriod = 'day';
  let statsDrill = null;
  let viewModel = null;
  let dirty = false;
  let deferred = false;
  let formGeneration = 0;
  let editRevision = 0;
  let foreground = 0;
  let presentation = 'snapshot';
  let presentationError = null;
  const expandedViews = new Set();
  const inFlight = new Map();
  const abortFiles = new AbortController();
  const renderer = createQuotaPanelRenderer({ t });
  renderer.installStyles(document, ROOT_ID);
  const shell = createFloatingPanelShell({
    rootId: ROOT_ID,
    labels: {
      panelTitle: t('panelTitle'), buttonTitle: t('buttonTitle'),
      buttonAriaOpen: t('buttonAriaOpen'), statusIdle: t('statusIdle'),
      actionRefresh: t('actionRefresh'), closeAria: t('closeAria'),
    },
    tokenCss: buildTokenCss({ rootSelector: `#${ROOT_ID}`, accent: '#10a37f', accentDark: '#19c37d' }),
    positionKey: 'codexQuotaCompassButtonPosition',
    document, window, storage,
    onAction: handleAction,
    onOpen: () => {
      if (!snapshot?.result || snapshot?.calculationError) void dispatch({ type: 'refresh', open: true });
      else { presentation = 'snapshot'; commitPresentation(); shell.setStatus(t('statusCached'), 'success'); }
    },
  });
  const mounted = shell.mount();
  const refs = mounted?.refs();
  const content = refs?.contentNode;
  const toaster = refs ? createToaster({ root: refs.root }) : null;
  if (toaster && !document.getElementById(`${ROOT_ID}-toast-style`)) {
    const style = document.createElement('style');
    style.id = `${ROOT_ID}-toast-style`;
    style.textContent = toaster.cssText;
    document.head.append(style);
  }

  function protectedForm() {
    return dirty || isSyncFormEditing(content, document.activeElement);
  }
  function renderState(overrides = {}) {
    return { activePanelView, statsPeriod: activeStatsPeriod, statsDrill, expandedViews, ...overrides };
  }
  function createViewModel() {
    if (!snapshot?.result) return null;
    const backend = snapshot.storageBackend;
    return createQuotaPanelViewModel({
      result: snapshot.result, ledgerCost: snapshot.ledgerCost,
      archiveSummary: snapshot.archiveSummary, importReport: snapshot.importReport,
      storageBackend: backend, syncStatus: createSnapshotSyncStatus(backend),
      remoteSyncStatus: snapshot.syncStatus,
    });
  }
  function safeStatus() {
    const status = snapshot?.syncStatus || {};
    const node = content?.querySelector('.cqc-sync-form-status');
    if (!node) return;
    const error = snapshot?.errors?.sync || status.lastError;
    node.textContent = error
      ? t('remoteSyncStatusError', { error })
      : status.lastSyncedAt ? t('remoteSyncLastSynced', { lastSyncedAt: new Date(status.lastSyncedAt).toLocaleString() }) : t('remoteSyncNeverSynced');
    node.dataset.tone = error ? 'error' : 'muted';
  }
  function commitPresentation() {
    if (disposed || !content) return;
    if (protectedForm()) { deferred = true; safeStatus(); return; }
    deferred = false;
    const next = presentation === 'loading' ? renderer.renderLoading()
      : presentation === 'error' ? renderer.renderError(presentationError)
        : (viewModel = createViewModel()) ? renderer.renderResult(viewModel, renderState()).html : '';
    if (content.innerHTML !== next) {
      content.innerHTML = next;
      formGeneration++;
    }
    shell.schedulePanelResize();
  }
  function update(nextSnapshot) {
    if (disposed) return;
    snapshot = nextSnapshot;
    if (presentation === 'snapshot') commitPresentation();
    else if (protectedForm()) safeStatus();
  }
  function notice(message, tone = 'info') { if (!disposed) toaster?.show({ message, tone }); }
  function foregroundStatus(sequence, status, tone) {
    if (!disposed && sequence === foreground) shell.setStatus(t(status), tone);
  }
  function settleRefresh(outcome) {
    try {
      const returned = onRefreshSettled(outcome);
      if (returned?.then) void returned.catch(() => {});
    } catch { /* Debug adapters must not change the operation result. */ }
  }
  function once(type, perform) {
    if (inFlight.has(type)) return inFlight.get(type);
    const operation = Promise.resolve().then(perform).catch((error) => {
      const outcome = {
        status: 'error', completed: [], error: error?.message || String(error),
        stage: error?.stage || (type === 'export-archive' ? 'export' : type === 'import-archive' ? 'import' : type),
      };
      if (!disposed) {
        if (type === 'refresh') { presentation = 'error'; presentationError = outcome.error; commitPresentation(); }
        const noticeKey = type === 'refresh' ? 'runFailed' : type === 'import-archive' ? 'importFailed' : type === 'export-archive' ? 'exportFailed' : 'remoteSyncFailed';
        notice(t(noticeKey, { error: outcome.error }), 'error');
        shell.setStatus(t('statusFailed'), 'error');
      }
      if (type === 'refresh') settleRefresh(outcome);
      return outcome;
    }).finally(() => { if (inFlight.get(type) === operation) inFlight.delete(type); });
    inFlight.set(type, operation);
    return operation;
  }
  function startRefresh({ open = true } = {}) {
    return once('refresh', async () => {
      const sequence = ++foreground;
      presentation = 'loading';
      commitPresentation();
      foregroundStatus(sequence, 'statusLoading', 'loading');
      const running = application.run();
      if (open && !shell.isOpen()) shell.openPanel();
      else if (open) shell.positionPanelNearButton();
      const outcome = await running;
      if (!disposed) {
        if (outcome.status === 'error' || outcome.status === 'skipped') {
          presentation = 'error';
          presentationError = outcome.error || t('alreadyRunning');
          foregroundStatus(sequence, 'statusFailed', 'error');
          if (outcome.status === 'error') notice(t('runFailed', { error: outcome.error }), 'error');
        } else {
          presentation = 'snapshot';
          foregroundStatus(sequence, outcome.status === 'partial' ? 'statusFailed' : 'statusUpdated', outcome.status === 'partial' ? 'error' : 'success');
          if (outcome.status === 'partial') notice(t('saveArchiveFailed', { error: outcome.error }), 'error');
        }
        commitPresentation();
      }
      settleRefresh(outcome);
      return outcome;
    });
  }
  function open(view) {
    if (view && ['details', 'stats', 'archive'].includes(view)) activePanelView = view;
    if (!snapshot?.result || snapshot?.calculationError) return startRefresh({ open: true });
    presentation = 'snapshot';
    commitPresentation();
    if (!shell.isOpen()) shell.openPanel();
    else shell.positionPanelNearButton();
    return Promise.resolve({ status: 'ok', completed: ['open'] });
  }
  function sync() {
    return once('sync', async () => {
      const sequence = ++foreground;
      foregroundStatus(sequence, 'statusLoading', 'loading');
      const outcome = await application.sync();
      if (!disposed) {
        if (outcome.status === 'error' || outcome.status === 'partial') notice(t('remoteSyncFailed', { error: outcome.error }), 'error');
        else if (outcome.status === 'skipped') notice(t('remoteSyncSkipped', { status: outcome.reason }), 'info');
        foregroundStatus(sequence, outcome.status === 'error' || outcome.status === 'partial' ? 'statusFailed' : 'statusUpdated', outcome.status === 'error' || outcome.status === 'partial' ? 'error' : 'success');
      }
      return outcome;
    });
  }
  function saveSettings() {
    return once('save-remote-sync', async () => {
      const values = readSyncFormValues(content);
      if (!values) return { status: 'skipped', reason: 'form-unavailable', completed: [] };
      const generation = formGeneration;
      const revision = editRevision;
      const sequence = ++foreground;
      const outcome = await application.configureSync(values);
      if (disposed) return outcome;
      if (outcome.completed?.includes('settings') && generation === formGeneration && revision === editRevision) {
        dirty = false;
        // The committed token must leave the DOM. A new edit or form owns its
        // own value and cannot be cleared by this completion.
        const token = content?.querySelector('[data-field="token"]');
        if (token) token.value = '';
        presentation = 'snapshot';
        commitPresentation();
      }
      if (outcome.reason === 'token-required') notice(t('remoteSyncTokenRequired'), 'error');
      else if (outcome.status === 'error' || outcome.status === 'partial') notice(t('remoteSyncFailed', { error: outcome.error || outcome.reason }), 'error');
      foregroundStatus(sequence, outcome.status === 'ok' ? 'statusUpdated' : 'statusFailed', outcome.status === 'ok' ? 'success' : 'error');
      return outcome;
    });
  }
  function importArchive() {
    return once('import-archive', async () => {
      const picked = await files.chooseText({ signal: abortFiles.signal });
      if (disposed || picked?.status === 'cancelled' || picked == null) return { status: 'skipped', reason: disposed ? 'disposed' : 'cancelled', completed: [] };
      let imported;
      try { imported = JSON.parse(picked.text); }
      catch (error) { const outcome = { status: 'error', completed: ['select'], stage: 'parse', error: error.message }; notice(t('importFailed', { error: outcome.error }), 'error'); return outcome; }
      const outcome = await application.importArchive(imported);
      if (!disposed) {
        if (outcome.status === 'ok') notice(t('importDone', outcome.report), 'success');
        else if (outcome.status === 'partial') notice(t('importPartial', { error: outcome.error }), 'error');
        else if (outcome.status === 'error') notice(t('importFailed', { error: outcome.error }), 'error');
        presentation = 'snapshot';
        commitPresentation();
      }
      return { ...outcome, completed: ['select', 'parse', ...(outcome.completed || [])] };
    });
  }
  function exportArchive() {
    return once('export-archive', async () => {
      const exported = await application.exportArchive();
      if (disposed) return { status: 'skipped', reason: 'disposed', completed: ['export'] };
      try { await files.downloadText(EXPORT_NAME, JSON.stringify(exported, null, 2)); }
      catch (error) { const outcome = { status: 'error', completed: ['export'], stage: 'download', error: error?.message || String(error) }; notice(t('exportFailed', { error: outcome.error }), 'error'); return outcome; }
      if (!disposed) notice(t('exportDone', { count: exported.snapshotCount }), 'success');
      return { status: 'ok', completed: ['export', 'download'], count: exported.snapshotCount };
    });
  }
  function dispatch(command) {
    if (disposed) return Promise.resolve({ status: 'skipped', reason: 'disposed', completed: [] });
    const type = typeof command === 'string' ? command : command?.type;
    if (type === 'open') return open(command?.view);
    if (type === 'refresh') return startRefresh({ open: command?.open !== false });
    if (type === 'sync') return sync();
    if (type === 'save-remote-sync') return saveSettings();
    if (type === 'import-archive') return importArchive();
    if (type === 'export-archive') return exportArchive();
    return Promise.resolve({ status: 'skipped', reason: 'unknown-command', completed: [] });
  }
  function rerenderActive(nextView) {
    if (disposed || !content || !viewModel) return;
    if ((!nextView || nextView === activePanelView) && protectedForm()) {
      deferred = true;
      safeStatus();
      return;
    }
    if (nextView && nextView !== activePanelView) {
      dirty = false;
      deferred = false;
      formGeneration++;
      statsDrill = null;
      activePanelView = nextView;
    }
    if (deferred) { presentation = 'snapshot'; commitPresentation(); }
    viewModel = createViewModel() || viewModel;
    const rendered = renderer.renderActiveView(viewModel, renderState());
    activePanelView = applyActiveView(content, rendered);
    formGeneration++;
    shell.schedulePanelResize();
  }
  function handleAction(action, event) {
    if (disposed || action === 'toggle') return;
    if (action === 'close') { shell.closePanel(); return; }
    if (action === 'refresh') { void dispatch({ type: 'refresh' }); return; }
    if (action === 'sync-remote') { void dispatch({ type: 'sync' }); return; }
    if (action === 'save-remote-sync') { void dispatch({ type: 'save-remote-sync' }); return; }
    if (action === 'import-archive' || action === 'export-archive') { void dispatch({ type: action }); return; }
    const target = event.target;
    if (action === 'switch-view') { rerenderActive(target.closest('[data-view]')?.dataset.view); return; }
    if (action === 'toggle-rows') {
      const id = target.closest('[data-view-id]')?.dataset.viewId;
      if (id) { if (expandedViews.has(id)) expandedViews.delete(id); else expandedViews.add(id); rerenderActive(); }
    }
    if (action === 'switch-stats-period') { activeStatsPeriod = target.closest('[data-period]')?.dataset.period || activeStatsPeriod; statsDrill = null; rerenderActive(); }
    if (action === 'stats-drill') {
      const node = target.closest('[data-from]');
      if (node?.dataset.from && node?.dataset.to) { statsDrill = { from: node.dataset.from, to: node.dataset.to, label: node.dataset.label || `${node.dataset.from} ~ ${node.dataset.to}` }; rerenderActive(); }
    }
    if (action === 'stats-drill-back') { statsDrill = null; rerenderActive(); }
  }
  function edited(event) { if (event.target?.closest?.('[data-sync-form]')) { dirty = true; editRevision++; } }
  function focusEnded() {
    window.queueMicrotask(() => { if (deferred && !protectedForm()) commitPresentation(); });
  }
  content?.addEventListener('input', edited);
  content?.addEventListener('change', edited);
  content?.addEventListener('focusout', focusEnded);
  function dispose() {
    if (disposed) return;
    disposed = true;
    abortFiles.abort();
    files.dispose?.();
    content?.removeEventListener('input', edited);
    content?.removeEventListener('change', edited);
    content?.removeEventListener('focusout', focusEnded);
    toaster?.destroy?.();
    shell.destroy();
  }
  return { update, dispatch, dispose };
}

export { createQuotaPanelController, createBrowserQuotaFiles };
