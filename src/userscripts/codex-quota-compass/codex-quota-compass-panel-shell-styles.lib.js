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
        --cqc-primary: #10a37f;
        --cqc-primary-soft: #34d399;
        --cqc-accent: #f59e0b;
        --cqc-surface: #ffffff;
        --cqc-surface-muted: #f8fafc;
        --cqc-text: #202123;
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
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 999px;
        padding: 0 14px;
        background: rgba(248, 250, 252, 0.95);
        color: var(--cqc-text);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
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
        border-color: rgba(30, 64, 175, 0.45);
        box-shadow: 0 10px 32px rgba(30, 64, 175, 0.22);
      }

      .cqc-button:focus-visible,
      .cqc-refresh:focus-visible,
      .cqc-icon-button:focus-visible,
      .cqc-detail-footnote button:focus-visible {
        outline: 2px solid var(--cqc-primary-soft);
        outline-offset: 2px;
      }

      .cqc-button.is-docked {
        width: ${BUTTON_HEIGHT}px;
        gap: 0;
        padding: 0;
        justify-content: center;
        background: rgba(255, 255, 255, 0.62);
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
        background: rgba(255, 255, 255, 0.94);
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
        background: rgba(255, 255, 255, 0.62);
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
        box-shadow: 0 0 0 4px rgba(30, 64, 175, 0.14);
        flex: 0 0 auto;
      }

      .cqc-button-title {
        font-size: 13px;
        font-weight: 650;
      }

      .cqc-status {
        color: #6e6e80;
        font-size: 11px;
      }

      .cqc-status[data-tone="loading"] { color: #0f7f67; }
      .cqc-status[data-tone="success"] { color: var(--cqc-primary); }
      .cqc-status[data-tone="error"] { color: #d92d20; }

      .cqc-panel {
        position: fixed;
        z-index: 2;
        top: 88px;
        right: auto;
        width: min(560px, calc(100vw - 32px));
        height: auto;
        max-height: min(760px, calc(100vh - 24px));
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 12px;
        background: var(--cqc-surface);
        color: var(--cqc-text);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
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
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        background: #f7f7f8;
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
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 8px;
        background: #ffffff;
        color: #202123;
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
        background: #ececf1;
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
        .cqc-button,
        .cqc-panel,
        .cqc-icon-button,
        .cqc-refresh {
          background: #2f2f2f;
          color: #ececf1;
          border-color: rgba(255, 255, 255, 0.14);
        }

        .cqc-button.is-docked {
          background: rgba(47, 47, 47, 0.64);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
        }

        .cqc-button.is-docked:hover,
        .cqc-button.is-docked:focus-visible,
        .cqc-button.is-docked.is-active,
        .cqc-button.is-docked.is-dragging {
          background: rgba(47, 47, 47, 0.96);
        }

        .cqc-panel-header {
          background: #212121;
          border-color: rgba(255, 255, 255, 0.12);
        }

        .cqc-status {
          color: #b4b4b4;
        }

        .cqc-refresh:hover,
        .cqc-icon-button:hover {
          background: #3f3f3f;
        }
      }
    `;
  }

  globalObject.CodexQuotaCompassPanelShellStylesLib = {
    createShellStyles,
    name: LIB_NAME,
  };
}(globalThis));
