import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const blockStart = '// WEB_PAGE_ASSISTANT_SESSION_START';
const blockEnd = '// WEB_PAGE_ASSISTANT_SESSION_END';

async function loadSessionFactory() {
  const userscriptPath = path.resolve(import.meta.dirname, '../src/web-page-assistant.user.js');
  const content = await readFile(userscriptPath, 'utf8');
  const startIndex = content.indexOf(blockStart);
  const endIndex = content.indexOf(blockEnd);

  assert.notEqual(startIndex, -1, 'session runtime start marker is missing');
  assert.notEqual(endIndex, -1, 'session runtime end marker is missing');
  assert.ok(endIndex > startIndex, 'session runtime markers are out of order');

  const block = content.slice(startIndex + blockStart.length, endIndex);
  return vm.runInThisContext(`
    (() => {
      ${block}
      return createWebPageAssistantSession;
    })()
  `);
}

function createSettingsContract() {
  function ensureSettings(settings) {
    return settings || { refresh: { pages: {}, sites: {} }, unlocker: { pages: {}, sites: {} } };
  }

  function bucketFor(settings, area, scope) {
    const next = ensureSettings(settings);
    return scope === 'site' ? next[area].sites : next[area].pages;
  }

  return {
    isValidIntervalMs(value) {
      return Number.isFinite(value) && value >= 1000 && value <= 60 * 60 * 1000;
    },
    setRefreshSetting(settings, scope, key, intervalMs) {
      const next = structuredClone(ensureSettings(settings));
      bucketFor(next, 'refresh', scope)[key] = { intervalMs, updatedAt: 1 };
      return next;
    },
    deleteRefreshSetting(settings, scope, key) {
      const next = structuredClone(ensureSettings(settings));
      delete bucketFor(next, 'refresh', scope)[key];
      return next;
    },
    normalizeUnlockerSetting(value) {
      return value && typeof value === 'object' ? { enabled: Boolean(value.enabled), allowCopy: value.allowCopy === true } : null;
    },
    setUnlockerSetting(settings, scope, key, setting) {
      const next = structuredClone(ensureSettings(settings));
      bucketFor(next, 'unlocker', scope)[key] = setting;
      return next;
    },
    deleteUnlockerSetting(settings, scope, key) {
      const next = structuredClone(ensureSettings(settings));
      delete bucketFor(next, 'unlocker', scope)[key];
      return next;
    },
  };
}

function createHarness(overrides = {}) {
  let settings = {
    refresh: { pages: {}, sites: {} },
    unlocker: { pages: {}, sites: {} },
  };
  let activeMatch = overrides.activeMatch || null;
  let activeUnlockerMatch = null;
  let selectedScope = overrides.selectedScope || 'page';
  const writes = [];
  const renders = [];
  const messages = [];
  const restarts = [];
  const installedUnlockers = [];
  const pauseCalls = [];
  const createWebPageAssistantSession = createHarness.factory;

  const adapters = {
    settingsContract: createSettingsContract(),
    storagePort: {
      async writeSettings(nextSettings) {
        writes.push(nextSettings);
        return nextSettings;
      },
    },
    refreshRuntime: {
      restart(match) {
        restarts.push(match);
        activeMatch = match;
      },
      togglePause() {
        pauseCalls.push(true);
      },
    },
    getSettings: () => settings,
    setSettings(nextSettings) {
      settings = nextSettings;
    },
    getActiveMatch: () => activeMatch,
    setActiveMatch(nextActiveMatch) {
      activeMatch = nextActiveMatch;
    },
    setActiveUnlockerMatch(nextActiveUnlockerMatch) {
      activeUnlockerMatch = nextActiveUnlockerMatch;
    },
    getPageKey: () => 'https://example.com/a',
    getSiteKey: () => 'example.com',
    getSelectedScope: () => selectedScope,
    parseCustomInterval: () => ({ intervalMs: 90_000 }),
    readUnlockerFormSetting: () => ({ enabled: true, allowCopy: true }),
    resolveActiveSetting: (sourceSettings) => {
      const pageSetting = sourceSettings.refresh.pages['https://example.com/a'];
      const siteSetting = sourceSettings.refresh.sites['example.com'];
      if (pageSetting) return { scope: 'page', key: 'https://example.com/a', setting: pageSetting };
      if (siteSetting) return { scope: 'site', key: 'example.com', setting: siteSetting };
      return null;
    },
    resolveActiveUnlockerSetting: (sourceSettings) => {
      const pageSetting = sourceSettings.unlocker.pages['https://example.com/a'];
      const siteSetting = sourceSettings.unlocker.sites['example.com'];
      if (pageSetting?.enabled) return { scope: 'page', key: 'https://example.com/a', setting: pageSetting };
      if (siteSetting?.enabled) return { scope: 'site', key: 'example.com', setting: siteSetting };
      return null;
    },
    renderDialog(message, scope, tab) {
      renders.push({ message, scope, tab });
    },
    renderWidget() {},
    updatePauseButton() {},
    updateCountdownText() {},
    installUnlocker(setting) {
      installedUnlockers.push(setting || null);
    },
    setMessage(text, tone = 'info') {
      messages.push({ text, tone });
    },
    closeDialog() {
      renders.push({ close: true });
    },
    hasDialog: () => overrides.hasDialog === true,
    unlockerStatusText: () => '当前页面已启用：复制/剪切。',
    scopeLabel: (scope) => (scope === 'site' ? '整个站点' : '当前页面'),
    formatInterval: (intervalMs) => `${intervalMs / 1000} 秒`,
    ...overrides.adapters,
  };

  return {
    session: createWebPageAssistantSession(adapters),
    writes,
    renders,
    messages,
    restarts,
    installedUnlockers,
    pauseCalls,
    get settings() {
      return settings;
    },
    get activeMatch() {
      return activeMatch;
    },
    get activeUnlockerMatch() {
      return activeUnlockerMatch;
    },
    setSelectedScope(scope) {
      selectedScope = scope;
    },
  };
}

createHarness.factory = await loadSessionFactory();

test('session saves preset refresh settings and restarts countdown through one interface', async () => {
  const harness = createHarness();

  await harness.session.dispatch('save-preset', { dataset: { intervalMs: '30000' } });

  assert.deepEqual(harness.settings.refresh.pages['https://example.com/a'], { intervalMs: 30_000, updatedAt: 1 });
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.restarts.at(-1).setting.intervalMs, 30_000);
  assert.deepEqual(harness.renders.at(-1), {
    message: '已保存到当前页面：每 30 秒 刷新一次。',
    scope: 'page',
    tab: 'refresh',
  });
});

test('session rejects invalid preset interval before writing storage', async () => {
  const harness = createHarness();

  await harness.session.dispatch('save-preset', { dataset: { intervalMs: '500' } });

  assert.deepEqual(harness.writes, []);
  assert.deepEqual(harness.messages, [{ text: '预设刷新时间无效。', tone: 'error' }]);
});

test('session saves custom interval to selected site scope', async () => {
  const harness = createHarness({ selectedScope: 'site' });

  await harness.session.dispatch('save-custom', { dataset: {} });

  assert.deepEqual(harness.settings.refresh.sites['example.com'], { intervalMs: 90_000, updatedAt: 1 });
  assert.equal(harness.restarts.at(-1).scope, 'site');
  assert.deepEqual(harness.renders.at(-1), {
    message: '已保存到整个站点：每 90 秒 刷新一次。',
    scope: 'site',
    tab: 'refresh',
  });
});

test('session deletes active refresh scope and rerenders open dialog after disable-active', async () => {
  const harness = createHarness({
    hasDialog: true,
    activeMatch: { scope: 'page', key: 'https://example.com/a', setting: { intervalMs: 30_000 } },
  });
  await harness.session.saveSetting('page', 30_000);

  await harness.session.dispatch('disable-active', { dataset: {} });

  assert.equal(harness.settings.refresh.pages['https://example.com/a'], undefined);
  assert.equal(harness.activeMatch, null);
  assert.deepEqual(harness.renders.at(-1), {
    message: '已停用当前页面自动刷新。',
    scope: 'page',
    tab: 'refresh',
  });
});

test('session saves and deletes unlocker settings through capability refresh', async () => {
  const harness = createHarness();

  await harness.session.dispatch('save-unlocker', { dataset: {} });
  assert.deepEqual(harness.settings.unlocker.pages['https://example.com/a'], { enabled: true, allowCopy: true });
  assert.deepEqual(harness.activeUnlockerMatch.setting, { enabled: true, allowCopy: true });
  assert.deepEqual(harness.installedUnlockers.at(-1), { enabled: true, allowCopy: true });

  await harness.session.dispatch('delete-unlocker-page', { dataset: {} });
  assert.equal(harness.settings.unlocker.pages['https://example.com/a'], undefined);
  assert.equal(harness.activeUnlockerMatch, null);
  assert.equal(harness.installedUnlockers.at(-1), null);
});

test('session exposes supported actions and routes simple UI actions', async () => {
  const harness = createHarness();

  assert.equal(harness.session.canHandle('open-settings'), true);
  assert.equal(harness.session.canHandle('missing'), false);

  await harness.session.dispatch('open-settings', { dataset: {} });
  await harness.session.dispatch('switch-tab', { dataset: { partTab: 'unlocker' } });
  await harness.session.dispatch('toggle-pause', { dataset: {} });

  assert.deepEqual(harness.renders[0], { message: '', scope: null, tab: 'refresh' });
  assert.deepEqual(harness.renders[1], { message: '', scope: 'page', tab: 'unlocker' });
  assert.deepEqual(harness.pauseCalls, [true]);
});
