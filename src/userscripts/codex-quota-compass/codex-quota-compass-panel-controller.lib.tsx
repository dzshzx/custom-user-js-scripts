import { createQuotaPanelViewModel } from './codex-quota-compass-panel-view-model.lib.ts';
import { render } from 'preact';
import { createQuotaPanelRenderer } from './codex-quota-compass-panel-renderer.lib.tsx';
import { createFloatingPanelShell } from './codex-quota-compass-panel-shell.lib.tsx';
import { buildTokenCss } from '../shared/shared-tokens.lib.ts';
import { createToaster } from '../shared/shared-toast.lib.tsx';
import type { QuotaMessageKey, QuotaTranslate, TranslationVariables } from './codex-quota-compass-i18n.lib.ts';
import type {
  QuotaApplication,
  QuotaApplicationState,
  QuotaOperationOutcome,
} from './codex-quota-compass-application.lib.ts';
import type { RemoteSyncStatus } from './codex-quota-compass-remote-sync.lib.ts';
import type { PanelSyncStatus } from './codex-quota-compass-panel-view-model.lib.ts';
import type { PanelPresentation, PanelRenderState, SyncDraft } from './codex-quota-compass-panel-renderer.lib.tsx';
import type { StatsDrill } from './codex-quota-compass-panel-stats.lib.tsx';

/** Backend descriptor: storage backend info or an already-normalized sync status. */
interface SnapshotBackendInput {
  id?: string;
  label?: string;
  backendId?: string;
  backendLabel?: string;
}
export type QuotaFilePick = { status: 'cancelled' } | { status: 'selected'; text: string };
export interface QuotaFileChooseOptions {
  signal?: AbortSignal;
}
/** Browser file adapter: JSON picker + download, owning their DOM/URL resources. */
export interface QuotaPanelFiles {
  chooseText(options?: QuotaFileChooseOptions): Promise<QuotaFilePick | null>;
  downloadText(filename: string, content: string): void | Promise<void>;
  dispose?(): void;
}
export interface BrowserQuotaFilesOptions {
  document: Document;
  window: Window & typeof globalThis;
  t: QuotaTranslate;
}
/** Outcome of one panel command; extends the application outcome with panel-only steps. */
export type PanelOperationOutcome = Omit<QuotaOperationOutcome, 'completed'> & {
  completed?: string[];
  stage?: string;
  count?: number;
};
export type PanelCommandType = 'open' | 'refresh' | 'sync' | 'save-remote-sync' | 'import-archive' | 'export-archive';
export interface PanelCommand {
  type: PanelCommandType | string;
  open?: boolean;
  view?: string;
}
export interface QuotaPanelControllerOptions {
  application: Pick<QuotaApplication, 'run' | 'sync' | 'configureSync' | 'importArchive' | 'exportArchive'>;
  document: Document;
  window: Window & typeof globalThis;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  t: QuotaTranslate;
  files: QuotaPanelFiles;
  onRefreshSettled?: (outcome: PanelOperationOutcome) => unknown;
}
type MaybeTranslationVars = TranslationVariables | undefined;
type OperationError = { message?: string; stage?: string } | null | undefined;

const ROOT_ID = 'codex-quota-compass-root';
const EXPORT_NAME = 'codex-quota-compass-snapshot-archive.v1.json';

function createSnapshotSyncStatus(backendInfo: SnapshotBackendInput | null | undefined): PanelSyncStatus {
  const backendId = backendInfo?.backendId || backendInfo?.id || 'unavailable';
  const backendLabel = backendInfo?.backendLabel || backendInfo?.label || backendId;
  const localOnly = backendId === 'gm' || backendId === 'localStorage';
  const reason =
    backendId === 'gm'
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
function createBrowserQuotaFiles({ document, window, t }: BrowserQuotaFilesOptions) {
  const activeUrls = new Set<string>();
  const activePickers = new Set<() => void>();
  function chooseText({ signal }: QuotaFileChooseOptions = {}) {
    return new Promise<QuotaFilePick | null>((resolve, reject) => {
      if (signal?.aborted) {
        resolve({ status: 'cancelled' });
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.style.display = 'none';
      document.body.append(input);
      let reader: FileReader | undefined;
      let settled = false;
      let pickerActive = true;
      let focusTimer: number | undefined;
      function finish(value: QuotaFilePick | null, error?: unknown) {
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
      function aborted() {
        finish({ status: 'cancelled' });
      }
      function cancelled() {
        finish({ status: 'cancelled' });
      }
      function focused() {
        // Browsers without a native cancel event restore focus after the picker
        // closes. Let a pending change event run before treating it as cancel.
        if (pickerActive)
          focusTimer = window.setTimeout(() => {
            if (!settled && !input.files?.length) cancelled();
          }, 250);
      }
      function changed() {
        pickerActive = false;
        const file = input.files?.[0];
        if (!file) {
          cancelled();
          return;
        }
        reader = new window.FileReader();
        reader.onerror = () => finish(null, Object.assign(new Error(t('importReadFailed')), { stage: 'read' }));
        reader.onload = () => finish({ status: 'selected', text: String(reader!.result || '') });
        try {
          reader.readAsText(file, 'utf-8');
        } catch (error) {
          finish(null, Object.assign(error as Error, { stage: 'read' }));
        }
      }
      input.addEventListener('change', changed);
      input.addEventListener('cancel', cancelled);
      signal?.addEventListener('abort', aborted, { once: true });
      activePickers.add(aborted);
      window.addEventListener('focus', focused);
      try {
        input.click();
      } catch (error) {
        finish(null, Object.assign(error as Error, { stage: 'select' }));
      }
    });
  }
  function downloadText(filename: string, content: string) {
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

// Kept on one line: esbuild preserves the destructured parameter layout in the bundle.
// prettier-ignore
function createQuotaPanelController({ application, document, window, storage, t, files, onRefreshSettled = () => {} }: QuotaPanelControllerOptions) {
  let disposed = false;
  let snapshot: QuotaApplicationState | null = null;
  let activePanelView = 'details';
  let activeStatsPeriod = 'day';
  let statsDrill: StatsDrill | null = null;
  // Sync form draft: null until the user edits the form. It survives every
  // background refresh; only a completed save of the same edit revision in
  // the same form generation, or leaving the view, discards it.
  let syncDraft: SyncDraft | null = null;
  let formGeneration = 0;
  let editRevision = 0;
  let foreground = 0;
  let presentation: PanelPresentation = 'snapshot';
  let presentationError: string | null | undefined = null;
  const expandedViews = new Set<string>();
  const inFlight = new Map<string, Promise<PanelOperationOutcome>>();
  const abortFiles = new AbortController();
  const renderer = createQuotaPanelRenderer({ t });
  renderer.installStyles(document, ROOT_ID);
  const shell = createFloatingPanelShell({
    rootId: ROOT_ID,
    labels: {
      panelTitle: t('panelTitle'),
      buttonTitle: t('buttonTitle'),
      buttonAriaOpen: t('buttonAriaOpen'),
      statusIdle: t('statusIdle'),
      actionRefresh: t('actionRefresh'),
      closeAria: t('closeAria'),
    },
    tokenCss: buildTokenCss({ rootSelector: `#${ROOT_ID}`, accent: '#10a37f', accentDark: '#19c37d' }),
    positionKey: 'codexQuotaCompassButtonPosition',
    document,
    window,
    storage,
    onAction: handleAction,
    onOpen: () => {
      if (!snapshot?.result || snapshot?.calculationError) void dispatch({ type: 'refresh', open: true });
      else {
        presentation = 'snapshot';
        commitPresentation();
        shell.setStatus(t('statusCached'), 'success');
      }
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

  function renderState(overrides: Partial<PanelRenderState> = {}): PanelRenderState {
    return { activePanelView, statsPeriod: activeStatsPeriod, statsDrill, expandedViews, ...overrides };
  }
  function createViewModel() {
    if (!snapshot?.result) return null;
    const backend = snapshot.storageBackend;
    return createQuotaPanelViewModel({
      result: snapshot.result,
      ledgerCost: snapshot.ledgerCost,
      archiveSummary: snapshot.archiveSummary,
      importReport: snapshot.importReport,
      storageBackend: backend,
      syncStatus: createSnapshotSyncStatus(backend),
      remoteSyncStatus: snapshot.errors?.sync
        ? { ...snapshot.syncStatus, lastError: snapshot.errors.sync }
        : snapshot.syncStatus,
    });
  }
  function setSyncDraft(next: SyncDraft) {
    if (disposed) return;
    syncDraft = next;
    editRevision++;
    commitPresentation();
  }
  function commitPresentation() {
    if (disposed || !content) return;
    const viewModel = createViewModel();
    if (viewModel) activePanelView = renderer.normalizeActivePanelView(viewModel, activePanelView);
    // Loading and error states never unmount a sync form holding a draft; the
    // button status line and toasts carry that outcome instead.
    const shown = presentation !== 'snapshot' && syncDraft && viewModel ? 'snapshot' : presentation;
    render(
      <renderer.Panel
        presentation={shown}
        error={presentationError}
        viewModel={viewModel}
        state={renderState()}
        form={{ draft: syncDraft, onDraft: setSyncDraft }}
      />,
      content,
    );
    shell.schedulePanelResize();
  }
  function update(nextSnapshot: QuotaApplicationState) {
    if (disposed) return;
    snapshot = nextSnapshot;
    commitPresentation();
  }
  function notice(message: string, tone = 'info') {
    if (!disposed) toaster?.show({ message, tone });
  }
  function foregroundStatus(sequence: number, status: QuotaMessageKey, tone: string) {
    if (!disposed && sequence === foreground) shell.setStatus(t(status), tone);
  }
  function settleRefresh(outcome: PanelOperationOutcome) {
    try {
      const returned = onRefreshSettled(outcome) as Promise<unknown> | null | undefined;
      if (returned?.then) void returned.catch(() => {});
    } catch {
      /* Debug adapters must not change the operation result. */
    }
  }
  function once(type: string, perform: () => Promise<PanelOperationOutcome>): Promise<PanelOperationOutcome> {
    if (inFlight.has(type)) return inFlight.get(type)!;
    const operation = Promise.resolve()
      .then(perform)
      .catch((error: OperationError) => {
        const outcome: PanelOperationOutcome = {
          status: 'error',
          completed: [],
          error: error?.message || String(error),
          stage: error?.stage || (type === 'export-archive' ? 'export' : type === 'import-archive' ? 'import' : type),
        };
        if (!disposed) {
          if (type === 'refresh') {
            presentation = 'error';
            presentationError = outcome.error;
            commitPresentation();
          }
          const noticeKey =
            type === 'refresh'
              ? 'runFailed'
              : type === 'import-archive'
                ? 'importFailed'
                : type === 'export-archive'
                  ? 'exportFailed'
                  : 'remoteSyncFailed';
          notice(t(noticeKey, { error: outcome.error }), 'error');
          shell.setStatus(t('statusFailed'), 'error');
        }
        if (type === 'refresh') settleRefresh(outcome);
        return outcome;
      })
      .finally(() => {
        if (inFlight.get(type) === operation) inFlight.delete(type);
      });
    inFlight.set(type, operation);
    return operation;
  }
  function startRefresh({ open = true }: { open?: boolean } = {}) {
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
          foregroundStatus(
            sequence,
            outcome.status === 'partial' ? 'statusFailed' : 'statusUpdated',
            outcome.status === 'partial' ? 'error' : 'success',
          );
          if (outcome.status === 'partial') notice(t('saveArchiveFailed', { error: outcome.error }), 'error');
        }
        commitPresentation();
      }
      settleRefresh(outcome);
      return outcome;
    });
  }
  function open(view?: string): Promise<PanelOperationOutcome> {
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
        if (outcome.status === 'error' || outcome.status === 'partial')
          notice(t('remoteSyncFailed', { error: outcome.error }), 'error');
        else if (outcome.status === 'skipped') notice(t('remoteSyncSkipped', { status: outcome.reason }), 'info');
        foregroundStatus(
          sequence,
          outcome.status === 'error' || outcome.status === 'partial' ? 'statusFailed' : 'statusUpdated',
          outcome.status === 'error' || outcome.status === 'partial' ? 'error' : 'success',
        );
      }
      return outcome;
    });
  }
  function saveSettings() {
    return once('save-remote-sync', async () => {
      if (!content?.querySelector('[data-sync-form]'))
        return { status: 'skipped', reason: 'form-unavailable', completed: [] };
      const status: Partial<RemoteSyncStatus> = snapshot?.syncStatus || {};
      const values = syncDraft || { token: '', gistId: status.gistId || '', enabled: Boolean(status.enabled) };
      const generation = formGeneration;
      const revision = editRevision;
      const sequence = ++foreground;
      const outcome = await application.configureSync(values);
      if (disposed) return outcome;
      if (outcome.completed?.includes('settings') && generation === formGeneration && revision === editRevision) {
        // The committed token must leave the DOM. A new edit or form owns its
        // own value and cannot be cleared by this completion.
        syncDraft = null;
        presentation = 'snapshot';
        commitPresentation();
      }
      if (outcome.reason === 'token-required') notice(t('remoteSyncTokenRequired'), 'error');
      else if (outcome.status === 'error' || outcome.status === 'partial')
        notice(t('remoteSyncFailed', { error: outcome.error || outcome.reason }), 'error');
      foregroundStatus(
        sequence,
        outcome.status === 'ok' ? 'statusUpdated' : 'statusFailed',
        outcome.status === 'ok' ? 'success' : 'error',
      );
      return outcome;
    });
  }
  function importArchive() {
    return once('import-archive', async () => {
      const picked = await files.chooseText({ signal: abortFiles.signal });
      if (disposed || picked?.status === 'cancelled' || picked == null)
        return { status: 'skipped', reason: disposed ? 'disposed' : 'cancelled', completed: [] };
      let imported: unknown;
      try {
        imported = JSON.parse(picked.text);
      } catch (error) {
        const outcome = { status: 'error', completed: ['select'], stage: 'parse', error: (error as Error).message };
        notice(t('importFailed', { error: outcome.error }), 'error');
        return outcome as PanelOperationOutcome;
      }
      const outcome = await application.importArchive(imported);
      if (!disposed) {
        if (outcome.status === 'ok') notice(t('importDone', outcome.report as MaybeTranslationVars), 'success');
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
      try {
        await files.downloadText(EXPORT_NAME, JSON.stringify(exported, null, 2));
      } catch (error) {
        const outcome: PanelOperationOutcome = {
          status: 'error',
          completed: ['export'],
          stage: 'download',
          error: (error as OperationError)?.message || String(error),
        };
        notice(t('exportFailed', { error: outcome.error }), 'error');
        return outcome;
      }
      if (!disposed) notice(t('exportDone', { count: exported.snapshotCount }), 'success');
      return { status: 'ok', completed: ['export', 'download'], count: exported.snapshotCount };
    });
  }
  function dispatch(command: PanelCommand | string): Promise<PanelOperationOutcome> {
    if (disposed) return Promise.resolve({ status: 'skipped', reason: 'disposed', completed: [] });
    const type = typeof command === 'string' ? command : command?.type;
    if (type === 'open') return open((command as PanelCommand)?.view);
    if (type === 'refresh') return startRefresh({ open: (command as PanelCommand)?.open !== false });
    if (type === 'sync') return sync();
    if (type === 'save-remote-sync') return saveSettings();
    if (type === 'import-archive') return importArchive();
    if (type === 'export-archive') return exportArchive();
    return Promise.resolve({ status: 'skipped', reason: 'unknown-command', completed: [] });
  }
  function rerenderActive(nextView?: string) {
    if (disposed || !content) return;
    if (nextView && nextView !== activePanelView) {
      syncDraft = null;
      formGeneration++;
      statsDrill = null;
      activePanelView = nextView;
    }
    commitPresentation();
  }
  function handleAction(action: string, event: MouseEvent) {
    if (disposed || action === 'toggle') return;
    if (action === 'close') {
      shell.closePanel();
      return;
    }
    if (action === 'refresh') {
      void dispatch({ type: 'refresh' });
      return;
    }
    if (action === 'sync-remote') {
      void dispatch({ type: 'sync' });
      return;
    }
    if (action === 'save-remote-sync') {
      void dispatch({ type: 'save-remote-sync' });
      return;
    }
    if (action === 'import-archive' || action === 'export-archive') {
      void dispatch({ type: action });
      return;
    }
    const target = event.target as Element;
    if (action === 'switch-view') {
      rerenderActive(target.closest<HTMLElement>('[data-view]')?.dataset.view);
      return;
    }
    if (action === 'toggle-rows') {
      const id = target.closest<HTMLElement>('[data-view-id]')?.dataset.viewId;
      if (id) {
        if (expandedViews.has(id)) expandedViews.delete(id);
        else expandedViews.add(id);
        rerenderActive();
      }
    }
    if (action === 'switch-stats-period') {
      activeStatsPeriod = target.closest<HTMLElement>('[data-period]')?.dataset.period || activeStatsPeriod;
      statsDrill = null;
      rerenderActive();
    }
    if (action === 'stats-drill') {
      const node = target.closest<HTMLElement>('[data-from]');
      if (node?.dataset.from && node?.dataset.to) {
        statsDrill = {
          from: node.dataset.from,
          to: node.dataset.to,
          label: node.dataset.label || `${node.dataset.from} ~ ${node.dataset.to}`,
        };
        rerenderActive();
      }
    }
    if (action === 'stats-drill-back') {
      statsDrill = null;
      rerenderActive();
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    abortFiles.abort();
    files.dispose?.();
    if (content) render(null, content);
    toaster?.destroy?.();
    shell.destroy();
  }
  return { update, dispatch, dispose };
}

export type QuotaPanelController = ReturnType<typeof createQuotaPanelController>;

export { createQuotaPanelController, createBrowserQuotaFiles };
