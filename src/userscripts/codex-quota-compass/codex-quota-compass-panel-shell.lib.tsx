import { render } from 'preact';
import { Icon } from '../shared/shared-icons.lib.tsx';
import { applyTheme } from '../shared/shared-tokens.lib.ts';
import { createWidgetShell } from '../shared/shared-widget-shell.lib.ts';
import { createShellStyles } from './codex-quota-compass-panel-shell-styles.lib.ts';
import type { Theme } from '../shared/shared-tokens.lib.ts';
import type { WidgetShell, WidgetShellStorage } from '../shared/shared-widget-shell.lib.ts';

export interface ShellLabels {
  panelTitle?: string;
  buttonTitle?: string;
  buttonAriaOpen?: string;
  statusIdle?: string;
  actionRefresh?: string;
  closeAria?: string;
}
export type ShellActionHandler = (action: string, event: MouseEvent, actionNode: HTMLElement) => void;
type ShellStorage = Pick<Storage, 'getItem' | 'setItem'> | null;
export interface FloatingPanelShellOptions {
  rootId: string;
  labels?: ShellLabels;
  positionKey?: string;
  tokenCss?: string;
  detectHost?: (documentObject: Document) => Theme | null;
  document?: Document;
  window?: Window | typeof globalThis;
  storage?: ShellStorage;
  onAction?: ShellActionHandler;
  onOpen?: () => void;
  onClose?: () => void;
}
export interface FloatingPanelShellRefs {
  root: HTMLDivElement | null;
  button: HTMLButtonElement | null;
  panel: HTMLDivElement | null;
  statusNode: HTMLElement | null;
  contentNode: HTMLElement | null;
}
export interface FloatingPanelShell {
  mount(): FloatingPanelShell | null;
  refs(): FloatingPanelShellRefs;
  setStatus(text: string, tone?: string): void;
  openPanel(): void;
  closePanel(): void;
  positionPanelNearButton(): void;
  schedulePanelResize(): void;
  isOpen(): boolean;
  destroy(): void;
}

const DEFAULT_BUTTON_POSITION = { top: 76, right: 24 };

// chatgpt.com signals its theme through a class or an inline color-scheme on
// <html>; return null when neither is conclusive so the kit falls back to the
// prefers-color-scheme media query.
function detectHostTheme(documentObject: Document | undefined = globalThis.document): Theme | null {
  const host = documentObject?.documentElement;
  if (!host) return null;
  const className = typeof host.className === 'string' ? host.className : '';
  if (/(^|\s)dark(\s|$)/.test(className)) return 'dark';
  const inlineScheme = String(host.style?.colorScheme || '').toLowerCase();
  if (inlineScheme.includes('dark')) return 'dark';
  if (/(^|\s)light(\s|$)/.test(className) || inlineScheme.includes('light')) return 'light';
  return null;
}

function ButtonContent({ labels }: { labels: ShellLabels }) {
  return (
    <>
      <span class="cqc-dot" aria-hidden="true" />
      <span class="cqc-button-text">
        <span class="cqc-button-title">{labels.buttonTitle || ''}</span>
        <span class="cqc-status" data-tone="idle">
          {labels.statusIdle || ''}
        </span>
      </span>
    </>
  );
}

function PanelHeader({ labels }: { labels: ShellLabels }) {
  return (
    <>
      <div class="cqc-panel-title">
        <span class="cqc-dot" aria-hidden="true" />
        <span>{labels.panelTitle || ''}</span>
      </div>
      <div class="cqc-panel-actions">
        <button type="button" class="cqc-refresh" data-action="refresh">
          <Icon name="refresh-cw" size={14} />
          <span>{labels.actionRefresh || ''}</span>
        </button>
        <button type="button" class="cqc-icon-button" data-action="close" aria-label={labels.closeAria || 'Close'}>
          <Icon name="x" size={16} />
        </button>
      </div>
    </>
  );
}

// Thin adapter over the shared widget shell: keeps the Codex Quota Compass DOM
// contract (#rootId, .cqc-button/.cqc-panel classes, data-action delegation,
// status line) while drag/dock/persist/Esc/focus behavior comes from the kit.
function createFloatingPanelShell(
  {
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
  }: FloatingPanelShellOptions = {} as FloatingPanelShellOptions,
) {
  if (!rootId) {
    throw new Error('Floating panel shell requires rootId.');
  }
  if (!documentObject?.createElement || !documentObject?.documentElement) {
    throw new Error('Floating panel shell requires a document adapter.');
  }
  if (!windowObject) {
    throw new Error('Floating panel shell requires a window adapter.');
  }

  let root: HTMLDivElement | null = null;
  let shell: WidgetShell | null = null;
  let statusNode: HTMLElement | null = null;
  let contentNode: HTMLElement | null = null;
  let themeCleanup: (() => void) | null = null;

  function refs(): FloatingPanelShellRefs {
    return { root, button: shell?.buttonEl || null, panel: shell?.panelEl || null, statusNode, contentNode };
  }

  function setStatus(text: string, tone = 'idle') {
    if (!statusNode) return;
    statusNode.textContent = text;
    statusNode.dataset.tone = tone;
  }

  function installShellStyles() {
    if (documentObject.getElementById(`${rootId}-shell-style`)) return;

    const style = documentObject.createElement('style');
    style.id = `${rootId}-shell-style`;
    style.textContent = [tokenCss, shell!.cssText, createShellStyles(rootId)].filter(Boolean).join('\n\n');
    documentObject.head.append(style);
  }

  function requestFrame(callback: () => void) {
    if (typeof windowObject.requestAnimationFrame === 'function') {
      windowObject.requestAnimationFrame(callback);
    } else {
      windowObject.setTimeout(callback, 16);
    }
  }

  function mount(): FloatingPanelShell | null {
    if (documentObject.getElementById(rootId)) return null;

    root = documentObject.createElement('div');
    root.id = rootId;
    documentObject.documentElement.append(root);

    themeCleanup = applyTheme(root, { detectHost: () => detectHost(documentObject), observeHost: true });

    shell = createWidgetShell({
      root,
      buttonAriaLabel: labels.buttonAriaOpen,
      buttonClass: 'cqc-button',
      panelClass: 'cqc-panel',
      panelWidth: 560,
      panelMaxHeight: 760,
      storage: storage?.getItem
        ? {
            get: (key) => storage.getItem(key),
            set: (key, value) => storage.setItem(key, value),
          }
        : (storage as WidgetShellStorage | null | undefined),
      positionKey,
      defaultPosition: DEFAULT_BUTTON_POSITION,
      dock: true,
      onOpen,
      onClose,
      renderPanelHeader: (headerEl) => {
        headerEl.classList.add('cqc-panel-header');
        render(<PanelHeader labels={labels} />, headerEl);
      },
      renderPanelBody: (bodyEl) => {
        bodyEl.classList.add('cqc-content');
      },
    });

    installShellStyles();

    // The status text is then updated in place by setStatus, outside preact.
    render(<ButtonContent labels={labels} />, shell.buttonEl);
    shell.buttonEl.dataset.action = 'toggle';
    statusNode = shell.buttonEl.querySelector<HTMLElement>('.cqc-status');
    contentNode = shell.panelEl.querySelector<HTMLElement>('.cqc-content');

    root.addEventListener('click', (event) => {
      const actionNode = (event.target as Element | null)?.closest?.<HTMLElement>('[data-action]');
      const action = actionNode?.dataset?.action;
      if (!action) return;
      onAction(action, event, actionNode!);
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

  const api: FloatingPanelShell = {
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

export { createFloatingPanelShell, detectHostTheme };
