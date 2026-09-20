import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, createMemoryStorage, domSkip } from './helpers/dom-env.mjs';

import { createFloatingPanelShell, detectHostTheme } from '../src/userscripts/codex-quota-compass/codex-quota-compass-panel-shell.lib.js';

const POSITION_KEY = 'codexQuotaCompassButtonPosition';
const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function createMountedShell({ storage, labels, ...options } = {}) {
  const window = createDomWindow();
  const actions = [];
  const shell = createFloatingPanelShell({
    rootId: 'cqc-test-root',
    labels: labels || {
      panelTitle: 'Quota panel',
      buttonTitle: 'Quota',
      buttonAriaOpen: 'Open quota panel',
      statusIdle: 'Idle',
      actionRefresh: 'Refresh',
      closeAria: 'Close',
    },
    positionKey: POSITION_KEY,
    tokenCss: '#cqc-test-root { --wk-accent: #10a37f; }',
    document: window.document,
    window,
    storage: storage || createMemoryStorage(),
    onAction: (action) => actions.push(action),
    ...options,
  });

  const mounted = shell.mount();
  assert.ok(mounted);
  return { shell: mounted, window, actions };
}

test('createFloatingPanelShell mounts shell and preserves injected position key', { skip: domSkip }, async () => {
  const storage = createMemoryStorage();
  storage.setItem(POSITION_KEY, JSON.stringify({ left: 10, top: 90, dockSide: 'left' }));
  const { shell, window } = createMountedShell({ storage });
  const refs = shell.refs();

  assert.equal(refs.root.id, 'cqc-test-root');
  assert.equal(shell.isOpen(), false);
  assert.equal(refs.panel.hidden, true);
  assert.equal(refs.button.getAttribute('aria-expanded'), 'false');
  assert.equal(refs.statusNode.textContent, 'Idle');

  await flush();
  assert.equal(refs.button.style.top, '90px');
  assert.equal(refs.button.dataset.wkDocked, 'left');
  assert.equal(refs.button.style.right, 'auto');
  assert.equal(refs.button.style.left, '8px');
  shell.destroy();
});

test('createFloatingPanelShell keeps the CQC DOM contract on the shared shell', { skip: domSkip }, () => {
  const { shell } = createMountedShell();
  const refs = shell.refs();

  assert.equal(refs.button.dataset.action, 'toggle');
  assert.ok(refs.button.classList.contains('cqc-button'));
  assert.ok(refs.button.classList.contains('wk-widget-button'));
  assert.ok(refs.panel.classList.contains('cqc-panel'));
  assert.ok(refs.panel.classList.contains('wk-widget-panel'));
  assert.ok(refs.panel.querySelector('.cqc-panel-header'));
  assert.ok(refs.panel.querySelector('.cqc-content'));
  assert.ok(refs.contentNode.classList.contains('cqc-content'));
  assert.ok(refs.root.querySelector('[data-action="refresh"]'));
  assert.ok(refs.root.querySelector('[data-action="close"]'));
  // Lucide icons replace the old CSS close cross and the text-only refresh.
  assert.ok(refs.root.querySelector('.cqc-refresh .wk-icon-refresh-cw'));
  assert.ok(refs.root.querySelector('[data-action="close"] .wk-icon-x'));
  assert.equal(refs.root.querySelector('.cqc-close-icon'), null);
  shell.destroy();
});

test('createFloatingPanelShell installs tokens, kit and CQC styles once', { skip: domSkip }, () => {
  const { shell, window } = createMountedShell();
  const style = window.document.getElementById('cqc-test-root-shell-style');
  assert.ok(style);
  assert.match(style.textContent, /--wk-accent: #10a37f/);
  assert.match(style.textContent, /\.wk-widget-panel/);
  assert.match(style.textContent, /#cqc-test-root\[data-wk-theme="dark"\]/);
  assert.match(style.textContent, /\.cqc-button\[data-wk-docked\]/);
  shell.destroy();
});

test('createFloatingPanelShell updates status and delegates shell actions', { skip: domSkip }, () => {
  const { shell, actions } = createMountedShell();
  const refs = shell.refs();

  shell.setStatus('Ready', 'success');
  assert.equal(refs.statusNode.textContent, 'Ready');
  assert.equal(refs.statusNode.dataset.tone, 'success');

  refs.root.querySelector('[data-action="refresh"]').click();
  refs.root.querySelector('[data-action="close"]').click();

  assert.deepEqual(actions, ['refresh', 'close']);
  shell.destroy();
});

test('createFloatingPanelShell opens, repositions, and closes panel state', { skip: domSkip }, async () => {
  const { shell } = createMountedShell();
  const refs = shell.refs();

  shell.openPanel();
  assert.equal(shell.isOpen(), true);
  assert.equal(refs.panel.hidden, false);
  assert.equal(refs.button.classList.contains('is-active'), true);
  assert.equal(refs.button.getAttribute('aria-expanded'), 'true');

  shell.schedulePanelResize();
  await flush();
  assert.equal(refs.panel.style.width, '560px');

  shell.closePanel();
  assert.equal(shell.isOpen(), false);
  assert.equal(refs.button.classList.contains('is-active'), false);
  assert.equal(refs.button.getAttribute('aria-expanded'), 'false');
  await flush(260);
  assert.equal(refs.panel.hidden, true);
  shell.destroy();
});

test('Escape closes the panel and focus returns to the floating button', { skip: domSkip }, () => {
  const { shell, window } = createMountedShell();

  shell.openPanel();
  assert.equal(window.document.activeElement, shell.refs().panel.querySelector('.cqc-refresh'));

  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(shell.isOpen(), false);
  assert.equal(window.document.activeElement, shell.refs().button);
  shell.destroy();
});

test('pointerdown outside the shell closes the panel', { skip: domSkip }, () => {
  const { shell, window } = createMountedShell();
  shell.openPanel();

  const outside = window.document.createElement('div');
  window.document.body.append(outside);
  outside.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(shell.isOpen(), false);
  shell.destroy();
});

test('createFloatingPanelShell escapes labels in shell markup', { skip: domSkip }, () => {
  const { shell } = createMountedShell({
    labels: {
      panelTitle: 'Panel <title>',
      buttonTitle: 'Quota & Usage',
      buttonAriaOpen: 'Open <quota>',
      statusIdle: 'Idle "now"',
      actionRefresh: 'Refresh',
      closeAria: 'Close',
    },
  });
  const refs = shell.refs();
  // Attribute values are set through setAttribute (verbatim), text through
  // escaped innerHTML markup; both must round-trip the literal label text.
  assert.equal(refs.button.getAttribute('aria-label'), 'Open <quota>');
  assert.equal(refs.root.querySelector('.cqc-button-title').textContent, 'Quota & Usage');
  assert.equal(refs.statusNode.textContent, 'Idle "now"');
  assert.equal(refs.root.querySelector('.cqc-panel-title span:last-child').textContent, 'Panel <title>');
  assert.match(refs.root.innerHTML, /Panel &lt;title&gt;/);
  shell.destroy();
});

test('shell theme follows the host documentElement class', { skip: domSkip }, async () => {
  const window = createDomWindow();
  window.document.documentElement.className = 'dark';
  const shell = createFloatingPanelShell({
    rootId: 'cqc-theme-root',
    labels: { statusIdle: 'Idle' },
    document: window.document,
    window,
    storage: createMemoryStorage(),
  });
  const mounted = shell.mount();
  assert.ok(mounted);
  const root = window.document.getElementById('cqc-theme-root');
  assert.equal(root.dataset.wkTheme, 'dark');

  window.document.documentElement.className = 'light';
  await flush();
  assert.equal(root.dataset.wkTheme, 'light');
  shell.destroy();
});

test('detectHostTheme reads chatgpt.com dark and light host signals', { skip: domSkip }, () => {
  const window = createDomWindow();
  const host = window.document.documentElement;

  host.className = 'dark';
  assert.equal(detectHostTheme(window.document), 'dark');

  host.className = '';
  host.style.colorScheme = 'dark';
  assert.equal(detectHostTheme(window.document), 'dark');

  host.style.colorScheme = 'light';
  assert.equal(detectHostTheme(window.document), 'light');

  host.style.colorScheme = '';
  assert.equal(detectHostTheme(window.document), null);
});

test('destroy removes the root and releases listeners', { skip: domSkip }, () => {
  const { shell, window } = createMountedShell();
  shell.openPanel();
  shell.destroy();

  assert.equal(window.document.getElementById('cqc-test-root'), null);
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(shell.isOpen(), false);
});
