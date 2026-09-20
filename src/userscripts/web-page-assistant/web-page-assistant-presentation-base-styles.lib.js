const LIB_NAME = 'WebPageAssistantPresentationBaseStylesLib';

function installAssistantBaseStyles({ documentObject, rootId, styleId }) {
  if (!documentObject || !rootId || !styleId) {
    throw new Error(`${LIB_NAME}: documentObject, rootId, and styleId are required.`);
  }

  if (documentObject.getElementById(styleId)) return;

  // WPA tokens bridge the shared widget kit tokens (--wk-*) injected on the
  // same root by buildTokenCss; theme flips via [data-wk-theme="dark"] set by
  // applyTheme. Only derivatives without a --wk-* counterpart stay local.
  const style = documentObject.createElement('style');
  style.id = styleId;
  style.textContent = `
	      #${rootId} {
	        position: fixed;
	        z-index: 2147483647;
	        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	        font-size: 14px;
	        line-height: 1.4;
	        color: var(--part-text);
	        --part-text: var(--wk-text);
	        --part-muted-text: var(--wk-text-muted);
	        --part-soft-text: var(--wk-text-muted);
	        --part-surface: var(--wk-surface);
	        --part-panel: var(--wk-surface-muted);
	        --part-panel-strong: var(--wk-surface-sunken);
	        --part-field: var(--wk-surface);
	        --part-line: var(--wk-border);
	        --part-line-strong: var(--wk-border-strong);
	        --part-action: var(--wk-accent);
	        --part-action-hover: color-mix(in oklab, var(--wk-accent), black 14%);
	        --part-accent: var(--wk-accent);
	        --part-danger: var(--wk-danger);
	        --part-danger-soft: color-mix(in oklab, var(--wk-danger) 9%, var(--wk-surface));
	        --part-shadow-soft: var(--wk-shadow-pop);
	        --part-shadow-strong: var(--wk-shadow-panel);
	      }

	    #${rootId} .part-sr-only {
	      position: absolute;
	      width: 1px;
	      height: 1px;
	      padding: 0;
	      margin: -1px;
	      overflow: hidden;
	      clip: rect(0 0 0 0);
	      clip-path: inset(50%);
	      white-space: nowrap;
	      border: 0;
	    }

	    #${rootId} .part-widget.is-idle .part-widget-button {
	      opacity: 0.55;
	    }

	    #${rootId} .part-widget.is-idle:hover .part-widget-button,
	    #${rootId} .part-widget.is-idle:focus-within .part-widget-button,
	    #${rootId} .part-widget.is-idle.is-expanded .part-widget-button {
	      opacity: 1;
	    }

    #${rootId} .wk-icon {
      display: block;
      flex: none;
      pointer-events: none;
    }

    #${rootId} *,
    #${rootId} *::before,
    #${rootId} *::after {
      box-sizing: border-box;
    }

    #${rootId} button,
    #${rootId} input,
    #${rootId} select {
      font: inherit;
    }

	      #${rootId} button {
	        border: 0;
	        cursor: pointer;
	      }

	      #${rootId} button,
	      #${rootId} input,
	      #${rootId} select {
	        color: inherit;
	      }

	      #${rootId} button:focus-visible,
	      #${rootId} input:focus-visible,
	      #${rootId} select:focus-visible {
	        outline: 2px solid var(--part-accent);
	        outline-offset: 2px;
	      }

    #${rootId} button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    #${rootId} .part-widget {
      position: fixed;
      right: 18px;
      bottom: 18px;
      width: 154px;
      height: 60px;
    }

    #${rootId} .part-widget.is-dragging {
      user-select: none;
    }

    #${rootId} .part-widget-panel-header,
    #${rootId} .part-dialog-header,
    #${rootId} .part-dialog-actions,
    #${rootId} .part-custom-row,
    #${rootId} .part-scope-grid {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #${rootId} .part-widget-panel-header,
    #${rootId} .part-dialog-header {
      justify-content: space-between;
    }

	      #${rootId} .part-widget-button {
      position: absolute;
      right: 0;
      bottom: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      width: 52px;
      height: 52px;
      padding: 0;
	        border: 1px solid var(--part-line);
	        border-radius: 999px;
	        background: var(--part-surface);
	        color: var(--part-text);
	        box-shadow: var(--part-shadow-soft);
	        cursor: grab;
	        opacity: 0.72;
	        overflow: hidden;
	        transition:
	          width 160ms ease,
	          padding 160ms ease,
        opacity 160ms ease,
        background-color 160ms ease,
        box-shadow 160ms ease;
    }

    #${rootId} .part-widget-button:active {
      cursor: grabbing;
    }

    #${rootId} .part-widget:hover .part-widget-button,
    #${rootId} .part-widget:focus-within .part-widget-button,
    #${rootId} .part-widget.is-expanded .part-widget-button {
      justify-content: flex-start;
	        gap: 8px;
	        width: 154px;
	        padding: 0 12px;
	        background: var(--part-surface);
	        box-shadow: 0 14px 38px oklch(28% 0.03 242 / 0.2);
	        opacity: 1;
	      }

    #${rootId} .part-widget-button-icon {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      min-width: 26px;
      height: 26px;
      border-radius: 999px;
	        background: var(--part-action);
	        color: oklch(98.6% 0.003 250);
      font-size: 16px;
      line-height: 1;
    }

    #${rootId} .part-widget-button-icon .wk-icon {
      width: 16px;
      height: 16px;
    }

    #${rootId} .part-widget-button-text {
      max-width: 0;
      overflow: hidden;
      opacity: 0;
	        color: var(--part-text);
      font-size: 16px;
      font-weight: 750;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      transform: translateX(-4px);
      transition:
        max-width 160ms ease,
        opacity 140ms ease,
        transform 160ms ease;
    }

    #${rootId} .part-widget:hover .part-widget-button-text,
    #${rootId} .part-widget:focus-within .part-widget-button-text,
    #${rootId} .part-widget.is-expanded .part-widget-button-text {
      max-width: 84px;
      opacity: 1;
      transform: translateX(0);
    }

    #${rootId} .part-widget-panel {
      position: absolute;
      left: var(--part-panel-left, -94px);
      top: var(--part-panel-top, -140px);
      width: var(--part-panel-width, min(248px, calc(100vw - 24px)));
      padding: 10px;
	        border: 1px solid var(--part-line);
	        border-radius: 8px;
	        background: var(--part-surface);
	        box-shadow: 0 18px 50px oklch(25% 0.035 242 / 0.2);
      opacity: 0;
      pointer-events: none;
      transform: translateY(8px) scale(0.98);
      transform-origin: var(--part-panel-origin, bottom right);
	        transition:
        opacity 140ms ease,
        transform 160ms ease;
    }

    #${rootId} .part-widget:hover .part-widget-panel,
    #${rootId} .part-widget:focus-within .part-widget-panel,
    #${rootId} .part-widget.is-expanded .part-widget-panel {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }

	      #${rootId} .part-title {
	        margin: 0;
	        font-size: 15px;
	        font-weight: 750;
	      }

	      #${rootId} .part-subtitle {
	        margin: 4px 0 0;
	        color: var(--part-muted-text);
	        font-size: 12px;
	      }

    #${rootId} .part-widget-countdown {
      margin: 6px 0 6px;
      font-size: 22px;
      font-weight: 750;
	        color: var(--part-text);
      font-variant-numeric: tabular-nums;
    }

    #${rootId} .part-muted {
	        color: var(--part-muted-text);
      font-size: 12px;
    }

    #${rootId} .part-row {
      margin-top: 10px;
    }

    #${rootId} .part-widget-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }

    #${rootId} .part-button {
	        min-height: 34px;
	        padding: 7px 12px;
	        border-radius: 7px;
	        background: var(--part-action);
	        color: oklch(98.6% 0.003 250);
	        font-weight: 650;
	        transition:
	          background-color 140ms ease,
	          box-shadow 140ms ease,
	          transform 140ms ease;
	      }

	      #${rootId} .part-button:hover {
	        background: var(--part-action-hover);
	        box-shadow: 0 7px 18px oklch(20% 0.01 250 / 0.18);
	      }

	      #${rootId} .part-button:active {
	        transform: translateY(1px);
	      }

	      #${rootId} .part-button[data-variant="danger"] {
	        background: var(--part-danger-soft);
	        color: var(--part-danger);
	      }

	      #${rootId} .part-button[data-variant="danger"]:hover {
	        background: oklch(91% 0.052 25);
	        box-shadow: none;
	      }

    #${rootId} .part-icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
	        width: 30px;
	        height: 30px;
	        border-radius: 7px;
	        background: var(--part-panel-strong);
	        color: var(--part-text);
	        font-size: 18px;
	        line-height: 1;
	        transition:
	          background-color 140ms ease,
	          transform 140ms ease;
	      }

	      #${rootId} .part-icon-button:hover {
	        background: var(--part-panel);
	        transform: translateY(-1px);
    }

    #${rootId} .part-icon-button .wk-icon {
      width: 16px;
      height: 16px;
    }

`;
  documentObject.documentElement.append(style);
}

export {
  installAssistantBaseStyles,
};
