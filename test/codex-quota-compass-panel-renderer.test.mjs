import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-renderer-styles.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-renderer.lib.js');

const { createQuotaPanelRenderer } = globalThis.CodexQuotaCompassPanelRendererLib;
const userscriptPath = path.resolve(
  import.meta.dirname,
  '../src/userscripts/codex-quota-compass/codex-quota-compass.user.js',
);
const rendererStylesRequireUrl = 'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-renderer-styles.lib.js';
const userscriptContent = await readFile(userscriptPath, 'utf8');

const labels = {
  actionRetry: 'Retry',
  archiveCapturedAt: 'Captured',
  archiveEarliestCapturedAt: 'Earliest',
  archiveEmpty: 'Archive empty',
  archiveExportAction: 'Export Archive',
  archiveImportAction: 'Import Archive',
  archiveLatestCapturedAt: 'Latest',
  archiveLatestImport: 'Added {added}, skipped {skipped}, invalid {invalid}',
  archiveMonthlyCredits: 'Monthly',
  archiveNoSnapshot: 'No snapshots',
  archiveSnapshotCount: 'Snapshots',
  archiveSnapshotId: 'Snapshot ID',
  archiveStorageBackend: 'Storage',
  archiveWeeklyUsedPercent: 'Weekly used',
  errorTitle: 'Failed',
  loadingHint: 'Loading hint',
  loadingTitle: 'Loading',
  metricRemainingUsdIncludingReset: 'Remaining',
  resetCountdown: 'Reset',
  sectionArchiveOverview: 'Archive Overview',
  sectionDailyQuery: 'Daily',
  sectionPeriodSummary: 'Period',
  syncBannerGmDetail: 'Using {backend}',
  syncBannerGmTitle: 'Sync enabled',
  tableNoData: 'No data',
  tablePreviewHint: 'Showing {visible} of {total}; debug {debugKey}',
  tabArchiveWorkspace: 'Sync',
  tabDetails: 'Details',
  tabHistory: 'History',
  transferNote: 'Transfer note',
};

function t(key, variables = {}) {
  const template = labels[key] || key;
  return template.replace(/\{([^}]+)\}/g, (_, name) => String(variables[name] ?? ''));
}

function createRenderer() {
  return createQuotaPanelRenderer({ t, debugKey: '__debugKey' });
}

test('installable metadata requires the panel renderer styles library', () => {
  assert.equal(
    userscriptContent.includes(`// @require      ${rendererStylesRequireUrl}`),
    true,
  );
});

test('renderLoading and renderError return escaped panel states', () => {
  const renderer = createRenderer();

  assert.match(renderer.renderLoading(), /Loading hint/);

  const errorHtml = renderer.renderError(new Error('<private>'));
  assert.match(errorHtml, /Failed/);
  assert.match(errorHtml, /&lt;private&gt;/);
  assert.match(errorHtml, /data-action="refresh"/);
});

test('renderResult renders metrics, tabs, archive actions, and active view', () => {
  const renderer = createRenderer();
  const rendered = renderer.renderResult({
    primaryMetrics: [
      { id: 'remaining', type: 'credit', labelKey: 'metricRemainingUsdIncludingReset', usd: 4.25 },
      { id: 'reset', type: 'reset', hours: 26.5 },
    ],
    tabs: [
      { id: 'details', labelKey: 'tabDetails' },
      { id: 'archive', labelKey: 'tabArchiveWorkspace' },
    ],
    syncBanner: {
      tone: 'success',
      titleKey: 'syncBannerGmTitle',
      detailKey: 'syncBannerGmDetail',
      backendLabel: 'GM storage',
    },
    archive: {
      isLoaded: true,
      snapshotCount: 2,
      earliestCapturedAt: '2026-06-01T00:00:00.000Z',
      latestCapturedAt: '2026-06-02T00:00:00.000Z',
      storageBackend: { label: 'GM storage' },
      recentSnapshots: [
        {
          capturedAt: '2026-06-02T00:00:00.000Z',
          snapshotId: '<snapshot-2>',
          monthlyCredits: 12,
          weeklyUsedPercent: 30,
        },
      ],
      importReport: { added: 1, skipped: 0, invalid: 0 },
    },
    views: {
      details: {
        kind: 'sections',
        sections: [
          {
            type: 'dataView',
            id: 'details-table',
            titleKey: 'sectionDailyQuery',
            rows: [{ date: '2026-06-01', credits: 3 }],
            columns: [
              { key: 'date', label: 'Date', priority: 'primary' },
              { key: 'credits', label: 'Credits', priority: 'primary' },
            ],
          },
        ],
      },
      archive: {
        kind: 'archiveWorkspace',
        sections: [
          { type: 'syncBanner' },
          { type: 'archiveSummary' },
          { type: 'note', noteKey: 'transferNote' },
          {
            type: 'actions',
            actions: [
              { action: 'export-archive', labelKey: 'archiveExportAction' },
              { action: 'import-archive', labelKey: 'archiveImportAction' },
            ],
          },
        ],
      },
    },
  }, { activePanelView: 'archive' });

  assert.equal(rendered.activePanelView, 'archive');
  assert.match(rendered.html, /class="cqc-tab is-active"/);
  assert.match(rendered.html, /Sync enabled/);
  assert.match(rendered.html, /data-action="export-archive"/);
  assert.match(rendered.html, /data-action="import-archive"/);
  assert.match(rendered.html, /&lt;snapshot-2&gt;/);
});

test('renderResult renders an inline sync form seeded from remote sync status', () => {
  const renderer = createRenderer();
  const rendered = renderer.renderResult({
    primaryMetrics: [],
    tabs: [{ id: 'archive', labelKey: 'tabArchiveWorkspace' }],
    remoteSyncStatus: {
      enabled: true,
      configured: true,
      hasToken: true,
      gistId: '<my-gist>',
      lastSyncedAt: '2026-06-13T10:00:00.000Z',
      lastError: '',
    },
    archive: { isLoaded: false },
    views: {
      archive: {
        kind: 'archiveWorkspace',
        sections: [
          { type: 'syncForm' },
          { type: 'actions', actions: [{ action: 'export-archive', labelKey: 'archiveExportAction' }] },
        ],
      },
    },
  }, { activePanelView: 'archive' });

  assert.match(rendered.html, /data-sync-form/);
  assert.match(rendered.html, /data-field="token"/);
  assert.match(rendered.html, /data-field="gistId"/);
  assert.match(rendered.html, /data-field="enabled"[^>]* checked/);
  assert.match(rendered.html, /data-action="save-remote-sync"/);
  // Sync-now appears only when enabled and configured.
  assert.match(rendered.html, /data-action="sync-remote"/);
  // The stored gist id is echoed (escaped) into the input value.
  assert.match(rendered.html, /value="&lt;my-gist&gt;"/);
  // The token is never echoed back into the form.
  assert.equal(rendered.html.includes('value="secret'), false);
});

test('renderResult falls back to first tab when active view is unavailable', () => {
  const renderer = createRenderer();
  const rendered = renderer.renderResult({
    primaryMetrics: [],
    tabs: [
      { id: 'details', labelKey: 'tabDetails' },
      { id: 'history', labelKey: 'tabHistory' },
    ],
    views: {
      details: {
        kind: 'sections',
        sections: [],
      },
    },
  }, { activePanelView: 'missing' });

  assert.equal(rendered.activePanelView, 'details');
});

test('installStyles installs content styles once', () => {
  const renderer = createRenderer();
  const appended = [];
  const documentObject = {
    head: {
      append(node) {
        appended.push(node);
      },
    },
    createElement(tagName) {
      return { tagName, id: '', textContent: '' };
    },
    getElementById(id) {
      return appended.find((node) => node.id === id) || null;
    },
  };

  renderer.installStyles(documentObject, 'root');
  renderer.installStyles(documentObject, 'root');

  assert.equal(appended.length, 1);
  assert.equal(appended[0].id, 'root-style');
  assert.match(appended[0].textContent, /\.cqc-tabs/);
  assert.match(appended[0].textContent, /@container \(max-width: 720px\)/);
  assert.match(appended[0].textContent, /\.cqc-data-view\[data-compact="true"\] \.cqc-data-table/);
});
