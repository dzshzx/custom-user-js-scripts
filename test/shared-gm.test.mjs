import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGmApi } from '../src/userscripts/shared/shared-gm.lib.ts';

test('resolveGmApi wraps a synchronous getValue/setValue override in a promise', async () => {
  const writes = [];
  const gm = resolveGmApi({
    gmGetValue: (key, fallback) => (key === 'known' ? 'stored' : fallback),
    gmSetValue: (key, value) => {
      writes.push([key, value]);
      return 'ignored';
    },
  });

  const read = gm.getValue('known', null);
  assert.ok(read instanceof Promise);
  assert.equal(await read, 'stored');
  assert.equal(await gm.getValue('missing', 'default'), 'default');

  const written = gm.setValue('key', { a: 1 });
  assert.ok(written instanceof Promise);
  await written;
  assert.deepEqual(writes, [['key', { a: 1 }]]);
});

test('resolveGmApi turns a synchronous throw into a rejected promise', async () => {
  const gm = resolveGmApi({
    gmGetValue: () => {
      throw new Error('blocked read');
    },
    gmSetValue: () => {
      throw new Error('blocked write');
    },
  });

  const read = gm.getValue('key', null);
  assert.ok(read instanceof Promise);
  await assert.rejects(read, /blocked read/);
  await assert.rejects(gm.setValue('key', 1), /blocked write/);
});

test('resolveGmApi binds the modern GM object and keeps its promises', async () => {
  const modern = {
    values: new Map([['key', 'modern']]),
    async getValue(key, fallback) {
      return this.values.has(key) ? this.values.get(key) : fallback;
    },
    async setValue(key, value) {
      this.values.set(key, value);
    },
  };
  const gm = resolveGmApi({ gm: modern });

  assert.equal(await gm.getValue('key', null), 'modern');
  await gm.setValue('other', 2);
  assert.equal(modern.values.get('other'), 2);
});

test('resolveGmApi reports missing storage functions as null', () => {
  const gm = resolveGmApi({ gm: {} });
  assert.equal(gm.getValue, null);
  assert.equal(gm.setValue, null);
});
