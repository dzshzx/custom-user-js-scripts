import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

// Dist-level behavior tests: the dialog/modal wiring lives in the entry IIFE,
// so these drive the built userscript in a DOM instead of importing libs.
const distPath = path.resolve(
  import.meta.dirname,
  '../dist/web-page-assistant.user.js',
);
const distSource = await readFile(distPath, 'utf8');

const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

async function boot({ gmSetValue, localStorageStub, seedFallbackSettings, clock } = {}) {
  const window = createDomWindow({ url: 'https://example.com/article?id=1' });
  if (clock) {
    window.Date = class extends window.Date { static now() { return clock.now; } };
    window.setInterval = (handler) => { clock.tick = handler; return 1; };
    window.clearInterval = () => { clock.tick = () => {}; };
  }
  const pageContent = window.document.createElement('main');
  pageContent.id = 'page-content';
  window.document.body.append(pageContent);
  if (gmSetValue) window.GM_setValue = gmSetValue;
  // happy-dom ignores setItem patching on its Storage instance, so the stub
  // must replace the whole localStorage before the script captures it.
  if (localStorageStub) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageStub,
    });
  }
  if (seedFallbackSettings) {
    window.localStorage.setItem('__pageAutoRefreshTimerSettings', JSON.stringify(seedFallbackSettings));
  }
  window.eval(distSource);
  await flush(30);
  const root = window.document.getElementById('page-auto-refresh-timer-root');
  assert.ok(root, 'script root mounted');
  return { window, root, pageContent };
}

function dialogOf(root) {
  return root.querySelector('.part-backdrop');
}

test('idle widget renders collapsed and opens the settings dialog on click', { skip: domSkip }, async () => {
  const { window, root } = await boot();
  const button = root.querySelector('.part-widget-button');

  assert.ok(root.querySelector('.part-widget').classList.contains('is-idle'));
  assert.equal(root.querySelectorAll('[data-part-role="countdown"]').length, 0);
  assert.equal(
    root.querySelector('[data-part-role="widget-status"]').textContent,
    '当前未启用自动刷新。',
  );

  button.click();
  await flush();
  assert.ok(dialogOf(root), 'dialog opened');
  assert.ok(dialogOf(root).contains(window.document.activeElement), 'focus moved into the dialog');
});

test('dialog traps Tab focus, closes on Escape, inerts the page, and returns focus', { skip: domSkip }, async () => {
  const { window, root, pageContent } = await boot();
  const button = root.querySelector('.part-widget-button');
  button.click();
  await flush();

  const dialog = dialogOf(root);
  const panel = dialog.querySelector('.part-dialog');
  assert.equal(pageContent.hasAttribute('inert'), true);
  assert.ok(dialog.contains(window.document.activeElement));

  // Shift+Tab on the first focusable wraps to the last one inside the panel.
  const focusables = [...panel.querySelectorAll('button, [href], input, select, textarea')]
    .filter((el) => !el.disabled && !el.closest('[hidden]'));
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  first.focus();
  first.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
  assert.equal(window.document.activeElement, last);
  last.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(window.document.activeElement, first);

  // Escape closes through the same path as the close button.
  last.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await flush();
  assert.equal(dialogOf(root), null);
  assert.equal(pageContent.hasAttribute('inert'), false);
  assert.equal(window.document.activeElement, button);
});

test('dialog rebuilds preserve scroll offset and the focused control', { skip: domSkip }, async () => {
  const { window, root } = await boot();
  root.querySelector('.part-widget-button').click();
  await flush();

  const dialog = dialogOf(root);
  const panel = dialog.querySelector('.part-dialog');
  panel.scrollTop = 120;
  const siteRadio = dialog.querySelector('input[name="part-scope"][value="site"]');
  siteRadio.focus();
  siteRadio.checked = true;
  siteRadio.dispatchEvent(new window.Event('change', { bubbles: true }));
  await flush();

  const rebuilt = dialogOf(root);
  assert.ok(rebuilt !== dialog, 'dialog tree was rebuilt');
  assert.equal(rebuilt.querySelector('.part-dialog').scrollTop, 120);
  const refocused = window.document.activeElement;
  assert.equal(refocused.name, 'part-scope');
  assert.equal(refocused.value, 'site');
  assert.equal(refocused.checked, true);
});

test('write actions show a pending state while storage is in flight', { skip: domSkip }, async () => {
  let resolveWrite;
  const { window, root } = await boot({
    gmSetValue: () => new Promise((resolve) => { resolveWrite = resolve; }),
  });
  root.querySelector('.part-widget-button').click();
  await flush();

  const preset = dialogOf(root).querySelector('[data-part-action="save-preset"][data-interval-ms="30000"]');
  preset.click();
  await flush();

  assert.equal(preset.disabled, true);
  assert.equal(preset.textContent, '处理中…');

  resolveWrite();
  await flush(10);

  // The dialog re-rendered with the confirmation message and the widget went live.
  assert.match(dialogOf(root).querySelector('[data-part-role="message"]').textContent, /已保存到当前页面/);
  assert.equal(root.querySelector('.part-widget').classList.contains('is-idle'), false);
  assert.ok(root.querySelector('[data-part-action="toggle-pause"]'));
  assert.match(
    root.querySelector('[data-part-role="widget-status"]').textContent,
    /自动刷新已启用/,
  );
});

test('pause and resume announce a full status sentence through the live region', { skip: domSkip }, async () => {
  const { window, root } = await boot({
    seedFallbackSettings: {
      version: 2,
      refresh: { pages: { 'https://example.com/article?id=1': { intervalMs: 30_000 } }, sites: {} },
      unlocker: { pages: {}, sites: {} },
    },
  });

  const statusNode = root.querySelector('[data-part-role="widget-status"]');
  assert.match(statusNode.textContent, /当前页面自动刷新已启用，每 30 秒 刷新一次。/);

  root.querySelector('[data-part-action="toggle-pause"]').click();
  await flush();
  assert.match(statusNode.textContent, /自动刷新已暂停，剩余 30 秒。/);

  root.querySelector('[data-part-action="toggle-pause"]').click();
  await flush();
  assert.match(statusNode.textContent, /自动刷新已启用/);
});

test('a failed write restores the button and surfaces the error reason', { skip: domSkip }, async () => {
  const { window, root } = await boot({
    gmSetValue: () => Promise.reject(new Error('GM quota exceeded')),
    // The localStorage fallback also fails, so the write propagates.
    localStorageStub: {
      getItem: () => null,
      setItem: () => { throw new Error('fallback full'); },
    },
  });

  root.querySelector('.part-widget-button').click();
  await flush();

  const preset = dialogOf(root).querySelector('[data-part-action="save-preset"][data-interval-ms="30000"]');
  preset.click();
  await flush(10);

  assert.equal(preset.disabled, false);
  assert.equal(preset.textContent, '30 秒');
  const message = dialogOf(root).querySelector('[data-part-role="message"]');
  assert.equal(message.dataset.tone, 'error');
  // The GM failure is logged and falls back; the surfaced reason is the
  // fallback write that ultimately propagated.
  assert.match(message.textContent, /操作失败：设置保存失败。fallback full/);
});

test('countdown ticks preserve dialog inputs, focus and lifecycle announcement', { skip: domSkip }, async () => {
  const clock = { now: 1000 };
  const { window, root } = await boot({
    clock,
    seedFallbackSettings: {
      version: 2,
      refresh: { pages: { 'https://example.com/article?id=1': { intervalMs: 30000 } }, sites: {} },
    },
  });
  root.querySelector('[data-part-action="open-settings"]').click();
  await flush();
  const dialog = dialogOf(root);
  const input = dialog.querySelector('input[type="number"]');
  input.value = '42'; input.focus();
  const status = root.querySelector('[data-part-role="widget-status"]');
  const statusText = status.textContent;
  const countdown = root.querySelector('[data-part-role="countdown"]');
  const initialCountdown = countdown.textContent;
  clock.now += 1000;
  clock.tick();
  assert.equal(dialogOf(root), dialog);
  assert.equal(window.document.activeElement, input);
  assert.equal(input.value, '42');
  assert.equal(status.textContent, statusText);
  assert.notEqual(countdown.textContent, initialCountdown);
  window.dispatchEvent(new window.Event('pagehide'));
});
