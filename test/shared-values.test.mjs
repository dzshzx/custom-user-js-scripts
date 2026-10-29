import test from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';

import { coerce, errorMessage, isRecord } from '../src/userscripts/shared/shared-values.lib.ts';

test('isRecord accepts plain objects only', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord(Object.create(null)), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord('x'), false);
});

test('coerce runs the transform for missing keys so defaults apply', () => {
  const schema = v.object({ count: coerce((value) => (typeof value === 'number' ? value : 0)) });
  assert.deepEqual(v.parse(schema, {}), { count: 0 });
  assert.deepEqual(v.parse(schema, { count: 3 }), { count: 3 });
  assert.deepEqual(v.parse(schema, { count: 'bad' }), { count: 0 });
});

test('errorMessage reads Error, string, GM error objects and odd values without throwing', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom');
  assert.equal(errorMessage('plain'), 'plain');
  assert.equal(errorMessage({ id: 1, error: 'not_whitelisted', details: {} }), 'not_whitelisted');
  assert.equal(errorMessage({ message: 'from message' }), 'from message');
  assert.equal(errorMessage({ code: 7 }), '{"code":7}');
  assert.equal(errorMessage(null), 'null');
  assert.equal(errorMessage(undefined), 'undefined');
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(errorMessage(cyclic), 'unknown error');
});
