import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-stats-styles.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-renderer-styles.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-stats.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-renderer.lib.js');

const { createQuotaPanelRenderer } = globalThis.CodexQuotaCompassPanelRendererLib;
const userscriptPath = path.resolve(
  import.meta.dirname,
  '../src/userscripts/codex-quota-compass/codex-quota-compass.user.js',
);
const rendererStylesRequireUrl = 'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-renderer-styles.lib.js';
const statsStylesRequireUrl = 'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/codex-quota-compass/codex-quota-compass-panel-stats-styles.lib.js';
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
  syncBannerGmDetail: 'Using {backend}',
  syncBannerGmTitle: 'Sync enabled',
  tableNoData: 'No data',
  tablePreviewHint: 'Showing {visible} of {total}; debug {debugKey}',
  tabArchiveWorkspace: 'Sync',
  tabDetails: 'Details',
  tabStats: 'Stats',
  transferNote: 'Transfer note',
};

function t(key, variables = {}) {
  const template = labels[key] || key;
  return template.replace(/\{([^}]+)\}/g, (_, name) => String(variables[name] ?? ''));
}

function createRenderer() {
  return createQuotaPanelRenderer({ t, debugKey: '__debugKey' });
}

test('installable metadata requires statistics styles before renderer styles', () => {
  assert.equal(
    userscriptContent.includes(`// @require      ${rendererStylesRequireUrl}`),
    true,
  );
  assert.equal(
    userscriptContent.includes(`// @require      ${statsStylesRequireUrl}`),
    true,
  );
  assert.equal(
    userscriptContent.indexOf(statsStylesRequireUrl) < userscriptContent.indexOf(rendererStylesRequireUrl),
    true,
  );
});

test('installable metadata and Snapshot Archive version stay synchronized at 0.4.1', () => {
  const metadataVersion = /^\/\/ @version\s+(\S+)$/m.exec(userscriptContent)?.[1];
  const internalVersion = /const SCRIPT_VERSION = '([^']+)';/.exec(userscriptContent)?.[1];

  assert.equal(metadataVersion, '0.4.1');
  assert.equal(internalVersion, metadataVersion);
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

test('renderResult formats the last synced time through the injected timestamp formatter', () => {
  const seen = [];
  const renderer = createQuotaPanelRenderer({
    t: (key, variables = {}) => (key === 'remoteSyncLastSynced' ? `Last synced: ${variables.lastSyncedAt}` : t(key, variables)),
    debugKey: '__debugKey',
    formatTimestamp: (value) => {
      seen.push(value);
      return 'LOCAL-TIME';
    },
  });
  const rendered = renderer.renderResult({
    primaryMetrics: [],
    tabs: [{ id: 'archive', labelKey: 'tabArchiveWorkspace' }],
    remoteSyncStatus: {
      enabled: true,
      configured: true,
      hasToken: true,
      gistId: '',
      lastSyncedAt: '2026-06-13T10:00:00.000Z',
      lastError: '',
    },
    archive: { isLoaded: false },
    views: {
      archive: { kind: 'archiveWorkspace', sections: [{ type: 'syncForm' }] },
    },
  }, { activePanelView: 'archive' });

  assert.deepEqual(seen, ['2026-06-13T10:00:00.000Z']);
  assert.match(rendered.html, /Last synced: LOCAL-TIME/);
});

test('renderResult reformats a valid ISO sync time by default and keeps junk verbatim', () => {
  function renderSyncForm(lastSyncedAt) {
    const renderer = createQuotaPanelRenderer({
      t: (key, variables = {}) => (key === 'remoteSyncLastSynced' ? `Last synced: ${variables.lastSyncedAt}` : t(key, variables)),
      debugKey: '__debugKey',
    });
    return renderer.renderResult({
      primaryMetrics: [],
      tabs: [{ id: 'archive', labelKey: 'tabArchiveWorkspace' }],
      remoteSyncStatus: { enabled: true, configured: true, hasToken: true, gistId: '', lastSyncedAt, lastError: '' },
      archive: { isLoaded: false },
      views: { archive: { kind: 'archiveWorkspace', sections: [{ type: 'syncForm' }] } },
    }, { activePanelView: 'archive' }).html;
  }

  // A valid ISO timestamp is localized, so the raw UTC string is not shown.
  const iso = '2026-06-13T10:00:00.000Z';
  const html = renderSyncForm(iso);
  assert.match(html, /Last synced: /);
  assert.equal(html.includes(`Last synced: ${iso}`), false);

  // Unparseable input is preserved rather than turned into "Invalid Date".
  assert.match(renderSyncForm('not-a-date'), /Last synced: not-a-date/);
});

test('renderResult localizes archive captured timestamps through the formatter', () => {
  const seen = [];
  const renderer = createQuotaPanelRenderer({
    t,
    debugKey: '__debugKey',
    formatTimestamp: (value) => {
      seen.push(value);
      return `LOCAL(${value})`;
    },
  });
  const rendered = renderer.renderResult({
    primaryMetrics: [],
    tabs: [{ id: 'archive', labelKey: 'tabArchiveWorkspace' }],
    archive: {
      isLoaded: true,
      snapshotCount: 2,
      earliestCapturedAt: '2026-06-01T00:00:00.000Z',
      latestCapturedAt: '2026-06-02T00:00:00.000Z',
      storageBackend: { label: 'GM storage' },
      recentSnapshots: [
        { capturedAt: '2026-06-03T00:00:00.000Z', snapshotId: 's3', monthlyCredits: 12, weeklyUsedPercent: 30 },
      ],
    },
    views: { archive: { kind: 'archiveWorkspace', sections: [{ type: 'archiveSummary' }] } },
  }, { activePanelView: 'archive' });

  assert.ok(seen.includes('2026-06-01T00:00:00.000Z'));
  assert.ok(seen.includes('2026-06-02T00:00:00.000Z'));
  assert.ok(seen.includes('2026-06-03T00:00:00.000Z'));
  assert.match(rendered.html, /LOCAL\(2026-06-01T00:00:00\.000Z\)/);
  // The raw ISO is never shown as a bare cell value.
  assert.equal(/>\s*2026-06-01T00:00:00\.000Z\s*</.test(rendered.html), false);
});

test('renderResult falls back to first tab when active view is unavailable', () => {
  const renderer = createRenderer();
  const rendered = renderer.renderResult({
    primaryMetrics: [],
    tabs: [
      { id: 'details', labelKey: 'tabDetails' },
      { id: 'stats', labelKey: 'tabStats' },
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
  assert.match(appended[0].textContent, /#root \.cqc-stats-tabs/);
  assert.match(appended[0].textContent, /#root \.cqc-stats-tab:focus-visible/);
  assert.match(appended[0].textContent, /@container \(max-width: 720px\)/);
  assert.match(appended[0].textContent, /\.cqc-data-view\[data-compact="true"\] \.cqc-data-table/);
});

test('stats view renders cost dimensions, a live rolling line, and drillable rows', () => {
  const renderer = createQuotaPanelRenderer({ t: (key) => key, debugKey: '__debugKey' });
  const model = {
    rolling: { 累计折算USD: 8, 累计Credits: 200 },
    cost: {
      cycleStartDate: '2026-06-01',
      today: { date: '2026-06-05', credits: 50, usd: 2 },
      day: { rows: [{ date: '2026-06-02', credits: 200, usd: 8 }], today: { date: '2026-06-05', credits: 50, usd: 2 } },
      week: {
        current: { from: '2026-05-30', to: '2026-06-05', credits: 50, usd: 2 },
        blocks: [{ from: '2026-05-23', to: '2026-05-29', credits: 100, usd: 4 }],
      },
      month: {
        current: { month: '2026-06', credits: 250, usd: 10 },
        rows: [{ month: '2026-05', from: '2026-05-01', to: '2026-05-31', credits: 100, usd: 4 }],
      },
      all: { totalCredits: 300, totalUsd: 12, coverDays: 5, fromDate: '2026-06-02', toDate: '2026-06-02', rows: [{ date: '2026-06-02', credits: 200, usd: 8 }] },
      allDays: [{ date: '2026-06-02', credits: 200, usd: 8 }],
    },
    views: { stats: { id: 'stats', kind: 'stats' } },
  };

  const day = renderer.renderActiveView(model, { activePanelView: 'stats' });
  assert.match(day.html, /cqc-stats-tabs/);
  assert.match(day.html, /statsRollingLive/);
  assert.match(day.html, /2026-06-02/);

  const week = renderer.renderActiveView(model, { activePanelView: 'stats', statsPeriod: 'week' });
  assert.match(week.html, /data-action="stats-drill"/);
  assert.match(week.html, /data-from="2026-05-23"/);
  assert.match(week.html, /data-to="2026-05-29"/);

  const drill = renderer.renderActiveView(model, {
    activePanelView: 'stats',
    statsPeriod: 'week',
    statsDrill: { from: '2026-05-23', to: '2026-05-29', label: 'wk' },
  });
  assert.match(drill.html, /data-action="stats-drill-back"/);
  // The live rolling line is summary-only and must not bleed into a drill view.
  assert.doesNotMatch(drill.html, /statsRollingLive/);
});
