const LIB_NAME = 'CodexQuotaCompassPanelShellStylesLib';
const BUTTON_FULL_WIDTH = 168;
const BUTTON_HEIGHT = 42;

// CQC-specific variables alias the shared widget kit tokens (--wk-*) that
// buildTokenCss injects on the same root. Dark mode flips via
// [data-wk-theme="dark"] set by applyTheme — no prefers-color-scheme block
// lives here anymore. Only accent derivates without a --wk-* counterpart keep
// local values, flipped per theme below.
function createShellStyles(rootId) {
  return `
    #${rootId} {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      --cqc-primary: var(--wk-accent);
      --cqc-primary-strong: #0f766e;
      --cqc-primary-soft: rgba(16, 163, 127, 0.12);
      --cqc-primary-border: rgba(16, 163, 127, 0.55);
      --cqc-primary-ring: rgba(16, 163, 127, 0.18);
      --cqc-surface: var(--wk-surface);
      --cqc-surface-muted: var(--wk-surface-muted);
      --cqc-surface-sunken: var(--wk-surface-sunken);
      --cqc-text: var(--wk-text);
      --cqc-text-muted: var(--wk-text-muted);
      --cqc-border: var(--wk-border);
      --cqc-border-strong: var(--wk-border-strong);
      --cqc-row-hover: rgba(16, 163, 127, 0.06);
      --cqc-danger: var(--wk-danger);
      --cqc-warning: var(--wk-warning);
      --cqc-warning-surface: rgba(245, 158, 11, 0.1);
      --cqc-warning-border: rgba(245, 158, 11, 0.32);
      --cqc-shadow-panel: var(--wk-shadow-panel);
      --cqc-shadow-button: var(--wk-shadow-pop);
      --cqc-button-bg: var(--wk-surface);
      --cqc-button-bg-docked: var(--wk-surface);
      --cqc-button-bg-docked-active: var(--wk-surface);
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
    }

    #${rootId}[data-wk-theme="dark"] {
      --cqc-primary-strong: #34d399;
      --cqc-primary-soft: rgba(25, 195, 125, 0.2);
      --cqc-primary-border: rgba(25, 195, 125, 0.5);
      --cqc-primary-ring: rgba(25, 195, 125, 0.22);
      --cqc-row-hover: rgba(25, 195, 125, 0.14);
      --cqc-warning-surface: rgba(245, 158, 11, 0.16);
      --cqc-warning-border: rgba(245, 158, 11, 0.3);
    }

    /* Widget kit overrides: keep the 168x42 pill that shrinks to a dot-only
       button when docked at a screen edge. */
    #${rootId} .cqc-button {
      width: ${BUTTON_FULL_WIDTH}px;
      min-width: ${BUTTON_HEIGHT}px;
      height: ${BUTTON_HEIGHT}px;
      min-height: ${BUTTON_HEIGHT}px;
      justify-content: flex-start;
      gap: 8px;
      padding: 0 14px;
      border-color: var(--cqc-border-strong);
      background: var(--cqc-button-bg);
      box-shadow: var(--cqc-shadow-button);
      overflow: hidden;
      pointer-events: auto;
      transition:
        width 160ms ease,
        gap 160ms ease,
        padding 160ms ease,
        opacity 160ms ease,
        background-color 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease;
    }

    #${rootId} .cqc-button:active,
    #${rootId} .cqc-button.is-dragging {
      cursor: grabbing;
    }

    #${rootId} .cqc-button.is-active {
      border-color: var(--cqc-primary-border);
      box-shadow: 0 10px 32px var(--cqc-primary-ring);
    }

    #${rootId} .cqc-button[data-wk-docked] {
      width: ${BUTTON_HEIGHT}px;
      gap: 0;
      padding: 0;
      justify-content: center;
      background: var(--cqc-button-bg-docked);
      opacity: 0.72;
      transform: none;
    }

    #${rootId} .cqc-button[data-wk-docked]:hover,
    #${rootId} .cqc-button[data-wk-docked]:focus-visible,
    #${rootId} .cqc-button[data-wk-docked].is-active,
    #${rootId} .cqc-button[data-wk-docked].is-dragging {
      width: ${BUTTON_FULL_WIDTH}px;
      gap: 8px;
      padding: 0 14px;
      justify-content: flex-start;
      background: var(--cqc-button-bg-docked-active);
      opacity: 1;
      transform: none;
    }

    #${rootId} .cqc-button[data-wk-docked] .cqc-button-text {
      max-width: 0;
      opacity: 0;
      transform: translateX(-4px);
    }

    #${rootId} .cqc-button[data-wk-docked]:hover .cqc-button-text,
    #${rootId} .cqc-button[data-wk-docked]:focus-visible .cqc-button-text,
    #${rootId} .cqc-button[data-wk-docked].is-active .cqc-button-text,
    #${rootId} .cqc-button[data-wk-docked].is-dragging .cqc-button-text {
      max-width: 116px;
      opacity: 1;
      transform: translateX(0);
    }

    #${rootId} .cqc-button-text {
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

    #${rootId} .cqc-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--cqc-primary);
      box-shadow: 0 0 0 4px var(--cqc-primary-ring);
      flex: 0 0 auto;
    }

    #${rootId} .cqc-button-title {
      font-size: 13px;
      font-weight: 650;
    }

    #${rootId} .cqc-status {
      color: var(--cqc-text-muted);
      font-size: 11px;
    }

    #${rootId} .cqc-status[data-tone="loading"] { color: var(--cqc-primary-strong); }
    #${rootId} .cqc-status[data-tone="success"] { color: var(--cqc-primary); }
    #${rootId} .cqc-status[data-tone="error"] { color: var(--cqc-danger); }

    #${rootId} .cqc-panel {
      border-color: var(--cqc-border-strong);
    }

    #${rootId} .cqc-panel-header {
      justify-content: space-between;
      min-height: 48px;
      padding: 12px 14px;
      background: var(--cqc-surface-muted);
    }

    #${rootId} .cqc-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-size: 14px;
      font-weight: 650;
    }

    #${rootId} .cqc-panel-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #${rootId} .cqc-icon-button,
    #${rootId} .cqc-refresh {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid var(--cqc-border-strong);
      border-radius: 8px;
      background: var(--cqc-surface);
      color: var(--cqc-text);
      min-height: 32px;
      padding: 0 10px;
      font-size: 13px;
      cursor: pointer;
    }

    #${rootId} .cqc-icon-button {
      width: 32px;
      height: 32px;
      min-height: 32px;
      padding: 0;
    }

    #${rootId} .cqc-refresh:hover,
    #${rootId} .cqc-icon-button:hover {
      background: var(--cqc-surface-muted);
      border-color: var(--cqc-primary-border);
    }

    #${rootId} .cqc-content {
      container-type: inline-size;
      padding: 14px;
    }
  `;
}

export {
  createShellStyles,
  LIB_NAME as name,
};
