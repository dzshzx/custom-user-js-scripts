(function attachCodexQuotaCompassPanelRendererLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelRendererLib';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
    return String(value);
  }

  function safeRows(rows, limit = 12) {
    return Array.isArray(rows) ? rows.slice(0, limit) : [];
  }

  function createQuotaPanelRenderer({ t, debugKey = '__codexQuotaCompassDebug' } = {}) {
    if (typeof t !== 'function') {
      throw new Error('Quota panel renderer requires a translator function.');
    }

    function normalizeDataColumns(rows, columns) {
      if (Array.isArray(columns) && columns.length) {
        return columns.map((column) => (
          typeof column === 'string'
            ? { key: column, label: column, priority: 'secondary', compact: true }
            : {
              key: column.key || column.label || '',
              label: column.label || column.key || '',
              labelKey: column.labelKey || '',
              priority: column.priority || 'secondary',
              truncate: Boolean(column.truncate),
              wrap: Boolean(column.wrap),
              compact: column.compact !== false,
            }
        )).filter((column) => column.key);
      }

      return [...new Set(rows.flatMap((row) => Object.keys(row || {})))]
        .map((key) => ({ key, label: key, priority: 'secondary', compact: true }));
    }

    function columnLabel(column) {
      return column.labelKey ? t(column.labelKey) : column.label;
    }

    function dataCellHtml(row, column) {
      const value = formatValue(row?.[column.key]);
      const classes = [
        column.truncate ? 'is-truncated' : '',
        column.wrap ? 'is-wrappable' : '',
        column.priority ? `is-${column.priority}` : '',
      ].filter(Boolean).join(' ');
      const title = column.truncate ? ` title="${escapeHtml(value)}"` : '';
      return `<td class="${escapeHtml(classes)}"${title}>${escapeHtml(value)}</td>`;
    }

    function compactValueHtml(row, column) {
      const value = formatValue(row?.[column.key]);
      const classes = [
        'cqc-compact-value',
        column.truncate ? 'is-truncated' : '',
        column.wrap ? 'is-wrappable' : '',
      ].filter(Boolean).join(' ');
      const title = column.truncate ? ` title="${escapeHtml(value)}"` : '';
      return `
        <div class="cqc-compact-field">
          <dt>${escapeHtml(columnLabel(column))}</dt>
          <dd class="${escapeHtml(classes)}"${title}>${escapeHtml(value)}</dd>
        </div>
      `;
    }

    function dataViewHtml(view = {}) {
      const rows = Array.isArray(view.rows) ? view.rows : [];
      const visibleRows = safeRows(rows, view.limit ?? 12);
      const columns = normalizeDataColumns(visibleRows, view.columns);

      if (!visibleRows.length || !columns.length) {
        return `<div class="cqc-empty">${escapeHtml(t(view.emptyKey || 'tableNoData'))}</div>`;
      }

      const head = columns
        .map((column) => `<th>${escapeHtml(columnLabel(column))}</th>`)
        .join('');
      const body = visibleRows
        .map((row) => (
          `<tr>${columns
            .map((column) => dataCellHtml(row, column))
            .join('')}</tr>`
        ))
        .join('');
      const compactColumns = columns.filter((column) => column.compact && column.priority !== 'debug');
      const compact = visibleRows
        .map((row) => `
          <dl class="cqc-compact-row">
            ${compactColumns.map((column) => compactValueHtml(row, column)).join('')}
          </dl>
        `)
        .join('');
      const more = rows.length > visibleRows.length
        ? `<div class="cqc-table-note">${escapeHtml(t('tablePreviewHint', { visible: visibleRows.length, total: rows.length, debugKey }))}</div>`
        : '';

      return `
        <div class="cqc-data-view" data-view-id="${escapeHtml(view.id || '')}" data-compact="${view.compactOnMobile === false ? 'false' : 'true'}">
          <div class="cqc-table-wrap cqc-data-table">
            <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
          </div>
          <div class="cqc-compact-list">${compact}</div>
        </div>
        ${more}
      `;
    }

    function tableHtml(rows, options = {}) {
      return dataViewHtml({
        id: options.id || '',
        rows,
        columns: options.columns,
        limit: options.limit,
        compactOnMobile: options.compactOnMobile,
      });
    }

    function metricHtml(label, value, hint = '') {
      return `
        <div class="cqc-metric">
          <div class="cqc-metric-label">${escapeHtml(label)}</div>
          <div class="cqc-metric-value">${escapeHtml(formatValue(value))}</div>
          ${hint ? `<div class="cqc-metric-hint">${escapeHtml(hint)}</div>` : ''}
        </div>
      `;
    }

    function formatMetricDecimal(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return '-';
      return numericValue.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    }

    function usdMetricValue(value) {
      return value === null || value === undefined || value === ''
        ? '-'
        : `$${formatMetricDecimal(value)}`;
    }

    function formatHoursDuration(hours) {
      const numericHours = Number(hours);
      if (!Number.isFinite(numericHours)) return '-';

      const totalMinutes = Math.max(0, Math.round(numericHours * 60));
      const days = Math.floor(totalMinutes / (24 * 60));
      const remainingHours = Math.floor((totalMinutes % (24 * 60)) / 60);
      const minutes = totalMinutes % 60;

      if (days > 0) return `${days} 天 ${remainingHours} 小时`;
      if (remainingHours > 0) return `${remainingHours} 小时 ${minutes} 分钟`;
      return `${minutes} 分钟`;
    }

    function creditMetricHtml(label, usd) {
      return metricHtml(label, usdMetricValue(usd));
    }

    function resetMetricHtml(hours) {
      return metricHtml(t('resetCountdown'), formatHoursDuration(hours));
    }

    function primaryMetricHtml(metric) {
      const label = metric?.labelKey ? t(metric.labelKey) : (metric?.label || '-');
      if (metric?.type === 'credit') {
        return creditMetricHtml(label, metric.usd);
      }
      if (metric?.type === 'reset') {
        return resetMetricHtml(metric.hours);
      }
      return metricHtml(label, metric?.value);
    }

    function syncBannerHtml(banner) {
      if (!banner) return '';
      const variables = { backend: banner.backendLabel || '-' };
      return `
        <div class="cqc-sync-banner" data-tone="${escapeHtml(banner.tone || 'muted')}">
          <strong>${escapeHtml(t(banner.titleKey, variables))}</strong>
          <span>${escapeHtml(t(banner.detailKey, variables))}</span>
        </div>
      `;
    }

    function sectionHtml(title, body) {
      return `
        <section class="cqc-section">
          <h3>${escapeHtml(title)}</h3>
          ${body}
        </section>
      `;
    }

    function detailActionsHtml(actions) {
      return `
        <div class="cqc-detail-footnote">
          ${actions.map((item) => `
            <button type="button" data-action="${escapeHtml(item.action)}">${escapeHtml(item.label)}</button>
          `).join('')}
        </div>
      `;
    }

    function archiveSummaryHtml(model = {}) {
      if (!model.isLoaded) {
        return `<div class="cqc-empty">${escapeHtml(t('archiveEmpty'))}</div>`;
      }

      const overviewColumns = [
        t('archiveSnapshotCount'),
        t('archiveEarliestCapturedAt'),
        t('archiveLatestCapturedAt'),
        t('archiveStorageBackend'),
      ];
      const recentColumns = [
        t('archiveCapturedAt'),
        t('archiveSnapshotId'),
        t('archiveMonthlyCredits'),
        t('archiveWeeklyUsedPercent'),
      ];
      const overview = dataViewHtml({
        id: 'archive-overview',
        rows: [
          {
            [overviewColumns[0]]: model.snapshotCount,
            [overviewColumns[1]]: model.earliestCapturedAt || '-',
            [overviewColumns[2]]: model.latestCapturedAt || '-',
            [overviewColumns[3]]: model.storageBackend?.label || '-',
          },
        ],
        columns: overviewColumns.map((column) => ({
          key: column,
          label: column,
          priority: column === t('archiveSnapshotCount') ? 'primary' : 'secondary',
          truncate: column !== t('archiveSnapshotCount'),
        })),
        limit: 1,
      });

      const recentSnapshots = safeRows(model.recentSnapshots || [], 5);
      const recent = recentSnapshots.length
        ? dataViewHtml({
          id: 'archive-recent',
          rows: recentSnapshots.map((row) => ({
            [recentColumns[0]]: row.capturedAt,
            [recentColumns[1]]: row.snapshotId,
            [recentColumns[2]]: row.monthlyCredits,
            [recentColumns[3]]: row.weeklyUsedPercent,
          })),
          columns: recentColumns.map((column) => ({
            key: column,
            label: column,
            priority: column === t('archiveSnapshotId') ? 'primary' : 'secondary',
            truncate: column === t('archiveSnapshotId') || column === t('archiveCapturedAt'),
          })),
        })
        : `<div class="cqc-empty">${escapeHtml(t('archiveNoSnapshot'))}</div>`;

      const importReport = model.importReport
        ? `<div class="cqc-table-note">${escapeHtml(t('archiveLatestImport', { added: model.importReport.added, skipped: model.importReport.skipped, invalid: model.importReport.invalid }))}</div>`
        : '';

      return `${overview}${importReport}${recent}`;
    }

    function archiveTransferActionsHtml() {
      return detailActionsHtml([
        { action: 'export-archive', label: t('archiveExportAction') },
        { action: 'import-archive', label: t('archiveImportAction') },
      ]);
    }

    function panelTabsHtml(model, activePanelView) {
      const tabs = Array.isArray(model?.tabs) && model.tabs.length
        ? model.tabs
        : [
          { id: 'details', labelKey: 'tabDetails' },
          { id: 'history', labelKey: 'tabHistory' },
          { id: 'archive', labelKey: 'tabArchiveWorkspace' },
        ];
      return `
        <div class="cqc-tabs">
          ${tabs.map((tab) => `
            <button
              type="button"
              class="cqc-tab${activePanelView === tab.id ? ' is-active' : ''}"
              data-action="switch-view"
              data-view="${escapeHtml(tab.id)}"
            >${escapeHtml(tab.labelKey ? t(tab.labelKey) : tab.label)}</button>
          `).join('')}
        </div>
      `;
    }

    function sectionFromModelHtml(section, viewModel) {
      if (!section) return '';
      if (section.type === 'dataView') {
        return sectionHtml(t(section.titleKey), dataViewHtml(section));
      }
      if (section.type === 'syncBanner') {
        return syncBannerHtml(viewModel?.syncBanner);
      }
      if (section.type === 'archiveSummary') {
        return sectionHtml(t('sectionArchiveOverview'), archiveSummaryHtml(viewModel?.archive));
      }
      if (section.type === 'note') {
        return `<div class="cqc-transfer-note">${escapeHtml(t(section.noteKey || 'transferNote'))}</div>`;
      }
      if (section.type === 'actions') {
        const actions = Array.isArray(section.actions)
          ? section.actions.map((item) => ({
            action: item.action,
            label: item.labelKey ? t(item.labelKey) : item.label,
          }))
          : [];
        return actions.length ? detailActionsHtml(actions) : '';
      }
      return '';
    }

    function sectionsViewHtml(view, viewModel) {
      return (view?.sections || []).map((section) => sectionFromModelHtml(section, viewModel)).join('');
    }

    function historyViewHtml(model) {
      const view = model?.views?.history;
      if (view) return sectionsViewHtml(view, model);
      const dayRows = model?.history?.dayRows || [];
      const daySummary = model?.history?.daySummary || {};
      const rollingSummary = model?.history?.rollingSummary || {};
      const monthSummary = model?.history?.monthSummary || {};
      return `
        ${sectionHtml(t('sectionDailyQuery'), tableHtml(dayRows.map((row) => ({
          日期桶: row.date,
          Credits: row.credits,
          折算USD: row.usd,
        })), { columns: ['日期桶', 'Credits', '折算USD'] }))}
        ${sectionHtml(t('sectionPeriodSummary'), tableHtml([{
          近30天Credits: rollingSummary.totalCredits,
          近30天USD: rollingSummary.totalUsd,
          本月Credits: monthSummary.totalCredits,
          本月USD: monthSummary.totalUsd,
          日查询Credits: daySummary.totalCredits,
        }], { columns: ['近30天Credits', '近30天USD', '本月Credits', '本月USD', '日查询Credits'] }))}
      `;
    }

    function archiveViewHtml(model) {
      const view = model?.views?.archive;
      if (view) return sectionsViewHtml(view, model);
      return `
        ${syncBannerHtml(model?.syncBanner)}
        ${sectionHtml(t('sectionArchiveOverview'), archiveSummaryHtml(model?.archive))}
        <div class="cqc-transfer-note">${escapeHtml(t('transferNote'))}</div>
        ${archiveTransferActionsHtml()}
      `;
    }

    function activeViewHtml(viewModel, activePanelView) {
      const view = viewModel?.views?.[activePanelView] || viewModel?.views?.details;
      if (view?.kind === 'archiveWorkspace') {
        return archiveViewHtml(viewModel);
      }
      if (view?.kind === 'sections') {
        return sectionsViewHtml(view, viewModel);
      }
      return historyViewHtml(viewModel);
    }

    function normalizeActivePanelView(viewModel, requestedPanelView) {
      const tabs = Array.isArray(viewModel?.tabs) ? viewModel.tabs : [];
      if (tabs.length && !tabs.some((tab) => tab.id === requestedPanelView)) {
        return tabs[0].id;
      }
      return requestedPanelView || 'details';
    }

    function renderResult(viewModel, state = {}) {
      const activePanelView = normalizeActivePanelView(viewModel, state.activePanelView);
      const viewBody = activeViewHtml(viewModel, activePanelView);
      return {
        activePanelView,
        html: `
          <div class="cqc-metrics">
            ${(viewModel?.primaryMetrics || []).map(primaryMetricHtml).join('')}
          </div>
          ${panelTabsHtml(viewModel, activePanelView)}
          <div class="cqc-details">
            ${viewBody}
          </div>
        `,
      };
    }

    function renderLoading() {
      return `
        <div class="cqc-loading">
          <div class="cqc-spinner"></div>
          <div>
            <strong>${escapeHtml(t('loadingTitle'))}</strong>
            <span>${escapeHtml(t('loadingHint'))}</span>
          </div>
        </div>
      `;
    }

    function renderError(error) {
      return `
        <div class="cqc-error">
          <strong>${escapeHtml(t('errorTitle'))}</strong>
          <p>${escapeHtml(error?.message || error || t('errorUnknown'))}</p>
          <button type="button" class="cqc-refresh" data-action="refresh">${escapeHtml(t('actionRetry'))}</button>
        </div>
      `;
    }

    function installStyles(documentObject, rootId) {
      if (!documentObject?.createElement || !documentObject?.head) {
        throw new Error('Quota panel renderer requires a document adapter.');
      }
      if (!rootId) {
        throw new Error('Quota panel renderer requires rootId.');
      }
      if (documentObject.getElementById(`${rootId}-style`)) return;

      const style = documentObject.createElement('style');
      style.id = `${rootId}-style`;
      style.textContent = `
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
      documentObject.head.append(style);
    }

    return {
      renderResult,
      renderLoading,
      renderError,
      installStyles,
    };
  }

  globalObject[LIB_NAME] = Object.freeze({
    createQuotaPanelRenderer,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
