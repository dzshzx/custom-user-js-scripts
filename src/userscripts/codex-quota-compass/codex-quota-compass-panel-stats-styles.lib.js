(function attachCodexQuotaCompassPanelStatsStylesLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelStatsStylesLib';

  function createQuotaPanelStatsStyles(rootId) {
    if (!rootId) {
      throw new Error(`${LIB_NAME}.createQuotaPanelStatsStyles requires rootId.`);
    }
    const scope = `#${rootId}`;

    return `
        ${scope} {
          --cqc-stats-space-tight: 0.25rem;
          --cqc-stats-space-control: 0.5rem;
          --cqc-stats-space-section: 0.75rem;
          --cqc-stats-radius-control: 0.5rem;
          --cqc-stats-radius-section: 0.625rem;
          --cqc-stats-radius-pill: 100rem;
          --cqc-stats-font-control: 0.75rem;
          --cqc-stats-font-meta: 0.6875rem;
          --cqc-stats-font-value: 0.8125rem;
          --cqc-stats-motion-duration: 160ms;
        }

        ${scope} .cqc-stats-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: var(--cqc-stats-space-tight);
          margin: 0 0 var(--cqc-stats-space-section);
        }

        ${scope} .cqc-stats-tab {
          border: 1px solid var(--cqc-border);
          background: transparent;
          color: var(--cqc-text-muted);
          border-radius: var(--cqc-stats-radius-pill);
          padding: var(--cqc-stats-space-tight) var(--cqc-stats-space-section);
          font-size: var(--cqc-stats-font-control);
          font-weight: 600;
          cursor: pointer;
          transition:
            background-color var(--cqc-stats-motion-duration) ease,
            color var(--cqc-stats-motion-duration) ease,
            border-color var(--cqc-stats-motion-duration) ease;
        }

        ${scope} .cqc-stats-tab:hover {
          color: var(--cqc-text);
        }

        ${scope} .cqc-stats-tab.is-active {
          background: var(--cqc-surface);
          border-color: var(--cqc-border-strong);
          color: var(--cqc-primary-strong);
        }

        ${scope} .cqc-stats-live {
          margin: 0 0 var(--cqc-stats-space-section);
        }

        ${scope} .cqc-stats-estimate {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: var(--cqc-stats-space-control);
          margin: 0 0 var(--cqc-stats-space-control);
          padding: var(--cqc-stats-space-control) var(--cqc-stats-space-section);
          border: 1px dashed var(--cqc-border-strong);
          border-radius: var(--cqc-stats-radius-section);
          font-size: var(--cqc-stats-font-control);
          color: var(--cqc-text);
        }

        ${scope} .cqc-stats-estimate-tag {
          font-size: var(--cqc-stats-font-meta);
          font-weight: 600;
          color: var(--cqc-text-muted);
          border: 1px solid var(--cqc-border);
          border-radius: var(--cqc-stats-radius-pill);
          padding: 0 var(--cqc-stats-space-tight);
        }

        ${scope} .cqc-stats-estimate-figure {
          margin-left: auto;
          font-weight: 600;
        }

        ${scope} .cqc-stats-list {
          display: grid;
          gap: var(--cqc-stats-space-tight);
        }

        ${scope} .cqc-stats-row {
          display: flex;
          align-items: baseline;
          gap: var(--cqc-stats-space-section);
          width: 100%;
          text-align: left;
          border: 1px solid var(--cqc-border);
          background: var(--cqc-surface);
          color: var(--cqc-text);
          border-radius: var(--cqc-stats-radius-control);
          padding: var(--cqc-stats-space-control) var(--cqc-stats-space-section);
          font-size: var(--cqc-stats-font-control);
          cursor: pointer;
          transition:
            border-color var(--cqc-stats-motion-duration) ease,
            background-color var(--cqc-stats-motion-duration) ease;
        }

        ${scope} .cqc-stats-row:hover {
          border-color: var(--cqc-border-strong);
        }

        ${scope} .cqc-stats-row-label {
          font-weight: 600;
        }

        ${scope} .cqc-stats-row-usd {
          margin-left: auto;
          font-weight: 600;
        }

        ${scope} .cqc-stats-row-credits {
          color: var(--cqc-text-muted);
        }

        ${scope} .cqc-stats-back {
          border: 1px solid var(--cqc-border);
          background: transparent;
          color: var(--cqc-text-muted);
          border-radius: var(--cqc-stats-radius-control);
          padding: var(--cqc-stats-space-tight) var(--cqc-stats-space-section);
          font-size: var(--cqc-stats-font-control);
          font-weight: 600;
          cursor: pointer;
          margin: 0 0 var(--cqc-stats-space-control);
          transition:
            border-color var(--cqc-stats-motion-duration) ease,
            color var(--cqc-stats-motion-duration) ease;
        }

        ${scope} .cqc-stats-back:hover {
          color: var(--cqc-text);
          border-color: var(--cqc-border-strong);
        }

        ${scope} .cqc-stats-tab:focus-visible,
        ${scope} .cqc-stats-row:focus-visible,
        ${scope} .cqc-stats-back:focus-visible {
          outline: 2px solid var(--cqc-primary);
          outline-offset: 2px;
        }

        ${scope} .cqc-stats-drill-title {
          font-size: var(--cqc-stats-font-control);
          font-weight: 600;
          color: var(--cqc-text);
          margin: 0 0 var(--cqc-stats-space-control);
        }

        ${scope} .cqc-stats-all-total {
          font-size: var(--cqc-stats-font-value);
          font-weight: 700;
          color: var(--cqc-primary-strong);
          margin: 0 0 var(--cqc-stats-space-tight);
        }

        @media (prefers-reduced-motion: reduce) {
          ${scope} .cqc-stats-tab,
          ${scope} .cqc-stats-row,
          ${scope} .cqc-stats-back {
            transition: none !important;
          }
        }
      `;
  }

  globalObject[LIB_NAME] = Object.freeze({
    createQuotaPanelStatsStyles,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
