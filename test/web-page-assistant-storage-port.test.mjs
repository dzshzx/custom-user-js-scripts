import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createWebPageAssistantStoragePort } from '../src/userscripts/web-page-assistant/web-page-assistant-storage.lib.js';

const entryPath = path.resolve(
  import.meta.dirname,
  '../src/userscripts/web-page-assistant/web-page-assistant.entry.js',
);
const entryContent = await readFile(entryPath, 'utf8');

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

test('entry module imports the storage library', () => {
  assert.equal(
    entryContent.includes(`from './web-page-assistant-storage.lib.js'`),
    true,
  );
  assert.equal(entryContent.includes('WEB_PAGE_ASSISTANT_STORAGE_PORT_START'), false);
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

test('storage port reports only other tabs\' settings changes and unsubscribes', async () => {
  const calls = [];
  const removed = [];
  const listeners = [];
  const storageHandlers = new Set();
  const port = createWebPageAssistantStoragePort(baseAdapters({
    gmApi: {
      addValueChangeListener(key, listener) {
        listeners.push([key, listener]);
        return Promise.resolve(7);
      },
      removeValueChangeListener(id) {
        removed.push(id);
      },
    },
    eventTarget: {
      addEventListener(type, handler) { if (type === 'storage') storageHandlers.add(handler); },
      removeEventListener(type, handler) { storageHandlers.delete(handler); },
    },
  }));

  const unsubscribe = port.subscribeSettings(() => calls.push('change'));
  assert.equal(listeners[0][0], 'settings');
  listeners[0][1]('settings', null, {}, false);
  listeners[0][1]('settings', null, {}, true);
  for (const handler of storageHandlers) {
    handler({ key: 'unrelated' });
    handler({ key: 'fallbackSettings' });
  }
  assert.deepEqual(calls, ['change', 'change']);

  unsubscribe();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(removed, [7]);
  assert.equal(storageHandlers.size, 0);
});

test('storage port updates the latest primary settings and keeps a failed read off primary', async () => {
  let primary = { stored: 1 };
  const gmWrites = [];
  const localStorageAdapter = createLocalStorage({ fallbackSettings: JSON.stringify({ from: 'local' }) });
  let failRead = false;
  const port = createWebPageAssistantStoragePort(baseAdapters({
    localStorageAdapter,
    gmGetValue() {
      if (failRead) throw new Error('read failed');
      return primary;
    },
    gmSetValue(key, value) {
      gmWrites.push([key, value]);
      primary = value;
    },
  }));

  const seen = [];
  await port.updateSettings((latest) => { seen.push(latest); return { next: 1 }; });
  assert.deepEqual(seen, [{ normalized: true, value: { stored: 1 } }]);
  assert.deepEqual(gmWrites, [['settings', { normalized: true, value: { next: 1 } }]]);

  failRead = true;
  await port.updateSettings((latest) => { seen.push(latest); return { next: 2 }; });
  assert.deepEqual(seen[1], { normalized: true, value: { from: 'local' } });
  assert.equal(gmWrites.length, 1);
  assert.deepEqual(localStorageAdapter.writes.at(-1), [
    'fallbackSettings',
    JSON.stringify({ normalized: true, value: { next: 2 } }),
  ]);
});
