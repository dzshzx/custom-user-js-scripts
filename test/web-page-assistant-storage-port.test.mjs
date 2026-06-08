import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const blockStart = '// WEB_PAGE_ASSISTANT_STORAGE_PORT_START';
const blockEnd = '// WEB_PAGE_ASSISTANT_STORAGE_PORT_END';

async function loadStoragePortFactory() {
  const userscriptPath = path.resolve(import.meta.dirname, '../src/web-page-assistant.user.js');
  const content = await readFile(userscriptPath, 'utf8');
  const startIndex = content.indexOf(blockStart);
  const endIndex = content.indexOf(blockEnd);

  assert.notEqual(startIndex, -1, 'storage port start marker is missing');
  assert.notEqual(endIndex, -1, 'storage port end marker is missing');
  assert.ok(endIndex > startIndex, 'storage port markers are out of order');

  const block = content.slice(startIndex + blockStart.length, endIndex);
  return vm.runInThisContext(`
    (() => {
      const SCRIPT_NAME = 'Web Page Assistant';
      ${block}
      return createWebPageAssistantStoragePort;
    })()
  `);
}

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
    empty() {
      return { version: 2, refresh: { pages: {}, sites: {} }, unlocker: { pages: {}, sites: {} } };
    },
    normalize(value) {
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

const createWebPageAssistantStoragePort = await loadStoragePortFactory();

test('storage port reads and writes settings through legacy GM storage first', async () => {
  const gmWrites = [];
  const port = createWebPageAssistantStoragePort(baseAdapters({
    gmGetValue(key, fallbackValue) {
      assert.equal(key, 'settings');
      assert.deepEqual(fallbackValue, createSettingsContract().empty());
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
