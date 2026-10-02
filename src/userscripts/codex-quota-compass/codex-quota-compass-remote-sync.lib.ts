import pLimit from 'p-limit';
import * as v from 'valibot';
import { resolveGmApi } from '../shared/shared-gm.lib.ts';
import {
  EXPORT_FORMAT,
  buildSnapshotExportDocument,
  exportDocumentContentKey,
  previewImportArchiveDocument,
} from './codex-quota-compass-archive.lib.ts';
import type { GmOverrides } from '../shared/shared-gm.lib.ts';
import type {
  ArchiveMergeReport,
  SnapshotArchive,
  SnapshotArchiveStore,
  SnapshotArchiveSummary,
  SnapshotExportDocument,
} from './codex-quota-compass-archive.lib.ts';

export type RemoteSyncSettings = v.InferOutput<typeof RemoteSyncSettingsSchema>;
export type RemoteSyncSettingsPatch = Partial<RemoteSyncSettings>;
export interface RemoteSyncSettingsStore {
  read(): Promise<RemoteSyncSettings>;
  write(nextSettings: unknown): Promise<RemoteSyncSettings>;
}
export type RemoteState = 'idle' | 'failed' | 'unknown';
/** Credential-free view of the sync settings. */
export interface RemoteSyncStatus {
  enabled: boolean;
  configured: boolean;
  provider: string;
  providerLabel: string;
  endpoint: string;
  gistId: string;
  filename: string;
  clientId: string;
  hasToken: boolean;
  lastSyncedAt: string;
  lastError: string;
  remoteState: RemoteState;
}
export type HttpMethod = 'GET' | 'POST' | 'PATCH';
export interface JsonRequest {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}
export type RequestJson = (request: JsonRequest) => Promise<unknown>;
export interface FetchRequesterOptions {
  fetchImpl?: typeof fetch | null;
}
interface HttpError extends Error {
  status?: number;
}
interface GistFilePayload {
  truncated?: boolean;
  raw_url?: string;
  content?: string;
}
export interface GistPayload {
  id?: string;
  description?: string;
  files?: Record<string, GistFilePayload | undefined>;
}
export type RemoteSyncArchiveStore = Pick<
  SnapshotArchiveStore,
  'loadArchive' | 'importArchiveDocument' | 'summarizeArchive'
>;
export interface RemoteSyncClientOptions {
  archiveStore: RemoteSyncArchiveStore;
  settingsStore?: RemoteSyncSettingsStore;
  requestJson?: RequestJson;
  now?: () => string;
}
export type RemoteSyncOutcome =
  | { status: 'disabled' | 'unconfigured' | 'superseded'; settings: RemoteSyncStatus }
  | {
      status: 'synced';
      settings: RemoteSyncStatus;
      remoteReport: { created: boolean; updated?: boolean; gistId?: string };
      localReport: ArchiveMergeReport;
      summary: SnapshotArchiveSummary;
      archive: SnapshotArchive;
    };
export type SyncPhase = 'persistence' | 'sync';
/** Error thrown by `syncNow` after recording the failure. */
export interface RemoteSyncFailure extends Error {
  localMerged: boolean;
  phase: SyncPhase;
  remoteState: 'unknown' | 'failed';
}
type SyncCaughtError = (HttpError & { superseded?: boolean; latest?: RemoteSyncSettings }) | null | undefined;
export interface RemoteSyncFormValues {
  token?: string | null;
  gistId?: string | null;
  enabled?: unknown;
}
export type RemoteSyncSavePlan =
  | { ok: false; reason: 'token-required' }
  | { ok: true; patch: { enabled: boolean; gistId: string; token?: string }; syncAfter: boolean };
export type RemoteSyncClient = ReturnType<typeof createRemoteSyncClient>;
interface GistApiOptions {
  requestJson: RequestJson;
  token: string;
  filename: string;
}

const REMOTE_SYNC_SETTINGS_KEY = 'codexQuotaCompassRemoteSyncSettings';
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_VERSION = '2026-03-10';
const GIST_DESCRIPTION = 'Codex Quota Compass Snapshot Archive';
const GIST_FILENAME = 'codex-quota-compass-snapshot-archive.v1.json';
// Read both the legacy full-snapshot doc (v1) and the new ledger doc (v2).
const SUPPORTED_IMPORT_VERSIONS = new Set([1, 2]);
const UNKNOWN_WRITE_PREFIX = 'Remote write outcome unknown. Verify the Gist before retrying. ';

function maybePromise(value: unknown): Promise<unknown> {
  return value && typeof (value as PromiseLike<unknown>).then === 'function'
    ? (value as Promise<unknown>)
    : Promise.resolve(value);
}

function describeHttpStatus(status: number): string {
  if (status === 401) {
    return 'GitHub rejected the token (HTTP 401). Check the token and its Gists permission.';
  }
  if (status === 403) {
    return 'GitHub denied the request (HTTP 403). The token may lack Gists scope or be rate limited.';
  }
  if (status === 404) {
    return 'GitHub Gist was not found (HTTP 404).';
  }
  return `GitHub Gist sync request failed with HTTP ${status}.`;
}

function httpError(status: number): HttpError {
  const error: HttpError = new Error(describeHttpStatus(status));
  error.status = status;
  return error;
}

function createClientId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeGistId(gistId: unknown): string {
  return String(gistId || '').trim();
}

function normalizeFilename(filename: unknown): string {
  const trimmed = String(filename || '').trim();
  return trimmed || GIST_FILENAME;
}

// Missing keys still run through the transform, so defaults apply uniformly.
const coerce = <T>(transform: (value: unknown) => T) =>
  v.pipe(
    v.optional(v.unknown(), () => undefined),
    v.transform(transform),
  );

const RemoteSyncSettingsSchema = v.object({
  enabled: coerce(Boolean),
  provider: coerce(() => 'github-gist'),
  token: v.fallback(v.string(), ''),
  gistId: coerce(normalizeGistId),
  filename: coerce(normalizeFilename),
  clientId: v.fallback(
    v.pipe(
      v.string(),
      v.check((value) => value.trim() !== ''),
    ),
    createClientId,
  ),
  lastSyncedAt: v.fallback(v.string(), ''),
  lastError: v.fallback(v.string(), ''),
});

const SupportedExportDocumentSchema = v.object({
  format: v.literal(EXPORT_FORMAT),
  version: v.picklist([...SUPPORTED_IMPORT_VERSIONS]),
});

function normalizeSettings(rawSettings: unknown): RemoteSyncSettings {
  return v.parse(RemoteSyncSettingsSchema, rawSettings && typeof rawSettings === 'object' ? rawSettings : {});
}

function createGmSettingsStore(options: GmOverrides = {}): RemoteSyncSettingsStore {
  async function readRaw(): Promise<unknown> {
    const { getValue } = resolveGmApi(options);
    if (getValue) {
      return maybePromise(getValue(REMOTE_SYNC_SETTINGS_KEY, null));
    }

    throw new Error('GM storage is required for remote sync settings.');
  }

  async function writeRaw(settings: RemoteSyncSettings): Promise<RemoteSyncSettings> {
    const { setValue } = resolveGmApi(options);
    if (setValue) {
      await maybePromise(setValue(REMOTE_SYNC_SETTINGS_KEY, settings));
      return settings;
    }

    throw new Error('GM storage is required for remote sync settings.');
  }

  return {
    async read() {
      return normalizeSettings(await readRaw());
    },

    async write(nextSettings: unknown) {
      const normalized = normalizeSettings(nextSettings);
      await writeRaw(normalized);
      return normalized;
    },
  };
}

function createFetchJsonRequester(options: FetchRequesterOptions = {}): RequestJson {
  const fetchImpl =
    options.fetchImpl || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is required for GitHub Gist sync.');
  }

  return async function requestJson({ method, url, headers = {}, body, timeout = 15000 }: JsonRequest) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller ? globalThis.setTimeout(() => controller.abort(), timeout) : null;

    try {
      const response = await fetchImpl(url, {
        method,
        mode: 'cors',
        credentials: 'omit',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller?.signal,
      });

      if (!response.ok) {
        throw httpError(response.status);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if ((error as Error | null)?.name === 'AbortError') {
        throw new Error('GitHub Gist sync request timed out.', { cause: error });
      }
      if (error instanceof SyntaxError) {
        throw new Error('GitHub Gist sync response is not valid JSON.', { cause: error });
      }
      throw error;
    } finally {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
    }
  };
}

function getGmXmlHttpRequest(options: GmOverrides = {}) {
  return resolveGmApi(options).xmlHttpRequest;
}

function createGmJsonRequester(options: GmOverrides = {}): RequestJson {
  const gmXmlhttpRequest = getGmXmlHttpRequest(options);
  if (!gmXmlhttpRequest) {
    throw new Error('GM_xmlhttpRequest is required for GitHub Gist sync.');
  }

  return function requestJson({ method, url, headers = {}, body, timeout = 15000 }: JsonRequest) {
    return new Promise((resolve, reject) => {
      gmXmlhttpRequest({
        method,
        url,
        timeout,
        headers,
        data: body === undefined ? undefined : JSON.stringify(body),
        onload: (response) => {
          const status = Number(response?.status) || 0;
          const text = String(response?.responseText || '');
          if (status < 200 || status >= 300) {
            reject(httpError(status));
            return;
          }

          try {
            resolve(text ? JSON.parse(text) : null);
          } catch {
            reject(new Error('GitHub Gist sync response is not valid JSON.'));
          }
        },
        onerror: () => reject(new Error('GitHub Gist sync network request failed.')),
        ontimeout: () => reject(new Error('GitHub Gist sync request timed out.')),
      } as Tampermonkey.Request);
    });
  };
}

function createJsonRequester(options: GmOverrides & FetchRequesterOptions = {}): RequestJson {
  return getGmXmlHttpRequest(options) ? createGmJsonRequester(options) : createFetchJsonRequester(options);
}

function createArchiveExportDocument(archive: unknown, exportedAt: string): SnapshotExportDocument {
  // Delegate to the archive lib so the pushed payload is the compact v2 shape
  // (per-day ledger + last 5 snapshots) instead of full per-snapshot history.
  return buildSnapshotExportDocument(archive || { snapshots: [] }, exportedAt);
}

function createEmptyExportDocument(exportedAt: string): SnapshotExportDocument {
  return createArchiveExportDocument({ snapshots: [] }, exportedAt);
}

function publicStatus(settings: RemoteSyncSettings): RemoteSyncStatus {
  const gistLabel = settings.gistId ? `GitHub Gist ${settings.gistId}` : 'GitHub Gist';
  return {
    enabled: Boolean(settings.enabled),
    configured: Boolean(settings.token),
    provider: settings.provider,
    providerLabel: 'GitHub Gist',
    endpoint: gistLabel,
    gistId: settings.gistId,
    filename: settings.filename,
    clientId: settings.clientId,
    hasToken: Boolean(settings.token),
    lastSyncedAt: settings.lastSyncedAt,
    lastError: settings.token ? settings.lastError.split(settings.token).join('[redacted]') : settings.lastError,
    remoteState: settings.lastError?.startsWith(UNKNOWN_WRITE_PREFIX)
      ? 'unknown'
      : settings.lastError
        ? 'failed'
        : 'idle',
  };
}

function gitHubHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    ...extra,
  };
}

function gistHasArchiveFile(gist: GistPayload | null | undefined, filename: string): boolean {
  return Boolean(gist?.files?.[filename]);
}

function pickArchiveGist(gists: unknown, filename: string): GistPayload | null {
  return (
    (Array.isArray(gists) ? gists : []).find(
      (gist) => gist?.description === GIST_DESCRIPTION && gistHasArchiveFile(gist, filename),
    ) || null
  );
}

function validateArchiveDocument(documentObject: unknown) {
  if (!v.is(SupportedExportDocumentSchema, documentObject)) {
    throw new Error('GitHub Gist archive file is not a supported Snapshot Export.');
  }
  return documentObject;
}

async function archiveDocumentFromGist(
  gist: GistPayload,
  filename: string,
  now: () => string,
  requestJson: RequestJson,
): Promise<unknown> {
  const file = gist?.files?.[filename];
  if (!file) return createEmptyExportDocument(now());
  if (file.truncated) {
    if (!file.raw_url) {
      throw new Error('GitHub Gist archive file is truncated and has no raw URL.');
    }

    return validateArchiveDocument(
      await requestJson({
        method: 'GET',
        url: file.raw_url,
        headers: { Accept: 'application/json' },
      }),
    );
  }

  const content = String(file.content || '').trim();
  if (!content) return createEmptyExportDocument(now());

  return validateArchiveDocument(JSON.parse(content));
}

function archiveFilePayload(archive: unknown, exportedAt: string): string {
  // Compact (no pretty-print) to keep the synced blob small.
  return JSON.stringify(createArchiveExportDocument(archive, exportedAt));
}

// Compare two export documents by the content that actually matters for sync
// convergence (ledger + retained snapshots), ignoring the always-changing
// `exportedAt` / `snapshotCount` envelope fields so an unchanged archive is
// not re-pushed on every page open.
function sameArchiveContent(left: SnapshotExportDocument, right: SnapshotExportDocument): boolean {
  return exportDocumentContentKey(left) === exportDocumentContentKey(right);
}

const GIST_PAGE_SIZE = 100;
const GIST_MAX_PAGES = 10;

function createGitHubGistApi({ requestJson, token, filename }: GistApiOptions) {
  function listGistsPage(page: number): Promise<unknown> {
    const url =
      page <= 1
        ? `${GITHUB_API_BASE}/gists?per_page=${GIST_PAGE_SIZE}`
        : `${GITHUB_API_BASE}/gists?per_page=${GIST_PAGE_SIZE}&page=${page}`;
    return requestJson({ method: 'GET', url, headers: gitHubHeaders(token) });
  }

  async function getGist(gistId: string): Promise<GistPayload> {
    return requestJson({
      method: 'GET',
      url: `${GITHUB_API_BASE}/gists/${encodeURIComponent(gistId)}`,
      headers: gitHubHeaders(token),
    }) as Promise<GistPayload>;
  }

  async function createGist(archive: unknown, exportedAt: string): Promise<GistPayload> {
    return requestJson({
      method: 'POST',
      url: `${GITHUB_API_BASE}/gists`,
      headers: gitHubHeaders(token, { 'Content-Type': 'application/json' }),
      body: {
        description: GIST_DESCRIPTION,
        public: false,
        files: {
          [filename]: {
            content: archiveFilePayload(archive, exportedAt),
          },
        },
      },
    }) as Promise<GistPayload>;
  }

  async function updateGist(gistId: string, archive: unknown, exportedAt: string): Promise<GistPayload> {
    return requestJson({
      method: 'PATCH',
      url: `${GITHUB_API_BASE}/gists/${encodeURIComponent(gistId)}`,
      headers: gitHubHeaders(token, { 'Content-Type': 'application/json' }),
      body: {
        files: {
          [filename]: {
            content: archiveFilePayload(archive, exportedAt),
          },
        },
      },
    }) as Promise<GistPayload>;
  }

  async function findExistingArchiveGist(): Promise<GistPayload | null> {
    // Paginate so users with more than one page of gists do not silently miss
    // their archive gist and create a duplicate on every sync.
    for (let page = 1; page <= GIST_MAX_PAGES; page += 1) {
      const gists = await listGistsPage(page);
      const list = Array.isArray(gists) ? gists : [];
      const match = pickArchiveGist(list, filename);
      if (match) return match;
      if (list.length < GIST_PAGE_SIZE) break;
    }
    return null;
  }

  return {
    createGist,
    findExistingArchiveGist,
    getGist,
    updateGist,
  };
}

function createRemoteSyncClient(
  {
    archiveStore,
    settingsStore = createGmSettingsStore(),
    requestJson = createJsonRequester(),
    now = () => new Date().toISOString(),
  }: RemoteSyncClientOptions = {} as RemoteSyncClientOptions,
) {
  if (!archiveStore?.loadArchive || !archiveStore?.importArchiveDocument) {
    throw new Error('Remote sync requires a Snapshot Archive store.');
  }

  const queue = pLimit(1);
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return queue(operation);
  }

  async function getSettings(): Promise<RemoteSyncSettings> {
    return settingsStore.read();
  }

  async function saveSettings(nextSettings: unknown): Promise<RemoteSyncSettings> {
    return settingsStore.write(nextSettings);
  }

  async function configure(patch: RemoteSyncSettingsPatch = {}): Promise<RemoteSyncStatus> {
    const current = await getSettings();
    const next = {
      ...current,
      ...patch,
      provider: 'github-gist',
      gistId: patch.gistId === undefined ? current.gistId : normalizeGistId(patch.gistId),
      filename: patch.filename === undefined ? current.filename : normalizeFilename(patch.filename),
      token: patch.token === undefined ? current.token : String(patch.token || '').trim(),
      clientId: current.clientId || createClientId(),
      lastError: '',
    };
    return publicStatus(await saveSettings(next));
  }

  async function getStatus(): Promise<RemoteSyncStatus> {
    return publicStatus(await getSettings());
  }

  // A sync belongs to the settings it started with. Another tab may disable
  // sync or change the token, Gist or file while requests are in flight; the
  // stored settings then win and this sync's outcome is discarded.
  function isSameSyncTarget(started: RemoteSyncSettings, latest: RemoteSyncSettings): boolean {
    return (
      latest.enabled &&
      Boolean(latest.token) &&
      latest.token === started.token &&
      latest.gistId === started.gistId &&
      latest.filename === started.filename
    );
  }

  function supersededError(latest: RemoteSyncSettings) {
    return Object.assign(new Error('GitHub Gist sync settings changed during sync.'), {
      superseded: true,
      latest,
    });
  }

  async function assertSyncTargetCurrent(started: RemoteSyncSettings): Promise<void> {
    const latest = await getSettings();
    if (!isSameSyncTarget(started, latest)) throw supersededError(latest);
  }

  // Writes only the fields a sync produces, onto the latest stored settings.
  async function saveSyncOutcome(
    started: RemoteSyncSettings,
    outcome: RemoteSyncSettingsPatch,
  ): Promise<RemoteSyncSettings> {
    const latest = await getSettings();
    if (!isSameSyncTarget(started, latest)) return latest;
    return saveSettings({ ...latest, ...outcome });
  }

  async function markSyncFailure(settings: RemoteSyncSettings, error: unknown): Promise<string> {
    const rawMessage = (error as Error | null)?.message || String(error);
    const message = settings.token ? rawMessage.split(settings.token).join('[redacted]') : rawMessage;
    await saveSyncOutcome(settings, { lastError: message });
    return message;
  }

  function supersededResult(latest: RemoteSyncSettings): RemoteSyncOutcome {
    return { status: latest.enabled ? 'superseded' : 'disabled', settings: publicStatus(latest) };
  }

  async function syncNow(): Promise<RemoteSyncOutcome> {
    const settings = await getSettings();
    if (!settings.enabled) {
      return { status: 'disabled', settings: publicStatus(settings) };
    }
    if (!settings.token) {
      return { status: 'unconfigured', settings: publicStatus(settings) };
    }

    let localMerged = false;
    let remoteWritePending = false;
    let phase: SyncPhase = 'persistence';
    try {
      await archiveStore.loadArchive();
      phase = 'sync';
      const exportedAt = now();
      const gistApi = createGitHubGistApi({
        requestJson,
        token: settings.token,
        filename: settings.filename,
      });
      let gist: GistPayload | null = null;
      if (settings.gistId) {
        try {
          gist = await gistApi.getGist(settings.gistId);
        } catch (error) {
          // A stored gist id can go stale if the gist was deleted remotely.
          // Recover by rediscovering or recreating instead of failing forever.
          if ((error as SyncCaughtError)?.status !== 404) throw error;
          gist = null;
        }
      }

      if (!gist) {
        const candidate = await gistApi.findExistingArchiveGist();
        gist = candidate?.id ? await gistApi.getGist(candidate.id) : null;
      }

      if (!gist) {
        phase = 'persistence';
        const localArchive = await archiveStore.loadArchive();
        phase = 'sync';
        await assertSyncTargetCurrent(settings);
        remoteWritePending = true;
        gist = await gistApi.createGist(localArchive, exportedAt);
        remoteWritePending = false;
        const savedSettings = await saveSyncOutcome(settings, {
          gistId: gist.id!,
          lastSyncedAt: exportedAt,
          lastError: '',
        });
        return {
          status: 'synced',
          settings: publicStatus(savedSettings),
          remoteReport: { created: true, gistId: gist.id },
          localReport: { added: 0, skipped: 0, invalid: 0 },
          summary: await archiveStore.summarizeArchive(),
          archive: localArchive,
        };
      }

      const remoteDocument = await archiveDocumentFromGist(gist, settings.filename, now, requestJson);
      phase = 'persistence';
      const imported = await archiveStore.importArchiveDocument(remoteDocument);
      localMerged = true;
      phase = 'sync';
      // Write back whenever the merged content (ledger or retained snapshots)
      // differs from what the remote currently holds. A snapshot-count check is
      // not enough: the ledger keeps growing one row per settled day while the
      // snapshot list stays capped at 5, so a count comparison would never push
      // newly settled days once the cap is reached. Comparing the stable content
      // (ledger + snapshots, ignoring the always-changing exportedAt/snapshotCount)
      // still avoids a redundant gist revision when nothing actually changed.
      const mergedDocument = buildSnapshotExportDocument(imported.archive, exportedAt);
      // Normalize the remote document through the same archive pipeline before
      // comparing, so a v1 (no-ledger, raw-snapshot) remote and the merged v2
      // document are compared on equal footing instead of always looking
      // "different" due to shape/normalization noise.
      const remoteNormalized = buildSnapshotExportDocument(
        previewImportArchiveDocument({ snapshots: [] }, remoteDocument, Date.parse(exportedAt) || Date.now()).archive,
        exportedAt,
      );
      const remoteNeedsUpdate = !sameArchiveContent(mergedDocument, remoteNormalized);
      if (remoteNeedsUpdate) await assertSyncTargetCurrent(settings);
      remoteWritePending = remoteNeedsUpdate;
      const updatedGist = remoteNeedsUpdate ? await gistApi.updateGist(gist.id!, imported.archive, now()) : gist;
      remoteWritePending = false;
      const savedSettings = await saveSyncOutcome(settings, {
        gistId: updatedGist.id || gist.id,
        lastSyncedAt: now(),
        lastError: '',
      });

      return {
        status: 'synced',
        settings: publicStatus(savedSettings),
        remoteReport: { created: false, updated: remoteNeedsUpdate, gistId: updatedGist.id || gist.id },
        localReport: imported.report,
        summary: imported.summary,
        archive: imported.archive,
      };
    } catch (error) {
      // Nothing was pushed; a completed local merge stays, as on any failure.
      if ((error as SyncCaughtError)?.superseded) return supersededResult((error as SyncCaughtError)!.latest!);
      const unknown = remoteWritePending && !(error as SyncCaughtError)?.status;
      const failure = unknown
        ? new Error(UNKNOWN_WRITE_PREFIX + ((error as SyncCaughtError)?.message || String(error)))
        : error;
      const message = await markSyncFailure(settings, failure).catch(
        () => 'GitHub Gist sync failed; status could not be saved.',
      );
      throw Object.assign(new Error(message), {
        localMerged,
        phase,
        remoteState: unknown ? 'unknown' : 'failed',
      });
    }
  }

  return {
    configure: (patch?: RemoteSyncSettingsPatch) => enqueue(() => configure(patch)),
    getSettings: () => enqueue(getSettings),
    getStatus: () => enqueue(getStatus),
    syncNow: () => enqueue(syncNow),
  };
}

function planRemoteSyncSave(
  formValues: RemoteSyncFormValues = {},
  currentStatus: Partial<Pick<RemoteSyncStatus, 'hasToken'>> = {},
): RemoteSyncSavePlan {
  const token = String(formValues.token || '').trim();
  const gistId = String(formValues.gistId || '').trim();
  const enabled = Boolean(formValues.enabled);
  const hasToken = Boolean(currentStatus.hasToken);

  if (enabled && !token && !hasToken) {
    return { ok: false, reason: 'token-required' };
  }

  return {
    ok: true,
    patch: {
      enabled,
      gistId,
      ...(token ? { token } : {}),
    },
    syncAfter: enabled && (Boolean(token) || hasToken),
  };
}

export {
  GIST_DESCRIPTION,
  GIST_FILENAME,
  GITHUB_API_BASE,
  GITHUB_API_VERSION,
  REMOTE_SYNC_SETTINGS_KEY,
  createFetchJsonRequester,
  createGmJsonRequester,
  createJsonRequester,
  createGmSettingsStore,
  createRemoteSyncClient,
  normalizeSettings,
  planRemoteSyncSave,
};
