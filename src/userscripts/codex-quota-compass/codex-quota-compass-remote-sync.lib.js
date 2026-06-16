(function attachCodexQuotaCompassRemoteSyncLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassRemoteSyncLib';
  const REMOTE_SYNC_SETTINGS_KEY = 'codexQuotaCompassRemoteSyncSettings';
  const DEFAULT_SYNC_DEBOUNCE_MS = 5000;
  const GITHUB_API_BASE = 'https://api.github.com';
  const GITHUB_API_VERSION = '2026-03-10';
  const GIST_DESCRIPTION = 'Codex Quota Compass Snapshot Archive';
  const GIST_FILENAME = 'codex-quota-compass-snapshot-archive.v1.json';
  const archiveLib = globalObject.CodexQuotaCompassArchiveLib;
  if (!archiveLib?.EXPORT_FORMAT || !archiveLib?.EXPORT_VERSION) {
    throw new Error('CodexQuotaCompassArchiveLib is required before CodexQuotaCompassRemoteSyncLib.');
  }
  const { EXPORT_FORMAT, EXPORT_VERSION } = archiveLib;

  function maybePromise(value) {
    return value && typeof value.then === 'function' ? value : Promise.resolve(value);
  }

  function describeHttpStatus(status) {
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

  function httpError(status) {
    const error = new Error(describeHttpStatus(status));
    error.status = status;
    return error;
  }

  function createClientId() {
    if (globalObject.crypto?.randomUUID) return globalObject.crypto.randomUUID();
    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeGistId(gistId) {
    return String(gistId || '').trim();
  }

  function normalizeFilename(filename) {
    const trimmed = String(filename || '').trim();
    return trimmed || GIST_FILENAME;
  }

  function normalizeSettings(rawSettings) {
    const source = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
    const token = typeof source.token === 'string' ? source.token : '';

    return {
      enabled: Boolean(source.enabled),
      provider: 'github-gist',
      token,
      gistId: normalizeGistId(source.gistId),
      filename: normalizeFilename(source.filename),
      clientId: typeof source.clientId === 'string' && source.clientId.trim()
        ? source.clientId
        : createClientId(),
      lastSyncedAt: typeof source.lastSyncedAt === 'string' ? source.lastSyncedAt : '',
      lastError: typeof source.lastError === 'string' ? source.lastError : '',
    };
  }

  function createGmSettingsStore(options = {}) {
    async function readRaw() {
      const gmGetValue = options.gmGetValue || (typeof GM_getValue === 'function' ? GM_getValue : null);
      if (typeof gmGetValue === 'function') {
        return maybePromise(gmGetValue(REMOTE_SYNC_SETTINGS_KEY, null));
      }

      const gmApi = options.gm || (typeof GM !== 'undefined' ? GM : null);
      if (typeof gmApi?.getValue === 'function') {
        return gmApi.getValue(REMOTE_SYNC_SETTINGS_KEY, null);
      }

      throw new Error('GM storage is required for remote sync settings.');
    }

    async function writeRaw(settings) {
      const gmSetValue = options.gmSetValue || (typeof GM_setValue === 'function' ? GM_setValue : null);
      if (typeof gmSetValue === 'function') {
        await maybePromise(gmSetValue(REMOTE_SYNC_SETTINGS_KEY, settings));
        return settings;
      }

      const gmApi = options.gm || (typeof GM !== 'undefined' ? GM : null);
      if (typeof gmApi?.setValue === 'function') {
        await gmApi.setValue(REMOTE_SYNC_SETTINGS_KEY, settings);
        return settings;
      }

      throw new Error('GM storage is required for remote sync settings.');
    }

    return {
      async read() {
        return normalizeSettings(await readRaw());
      },

      async write(nextSettings) {
        const normalized = normalizeSettings(nextSettings);
        await writeRaw(normalized);
        return normalized;
      },
    };
  }

  function createFetchJsonRequester(options = {}) {
    const fetchImpl = options.fetchImpl
      || (typeof globalObject.fetch === 'function' ? globalObject.fetch.bind(globalObject) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error('fetch is required for GitHub Gist sync.');
    }

    return async function requestJson({ method, url, headers = {}, body, timeout = 15000 }) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller
        ? globalObject.setTimeout(() => controller.abort(), timeout)
        : null;

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
        if (error?.name === 'AbortError') {
          throw new Error('GitHub Gist sync request timed out.');
        }
        if (error instanceof SyntaxError) {
          throw new Error('GitHub Gist sync response is not valid JSON.');
        }
        throw error;
      } finally {
        if (timeoutId) globalObject.clearTimeout(timeoutId);
      }
    };
  }

  function getGmXmlHttpRequest(options = {}) {
    if (typeof options.gmXmlhttpRequest === 'function') return options.gmXmlhttpRequest;
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    const gmApi = options.gm || (typeof GM !== 'undefined' ? GM : null);
    if (typeof gmApi?.xmlHttpRequest === 'function') return gmApi.xmlHttpRequest.bind(gmApi);
    if (typeof gmApi?.xmlhttpRequest === 'function') return gmApi.xmlhttpRequest.bind(gmApi);
    return null;
  }

  function createGmJsonRequester(options = {}) {
    const gmXmlhttpRequest = getGmXmlHttpRequest(options);
    if (!gmXmlhttpRequest) {
      throw new Error('GM_xmlhttpRequest is required for GitHub Gist sync.');
    }

    return function requestJson({ method, url, headers = {}, body, timeout = 15000 }) {
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
        });
      });
    };
  }

  function createJsonRequester(options = {}) {
    return getGmXmlHttpRequest(options)
      ? createGmJsonRequester(options)
      : createFetchJsonRequester(options);
  }

  function createArchiveExportDocument(archive, exportedAt) {
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt,
      snapshotCount: Array.isArray(archive?.snapshots) ? archive.snapshots.length : 0,
      snapshots: Array.isArray(archive?.snapshots) ? archive.snapshots : [],
    };
  }

  function createEmptyExportDocument(exportedAt) {
    return createArchiveExportDocument({ snapshots: [] }, exportedAt);
  }

  function publicStatus(settings) {
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
      lastError: settings.lastError,
    };
  }

  function gitHubHeaders(token, extra = {}) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      ...extra,
    };
  }

  function gistHasArchiveFile(gist, filename) {
    return Boolean(gist?.files?.[filename]);
  }

  function pickArchiveGist(gists, filename) {
    return (Array.isArray(gists) ? gists : [])
      .find((gist) => gist?.description === GIST_DESCRIPTION && gistHasArchiveFile(gist, filename))
      || null;
  }

  function validateArchiveDocument(documentObject) {
    if (documentObject?.format !== EXPORT_FORMAT || documentObject?.version !== EXPORT_VERSION) {
      throw new Error('GitHub Gist archive file is not a supported Snapshot Export.');
    }
    return documentObject;
  }

  async function archiveDocumentFromGist(gist, filename, now, requestJson) {
    const file = gist?.files?.[filename];
    if (!file) return createEmptyExportDocument(now());
    if (file.truncated) {
      if (!file.raw_url) {
        throw new Error('GitHub Gist archive file is truncated and has no raw URL.');
      }

      return validateArchiveDocument(await requestJson({
        method: 'GET',
        url: file.raw_url,
        headers: { Accept: 'application/json' },
      }));
    }

    const content = String(file.content || '').trim();
    if (!content) return createEmptyExportDocument(now());

    return validateArchiveDocument(JSON.parse(content));
  }

  function archiveFilePayload(archive, exportedAt) {
    return JSON.stringify(createArchiveExportDocument(archive, exportedAt), null, 2);
  }

  const GIST_PAGE_SIZE = 100;
  const GIST_MAX_PAGES = 10;

  function createGitHubGistApi({ requestJson, token, filename }) {
    function listGistsPage(page) {
      const url = page <= 1
        ? `${GITHUB_API_BASE}/gists?per_page=${GIST_PAGE_SIZE}`
        : `${GITHUB_API_BASE}/gists?per_page=${GIST_PAGE_SIZE}&page=${page}`;
      return requestJson({ method: 'GET', url, headers: gitHubHeaders(token) });
    }

    async function getGist(gistId) {
      return requestJson({
        method: 'GET',
        url: `${GITHUB_API_BASE}/gists/${encodeURIComponent(gistId)}`,
        headers: gitHubHeaders(token),
      });
    }

    async function createGist(archive, exportedAt) {
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
      });
    }

    async function updateGist(gistId, archive, exportedAt) {
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
      });
    }

    async function findExistingArchiveGist() {
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

  function createRemoteSyncClient({
    archiveStore,
    settingsStore = createGmSettingsStore(),
    requestJson = createJsonRequester(),
    now = () => new Date().toISOString(),
    logger = globalObject.console,
    debounceMs = DEFAULT_SYNC_DEBOUNCE_MS,
  } = {}) {
    if (!archiveStore?.loadArchive || !archiveStore?.importArchiveDocument) {
      throw new Error('Remote sync requires a Snapshot Archive store.');
    }

    let pendingTimer = null;

    async function getSettings() {
      return settingsStore.read();
    }

    async function saveSettings(nextSettings) {
      return settingsStore.write(nextSettings);
    }

    async function configure(patch = {}) {
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
      return saveSettings(next);
    }

    async function getStatus() {
      return publicStatus(await getSettings());
    }

    async function markSyncFailure(settings, error) {
      const message = error?.message || String(error);
      await saveSettings({ ...settings, lastError: message });
      return message;
    }

    async function syncNow() {
      const settings = await getSettings();
      if (!settings.enabled) {
        return { status: 'disabled', settings: publicStatus(settings) };
      }
      if (!settings.token) {
        return { status: 'unconfigured', settings: publicStatus(settings) };
      }

      try {
        const localArchive = await archiveStore.loadArchive();
        const exportedAt = now();
        const gistApi = createGitHubGistApi({
          requestJson,
          token: settings.token,
          filename: settings.filename,
        });
        let gist = null;
        if (settings.gistId) {
          try {
            gist = await gistApi.getGist(settings.gistId);
          } catch (error) {
            // A stored gist id can go stale if the gist was deleted remotely.
            // Recover by rediscovering or recreating instead of failing forever.
            if (error?.status !== 404) throw error;
            gist = null;
          }
        }

        if (!gist) {
          const candidate = await gistApi.findExistingArchiveGist();
          gist = candidate?.id ? await gistApi.getGist(candidate.id) : null;
        }

        if (!gist) {
          gist = await gistApi.createGist(localArchive, exportedAt);
          const savedSettings = await saveSettings({
            ...settings,
            gistId: gist.id,
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
        const imported = await archiveStore.importArchiveDocument(remoteDocument);
        // Only write back when the merged archive holds snapshots the remote is
        // missing; otherwise every page open would create a redundant gist revision.
        const remoteCount = Array.isArray(remoteDocument.snapshots) ? remoteDocument.snapshots.length : 0;
        const remoteNeedsUpdate = imported.archive.snapshots.length > remoteCount;
        const updatedGist = remoteNeedsUpdate
          ? await gistApi.updateGist(gist.id, imported.archive, now())
          : gist;
        const savedSettings = await saveSettings({
          ...settings,
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
        const message = await markSyncFailure(settings, error);
        throw new Error(message);
      }
    }

    function scheduleSync({ onComplete, onError } = {}) {
      if (pendingTimer) {
        globalObject.clearTimeout(pendingTimer);
      }
      pendingTimer = globalObject.setTimeout(() => {
        pendingTimer = null;
        syncNow()
          .then((result) => {
            if (typeof onComplete === 'function') onComplete(result);
          })
          .catch((error) => {
            logger?.warn?.('Codex Quota Compass remote sync failed.', error);
            if (typeof onError === 'function') onError(error);
          });
      }, debounceMs);
    }

    return {
      configure,
      getSettings,
      getStatus,
      scheduleSync,
      syncNow,
    };
  }

  function planRemoteSyncSave(formValues = {}, currentStatus = {}) {
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

  globalObject[LIB_NAME] = Object.freeze({
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
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
