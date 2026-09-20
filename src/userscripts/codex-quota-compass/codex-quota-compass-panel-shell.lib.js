import { iconSvg } from '../shared/shared-icons.lib.js';
import { applyTheme } from '../shared/shared-tokens.lib.js';
import { createWidgetShell } from '../shared/shared-widget-shell.lib.js';
import { createShellStyles } from './codex-quota-compass-panel-shell-styles.lib.js';

const DEFAULT_BUTTON_POSITION = { top: 76, right: 24 };

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// chatgpt.com signals its theme through a class or an inline color-scheme on
// <html>; return null when neither is conclusive so the kit falls back to the
// prefers-color-scheme media query.
function detectHostTheme(documentObject = globalThis.document) {
  const host = documentObject?.documentElement;
  if (!host) return null;
  const className = typeof host.className === 'string' ? host.className : '';
  if (/(^|\s)dark(\s|$)/.test(className)) return 'dark';
  const inlineScheme = String(host.style?.colorScheme || '').toLowerCase();
  if (inlineScheme.includes('dark')) return 'dark';
  if (/(^|\s)light(\s|$)/.test(className) || inlineScheme.includes('light')) return 'light';
  return null;
}

function createButtonContentMarkup(labels = {}) {
  return `
    <span class="cqc-dot" aria-hidden="true"></span>
    <span class="cqc-button-text">
      <span class="cqc-button-title">${escapeHtml(labels.buttonTitle || '')}</span>
      <span class="cqc-status" data-tone="idle">${escapeHtml(labels.statusIdle || '')}</span>
    </span>
  `;
}

function renderPanelHeader(headerEl, labels = {}) {
  headerEl.classList.add('cqc-panel-header');
  headerEl.innerHTML = `
    <div class="cqc-panel-title">
      <span class="cqc-dot" aria-hidden="true"></span>
      <span>${escapeHtml(labels.panelTitle || '')}</span>
    </div>
    <div class="cqc-panel-actions">
      <button type="button" class="cqc-refresh" data-action="refresh">${iconSvg('refresh-cw', { size: 14 })}<span>${escapeHtml(labels.actionRefresh || '')}</span></button>
      <button type="button" class="cqc-icon-button" data-action="close" aria-label="${escapeHtml(labels.closeAria || 'Close')}">${iconSvg('x', { size: 16 })}</button>
    </div>
  `;
}

// Thin adapter over the shared widget shell: keeps the Codex Quota Compass DOM
// contract (#rootId, .cqc-button/.cqc-panel classes, data-action delegation,
// status line) while drag/dock/persist/Esc/focus behavior comes from the kit.
function createFloatingPanelShell({
  rootId,
  labels = {},
  positionKey = `${rootId}:buttonPosition`,
  tokenCss = '',
  detectHost = detectHostTheme,
  document: documentObject = globalThis.document,
  window: windowObject = globalThis,
  storage = globalThis.localStorage,
  onAction = () => {},
  onOpen,
  onClose,
} = {}) {
  if (!rootId) {
    throw new Error('Floating panel shell requires rootId.');
  }
  if (!documentObject?.createElement || !documentObject?.documentElement) {
    throw new Error('Floating panel shell requires a document adapter.');
  }
  if (!windowObject) {
    throw new Error('Floating panel shell requires a window adapter.');
  }

  let root = null;
  let shell = null;
  let statusNode = null;
  let contentNode = null;
  let themeCleanup = null;

  function refs() {
    return { root, button: shell?.buttonEl || null, panel: shell?.panelEl || null, statusNode, contentNode };
  }

  function setStatus(text, tone = 'idle') {
    if (!statusNode) return;
    statusNode.textContent = text;
    statusNode.dataset.tone = tone;
  }

  function installShellStyles() {
    if (documentObject.getElementById(`${rootId}-shell-style`)) return;

    const style = documentObject.createElement('style');
    style.id = `${rootId}-shell-style`;
    style.textContent = [tokenCss, shell.cssText, createShellStyles(rootId)]
      .filter(Boolean)
      .join('\n\n');
    documentObject.head.append(style);
  }

  function requestFrame(callback) {
    if (typeof windowObject.requestAnimationFrame === 'function') {
      windowObject.requestAnimationFrame(callback);
    } else {
      windowObject.setTimeout(callback, 16);
    }
  }

  function mount() {
    if (documentObject.getElementById(rootId)) return null;

    root = documentObject.createElement('div');
    root.id = rootId;
    documentObject.documentElement.append(root);

    themeCleanup = applyTheme(root, { detectHost: () => detectHost(documentObject), observeHost: true });

    shell = createWidgetShell({
      root,
      buttonAriaLabel: labels.buttonAriaOpen,
      buttonContent: createButtonContentMarkup(labels),
      buttonClass: 'cqc-button',
      panelClass: 'cqc-panel',
      panelWidth: 560,
      panelMaxHeight: 760,
      storage: storage?.getItem
        ? {
          get: (key) => storage.getItem(key),
          set: (key, value) => storage.setItem(key, value),
        }
        : storage,
      positionKey,
      defaultPosition: DEFAULT_BUTTON_POSITION,
      dock: true,
      onOpen,
      onClose,
      renderPanelHeader: (headerEl) => renderPanelHeader(headerEl, labels),
      renderPanelBody: (bodyEl) => {
        bodyEl.classList.add('cqc-content');
      },
    });

    installShellStyles();

    shell.buttonEl.dataset.action = 'toggle';
    statusNode = shell.buttonEl.querySelector('.cqc-status');
    contentNode = shell.panelEl.querySelector('.cqc-content');

    root.addEventListener('click', (event) => {
      const actionNode = event.target?.closest?.('[data-action]');
      const action = actionNode?.dataset?.action;
      if (!action) return;
      onAction(action, event, actionNode);
    });

    setStatus(labels.statusIdle || '', 'idle');

    return api;
  }

  function positionPanelNearButton() {
    shell?.reposition();
  }

  function schedulePanelResize() {
    if (!shell?.isOpen()) return;
    requestFrame(() => {
      if (shell?.isOpen()) shell.reposition();
    });
  }

  function destroy() {
    themeCleanup?.();
    themeCleanup = null;
    shell?.destroy();
    shell = null;
    root?.remove?.();
    root = null;
    statusNode = null;
    contentNode = null;
  }

  const api = {
    mount,
    refs,
    setStatus,
    openPanel: () => shell?.open(),
    closePanel: () => shell?.close(),
    positionPanelNearButton,
    schedulePanelResize,
    isOpen: () => Boolean(shell?.isOpen()),
    destroy,
  };

  return api;
}

export {
  createFloatingPanelShell,
  detectHostTheme,
};
