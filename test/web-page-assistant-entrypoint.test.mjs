import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const userscriptDir = path.resolve(import.meta.dirname, '../src/userscripts/web-page-assistant');
const supportFiles = [
  'web-page-assistant-settings.lib.js',
  'web-page-assistant-storage.lib.js',
  'web-page-assistant-refresh.lib.js',
  'web-page-assistant-presentation-base-styles.lib.js',
  'web-page-assistant-presentation-dialog-styles.lib.js',
  'web-page-assistant-presentation.lib.js',
  'web-page-assistant-session.lib.js',
  'web-page-assistant-widget-layout.lib.js',
  'web-page-assistant-unlocker.lib.js',
];

function createLocalStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

async function runScriptFile(context, fileName) {
  const source = await readFile(path.join(userscriptDir, fileName), 'utf8');
  vm.runInContext(source, context, { filename: fileName });
}

async function createEntrypointHarness(overrides = {}) {
  const menuCalls = [];
  const timerIds = [];
  const windowObject = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener() {},
    setInterval(handler, delay) {
      timerIds.push({ handler, delay, type: 'interval' });
      return timerIds.length;
    },
    clearInterval() {},
    setTimeout(handler, delay) {
      timerIds.push({ handler, delay, type: 'timeout' });
      return timerIds.length;
    },
  };
  windowObject.top = windowObject;
  windowObject.self = windowObject;

  const context = vm.createContext({
    console: {
      warn() {},
    },
    document: {
      readyState: 'complete',
      addEventListener() {},
      getElementById() {
        return null;
      },
      createElement() {
        throw new Error('DOM should not be created before storage initialization finishes.');
      },
      documentElement: {
        append() {},
      },
    },
    location: {
      origin: 'https://example.com',
      pathname: '/article',
      search: '?id=1',
      hostname: 'example.com',
      reload() {},
    },
    localStorage: createLocalStorage(),
    window: windowObject,
    GM_getValue() {
      return new Promise(() => {});
    },
    GM_setValue() {},
    GM_registerMenuCommand(label, callback) {
      menuCalls.push({ label, callback });
      return menuCalls.length;
    },
    ...overrides,
  });

  for (const fileName of supportFiles) {
    await runScriptFile(context, fileName);
  }
  await runScriptFile(context, 'web-page-assistant.user.js');

  return { context, menuCalls, timerIds };
}

test('entrypoint registers the settings menu before async storage initialization resolves', async () => {
  const harness = await createEntrypointHarness();

  assert.deepEqual(
    harness.menuCalls.map((call) => call.label),
    ['网页助手设置'],
  );
});
