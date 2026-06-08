(function attachCodexQuotaCompassPanelRendererLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelRendererLib';

  const rendererStylesLib = globalObject.CodexQuotaCompassPanelRendererStylesLib;
  if (!rendererStylesLib?.installQuotaPanelRendererStyles) {
    throw new Error(`${LIB_NAME}: CodexQuotaCompassPanelRendererStylesLib is not loaded.`);
  }
  const { installQuotaPanelRendererStyles } = rendererStylesLib;

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
      installQuotaPanelRendererStyles(documentObject, rootId);
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
