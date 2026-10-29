import test from 'node:test';
import assert from 'node:assert/strict';

import { createGmFirstJsonStore } from '../src/userscripts/shared/shared-gm-json-store.lib.ts';
import { createMemoryStorage } from './helpers/dom-env.mjs';

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
// Node has no global localStorage; an explicit undefined keeps that obvious.
const NO_LOCAL_STORAGE = { localStorage: undefined };

function baseOptions(overrides = {}) {
  return {
    scriptName: 'Test Script',
    subject: 'settings',
    key: 'gmKey',
    fallbackKey: 'localKey',
    normalize: (raw) => (raw && typeof raw === 'object' ? { ...raw, normalized: true } : null),
    logger: createLogger(),
    ...overrides,
  };
}

test('GM available: reads and writes through GM and leaves localStorage alone without mirror', async () => {
  const gm = createGm({ gmKey: { from: 'gm' } });
  const localStorage = createMemoryStorage({ localKey: JSON.stringify({ from: 'local' }) });
  const logger = createLogger();
  const store = createGmFirstJsonStore(baseOptions({ ...gm, localStorage, logger }));

  assert.deepEqual(await store.read(), { backend: 'gm', value: { from: 'gm', normalized: true } });
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
      localStorage: createMemoryStorage(),
    }),
  );

  assert.deepEqual(await store.read(), { backend: 'gm', value: null });
  assert.deepEqual(defaults, [['gmKey', null]]);
});

test('inheritFrom: an empty primary key reads the inherited GM keys in order, never writes them', async () => {
  const gm = createGm({ sharedKey: { from: 'shared' } });
  const store = createGmFirstJsonStore(
    baseOptions({ ...gm, inheritFrom: ['legacyKey', 'sharedKey'], localStorage: createMemoryStorage() }),
  );

  assert.deepEqual(await store.read(), { backend: 'gm', value: { from: 'shared', normalized: true } });
  await store.write({ own: true });
  assert.deepEqual(gm.writes, [['gmKey', { own: true }]]);
  assert.deepEqual(await store.read(), { backend: 'gm', value: { own: true, normalized: true } });
});

test('GM available with mirror: a GM write is copied to localStorage', async () => {
  const gm = createGm();
  const localStorage = createMemoryStorage();
  const store = createGmFirstJsonStore(baseOptions({ ...gm, localStorage, mirror: true }));

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
      localStorage: createMemoryStorage({}, { failSet: true }),
      mirror: true,
      logger,
    }),
  );

  assert.deepEqual(await store.write({ next: 3 }), { backend: 'gm', mirrorDegraded: true });
  assert.deepEqual(gm.writes, [['gmKey', { next: 3 }]]);
  assert.deepEqual(logger.warnings, ['Test Script: failed to mirror archive to fallback storage.']);

  // A missing localStorage degrades the mirror the same way.
  const missing = createGmFirstJsonStore(baseOptions({ ...createGm(), ...NO_LOCAL_STORAGE, mirror: true }));
  assert.deepEqual(await missing.write({ next: 4 }), { backend: 'gm', mirrorDegraded: true });
});

test('GM missing: falls back to localStorage without a warning', async () => {
  const localStorage = createMemoryStorage({ localKey: JSON.stringify({ from: 'local' }) });
  const logger = createLogger();
  const store = createGmFirstJsonStore(baseOptions({ ...NO_GM, localStorage, logger }));

  assert.deepEqual(await store.read(), { backend: 'localStorage', value: { from: 'local', normalized: true } });
  assert.deepEqual(await store.write({ next: 5 }), { backend: 'localStorage', mirrorDegraded: false });
  assert.deepEqual(localStorage.writes, [['localKey', JSON.stringify({ next: 5 })]]);
  assert.deepEqual(logger.warnings, []);
});

test('GM throws: falls back to localStorage and warns', async () => {
  const localStorage = createMemoryStorage({ localKey: JSON.stringify({ from: 'local' }) });
  const logger = createLogger();
  const store = createGmFirstJsonStore(
    baseOptions({ ...createGm({}, { failGet: true, failSet: true }), localStorage, logger }),
  );

  assert.deepEqual(await store.read(), { backend: 'localStorage', value: { from: 'local', normalized: true } });
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
      localStorage: createMemoryStorage({ localKey: JSON.stringify({ from: 'local' }) }),
      logger,
    }),
  );

  assert.equal((await store.read()).backend, 'localStorage');
  assert.equal(logger.warnings.length, 1);
});

test('neither backend available: read answers none and write throws', async () => {
  const logger = createLogger();
  const store = createGmFirstJsonStore(
    baseOptions({
      ...createGm({}, { failGet: true, failSet: true }),
      localStorage: createMemoryStorage({}, { failGet: true, failSet: true }),
      logger,
    }),
  );

  assert.deepEqual(await store.read(), { backend: 'none', value: null });
  assert.deepEqual(logger.warnings, [
    'Test Script: failed to read settings from userscript storage.',
    'Test Script: failed to read settings from fallback storage.',
  ]);
  await assert.rejects(store.write({ next: 7 }), /set blocked/);

  const bare = createGmFirstJsonStore(baseOptions({ ...NO_GM, ...NO_LOCAL_STORAGE }));
  assert.deepEqual(await bare.read(), { backend: 'none', value: null });
  await assert.rejects(bare.write({ next: 8 }), /localStorage is unavailable/);
});

test('unparseable fallback JSON counts as an unavailable fallback', async () => {
  const logger = createLogger();
  const store = createGmFirstJsonStore(
    baseOptions({ ...NO_GM, localStorage: createMemoryStorage({ localKey: '{broken' }), logger }),
  );

  assert.deepEqual(await store.read(), { backend: 'none', value: null });
  assert.deepEqual(logger.warnings, ['Test Script: failed to read settings from fallback storage.']);
});

test('update: writes the transformed value GM first and hands the fallback copy to the transform', async () => {
  const gm = createGm({ gmKey: { from: 'gm' } });
  const localStorage = createMemoryStorage({ localKey: JSON.stringify({ from: 'local' }) });
  const store = createGmFirstJsonStore(baseOptions({ ...gm, localStorage, mirror: true }));

  const seen = [];
  const result = await store.update((current) => {
    seen.push({ backend: current.backend, value: current.value, fallback: current.fallback() });
    return { merged: true };
  });
  assert.deepEqual(seen, [
    { backend: 'gm', value: { from: 'gm', normalized: true }, fallback: { from: 'local', normalized: true } },
  ]);
  assert.deepEqual(result, {
    backend: 'gm',
    value: { merged: true },
    written: { backend: 'gm', mirrorDegraded: false },
  });
  assert.deepEqual(gm.writes, [['gmKey', { merged: true }]]);
  assert.deepEqual(localStorage.writes, [['localKey', JSON.stringify({ merged: true })]]);
});

test('update: returning undefined writes nothing', async () => {
  const gm = createGm({ gmKey: { from: 'gm' } });
  const localStorage = createMemoryStorage();
  const store = createGmFirstJsonStore(baseOptions({ ...gm, localStorage }));

  assert.deepEqual(await store.update(() => undefined), { backend: 'gm', value: { from: 'gm', normalized: true } });
  assert.deepEqual(gm.writes, []);
  assert.deepEqual(localStorage.writes, []);
});

test('update: a value derived after a GM read failure never overwrites the GM copy', async () => {
  const gm = createGm({ gmKey: { from: 'gm' } });
  let failRead = true;
  const localStorage = createMemoryStorage({ localKey: JSON.stringify({ from: 'local' }) });
  const store = createGmFirstJsonStore(
    baseOptions({
      ...gm,
      gmGetValue(key, fallback) {
        if (failRead) throw new Error('read failed');
        return gm.gmGetValue(key, fallback);
      },
      localStorage,
    }),
  );

  const degraded = await store.update((current) => ({ ...current.value, touched: true }));
  assert.deepEqual(degraded, {
    backend: 'localStorage',
    value: { from: 'local', normalized: true, touched: true },
    written: { backend: 'localStorage', mirrorDegraded: false },
  });
  assert.deepEqual(gm.writes, []);
  assert.deepEqual(localStorage.writes, [['localKey', JSON.stringify(degraded.value)]]);

  // Once GM reads again, the write goes GM first.
  failRead = false;
  const healthy = await store.update(() => ({ next: true }));
  assert.deepEqual(healthy.written, { backend: 'gm', mirrorDegraded: false });
  assert.deepEqual(gm.writes, [['gmKey', { next: true }]]);

  // GM merely absent is not a failure: the value lands wherever it can, without a warning.
  const logger = createLogger();
  const absent = createGmFirstJsonStore(baseOptions({ ...NO_GM, localStorage: createMemoryStorage(), logger }));
  assert.deepEqual((await absent.update(() => ({ next: 2 }))).written, {
    backend: 'localStorage',
    mirrorDegraded: false,
  });
  assert.deepEqual(logger.warnings, []);
});

test('update: with no fallback key the fallback copy is null and a failed GM read answers none', async () => {
  const gm = createGm({}, { failGet: true });
  const store = createGmFirstJsonStore(baseOptions({ ...gm, fallbackKey: undefined, ...NO_LOCAL_STORAGE }));

  const seen = [];
  const result = await store.update((current) => {
    seen.push({ backend: current.backend, fallback: current.fallback() });
    return undefined;
  });
  assert.deepEqual(seen, [{ backend: 'none', fallback: null }]);
  assert.deepEqual(result, { backend: 'none', value: null });
});

test('without a fallback key the store is GM only and never touches localStorage', async () => {
  const localStorage = createMemoryStorage({ localKey: JSON.stringify({ from: 'local' }) });
  const logger = createLogger();
  const failing = createGmFirstJsonStore(
    baseOptions({ ...createGm({}, { failGet: true }), fallbackKey: undefined, localStorage, mirror: true, logger }),
  );
  assert.deepEqual(await failing.read(), { backend: 'none', value: null });
  assert.deepEqual(logger.warnings, ['Test Script: failed to read settings from userscript storage.']);

  const gm = createGm();
  const working = createGmFirstJsonStore(baseOptions({ ...gm, fallbackKey: undefined, localStorage, mirror: true }));
  assert.deepEqual(await working.write({ next: 10 }), { backend: 'gm', mirrorDegraded: false });
  assert.deepEqual(localStorage.writes, []);

  const missing = createGmFirstJsonStore(baseOptions({ ...NO_GM, fallbackKey: undefined, localStorage }));
  assert.deepEqual(await missing.read(), { backend: 'none', value: null });
  await assert.rejects(missing.write({ next: 11 }), /no fallback storage/i);
});

test('a manager API that appears after construction is picked up and then kept', async () => {
  // The modern object is passed by reference, so a getter on it sees every probe.
  let getValue;
  let probes = 0;
  const modern = { setValue: async () => {} };
  Object.defineProperty(modern, 'getValue', {
    get() {
      probes += 1;
      return getValue;
    },
  });
  const store = createGmFirstJsonStore(
    baseOptions({ gm: modern, localStorage: createMemoryStorage({ localKey: JSON.stringify({ from: 'local' }) }) }),
  );

  assert.equal((await store.read()).backend, 'localStorage');
  getValue = async () => ({ from: 'gm' });
  assert.equal((await store.read()).backend, 'gm');
  const probesWhenFound = probes;
  await store.read();
  await store.write({ next: 12 });
  assert.equal(probes, probesWhenFound);
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
      localStorage: createMemoryStorage(),
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
      localStorage: createMemoryStorage(),
    }),
  );

  const unsubscribe = store.subscribe(() => {});
  unsubscribe();
  assert.deepEqual(removed, []);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(removed, [7]);

  // A remove that rejects or throws after the promised id arrives is swallowed (no unhandled rejection).
  for (const removeValueChangeListener of [
    () => Promise.reject(new Error('remove rejected')),
    () => {
      throw new Error('remove threw');
    },
  ]) {
    const failing = createGmFirstJsonStore(
      baseOptions({
        gm: { addValueChangeListener: () => Promise.resolve(8), removeValueChangeListener },
        localStorage: createMemoryStorage(),
      }),
    );
    failing.subscribe(() => {})();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
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
      localStorage: createMemoryStorage(),
      eventTarget: {
        addEventListener(type, handler) {
          if (type === 'storage') handlers.add(handler);
        },
        removeEventListener(type, handler) {
          if (type === 'storage') handlers.delete(handler);
        },
      },
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
    }),
  );

  const unsubscribe = store.subscribe(() => {});
  assert.doesNotThrow(unsubscribe);
});
