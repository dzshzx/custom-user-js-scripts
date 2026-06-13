import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-contract.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-archive.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-remote-sync.lib.js');

const {
  GIST_DESCRIPTION,
  GIST_FILENAME,
  GITHUB_API_BASE,
  GITHUB_API_VERSION,
  createJsonRequester,
  createRemoteSyncClient,
  normalizeSettings,
} = globalThis.CodexQuotaCompassRemoteSyncLib;
const { createSnapshotArchiveStore, normalizeSnapshotArchive } = globalThis.CodexQuotaCompassArchiveLib;
const userscriptPath = path.resolve(
  import.meta.dirname,
  '../src/userscripts/codex-quota-compass/codex-quota-compass.user.js',
);
const userscriptContent = await readFile(userscriptPath, 'utf8');

function createSnapshot(snapshotId, capturedAt, totalCredits = 1) {
  return {
    snapshotId,
    capturedAt,
    scriptVersion: '0.2.12',
    sourceContext: {},
    windowSnapshot: [],
    periodSummaries: {
      monthToDate: {
        periodKey: 'monthToDate',
        totalCredits,
        totalUsd: totalCredits * 0.04,
      },
    },
    periodDetails: {},
  };
}

function createExportDocument(snapshots = []) {
  return {
    format: 'codex-quota-compass.snapshot-archive',
    version: 1,
    exportedAt: '2026-06-13T12:00:00.000Z',
    snapshotCount: snapshots.length,
    snapshots,
  };
}

function createGist({ id = 'gist-1', snapshots = [] } = {}) {
  return {
    id,
    description: GIST_DESCRIPTION,
    files: {
      [GIST_FILENAME]: {
        filename: GIST_FILENAME,
        truncated: false,
        content: JSON.stringify(createExportDocument(snapshots), null, 2),
      },
    },
  };
}

function createMemoryArchiveStore(initialArchive = null) {
  let archive = initialArchive;
  const store = createSnapshotArchiveStore({
    read: async () => archive,
    write: async (nextArchive) => {
      archive = nextArchive;
      return nextArchive;
    },
    now: () => '2026-06-13T12:00:00.000Z',
    createId: () => 'created-snapshot',
    scriptVersion: '0.2.12',
  });

  return {
    store,
    dump: () => normalizeSnapshotArchive(archive),
  };
}

function createMemorySettingsStore(initialSettings = null) {
  let settings = normalizeSettings(initialSettings);

  return {
    read: async () => settings,
    write: async (nextSettings) => {
      settings = normalizeSettings(nextSettings);
      return settings;
    },
    dump: () => settings,
  };
}

test('installable metadata grants only GitHub API manager requests for Gist sync', () => {
  assert.equal(userscriptContent.includes('// @grant        GM_xmlhttpRequest'), true);
  assert.equal(userscriptContent.includes('// @connect      api.github.com'), true);
  assert.equal(userscriptContent.includes('// @connect      *'), false);
});

test('createJsonRequester prefers GM_xmlhttpRequest over page fetch to avoid host CSP blocks', async () => {
  let fetchCalled = false;
  const gmRequests = [];
  const requestJson = createJsonRequester({
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('page fetch should not be used');
    },
    gmXmlhttpRequest: (request) => {
      gmRequests.push(request);
      request.onload({
        status: 200,
        responseText: '{"ok":true}',
      });
    },
  });

  const response = await requestJson({
    method: 'GET',
    url: `${GITHUB_API_BASE}/gists?per_page=100`,
    headers: { Accept: 'application/vnd.github+json' },
  });

  assert.deepEqual(response, { ok: true });
  assert.equal(fetchCalled, false);
  assert.equal(gmRequests.length, 1);
  assert.equal(gmRequests[0].method, 'GET');
  assert.equal(gmRequests[0].url, `${GITHUB_API_BASE}/gists?per_page=100`);
});

test('configure stores GitHub token privately and optional gist id publicly', async () => {
  const settingsStore = createMemorySettingsStore();
  const archive = createMemoryArchiveStore();
  const client = createRemoteSyncClient({
    archiveStore: archive.store,
    settingsStore,
    requestJson: async () => [],
  });

  await client.configure({ enabled: true, gistId: ' gist-abc ', token: ' secret-token ' });
  const status = await client.getStatus();

  assert.equal(status.enabled, true);
  assert.equal(status.configured, true);
  assert.equal(status.provider, 'github-gist');
  assert.equal(status.providerLabel, 'GitHub Gist');
  assert.equal(status.endpoint, 'GitHub Gist gist-abc');
  assert.equal(status.gistId, 'gist-abc');
  assert.equal(status.filename, GIST_FILENAME);
  assert.equal(status.hasToken, true);
  assert.equal(Object.hasOwn(status, 'token'), false);
  assert.equal(settingsStore.dump().token, 'secret-token');
});

test('syncNow finds existing archive gist, merges remote archive locally, and patches gist', async () => {
  const localSnapshot = createSnapshot('local-snapshot', '2026-06-13T10:00:00.000Z', 10);
  const remoteSnapshot = createSnapshot('remote-snapshot', '2026-06-13T11:00:00.000Z', 20);
  const archive = createMemoryArchiveStore({ snapshots: [localSnapshot] });
  const settingsStore = createMemorySettingsStore({
    enabled: true,
    token: 'secret-token',
    clientId: 'client-1',
  });
  const requests = [];
  const client = createRemoteSyncClient({
    archiveStore: archive.store,
    settingsStore,
    now: () => '2026-06-13T12:30:00.000Z',
    requestJson: async (request) => {
      requests.push(request);
      if (request.method === 'GET' && request.url === `${GITHUB_API_BASE}/gists?per_page=100`) {
        return [{
          id: 'gist-1',
          description: GIST_DESCRIPTION,
          files: {
            [GIST_FILENAME]: {
              filename: GIST_FILENAME,
              truncated: false,
            },
          },
        }];
      }
      if (request.method === 'GET' && request.url === `${GITHUB_API_BASE}/gists/gist-1`) {
        return createGist({ id: 'gist-1', snapshots: [remoteSnapshot] });
      }
      if (request.method === 'PATCH' && request.url === `${GITHUB_API_BASE}/gists/gist-1`) {
        return createGist({ id: 'gist-1', snapshots: JSON.parse(request.body.files[GIST_FILENAME].content).snapshots });
      }
      throw new Error(`unexpected request ${request.method} ${request.url}`);
    },
  });

  const result = await client.syncNow();

  assert.equal(result.status, 'synced');
  assert.equal(requests.length, 3);
  assert.equal(requests[0].headers.Authorization, 'Bearer secret-token');
  assert.equal(requests[0].headers['X-GitHub-Api-Version'], GITHUB_API_VERSION);
  assert.equal(requests[1].method, 'GET');
  assert.equal(requests[1].url, `${GITHUB_API_BASE}/gists/gist-1`);
  assert.equal(requests[2].method, 'PATCH');
  assert.equal(requests[2].body.files[GIST_FILENAME].content.includes('local-snapshot'), true);
  assert.equal(requests[2].body.files[GIST_FILENAME].content.includes('remote-snapshot'), true);
  assert.deepEqual(result.localReport, { added: 1, skipped: 0, invalid: 0 });
  assert.equal(result.remoteReport.gistId, 'gist-1');
  assert.equal(result.settings.gistId, 'gist-1');
  assert.equal(result.settings.lastSyncedAt, '2026-06-13T12:30:00.000Z');
  assert.deepEqual(
    archive.dump().snapshots.map((snapshot) => snapshot.snapshotId),
    ['local-snapshot', 'remote-snapshot'],
  );
});

test('syncNow creates a secret gist when no archive gist exists', async () => {
  const localSnapshot = createSnapshot('local-snapshot', '2026-06-13T10:00:00.000Z', 10);
  const archive = createMemoryArchiveStore({ snapshots: [localSnapshot] });
  const settingsStore = createMemorySettingsStore({ enabled: true, token: 'secret-token' });
  const requests = [];
  const client = createRemoteSyncClient({
    archiveStore: archive.store,
    settingsStore,
    now: () => '2026-06-13T12:30:00.000Z',
    requestJson: async (request) => {
      requests.push(request);
      if (request.method === 'GET') return [];
      if (request.method === 'POST' && request.url === `${GITHUB_API_BASE}/gists`) {
        assert.equal(request.body.public, false);
        assert.equal(request.body.description, GIST_DESCRIPTION);
        assert.equal(request.body.files[GIST_FILENAME].content.includes('local-snapshot'), true);
        return createGist({ id: 'created-gist', snapshots: [localSnapshot] });
      }
      throw new Error(`unexpected request ${request.method} ${request.url}`);
    },
  });

  const result = await client.syncNow();

  assert.equal(result.status, 'synced');
  assert.equal(result.remoteReport.created, true);
  assert.equal(result.settings.gistId, 'created-gist');
  assert.equal(settingsStore.dump().gistId, 'created-gist');
  assert.deepEqual(requests.map((request) => request.method), ['GET', 'POST']);
});

test('syncNow skips disabled or missing-token settings without network calls', async () => {
  const archive = createMemoryArchiveStore();
  const requests = [];
  const disabledClient = createRemoteSyncClient({
    archiveStore: archive.store,
    settingsStore: createMemorySettingsStore({ enabled: false, token: 'secret-token' }),
    requestJson: async (request) => {
      requests.push(request);
      return [];
    },
  });

  const disabled = await disabledClient.syncNow();
  assert.equal(disabled.status, 'disabled');

  const unconfiguredClient = createRemoteSyncClient({
    archiveStore: archive.store,
    settingsStore: createMemorySettingsStore({ enabled: true, token: '' }),
    requestJson: async (request) => {
      requests.push(request);
      return [];
    },
  });

  const unconfigured = await unconfiguredClient.syncNow();
  assert.equal(unconfigured.status, 'unconfigured');
  assert.equal(requests.length, 0);
});

test('syncNow records request failures in settings and rethrows a clear error', async () => {
  const settingsStore = createMemorySettingsStore({
    enabled: true,
    token: 'secret-token',
  });
  const client = createRemoteSyncClient({
    archiveStore: createMemoryArchiveStore().store,
    settingsStore,
    requestJson: async () => {
      throw new Error('server unavailable');
    },
  });

  await assert.rejects(() => client.syncNow(), /server unavailable/);
  assert.equal(settingsStore.dump().lastError, 'server unavailable');
});
