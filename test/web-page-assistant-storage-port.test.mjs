import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

await import('../src/userscripts/web-page-assistant/web-page-assistant-storage.lib.js');

const userscriptPath = path.resolve(
  import.meta.dirname,
  '../src/userscripts/web-page-assistant/web-page-assistant.user.js',
);
const storageRequireUrl = 'https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/src/userscripts/web-page-assistant/web-page-assistant-storage.lib.js';
const userscriptContent = await readFile(userscriptPath, 'utf8');

function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  const writes = [];

  return {
    writes,
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      writes.push([key, value]);
      store.set(key, value);
    },
  };
}

function createSettingsContract() {
  return {
    emptySettings() {
      return { version: 2, refresh: { pages: {}, sites: {} }, unlocker: { pages: {}, sites: {} } };
    },
    normalizeSettings(value) {
      return { normalized: true, value };
    },
  };
}

function normalizeWidgetPosition(value) {
  if (!value || typeof value !== 'object') return null;
  const left = Number(value.left);
  const top = Number(value.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left: Math.round(left), top: Math.round(top) };
}

function baseAdapters(overrides = {}) {
  return {
    scriptName: 'Web Page Assistant',
    settingsContract: createSettingsContract(),
    normalizeWidgetPosition,
    storageKey: 'settings',
    widgetPositionKey: 'position',
    fallbackStorageKey: 'fallbackSettings',
    fallbackWidgetPositionKey: 'fallbackPosition',
    localStorageAdapter: createLocalStorage(),
    logger: { warn() {} },
    toPromise(value) {
      return value && typeof value.then === 'function' ? value : Promise.resolve(value);
    },
    ...overrides,
  };
}

const createWebPageAssistantStoragePort = globalThis.WebPageAssistantStorageLib.createWebPageAssistantStoragePort;

test('installable metadata requires the storage library', () => {
  assert.equal(
    userscriptContent.includes(`// @require      ${storageRequireUrl}`),
    true,
  );
  assert.equal(userscriptContent.includes('WEB_PAGE_ASSISTANT_STORAGE_PORT_START'), false);
});

test('storage port reads and writes settings through legacy GM storage first', async () => {
  const gmWrites = [];
  const port = createWebPageAssistantStoragePort(baseAdapters({
    gmGetValue(key, fallbackValue) {
      assert.equal(key, 'settings');
      assert.deepEqual(fallbackValue, createSettingsContract().emptySettings());
      return { from: 'gm' };
    },
    gmSetValue(key, value) {
      gmWrites.push([key, value]);
    },
  }));

  assert.deepEqual(await port.readSettings(), { normalized: true, value: { from: 'gm' } });
  assert.deepEqual(await port.writeSettings({ next: true }), {
    normalized: true,
    value: { next: true },
  });
  assert.deepEqual(gmWrites, [['settings', { normalized: true, value: { next: true } }]]);
});

test('storage port falls back to localStorage when GM settings storage fails', async () => {
  const localStorageAdapter = createLocalStorage({
    fallbackSettings: JSON.stringify({ from: 'local' }),
  });
  const warnings = [];
  const port = createWebPageAssistantStoragePort(baseAdapters({
    localStorageAdapter,
    logger: { warn: (...args) => warnings.push(args) },
    gmGetValue() {
      throw new Error('read failed');
    },
    gmSetValue() {
      throw new Error('write failed');
    },
  }));

  assert.deepEqual(await port.readSettings(), { normalized: true, value: { from: 'local' } });
  assert.deepEqual(await port.writeSettings({ next: true }), {
    normalized: true,
    value: { next: true },
  });
  assert.deepEqual(localStorageAdapter.writes, [[
    'fallbackSettings',
    JSON.stringify({ normalized: true, value: { next: true } }),
  ]]);
  assert.equal(warnings.length, 2);
});

test('storage port normalizes widget position from GM and fallback storage', async () => {
  const primaryPort = createWebPageAssistantStoragePort(baseAdapters({
    gmGetValue() {
      return { left: 10.4, top: 20.6 };
    },
  }));
  const fallbackPort = createWebPageAssistantStoragePort(baseAdapters({
    localStorageAdapter: createLocalStorage({
      fallbackPosition: JSON.stringify({ left: 4.2, top: 8.8 }),
    }),
  }));

  assert.deepEqual(await primaryPort.readWidgetPosition(), { left: 10, top: 21 });
  assert.deepEqual(await fallbackPort.readWidgetPosition(), { left: 4, top: 9 });
});

test('storage port registers settings menu through available GM adapter', () => {
  const legacyCalls = [];
  const promiseCalls = [];
  const callback = () => {};
  const legacyPort = createWebPageAssistantStoragePort(baseAdapters({
    gmRegisterMenuCommand(label, handler) {
      legacyCalls.push([label, handler]);
    },
    gmApi: {
      registerMenuCommand(label, handler) {
        promiseCalls.push([label, handler]);
      },
    },
  }));
  const promisePort = createWebPageAssistantStoragePort(baseAdapters({
    gmApi: {
      registerMenuCommand(label, handler) {
        promiseCalls.push([label, handler]);
      },
    },
  }));

  assert.equal(legacyPort.registerSettingsMenu('网页助手设置', callback), true);
  assert.equal(promisePort.registerSettingsMenu('网页助手设置', callback), true);
  assert.deepEqual(legacyCalls, [['网页助手设置', callback]]);
  assert.equal(promiseCalls.length, 1);
  assert.deepEqual(promiseCalls[0], ['网页助手设置', callback]);
});
