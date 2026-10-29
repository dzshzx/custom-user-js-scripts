import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

import { ensureStyle } from '../src/userscripts/shared/shared-dom.lib.ts';

test('ensureStyle installs once, lets only the installer remove it', { skip: domSkip }, () => {
  const { document } = createDomWindow();

  const remove = ensureStyle(document, 'wk-test-style', '.a { color: red; }');
  const node = document.getElementById('wk-test-style');
  assert.equal(node.tagName, 'STYLE');
  assert.equal(node.textContent, '.a { color: red; }');
  assert.equal(node.parentNode, document.head);

  const removeAgain = ensureStyle(document, 'wk-test-style', '.b {}');
  assert.equal(document.querySelectorAll('#wk-test-style').length, 1);
  assert.equal(node.textContent, '.a { color: red; }');

  removeAgain();
  assert.ok(document.getElementById('wk-test-style'));
  remove();
  assert.equal(document.getElementById('wk-test-style'), null);
});

test('ensureStyle mounts under the given parent', { skip: domSkip }, () => {
  const { document } = createDomWindow();
  ensureStyle(document, 'wk-root-style', '.c {}', document.documentElement);
  assert.equal(document.getElementById('wk-root-style').parentNode, document.documentElement);
});
