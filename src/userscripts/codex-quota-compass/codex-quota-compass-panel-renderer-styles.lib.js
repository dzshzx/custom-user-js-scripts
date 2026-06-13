(function attachCodexQuotaCompassPanelRendererStylesLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelRendererStylesLib';

  // All colors resolve from the CSS variables defined on the shell root
  // (codex-quota-compass-panel-shell-styles.lib.js). Dark mode flips those
  // variables there, so this file never hardcodes a theme color.
  function createQuotaPanelRendererStyles() {
    return `
        .cqc-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 14px 0;
          padding: 3px;
          border-radius: 10px;
          background: var(--cqc-surface-sunken);
          border: 1px solid var(--cqc-border);
        }

        .cqc-tab {
          flex: 1 1 auto;
          border: 1px solid transparent;
          background: transparent;
          color: var(--cqc-text-muted);
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
        }

        .cqc-tab:hover {
          color: var(--cqc-text);
        }

        .cqc-tab.is-active {
          background: var(--cqc-surface);
          border-color: var(--cqc-border-strong);
          color: var(--cqc-primary-strong);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        }

        .cqc-transfer-note {
          margin-top: 8px;
          color: var(--cqc-text-muted);
          font-size: 12px;
          line-height: 1.45;
        }

        .cqc-sync-banner {
          display: grid;
          gap: 4px;
          margin: 0 0 12px;
          padding: 10px 12px;
          border: 1px solid var(--cqc-border);
          border-left: 3px solid var(--cqc-border-strong);
          border-radius: 10px;
          background: var(--cqc-surface-sunken);
          color: var(--cqc-text-muted);
          font-size: 12px;
          line-height: 1.45;
        }

        .cqc-sync-banner strong {
          color: var(--cqc-text);
          font-size: 13px;
        }

        .cqc-sync-banner[data-tone="success"] {
          border-left-color: var(--cqc-primary);
          background: var(--cqc-primary-soft);
          color: var(--cqc-primary-strong);
        }

        .cqc-sync-banner[data-tone="success"] strong {
          color: var(--cqc-primary-strong);
        }

        .cqc-sync-banner[data-tone="warning"] {
          border-left-color: var(--cqc-warning);
          background: var(--cqc-warning-surface);
          color: var(--cqc-warning);
        }

        .cqc-sync-banner[data-tone="warning"] strong {
          color: var(--cqc-warning);
        }

        .cqc-sync-form {
          display: grid;
          gap: 10px;
          margin: 0 0 14px;
          padding: 14px;
          border: 1px solid var(--cqc-border);
          border-radius: 10px;
          background: var(--cqc-surface);
        }

        .cqc-sync-form-title {
          font-size: 13px;
          font-weight: 650;
          color: var(--cqc-text);
        }

        .cqc-sync-form-status {
          font-size: 12px;
          line-height: 1.4;
          color: var(--cqc-text-muted);
        }

        .cqc-sync-form-status[data-tone="error"] {
          color: var(--cqc-danger);
        }

        .cqc-sync-field {
          display: grid;
          gap: 4px;
        }

        .cqc-sync-field-label {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          color: var(--cqc-text-muted);
          font-size: 12px;
          font-weight: 600;
        }

        .cqc-sync-field-hint {
          color: var(--cqc-text-muted);
          font-size: 11px;
          font-weight: 400;
        }

        .cqc-sync-form input[type="text"],
        .cqc-sync-form input[type="password"] {
          width: 100%;
          border: 1px solid var(--cqc-border-strong);
          border-radius: 8px;
          padding: 8px 10px;
          font: inherit;
          font-size: 13px;
          color: var(--cqc-text);
          background: var(--cqc-surface-sunken);
        }

        .cqc-sync-form input::placeholder {
          color: var(--cqc-text-muted);
          opacity: 0.7;
        }

        .cqc-sync-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--cqc-text);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .cqc-sync-toggle input {
          width: 16px;
          height: 16px;
          accent-color: var(--cqc-primary);
        }

        .cqc-sync-form-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 2px;
        }

        .cqc-sync-form-actions button {
          border: 1px solid var(--cqc-border-strong);
          border-radius: 8px;
          background: var(--cqc-surface);
          color: var(--cqc-text);
          padding: 7px 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 140ms ease, border-color 140ms ease;
        }

        .cqc-sync-form-actions button:hover {
          border-color: var(--cqc-primary-border);
        }

        .cqc-sync-form-actions button[data-variant="primary"] {
          background: var(--cqc-primary);
          border-color: var(--cqc-primary);
          color: #ffffff;
        }

        .cqc-sync-form-actions button[data-variant="primary"]:hover {
          background: var(--cqc-primary-strong);
          border-color: var(--cqc-primary-strong);
        }

        .cqc-sync-form-actions button[data-variant="danger"] {
          color: var(--cqc-danger);
        }

        .cqc-sync-form-actions button[data-variant="danger"]:hover {
          border-color: var(--cqc-danger);
        }

        .cqc-metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin: 0 0 12px;
        }

        .cqc-metric,
        .cqc-section {
          border: 1px solid var(--cqc-border);
          border-radius: 10px;
          background: var(--cqc-surface);
        }

        .cqc-metric {
          min-width: 0;
          padding: 11px 12px;
        }

        .cqc-metric-label,
        .cqc-metric-hint {
          color: var(--cqc-text-muted);
          font-size: 12px;
          line-height: 1.3;
        }

        .cqc-metric-value {
          margin: 5px 0 2px;
          font-size: 17px;
          font-weight: 650;
          line-height: 1.2;
          letter-spacing: -0.01em;
          overflow-wrap: anywhere;
        }

        .cqc-detail-footnote {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 10px;
          justify-content: center;
          margin: 10px 0 2px;
        }

        .cqc-detail-footnote button {
          border: 0;
          background: transparent;
          color: var(--cqc-primary-strong);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          padding: 6px 8px;
        }

        .cqc-detail-footnote button:hover {
          text-decoration: underline;
        }

        .cqc-section {
          margin-top: 12px;
          overflow: hidden;
        }

        .cqc-section h3 {
          margin: 0;
          padding: 10px 12px;
          border-bottom: 1px solid var(--cqc-border);
          background: var(--cqc-surface-muted);
          font-size: 14px;
          line-height: 1.3;
        }

        .cqc-table-wrap {
          overflow: auto;
        }

        .cqc-table-wrap table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .cqc-table-wrap th,
        .cqc-table-wrap td {
          border-bottom: 1px solid var(--cqc-border);
          padding: 9px 10px;
          text-align: left;
          vertical-align: top;
          white-space: nowrap;
        }

        .cqc-table-wrap td.is-wrappable {
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .cqc-table-wrap td.is-truncated {
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cqc-table-wrap td.is-debug,
        .cqc-table-wrap th.is-debug {
          color: var(--cqc-text-muted);
        }

        .cqc-compact-list {
          display: none;
        }

        .cqc-compact-row {
          display: grid;
          gap: 8px;
          margin: 0;
          padding: 10px 12px;
          border-bottom: 1px solid var(--cqc-border);
        }

        .cqc-compact-row:last-child {
          border-bottom: 0;
        }

        .cqc-compact-field {
          display: grid;
          grid-template-columns: minmax(92px, 38%) minmax(0, 1fr);
          gap: 8px;
          align-items: start;
        }

        .cqc-compact-field dt,
        .cqc-compact-field dd {
          margin: 0;
          min-width: 0;
          font-size: 12px;
          line-height: 1.35;
        }

        .cqc-compact-field dt {
          color: var(--cqc-text-muted);
          font-weight: 650;
        }

        .cqc-compact-value {
          color: var(--cqc-text);
          overflow-wrap: anywhere;
        }

        .cqc-compact-value.is-truncated {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .cqc-table-wrap tbody tr:hover {
          background: var(--cqc-row-hover);
        }

        .cqc-table-wrap th {
          color: var(--cqc-text-muted);
          background: var(--cqc-surface);
          font-weight: 650;
          position: sticky;
          top: 0;
        }

        .cqc-table-note,
        .cqc-empty {
          color: var(--cqc-text-muted);
          font-size: 12px;
          padding: 10px 12px;
        }

        .cqc-loading,
        .cqc-error {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 18px;
          border: 1px solid var(--cqc-border);
          border-radius: 10px;
          background: var(--cqc-surface-muted);
        }

        .cqc-loading span,
        .cqc-error p {
          display: block;
          margin: 4px 0 0;
          color: var(--cqc-text-muted);
          font-size: 13px;
          line-height: 1.45;
          white-space: pre-wrap;
        }

        .cqc-error {
          display: block;
          border-color: rgba(217, 45, 32, 0.24);
        }

        .cqc-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid var(--cqc-primary-ring);
          border-top-color: var(--cqc-primary);
          border-radius: 50%;
          animation: cqc-spin 0.8s linear infinite;
          flex: 0 0 auto;
        }

        @keyframes cqc-spin {
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .cqc-spinner {
            transition: none !important;
            animation: none !important;
          }

          .cqc-tab,
          .cqc-sync-form-actions button {
            transition: none !important;
          }
        }

        @container (max-width: 720px) {
          .cqc-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .cqc-data-view[data-compact="true"] .cqc-data-table {
            display: none;
          }

          .cqc-data-view[data-compact="true"] .cqc-compact-list {
            display: block;
          }
        }

        @media (max-width: 720px) {
          .cqc-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .cqc-data-view[data-compact="true"] .cqc-data-table {
            display: none;
          }

          .cqc-data-view[data-compact="true"] .cqc-compact-list {
            display: block;
          }
        }
      `;
  }

  function installQuotaPanelRendererStyles(documentObject, rootId) {
    if (!documentObject?.createElement || !documentObject?.head) {
      throw new Error('Quota panel renderer requires a document adapter.');
    }
    if (!rootId) {
      throw new Error('Quota panel renderer requires rootId.');
    }
    if (documentObject.getElementById(`${rootId}-style`)) return;

    const style = documentObject.createElement('style');
    style.id = `${rootId}-style`;
    style.textContent = createQuotaPanelRendererStyles();
    documentObject.head.append(style);
  }

  globalObject[LIB_NAME] = Object.freeze({
    createQuotaPanelRendererStyles,
    installQuotaPanelRendererStyles,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
