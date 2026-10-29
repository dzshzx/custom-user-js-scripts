import test from 'node:test';
import assert from 'node:assert/strict';

import { createGmFirstJsonStore } from '../src/userscripts/shared/shared-gm-json-store.lib.ts';

function createLocalStorage(initial = {}, { failGet = false, failSet = false } = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getItem(key) {
      if (failGet) throw new Error('get blocked');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (failSet) throw new Error('set blocked');
      writes.push([key, value]);
      values.set(key, value);
    },
  };
}

function createGm(initial = {}, { failGet = false, failSet = false } = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    values,
    writes,
    gmGetValue(key, fallback) {
      if (failGet) throw new Error('gm get blocked');
      return values.has(key) ? values.get(key) : fallback;
    },
    gmSetValue(key, value) {
      if (failSet) throw new Error('gm set blocked');
      writes.push([key, value]);
      values.set(key, value);
    },
  };
}

function createLogger() {
  const warnings = [];
  return { warnings, warn: (message) => warnings.push(message) };
}

// Stands in for a manager without any storage API, so the test never probes
// the real globals.
const NO_GM = { gm: {} };

function baseOptions(overrides = {}) {
  return {
    scriptName: 'Test Script',
    subject: 'settings',
    key: 'gmKey',
    fallbackKey: 'localKey',
    normalize: (raw) => (raw && typeof raw === 'object' ? { ...raw, normalized: true } : null),
    ...overrides,
  };
}

test('GM available: reads and writes through GM and leaves localStorage alone without mirror', async () => {
  const gm = createGm({ gmKey: { from: 'gm' } });
  const localStorage = createLocalStorage({ localKey: JSON.stringify({ from: 'local' }) });
  const logger = createLogger();
  const store = createGmFirstJsonStore(baseOptions({ ...gm, localStorage, logger }));

  assert.deepEqual(await store.read(), {
    backend: 'gm',
    value: { from: 'gm', normalized: true },
    gmFailed: false,
  });
  assert.deepEqual(await store.write({ next: 1 }), { backend: 'gm', mirrorDegraded: false });
  assert.deepEqual(gm.writes, [['gmKey', { next: 1 }]]);
  assert.deepEqual(localStorage.writes, []);
  assert.deepEqual(logger.warnings, []);
});

test('GM available: passes null as the GM default and normalizes a missing value', async () => {
  const defaults = [];
  const store = createGmFirstJsonStore(
    baseOptions({
      gmGetValue: (key, fallback) => {
        defaults.push([key, fallback]);
        return fallback;
      },
      localStorage: createLocalStorage(),
      logger: createLogger(),
    }),
  );

  assert.deepEqual(await store.read(), { backend: 'gm', value: null, gmFailed: false });
  assert.deepEqual(defaults, [['gmKey', null]]);
});

test('GM available with mirror: a GM write is copied to localStorage', async () => {
  const gm = createGm();
  const localStorage = createLocalStorage();
  const store = createGmFirstJsonStore(baseOptions({ ...gm, localStorage, mirror: true, logger: createLogger() }));

  assert.deepEqual(await store.write({ next: 2 }), { backend: 'gm', mirrorDegraded: false });
  assert.deepEqual(gm.writes, [['gmKey', { next: 2 }]]);
  assert.deepEqual(localStorage.writes, [['localKey', JSON.stringify({ next: 2 })]]);
});

test('GM available but the mirror write fails: degraded, warned, still GM', async () => {
  const gm = createGm();
  const logger = createLogger();
  const store = createGmFirstJsonStore(
    baseOptions({
      ...gm,
      subject: 'archive',
      localStorage: createLocalStorage({}, { failSet: true }),
      mirror: true,
      logger,
    }),
  );

  assert.deepEqual(await store.write({ next: 3 }), { backend: 'gm', mirrorDegraded: true });
  assert.deepEqual(gm.writes, [['gmKey', { next: 3 }]]);
  assert.deepEqual(logger.warnings, ['Test Script: failed to mirror archive to fallback storage.']);

  // A missing localStorage degrades the mirror the same way.
  const missing = createGmFirstJsonStore(
    baseOptions({ ...createGm(), localStorage: null, mirror: true, logger: createLogger() }),
  );
  assert.deepEqual(await missing.write({ next: 4 }), { backend: 'gm', mirrorDegraded: true });
});

test('GM missing: falls back to localStorage without a warning', async () => {
  const localStorage = createLocalStorage({ localKey: JSON.stringify({ from: 'local' }) });
  const logger = createLogger();
  const store = createGmFirstJsonStore(baseOptions({ ...NO_GM, localStorage, logger }));

  assert.deepEqual(await store.read(), {
    backend: 'localStorage',
    value: { from: 'local', normalized: true },
    gmFailed: false,
  });
  assert.deepEqual(await store.write({ next: 5 }), { backend: 'localStorage', mirrorDegraded: false });
  assert.deepEqual(localStorage.writes, [['localKey', JSON.stringify({ next: 5 })]]);
  assert.deepEqual(logger.warnings, []);
});

test('GM throws: falls back to localStorage, flags gmFailed and warns', async () => {
  const localStorage = createLocalStorage({ localKey: JSON.stringify({ from: 'local' }) });
  const logger = createLogger();
  const store = createGmFirstJsonStore(
    baseOptions({ ...createGm({}, { failGet: true, failSet: true }), localStorage, logger }),
  );

  assert.deepEqual(await store.read(), {
    backend: 'localStorage',
    value: { from: 'local', normalized: true },
    gmFailed: true,
  });
  assert.deepEqual(await store.write({ next: 6 }), { backend: 'localStorage', mirrorDegraded: false });
  assert.deepEqual(localStorage.writes, [['localKey', JSON.stringify({ next: 6 })]]);
  assert.deepEqual(logger.warnings, [
    'Test Script: failed to read settings from userscript storage.',
    'Test Script: failed to write settings to userscript storage.',
  ]);
});

test('GM throws from a rejected promise just like a synchronous throw', async () => {
  const logger = createLogger();
  const store = createGmFirstJsonStore(
    baseOptions({
      gm: {
        getValue: async () => {
          throw new Error('async blocked');
        },
      },
      localStorage: createLocalStorage({ localKey: JSON.stringify({ from: 'local' }) }),
      logger,
    }),
  );

  const result = await store.read();
  assert.equal(result.backend, 'localStorage');
  assert.equal(result.gmFailed, true);
  assert.equal(logger.warnings.length, 1);
});

test('neither backend available: read answers none and write throws', async () => {
  const logger = createLogger();
  const store = createGmFirstJsonStore(
    baseOptions({
      ...createGm({}, { failGet: true, failSet: true }),
      localStorage: createLocalStorage({}, { failGet: true, failSet: true }),
      logger,
    }),
  );

  assert.deepEqual(await store.read(), { backend: 'none', value: null, gmFailed: true });
  assert.deepEqual(logger.warnings, [
    'Test Script: failed to read settings from userscript storage.',
    'Test Script: failed to read settings from fallback storage.',
  ]);
  await assert.rejects(store.write({ next: 7 }), /set blocked/);

  const bare = createGmFirstJsonStore(baseOptions({ ...NO_GM, localStorage: null, logger: createLogger() }));
  assert.deepEqual(await bare.read(), { backend: 'none', value: null, gmFailed: false });
  await assert.rejects(bare.write({ next: 8 }), /localStorage is unavailable/);
});

test('unparseable fallback JSON counts as an unavailable fallback', async () => {
  const logger = createLogger();
  const store = createGmFirstJsonStore(
    baseOptions({ ...NO_GM, localStorage: createLocalStorage({ localKey: '{broken' }), logger }),
  );

  assert.deepEqual(await store.read(), { backend: 'none', value: null, gmFailed: false });
  assert.deepEqual(store.readFallback(), { available: false, value: null });
  assert.deepEqual(logger.warnings, [
    'Test Script: failed to read settings from fallback storage.',
    'Test Script: failed to read settings from fallback storage.',
  ]);
});

test('readFallback reads only localStorage', () => {
  const gm = createGm({ gmKey: { from: 'gm' } });
  const store = createGmFirstJsonStore(
    baseOptions({
      ...gm,
      localStorage: createLocalStorage({ localKey: JSON.stringify({ from: 'local' }) }),
      logger: createLogger(),
    }),
  );
  assert.deepEqual(store.readFallback(), { available: true, value: { from: 'local', normalized: true } });

  const empty = createGmFirstJsonStore(
    baseOptions({ ...gm, localStorage: createLocalStorage(), logger: createLogger() }),
  );
  assert.deepEqual(empty.readFallback(), { available: true, value: null });
});

test('fallbackOnly writes skip GM even when it is available', async () => {
  const gm = createGm();
  const localStorage = createLocalStorage();
  const store = createGmFirstJsonStore(baseOptions({ ...gm, localStorage, mirror: true, logger: createLogger() }));

  assert.deepEqual(await store.write({ next: 9 }, { fallbackOnly: true }), {
    backend: 'localStorage',
    mirrorDegraded: false,
  });
  assert.deepEqual(gm.writes, []);
  assert.deepEqual(localStorage.writes, [['localKey', JSON.stringify({ next: 9 })]]);
});

test('without a fallback key the store is GM only and never touches localStorage', async () => {
  const localStorage = createLocalStorage({ localKey: JSON.stringify({ from: 'local' }) });
  const logger = createLogger();
  const failing = createGmFirstJsonStore(
    baseOptions({
      ...createGm({}, { failGet: true }),
      fallbackKey: null,
      localStorage,
      mirror: true,
      logger,
    }),
  );
  assert.deepEqual(await failing.read(), { backend: 'none', value: null, gmFailed: true });
  assert.deepEqual(failing.readFallback(), { available: false, value: null });
  assert.deepEqual(logger.warnings, ['Test Script: failed to read settings from userscript storage.']);

  const gm = createGm();
  const working = createGmFirstJsonStore(
    baseOptions({ ...gm, fallbackKey: null, localStorage, mirror: true, logger: createLogger() }),
  );
  assert.deepEqual(await working.write({ next: 10 }), { backend: 'gm', mirrorDegraded: false });
  assert.deepEqual(localStorage.writes, []);

  const missing = createGmFirstJsonStore(
    baseOptions({ ...NO_GM, fallbackKey: null, localStorage, logger: createLogger() }),
  );
  assert.deepEqual(await missing.read(), { backend: 'none', value: null, gmFailed: false });
  await assert.rejects(missing.write({ next: 11 }), /no fallback storage/i);
});

test('subscribe forwards legacy GM changes and removes the synchronous listener id', () => {
  const changes = [];
  const removed = [];
  const store = createGmFirstJsonStore(
    baseOptions({
      ...NO_GM,
      gmAddValueChangeListener(key, listener) {
        assert.equal(key, 'gmKey');
        listener(key, { old: 1 }, { new: 1 }, 1);
        listener(key, { old: 2 }, { new: 2 }, false);
        return 0;
      },
      gmRemoveValueChangeListener(id) {
        removed.push(id);
      },
      localStorage: createLocalStorage(),
      logger: createLogger(),
    }),
  );

  const unsubscribe = store.subscribe((change) => changes.push(change));
  assert.deepEqual(changes, [
    { backend: 'gm', key: 'gmKey', oldValue: { old: 1 }, newValue: { new: 1 }, remote: true },
    { backend: 'gm', key: 'gmKey', oldValue: { old: 2 }, newValue: { new: 2 }, remote: false },
  ]);
  unsubscribe();
  assert.deepEqual(removed, [0]);
});

test('subscribe waits for a promised GM listener id before removing it', async () => {
  const removed = [];
  const store = createGmFirstJsonStore(
    baseOptions({
      gm: {
        addValueChangeListener: () => Promise.resolve(7),
        removeValueChangeListener: (id) => removed.push(id),
      },
      localStorage: createLocalStorage(),
      logger: createLogger(),
    }),
  );

  const unsubscribe = store.subscribe(() => {});
  unsubscribe();
  assert.deepEqual(removed, []);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(removed, [7]);
});

test('subscribe warns when watching GM fails and never throws', async () => {
  const logger = createLogger();
  const throwing = createGmFirstJsonStore(
    baseOptions({
      ...NO_GM,
      gmAddValueChangeListener() {
        throw new Error('watch blocked');
      },
      logger,
    }),
  );
  const rejecting = createGmFirstJsonStore(
    baseOptions({
      gm: { addValueChangeListener: () => Promise.reject(new Error('watch rejected')) },
      logger,
    }),
  );

  const unsubscribeThrowing = throwing.subscribe(() => {});
  const unsubscribeRejecting = rejecting.subscribe(() => {});
  await Promise.resolve();
  await Promise.resolve();
  unsubscribeThrowing();
  unsubscribeRejecting();
  await Promise.resolve();
  assert.deepEqual(logger.warnings, [
    'Test Script: failed to watch settings in userscript storage.',
    'Test Script: failed to watch settings in userscript storage.',
  ]);
});

test('subscribe forwards same-origin storage events for the fallback key and unsubscribes', () => {
  const changes = [];
  const handlers = new Set();
  const store = createGmFirstJsonStore(
    baseOptions({
      ...NO_GM,
      localStorage: createLocalStorage(),
      eventTarget: {
        addEventListener(type, handler) {
          if (type === 'storage') handlers.add(handler);
        },
        removeEventListener(type, handler) {
          if (type === 'storage') handlers.delete(handler);
        },
      },
      logger: createLogger(),
    }),
  );

  const unsubscribe = store.subscribe((change) => changes.push(change));
  for (const handler of handlers) {
    handler({ key: 'unrelated', oldValue: 'a', newValue: 'b' });
    handler({ key: 'localKey', oldValue: '1', newValue: '2' });
    handler({ key: null, oldValue: null, newValue: null });
  }
  assert.deepEqual(changes, [
    { backend: 'localStorage', key: 'localKey', oldValue: '1', newValue: '2', remote: true },
    { backend: 'localStorage', key: 'localKey', oldValue: null, newValue: null, remote: true },
  ]);

  unsubscribe();
  assert.equal(handlers.size, 0);
});

test('unsubscribe swallows errors from either side', () => {
  const store = createGmFirstJsonStore(
    baseOptions({
      ...NO_GM,
      gmAddValueChangeListener: () => 1,
      gmRemoveValueChangeListener() {
        throw new Error('remove blocked');
      },
      eventTarget: {
        addEventListener() {},
        removeEventListener() {
          throw new Error('remove blocked');
        },
      },
      logger: createLogger(),
    }),
  );

  const unsubscribe = store.subscribe(() => {});
  assert.doesNotThrow(unsubscribe);
});
