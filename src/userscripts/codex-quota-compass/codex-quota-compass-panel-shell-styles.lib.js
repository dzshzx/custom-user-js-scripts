(function attachCodexQuotaCompassPanelShellStylesLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelShellStylesLib';

  function createShellStyles(rootId, constants = {}) {
    const {
      BUTTON_FULL_WIDTH = 168,
      BUTTON_HEIGHT = 42,
      PANEL_OPEN_ANIMATION_MS = 220,
      PANEL_CLOSE_ANIMATION_MS = PANEL_OPEN_ANIMATION_MS * 2,
      PANEL_OPEN_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)',
      PANEL_CLOSE_EASING = 'cubic-bezier(0.64, 0, 0.78, 0)',
    } = constants;

    return `
      #${rootId} {
        color-scheme: light dark;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        /* Single source of truth for theming: light values here, dark overrides
           only flip these variables in the prefers-color-scheme block below. */
        --cqc-primary: #10a37f;
        --cqc-primary-strong: #0f766e;
        --cqc-primary-soft: rgba(16, 163, 127, 0.12);
        --cqc-primary-border: rgba(16, 163, 127, 0.55);
        --cqc-primary-ring: rgba(16, 163, 127, 0.18);
        --cqc-accent: #f59e0b;
        --cqc-surface: #ffffff;
        --cqc-surface-muted: #f7f7f8;
        --cqc-surface-sunken: #f8fafc;
        --cqc-text: #202123;
        --cqc-text-muted: #6e6e80;
        --cqc-border: rgba(0, 0, 0, 0.1);
        --cqc-border-strong: rgba(0, 0, 0, 0.16);
        --cqc-row-hover: rgba(16, 163, 127, 0.06);
        --cqc-danger: #d92d20;
        --cqc-warning: #b45309;
        --cqc-warning-surface: rgba(245, 158, 11, 0.1);
        --cqc-warning-border: rgba(245, 158, 11, 0.32);
        --cqc-shadow-panel: 0 24px 80px rgba(0, 0, 0, 0.22);
        --cqc-shadow-button: 0 8px 28px rgba(0, 0, 0, 0.14);
        --cqc-button-bg: rgba(248, 250, 252, 0.95);
        --cqc-button-bg-docked: rgba(255, 255, 255, 0.62);
        --cqc-button-bg-docked-active: rgba(255, 255, 255, 0.94);
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
      }

      #${rootId} * {
        box-sizing: border-box;
      }

      .cqc-button {
        position: fixed;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 8px;
        width: ${BUTTON_FULL_WIDTH}px;
        min-width: ${BUTTON_HEIGHT}px;
        height: 42px;
        border: 1px solid var(--cqc-border-strong);
        border-radius: 999px;
        padding: 0 14px;
        background: var(--cqc-button-bg);
        color: var(--cqc-text);
        box-shadow: var(--cqc-shadow-button);
        cursor: pointer;
        pointer-events: auto;
        user-select: none;
        backdrop-filter: blur(18px);
        overflow: hidden;
        transition:
          width 160ms ease,
          padding 160ms ease,
          opacity 160ms ease,
          background-color 160ms ease,
          border-color 160ms ease,
          box-shadow 160ms ease;
      }

      .cqc-button:active,
      .cqc-button.is-dragging {
        cursor: grabbing;
      }

      .cqc-button.is-active {
        border-color: var(--cqc-primary-border);
        box-shadow: 0 10px 32px var(--cqc-primary-ring);
      }

      .cqc-button:focus-visible,
      .cqc-refresh:focus-visible,
      .cqc-icon-button:focus-visible,
      .cqc-detail-footnote button:focus-visible,
      .cqc-sync-form button:focus-visible,
      .cqc-sync-form input:focus-visible {
        outline: 2px solid var(--cqc-primary);
        outline-offset: 2px;
      }

      .cqc-button.is-docked {
        width: ${BUTTON_HEIGHT}px;
        gap: 0;
        padding: 0;
        justify-content: center;
        background: var(--cqc-button-bg-docked);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
        opacity: 0.72;
      }

      .cqc-button.is-docked:hover,
      .cqc-button.is-docked:focus-visible,
      .cqc-button.is-docked.is-active,
      .cqc-button.is-docked.is-dragging {
        width: ${BUTTON_FULL_WIDTH}px;
        gap: 8px;
        padding: 0 14px;
        justify-content: flex-start;
        background: var(--cqc-button-bg-docked-active);
        opacity: 1;
      }

      .cqc-button.is-panel-source-hidden,
      .cqc-button.is-docked.is-panel-source-hidden {
        opacity: 0;
        pointer-events: none;
      }

      .cqc-button.is-docked.is-hover-locked {
        width: ${BUTTON_HEIGHT}px;
        gap: 0;
        padding: 0;
        justify-content: center;
        background: var(--cqc-button-bg-docked);
        opacity: 0.72;
      }

      .cqc-button.is-docked.is-hover-locked .cqc-button-text,
      .cqc-button.is-docked .cqc-button-text {
        max-width: 0;
        opacity: 0;
        transform: translateX(-4px);
      }

      .cqc-button-text {
        display: grid;
        gap: 1px;
        text-align: left;
        line-height: 1.1;
        max-width: 116px;
        overflow: hidden;
        transition:
          max-width 160ms ease,
          opacity 140ms ease,
          transform 160ms ease;
      }

      .cqc-button.is-docked:hover .cqc-button-text,
      .cqc-button.is-docked:focus-visible .cqc-button-text,
      .cqc-button.is-docked.is-active .cqc-button-text,
      .cqc-button.is-docked.is-dragging .cqc-button-text {
        max-width: 116px;
        opacity: 1;
        transform: translateX(0);
      }

      .cqc-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--cqc-primary);
        box-shadow: 0 0 0 4px var(--cqc-primary-ring);
        flex: 0 0 auto;
      }

      .cqc-button-title {
        font-size: 13px;
        font-weight: 650;
      }

      .cqc-status {
        color: var(--cqc-text-muted);
        font-size: 11px;
      }

      .cqc-status[data-tone="loading"] { color: var(--cqc-primary-strong); }
      .cqc-status[data-tone="success"] { color: var(--cqc-primary); }
      .cqc-status[data-tone="error"] { color: var(--cqc-danger); }

      .cqc-panel {
        position: fixed;
        z-index: 2;
        top: 88px;
        right: auto;
        width: min(560px, calc(100vw - 32px));
        height: auto;
        max-height: min(760px, calc(100vh - 24px));
        border: 1px solid var(--cqc-border-strong);
        border-radius: 12px;
        background: var(--cqc-surface);
        color: var(--cqc-text);
        box-shadow: var(--cqc-shadow-panel);
        overflow: hidden;
        pointer-events: auto;
        opacity: 0;
        transition:
          left ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          top ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          width ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          height ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          border-radius ${PANEL_OPEN_ANIMATION_MS}ms ${PANEL_OPEN_EASING},
          opacity 120ms ease;
      }

      .cqc-panel.is-open {
        opacity: 1;
      }

      .cqc-panel.is-closing {
        transition:
          left ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          top ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          width ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          height ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          border-radius ${PANEL_CLOSE_ANIMATION_MS}ms ${PANEL_CLOSE_EASING},
          opacity ${PANEL_CLOSE_ANIMATION_MS}ms ease;
      }

      .cqc-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--cqc-border);
        background: var(--cqc-surface-muted);
        opacity: 0;
        transition: opacity 120ms ease 80ms;
      }

      .cqc-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        font-size: 14px;
        font-weight: 650;
      }

      .cqc-panel-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .cqc-icon-button,
      .cqc-refresh {
        border: 1px solid var(--cqc-border-strong);
        border-radius: 8px;
        background: var(--cqc-surface);
        color: var(--cqc-text);
        min-height: 32px;
        padding: 0 10px;
        font-size: 13px;
        cursor: pointer;
      }

      .cqc-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        width: 32px;
        height: 32px;
        min-height: 32px;
        padding: 0;
        font-size: 18px;
        line-height: 1;
      }

      .cqc-close-icon {
        position: relative;
        width: 14px;
        height: 14px;
        display: block;
        flex: 0 0 auto;
      }

      .cqc-close-icon::before,
      .cqc-close-icon::after {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        width: 14px;
        height: 2px;
        border-radius: 999px;
        background: currentColor;
        transform-origin: center;
      }

      .cqc-close-icon::before {
        transform: translate(-50%, -50%) rotate(45deg);
      }

      .cqc-close-icon::after {
        transform: translate(-50%, -50%) rotate(-45deg);
      }

      .cqc-refresh:hover,
      .cqc-icon-button:hover {
        background: var(--cqc-surface-muted);
        border-color: var(--cqc-primary-border);
      }

      .cqc-content {
        container-type: inline-size;
        height: calc(100% - 49px);
        overflow: auto;
        padding: 14px;
        opacity: 0;
        transition: opacity 120ms ease 100ms;
      }

      .cqc-panel.is-open .cqc-panel-header,
      .cqc-panel.is-open .cqc-content {
        opacity: 1;
      }

      @media (prefers-reduced-motion: reduce) {
        .cqc-button,
        .cqc-panel,
        .cqc-panel-header,
        .cqc-content {
          transition: none !important;
        }
      }

      @media (max-width: 720px) {
        .cqc-panel {
          width: calc(100vw - 24px);
          height: auto;
          max-height: calc(100vh - 24px);
        }

        .cqc-content {
          height: calc(100% - 49px);
        }
      }

      @media (prefers-color-scheme: dark) {
        #${rootId} {
          --cqc-primary: #19c37d;
          --cqc-primary-strong: #34d399;
          --cqc-primary-soft: rgba(25, 195, 125, 0.2);
          --cqc-primary-border: rgba(25, 195, 125, 0.5);
          --cqc-primary-ring: rgba(25, 195, 125, 0.22);
          --cqc-surface: #2f2f2f;
          --cqc-surface-muted: #212121;
          --cqc-surface-sunken: #262626;
          --cqc-text: #ececf1;
          --cqc-text-muted: #b4b4b4;
          --cqc-border: rgba(255, 255, 255, 0.12);
          --cqc-border-strong: rgba(255, 255, 255, 0.18);
          --cqc-row-hover: rgba(25, 195, 125, 0.14);
          --cqc-warning: #fbbf24;
          --cqc-warning-surface: rgba(245, 158, 11, 0.16);
          --cqc-warning-border: rgba(245, 158, 11, 0.3);
          --cqc-shadow-panel: 0 24px 80px rgba(0, 0, 0, 0.5);
          --cqc-shadow-button: 0 8px 28px rgba(0, 0, 0, 0.4);
          --cqc-button-bg: rgba(47, 47, 47, 0.95);
          --cqc-button-bg-docked: rgba(47, 47, 47, 0.64);
          --cqc-button-bg-docked-active: rgba(47, 47, 47, 0.96);
        }
      }
    `;
  }

  globalObject.CodexQuotaCompassPanelShellStylesLib = {
    createShellStyles,
    name: LIB_NAME,
  };
}(globalThis));
