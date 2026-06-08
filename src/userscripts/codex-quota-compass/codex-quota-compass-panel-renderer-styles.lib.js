(function attachCodexQuotaCompassPanelRendererStylesLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelRendererStylesLib';

  function createQuotaPanelRendererStyles() {
    return `
        .cqc-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 14px 0;
        }

        .cqc-tab {
          border: 1px solid rgba(16, 163, 127, 0.22);
          background: #ffffff;
          color: #334155;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .cqc-tab.is-active {
          background: rgba(16, 163, 127, 0.12);
          border-color: rgba(16, 163, 127, 0.58);
          color: #0f766e;
        }

        .cqc-transfer-note {
          margin-top: 8px;
          color: #64748b;
          font-size: 12px;
        }

        .cqc-sync-banner {
          display: grid;
          gap: 4px;
          margin: 0 0 12px;
          padding: 10px 12px;
          border: 1px solid rgba(100, 116, 139, 0.22);
          border-radius: 10px;
          background: #f8fafc;
          color: #334155;
          font-size: 12px;
          line-height: 1.45;
        }

        .cqc-sync-banner strong {
          color: #202123;
          font-size: 13px;
        }

        .cqc-sync-banner[data-tone="success"] {
          border-color: rgba(16, 163, 127, 0.28);
          background: rgba(16, 163, 127, 0.08);
          color: #0f766e;
        }

        .cqc-sync-banner[data-tone="warning"] {
          border-color: rgba(245, 158, 11, 0.3);
          background: rgba(245, 158, 11, 0.1);
          color: #92400e;
        }

        .cqc-sync-banner[data-tone="success"] strong {
          color: #0f766e;
        }

        .cqc-sync-banner[data-tone="warning"] strong {
          color: #92400e;
        }

        .cqc-metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin: 0 0 12px;
        }

        .cqc-metric,
        .cqc-section {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 10px;
          background: #ffffff;
        }

        .cqc-metric {
          min-width: 0;
          padding: 12px;
        }

        .cqc-metric-label,
        .cqc-metric-hint {
          color: #6e6e80;
          font-size: 12px;
          line-height: 1.3;
        }

        .cqc-metric-value {
          margin: 6px 0 4px;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.15;
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
          color: var(--cqc-primary);
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
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          background: #f7f7f8;
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
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
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
          color: #6e6e80;
        }

        .cqc-compact-list {
          display: none;
        }

        .cqc-compact-row {
          display: grid;
          gap: 8px;
          margin: 0;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
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
          color: #6e6e80;
          font-weight: 650;
        }

        .cqc-compact-value {
          color: #202123;
          overflow-wrap: anywhere;
        }

        .cqc-compact-value.is-truncated {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .cqc-table-wrap tbody tr:hover {
          background: rgba(30, 64, 175, 0.05);
        }

        .cqc-table-wrap th {
          color: #6e6e80;
          background: #ffffff;
          font-weight: 650;
          position: sticky;
          top: 0;
        }

        .cqc-table-note,
        .cqc-empty {
          color: #6e6e80;
          font-size: 12px;
          padding: 10px 12px;
        }

        .cqc-loading,
        .cqc-error {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 18px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 10px;
          background: #f7f7f8;
        }

        .cqc-loading span,
        .cqc-error p {
          display: block;
          margin: 4px 0 0;
          color: #6e6e80;
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
          border: 2px solid rgba(16, 163, 127, 0.2);
          border-top-color: #10a37f;
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

        @media (prefers-color-scheme: dark) {
          .cqc-metric,
          .cqc-section,
          .cqc-table-wrap th {
            background: #2f2f2f;
            color: #ececf1;
            border-color: rgba(255, 255, 255, 0.14);
          }

          .cqc-section h3,
          .cqc-loading,
          .cqc-error {
            background: #212121;
            border-color: rgba(255, 255, 255, 0.12);
          }

          .cqc-metric-label,
          .cqc-metric-hint,
          .cqc-table-note,
          .cqc-empty,
          .cqc-sync-banner,
          .cqc-loading span,
          .cqc-error p {
            color: #b4b4b4;
          }

          .cqc-sync-banner {
            background: #212121;
            border-color: rgba(255, 255, 255, 0.12);
          }

          .cqc-sync-banner strong {
            color: #ececf1;
          }

          .cqc-table-wrap th,
          .cqc-table-wrap td,
          .cqc-compact-row,
          .cqc-section h3 {
            border-bottom-color: rgba(255, 255, 255, 0.1);
          }

          .cqc-compact-value {
            color: #ececf1;
          }

          .cqc-detail-footnote button {
            color: #19c37d;
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
