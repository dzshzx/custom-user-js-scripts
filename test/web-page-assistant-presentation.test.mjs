import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

import {
  createWidgetElement,
  createDialogElement,
} from '../src/userscripts/web-page-assistant/web-page-assistant-presentation.lib.js';
import { installAssistantBaseStyles } from '../src/userscripts/web-page-assistant/web-page-assistant-presentation-base-styles.lib.js';
import { installAssistantDialogStyles } from '../src/userscripts/web-page-assistant/web-page-assistant-presentation-dialog-styles.lib.js';

test('enabled widget hides the per-second countdown from assistive technology', { skip: domSkip }, () => {
  const window = createDomWindow();
  const { widget, widgetButton, countdownNodes, statusNode } = createWidgetElement({
    documentObject: window.document,
    model: { enabled: true, summary: '每 5 分钟刷新一次。' },
  });

  assert.equal(widget.hasAttribute('aria-live'), false);
  assert.equal(widget.className, 'part-widget');
  assert.equal(countdownNodes.length, 2);
  for (const node of countdownNodes) {
    assert.equal(node.getAttribute('aria-hidden'), 'true');
  }
  assert.equal(statusNode.getAttribute('role'), 'status');
  assert.ok(statusNode.classList.contains('part-sr-only'));
  assert.equal(widgetButton.dataset.partAction, undefined);
  assert.equal(widgetButton.getAttribute('aria-label'), '自动刷新倒计时，悬停或聚焦查看控制');
  assert.ok(widget.querySelector('.wk-icon-refresh-cw'));
  assert.ok(widget.querySelector('.wk-icon-settings'));
});

test('idle widget is a dimmed dot whose button opens settings', { skip: domSkip }, () => {
  const window = createDomWindow();
  const { widget, widgetButton, countdownNodes, statusNode } = createWidgetElement({
    documentObject: window.document,
    model: { enabled: false, summary: '当前未启用自动刷新。' },
  });

  assert.ok(widget.classList.contains('is-idle'));
  assert.equal(widgetButton.dataset.partAction, 'open-settings');
  assert.equal(widgetButton.getAttribute('aria-label'), '自动刷新未启用，打开设置');
  // No live countdown nodes at all when idle.
  assert.equal(countdownNodes.length, 0);
  assert.ok(statusNode);
  // The panel keeps the summary plus the settings entry, but no pause/disable.
  assert.ok(widget.querySelector('[data-part-role="widget-summary"]'));
  assert.ok(widget.querySelector('.part-widget-panel [data-part-action="open-settings"]'));
  assert.equal(widget.querySelector('[data-part-action="toggle-pause"]'), null);
  assert.equal(widget.querySelector('[data-part-action="disable-active"]'), null);
});

test('dialog close button uses the shared Lucide x icon', { skip: domSkip }, () => {
  const window = createDomWindow();
  const dialog = createDialogElement({
    documentObject: window.document,
    model: { activeTab: 'refresh' },
  });

  const closeButton = dialog.querySelector('[data-part-action="close-dialog"]');
  assert.ok(closeButton.querySelector('.wk-icon-x'));
  assert.equal(dialog.querySelector('.part-close-icon'), null);
  assert.equal(dialog.querySelector('.part-dialog').getAttribute('aria-modal'), 'true');
});

test('base styles bridge part tokens onto the shared kit tokens', { skip: domSkip }, () => {
  const window = createDomWindow();
  installAssistantBaseStyles({
    documentObject: window.document,
    rootId: 'part-test-root',
    styleId: 'part-test-style',
  });

  const css = window.document.getElementById('part-test-style').textContent;
  assert.match(css, /--part-surface: var\(--wk-surface\)/);
  assert.match(css, /--part-text: var\(--wk-text\)/);
  assert.match(css, /--part-action: var\(--wk-accent\)/);
  assert.match(css, /--part-danger: var\(--wk-danger\)/);
  assert.match(css, /--part-shadow-strong: var\(--wk-shadow-panel\)/);
  // Dead tokens and the unused secondary variant are gone.
  assert.doesNotMatch(css, /--part-accent-strong/);
  assert.doesNotMatch(css, /--part-accent-soft/);
  assert.doesNotMatch(css, /data-variant="secondary"/);
  // No local dark block or local icon class: theme comes from the kit.
  assert.doesNotMatch(css, /prefers-color-scheme/);
  assert.doesNotMatch(css, /part-icon-svg/);
  assert.match(css, /\.part-sr-only/);
  assert.match(css, /\.part-widget\.is-idle \.part-widget-button/);
});

test('dialog styles drop the pseudo-element close icon', { skip: domSkip }, () => {
  const window = createDomWindow();
  installAssistantDialogStyles({
    documentObject: window.document,
    rootId: 'part-test-root',
    styleId: 'part-test-dialog-style',
  });

  const css = window.document.getElementById('part-test-dialog-style').textContent;
  assert.doesNotMatch(css, /part-close-icon/);
});
