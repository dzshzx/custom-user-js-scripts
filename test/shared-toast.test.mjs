import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

import { createToaster } from '../src/userscripts/shared/shared-toast.lib.js';

function setup() {
  const window = createDomWindow();
  const root = window.document.createElement('div');
  window.document.body.append(root);
  const toaster = createToaster({ root });
  return { window, root, toaster, container: root.querySelector('.wk-toasts') };
}

test('createToaster mounts an aria-live status container inside the root', { skip: domSkip }, () => {
  const { root, container, toaster } = setup();
  assert.ok(container);
  assert.equal(container.getAttribute('role'), 'status');
  assert.equal(container.getAttribute('aria-live'), 'polite');
  assert.ok(root.contains(container));
  assert.ok(toaster.cssText.includes('.wk-toasts'));
  assert.ok(toaster.cssText.includes('prefers-reduced-motion'));
  toaster.destroy();
});

test('show appends a toast with tone classes and tone icons', { skip: domSkip }, () => {
  const { container, toaster } = setup();

  const info = toaster.show({ message: 'Saved', duration: 0 });
  assert.equal(info.dataset.tone, 'info');
  assert.equal(container.children.length, 1);
  assert.ok(info.textContent.includes('Saved'));

  const success = toaster.show({ message: 'Done', tone: 'success', duration: 0 });
  assert.ok(success.querySelector('.wk-icon-check'));

  const error = toaster.show({ message: 'Boom', tone: 'error', duration: 0 });
  assert.ok(error.querySelector('.wk-icon-alert-triangle'));

  toaster.destroy();
});

test('toasts are capped at three entries, oldest first', { skip: domSkip }, () => {
  const { container, toaster } = setup();
  for (let index = 0; index < 4; index += 1) {
    toaster.show({ message: `t${index}`, duration: 0 });
  }
  assert.equal(container.children.length, 3);
  assert.ok(!container.textContent.includes('t0'));
  assert.ok(container.textContent.includes('t3'));
  toaster.destroy();
});

test('showProgress updates, then settles into success or error tones', { skip: domSkip }, () => {
  const { container, toaster } = setup();

  const progress = toaster.showProgress({ message: 'Working' });
  const toast = container.children[0];
  assert.equal(toast.dataset.tone, 'progress');
  assert.ok(toast.querySelector('.wk-icon-loader'));
  assert.ok(toast.querySelector('.wk-spin'));

  progress.update('Half way');
  assert.ok(toast.textContent.includes('Half way'));

  progress.done('Finished');
  assert.equal(toast.dataset.tone, 'success');
  assert.ok(toast.querySelector('.wk-icon-check'));
  assert.ok(toast.textContent.includes('Finished'));
  assert.equal(toast.querySelector('.wk-spin'), null);

  const failing = toaster.showProgress({ message: 'Working' });
  const failToast = container.children[1];
  failing.fail('Broken');
  assert.equal(failToast.dataset.tone, 'error');
  assert.ok(failToast.querySelector('.wk-icon-alert-triangle'));
  assert.ok(failToast.textContent.includes('Broken'));

  toaster.destroy();
});

test('show auto-dismisses after the given duration', { skip: domSkip }, (t) => {
  // shared-toast.lib.js is imported directly (not evaluated inside a
  // happy-dom window), so its bare `setTimeout` is Node's real global and
  // node:test's mock.timers can advance it without any real wait.
  const { container, toaster } = setup();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  toaster.show({ message: 'Quick', duration: 30 });
  assert.equal(container.children.length, 1);

  t.mock.timers.tick(30);
  t.mock.timers.tick(160);
  assert.equal(container.children.length, 0);
  toaster.destroy();
});

test('destroy removes the container and clears pending timers', { skip: domSkip }, () => {
  const { root, container, toaster } = setup();
  toaster.show({ message: 'Bye', duration: 20 });
  toaster.destroy();

  // destroy() clears every pending timer synchronously (shared-toast.lib.js
  // destroy(): `for (const timer of timers) clearTimeout(timer)`), so there
  // is nothing left to wait for here.
  assert.equal(root.querySelector('.wk-toasts'), null);
  assert.equal(container.isConnected, false);
});
