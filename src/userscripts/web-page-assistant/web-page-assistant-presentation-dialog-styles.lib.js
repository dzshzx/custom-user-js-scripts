(function attachWebPageAssistantPresentationDialogStylesLib(globalObject) {
  'use strict';

  const LIB_NAME = 'WebPageAssistantPresentationDialogStylesLib';

  function installAssistantDialogStyles({ documentObject, rootId, styleId }) {
    if (!documentObject || !rootId || !styleId) {
      throw new Error(`${LIB_NAME}: documentObject, rootId, and styleId are required.`);
    }

    if (documentObject.getElementById(styleId)) return;

    const style = documentObject.createElement('style');
    style.id = styleId;
    style.textContent = `      #${rootId} .part-close-icon {
        position: relative;
        display: inline-block;
        width: 14px;
        height: 14px;
      }

      #${rootId} .part-close-icon::before,
      #${rootId} .part-close-icon::after {
        content: "";
        position: absolute;
        top: 6px;
        left: 1px;
        width: 12px;
        height: 2px;
        border-radius: 999px;
        background: currentColor;
      }

      #${rootId} .part-close-icon::before {
        transform: rotate(45deg);
      }

      #${rootId} .part-close-icon::after {
        transform: rotate(-45deg);
      }

      #${rootId} .part-backdrop {
        position: fixed;
	        inset: 0;
	        display: grid;
	        place-items: center;
	        padding: 18px;
	        background: oklch(28% 0.025 242 / 0.42);
	      }

	      #${rootId} .part-dialog {
	        width: min(640px, 100%);
	        max-height: min(760px, calc(100vh - 36px));
	        overflow: auto;
	        border: 1px solid var(--part-line);
	        border-radius: 8px;
	        background: var(--part-surface);
	        box-shadow: var(--part-shadow-strong);
	      }

	      #${rootId} .part-dialog-header {
	        position: sticky;
	        top: 0;
	        display: block;
	        padding: 16px 18px 0;
	        border-bottom: 1px solid var(--part-line);
	        background: var(--part-surface);
	        z-index: 1;
	      }

	      #${rootId} .part-dialog-header-top {
	        display: flex;
	        align-items: flex-start;
	        justify-content: space-between;
	        gap: 12px;
	        padding-bottom: 14px;
	      }

	      #${rootId} .part-tabs {
	        display: flex;
	        align-items: center;
	        gap: 6px;
	        padding: 0 0 10px;
	      }

	      #${rootId} .part-tab {
	        min-height: 34px;
	        padding: 7px 12px;
	        border: 1px solid transparent;
	        border-radius: 7px;
	        background: transparent;
	        color: var(--part-muted-text);
	        font-weight: 700;
	        transition:
	          background-color 140ms ease,
	          border-color 140ms ease,
	          color 140ms ease;
	      }

	      #${rootId} .part-tab:hover {
	        background: var(--part-panel);
	        color: var(--part-text);
	      }

	      #${rootId} .part-tab[aria-selected="true"] {
	        border-color: var(--part-line-strong);
	        background: var(--part-panel-strong);
	        color: var(--part-text);
	      }

	      #${rootId} .part-tab-panel[hidden] {
	        display: none;
	      }

	      #${rootId} .part-dialog-body {
	        padding: 18px;
	      }

	      #${rootId} .part-section {
	        margin-top: 18px;
	        padding-top: 18px;
	        border-top: 1px solid var(--part-line);
	      }

	      #${rootId} .part-section:first-child {
	        margin-top: 0;
	        padding-top: 0;
	        border-top: 0;
	      }

	      #${rootId} .part-section-title {
	        margin: 0 0 8px;
	        font-size: 12px;
	        font-weight: 750;
	        color: var(--part-soft-text);
	        letter-spacing: 0;
	      }

	      #${rootId} .part-status-box {
	        padding: 12px;
	        border-radius: 8px;
	        background: var(--part-panel);
	        border: 1px solid var(--part-line);
	      }

      #${rootId} .part-key {
        display: block;
        margin-top: 4px;
        overflow-wrap: anywhere;
	        color: var(--part-muted-text);
	        font-size: 12px;
	      }

      #${rootId} .part-scope-grid {
        align-items: stretch;
        flex-wrap: wrap;
      }

      #${rootId} .part-scope-card {
	        flex: 1 1 210px;
	        display: block;
	        padding: 12px;
	        border: 1px solid var(--part-line);
	        border-radius: 8px;
	        background: var(--part-field);
	        transition:
	          border-color 140ms ease,
	          background-color 140ms ease,
	          box-shadow 140ms ease;
	      }

	      #${rootId} .part-scope-card:has(input:checked) {
	        border-color: var(--part-line-strong);
	        background: var(--part-panel);
	        box-shadow: inset 0 0 0 1px oklch(75% 0.01 250 / 0.18);
	      }

	      #${rootId} .part-scope-card input {
	        margin-right: 6px;
	        accent-color: var(--part-accent);
      }

      #${rootId} .part-presets {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      #${rootId} .part-preset {
        min-height: 36px;
        padding: 8px;
	        border: 1px solid var(--part-line);
	        border-radius: 7px;
	        background: var(--part-field);
	        color: var(--part-text);
	        font-weight: 650;
	        transition:
	          border-color 140ms ease,
	          background-color 140ms ease,
	          transform 140ms ease;
	      }

	      #${rootId} .part-preset:hover,
	      #${rootId} .part-preset:focus-visible {
	        border-color: var(--part-line-strong);
	        background: var(--part-panel);
	        outline: none;
	      }

	      #${rootId} .part-preset:active {
	        transform: translateY(1px);
	      }

      #${rootId} .part-custom-row {
        align-items: stretch;
        flex-wrap: wrap;
      }

      #${rootId} .part-custom-row input,
      #${rootId} .part-custom-row select {
        min-height: 36px;
	        border: 1px solid var(--part-line-strong);
	        border-radius: 7px;
	        background: var(--part-field);
	        color: var(--part-text);
	      }

      #${rootId} .part-custom-row input {
        width: 140px;
        padding: 7px 9px;
      }

      #${rootId} .part-custom-row select {
        padding: 7px 28px 7px 9px;
      }

	      #${rootId} .part-dialog-actions {
	        flex-wrap: wrap;
	      }

	      #${rootId} .part-check-list {
	        display: grid;
	        grid-template-columns: repeat(2, minmax(0, 1fr));
	        gap: 8px;
	      }

	      #${rootId} .part-check-card {
	        display: flex;
	        align-items: flex-start;
	        gap: 8px;
	        min-height: 42px;
	        padding: 10px;
	        border: 1px solid var(--part-line);
	        border-radius: 7px;
	        background: var(--part-field);
	        transition:
	          border-color 140ms ease,
	          background-color 140ms ease,
	          box-shadow 140ms ease;
	      }

	      #${rootId} .part-check-card input {
	        margin-top: 2px;
	        accent-color: var(--part-accent);
	      }

	      #${rootId} .part-check-card:has(input:checked) {
	        border-color: var(--part-line-strong);
	        background: var(--part-panel);
	        box-shadow: inset 0 0 0 1px oklch(75% 0.01 250 / 0.18);
	      }

	      #${rootId} .part-message {
	        min-height: 20px;
	        margin-top: 10px;
	        color: var(--part-soft-text);
	        font-size: 13px;
	      }

	      #${rootId} .part-message[data-tone="error"] {
	        color: var(--part-danger);
	      }

      @media (max-width: 520px) {
	        #${rootId} .part-presets {
	          grid-template-columns: repeat(2, minmax(0, 1fr));
	        }

	        #${rootId} .part-check-list {
	          grid-template-columns: 1fr;
	        }

        #${rootId} .part-custom-row input,
        #${rootId} .part-custom-row select,
        #${rootId} .part-custom-row button {
          flex: 1 1 100%;
          width: 100%;
        }

        #${rootId} .part-widget {
          right: 12px;
          bottom: 12px;
        }
      }
    `;
    documentObject.documentElement.append(style);
  }

  globalObject[LIB_NAME] = Object.freeze({
    installAssistantDialogStyles,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
