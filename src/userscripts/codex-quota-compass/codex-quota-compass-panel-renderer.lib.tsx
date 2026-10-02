import { installQuotaPanelRendererStyles } from './codex-quota-compass-panel-renderer-styles.lib.ts';
import { StatsView } from './codex-quota-compass-panel-stats.lib.tsx';

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number')
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return String(value);
}

function safeRows(rows, limit = 12) {
  return Array.isArray(rows) ? rows.slice(0, limit) : [];
}

function classes(...names) {
  return names.filter(Boolean).join(' ');
}

const DEFAULT_TABS = [
  { id: 'details', labelKey: 'tabDetails' },
  { id: 'stats', labelKey: 'tabStats' },
  { id: 'archive', labelKey: 'tabArchiveWorkspace' },
];

// Builds the quota panel's preact components around the injected translator.
// The controller renders <Panel> into the panel content node; preact diffs
// every update in place, so background refreshes and tab switches never
// rebuild unrelated nodes (focus, scroll and form drafts survive).
function createQuotaPanelRenderer({ t, formatTimestamp } = {}) {
  if (typeof t !== 'function') {
    throw new Error('Quota panel renderer requires a translator function.');
  }

  // Render stored UTC ISO timestamps in the viewer's own locale/timezone.
  // No-arg toLocaleString() uses the host environment's timezone, which in the
  // browser is the user's. Falls back to the raw value for unparseable input.
  const formatLocalTimestamp =
    typeof formatTimestamp === 'function'
      ? formatTimestamp
      : (value) => {
          const date = new Date(value);
          return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
        };

  // Guards empty/placeholder values (new Date(null) would wrongly become 1970)
  // before localizing a captured/synced timestamp.
  function displayTimestamp(value) {
    if (!value || value === '-') return '-';
    return formatLocalTimestamp(value);
  }

  function normalizeDataColumns(rows, columns) {
    if (Array.isArray(columns) && columns.length) {
      return columns
        .map((column) =>
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
              },
        )
        .filter((column) => column.key);
    }

    return [...new Set(rows.flatMap((row) => Object.keys(row || {})))].map((key) => ({
      key,
      label: key,
      priority: 'secondary',
      compact: true,
    }));
  }

  function columnLabel(column) {
    return column.labelKey ? t(column.labelKey) : column.label;
  }

  function DataView({ view = {}, state = {} }) {
    const rows = Array.isArray(view.rows) ? view.rows : [];
    const limit = view.limit ?? 12;
    const expandable = rows.length > limit;
    const expanded = expandable && Boolean(state.expandedViews?.has?.(view.id));
    const visibleRows = expanded ? rows : safeRows(rows, limit);
    const columns = normalizeDataColumns(visibleRows, view.columns);

    if (!visibleRows.length || !columns.length) {
      return <div class="cqc-empty">{t(view.emptyKey || 'tableNoData')}</div>;
    }

    const compactColumns = columns.filter((column) => column.compact && column.priority !== 'debug');
    return (
      <>
        <div
          class="cqc-data-view"
          data-view-id={view.id || ''}
          data-compact={view.compactOnMobile === false ? 'false' : 'true'}
        >
          <div class="cqc-table-wrap cqc-data-table">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{columnLabel(column)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr key={index}>
                    {columns.map((column) => {
                      const value = formatValue(row?.[column.key]);
                      return (
                        <td
                          key={column.key}
                          class={classes(
                            column.truncate && 'is-truncated',
                            column.wrap && 'is-wrappable',
                            column.priority && `is-${column.priority}`,
                          )}
                          title={column.truncate ? value : undefined}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="cqc-compact-list">
            {visibleRows.map((row, index) => (
              <dl key={index} class="cqc-compact-row">
                {compactColumns.map((column) => {
                  const value = formatValue(row?.[column.key]);
                  return (
                    <div key={column.key} class="cqc-compact-field">
                      <dt>{columnLabel(column)}</dt>
                      <dd
                        class={classes(
                          'cqc-compact-value',
                          column.truncate && 'is-truncated',
                          column.wrap && 'is-wrappable',
                        )}
                        title={column.truncate ? value : undefined}
                      >
                        {value}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ))}
          </div>
        </div>
        {expandable ? (
          <div class="cqc-table-note">
            <button
              type="button"
              class="cqc-table-expand"
              data-action="toggle-rows"
              data-view-id={view.id || ''}
              data-expanded={expanded ? 'true' : 'false'}
            >
              {expanded ? t('tableShowLess') : t('tableShowAll', { total: rows.length })}
            </button>
          </div>
        ) : null}
      </>
    );
  }

  function DataTable({ rows, id = '', columns, limit, compactOnMobile }) {
    return <DataView view={{ id, rows, columns, limit, compactOnMobile }} />;
  }

  function Metric({ label, value, hint = '' }) {
    return (
      <div class="cqc-metric">
        <div class="cqc-metric-label">{label}</div>
        <div class="cqc-metric-value">{formatValue(value)}</div>
        {hint ? <div class="cqc-metric-hint">{hint}</div> : null}
      </div>
    );
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
    return value === null || value === undefined || value === '' ? '-' : `$${formatMetricDecimal(value)}`;
  }

  function formatHoursDuration(hours) {
    const numericHours = Number(hours);
    if (!Number.isFinite(numericHours)) return '-';

    const totalMinutes = Math.max(0, Math.round(numericHours * 60));
    const days = Math.floor(totalMinutes / (24 * 60));
    const remainingHours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return t('durationDaysHours', { days, hours: remainingHours });
    if (remainingHours > 0) return t('durationHoursMinutes', { hours: remainingHours, minutes });
    return t('durationMinutes', { minutes });
  }

  function ModelMetric({ metric }) {
    const label = metric?.labelKey ? t(metric.labelKey) : metric?.label || '-';
    if (metric?.type === 'credit') return <Metric label={label} value={usdMetricValue(metric.usd)} />;
    if (metric?.type === 'reset')
      return <Metric label={t('resetCountdown')} value={formatHoursDuration(metric.hours)} />;
    return <Metric label={label} value={metric?.value} />;
  }

  function Hero({ metric }) {
    if (!metric) return null;
    const label = metric.labelKey ? t(metric.labelKey) : metric.label || '-';
    const value = metric.type === 'credit' ? usdMetricValue(metric.usd) : formatValue(metric.value);
    const hours = Number(metric.resetHours);
    return (
      <section class="cqc-hero">
        <div class="cqc-hero-label">{label}</div>
        <div class="cqc-hero-value">{value}</div>
        {Number.isFinite(hours) ? (
          <div class="cqc-hero-sub">{t('heroResetSubline', { duration: formatHoursDuration(hours) })}</div>
        ) : null}
      </section>
    );
  }

  function Metrics({ metrics, secondary = false }) {
    const list = Array.isArray(metrics) ? metrics : [];
    if (!list.length) return null;
    return (
      <div class={secondary ? 'cqc-metrics cqc-metrics-secondary' : 'cqc-metrics'}>
        {list.map((metric, index) => (
          <ModelMetric key={metric?.id || index} metric={metric} />
        ))}
      </div>
    );
  }

  function SyncBanner({ banner }) {
    if (!banner) return null;
    const variables = {
      backend: banner.backendLabel || '-',
      endpoint: banner.endpoint || '-',
      lastSyncedAt: banner.lastSyncedAt || '-',
      error: banner.lastError || '-',
    };
    return (
      <div class="cqc-sync-banner" data-tone={banner.tone || 'muted'}>
        <strong>{t(banner.titleKey, variables)}</strong>
        <span>{t(banner.detailKey, variables)}</span>
      </div>
    );
  }

  // The sync form is controlled by the controller-owned draft: background
  // refreshes re-render it with fresh status while the draft keeps whatever
  // the user has typed. `draft` is null until the first edit.
  function SyncForm({ status = {}, draft = null, onDraft = () => {} }) {
    const enabled = draft ? draft.enabled : Boolean(status.enabled);
    const hasToken = Boolean(status.hasToken);
    const configured = Boolean(status.configured);
    const token = draft ? draft.token : '';
    const gistId = draft ? draft.gistId : status.gistId || '';
    const lastSyncedAt = status.lastSyncedAt || '';
    const lastError = status.lastError || '';
    const current = { token, gistId, enabled };
    const edit = (changes) => onDraft({ ...current, ...changes });

    // A plain container (not a <form>) so pressing Enter never submits/reloads
    // the host page, and no inline event handlers trip the site CSP.
    return (
      <div class="cqc-sync-form" data-sync-form>
        <div class="cqc-sync-form-title">{t('remoteSyncFormTitle')}</div>
        <div class="cqc-sync-field">
          <span class="cqc-sync-field-label">
            {t('remoteSyncTokenLabel')}
            <span class="cqc-sync-field-hint">
              {hasToken ? t('remoteSyncTokenSavedHint') : t('remoteSyncTokenFieldHint')}
            </span>
          </span>
          <input
            type="password"
            data-field="token"
            autocomplete="new-password"
            spellcheck={false}
            placeholder={hasToken ? t('remoteSyncTokenPlaceholderSet') : t('remoteSyncTokenPlaceholderNew')}
            value={token}
            onInput={(event) => edit({ token: event.currentTarget.value })}
          />
        </div>
        <div class="cqc-sync-field">
          <span class="cqc-sync-field-label">
            {t('remoteSyncGistIdLabel')}
            <span class="cqc-sync-field-hint">{t('remoteSyncGistIdFieldHint')}</span>
          </span>
          <input
            type="text"
            data-field="gistId"
            spellcheck={false}
            placeholder={t('remoteSyncGistIdPlaceholder')}
            value={gistId}
            onInput={(event) => edit({ gistId: event.currentTarget.value })}
          />
        </div>
        <label class="cqc-sync-toggle">
          <input
            type="checkbox"
            data-field="enabled"
            checked={enabled}
            onChange={(event) => edit({ enabled: event.currentTarget.checked })}
          />
          {t('remoteSyncEnableLabel')}
        </label>
        <div class="cqc-sync-form-status" data-tone={lastError ? 'error' : 'muted'}>
          {lastError
            ? t('remoteSyncStatusError', { error: lastError })
            : lastSyncedAt
              ? t('remoteSyncLastSynced', { lastSyncedAt: formatLocalTimestamp(lastSyncedAt) })
              : t('remoteSyncNeverSynced')}
        </div>
        <div class="cqc-sync-form-actions">
          <button type="button" data-action="save-remote-sync" data-variant="primary">
            {t('remoteSyncSaveAction')}
          </button>
          {enabled && configured ? (
            <button type="button" data-action="sync-remote">
              {t('remoteSyncNowAction')}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function Section({ title, children }) {
    return (
      <section class="cqc-section">
        <h3>{title}</h3>
        {children}
      </section>
    );
  }

  function DetailActions({ actions }) {
    return (
      <div class="cqc-detail-footnote">
        {actions.map((item) => (
          <button key={item.action} type="button" data-action={item.action}>
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  function ArchiveSummary({ model = {}, state }) {
    if (!model.isLoaded) {
      return <div class="cqc-empty">{t('archiveEmpty')}</div>;
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
    const recentSnapshots = safeRows(model.recentSnapshots || [], 5);

    return (
      <>
        <DataView
          state={state}
          view={{
            id: 'archive-overview',
            rows: [
              {
                [overviewColumns[0]]: model.snapshotCount,
                [overviewColumns[1]]: displayTimestamp(model.earliestCapturedAt),
                [overviewColumns[2]]: displayTimestamp(model.latestCapturedAt),
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
          }}
        />
        {model.importReport ? (
          <div class="cqc-table-note">
            {t('archiveLatestImport', {
              added: model.importReport.added,
              skipped: model.importReport.skipped,
              invalid: model.importReport.invalid,
            })}
          </div>
        ) : null}
        {recentSnapshots.length ? (
          <DataView
            state={state}
            view={{
              id: 'archive-recent',
              rows: recentSnapshots.map((row) => ({
                [recentColumns[0]]: displayTimestamp(row.capturedAt),
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
            }}
          />
        ) : (
          <div class="cqc-empty">{t('archiveNoSnapshot')}</div>
        )}
      </>
    );
  }

  function PanelTabs({ model, activePanelView }) {
    const tabs = Array.isArray(model?.tabs) && model.tabs.length ? model.tabs : DEFAULT_TABS;
    return (
      <div class="cqc-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            class={`cqc-tab${activePanelView === tab.id ? ' is-active' : ''}`}
            data-action="switch-view"
            data-view={tab.id}
          >
            {tab.labelKey ? t(tab.labelKey) : tab.label}
          </button>
        ))}
      </div>
    );
  }

  function ModelSection({ section, viewModel, state, form }) {
    if (!section) return null;
    if (section.type === 'metrics') return <Metrics metrics={section.metrics} />;
    if (section.type === 'dataView') {
      return (
        <Section title={t(section.titleKey)}>
          <DataView view={section} state={state} />
        </Section>
      );
    }
    if (section.type === 'syncBanner') return <SyncBanner banner={viewModel?.syncBanner} />;
    if (section.type === 'syncForm') {
      return <SyncForm status={viewModel?.remoteSyncStatus} draft={form?.draft} onDraft={form?.onDraft} />;
    }
    if (section.type === 'archiveSummary') {
      return (
        <Section title={t('sectionArchiveOverview')}>
          <ArchiveSummary model={viewModel?.archive} state={state} />
        </Section>
      );
    }
    if (section.type === 'note') {
      return <div class="cqc-transfer-note">{t(section.noteKey || 'transferNote')}</div>;
    }
    if (section.type === 'actions') {
      const actions = Array.isArray(section.actions)
        ? section.actions.map((item) => ({
            action: item.action,
            label: item.labelKey ? t(item.labelKey) : item.label,
          }))
        : [];
      return actions.length ? <DetailActions actions={actions} /> : null;
    }
    return null;
  }

  function SectionsView({ view, viewModel, state, form }) {
    return (view?.sections || []).map((section, index) => (
      <ModelSection
        key={`${section?.type}:${section?.id || index}`}
        section={section}
        viewModel={viewModel}
        state={state}
        form={form}
      />
    ));
  }

  function ArchiveView({ viewModel, state, form }) {
    const view = viewModel?.views?.archive;
    if (view) return <SectionsView view={view} viewModel={viewModel} state={state} form={form} />;
    return (
      <>
        <SyncBanner banner={viewModel?.syncBanner} />
        <Section title={t('sectionArchiveOverview')}>
          <ArchiveSummary model={viewModel?.archive} state={state} />
        </Section>
        <div class="cqc-transfer-note">{t('transferNote')}</div>
        <DetailActions
          actions={[
            { action: 'export-archive', label: t('archiveExportAction') },
            { action: 'import-archive', label: t('archiveImportAction') },
          ]}
        />
      </>
    );
  }

  function ActiveView({ viewModel, activePanelView, state = {}, form }) {
    const view = viewModel?.views?.[activePanelView] || viewModel?.views?.details;
    if (view?.kind === 'archiveWorkspace') return <ArchiveView viewModel={viewModel} state={state} form={form} />;
    if (view?.kind === 'stats') {
      return (
        <StatsView
          cost={viewModel?.cost}
          rolling={viewModel?.rolling}
          period={state.statsPeriod}
          drill={state.statsDrill}
          t={t}
          Section={Section}
          DataTable={DataTable}
        />
      );
    }
    const sectionsView = view?.kind === 'sections' ? view : viewModel?.views?.details;
    return <SectionsView view={sectionsView} viewModel={viewModel} state={state} form={form} />;
  }

  function normalizeActivePanelView(viewModel, requestedPanelView) {
    const tabs = Array.isArray(viewModel?.tabs) ? viewModel.tabs : [];
    if (tabs.length && !tabs.some((tab) => tab.id === requestedPanelView)) {
      return tabs[0].id;
    }
    return requestedPanelView || 'details';
  }

  function Result({ viewModel, state = {}, form }) {
    const activePanelView = normalizeActivePanelView(viewModel, state.activePanelView);
    return (
      <>
        <Hero metric={viewModel?.heroMetric} />
        <Metrics metrics={viewModel?.secondaryMetrics} secondary />
        <PanelTabs model={viewModel} activePanelView={activePanelView} />
        <div class="cqc-details">
          <ActiveView viewModel={viewModel} activePanelView={activePanelView} state={state} form={form} />
        </div>
      </>
    );
  }

  function Loading() {
    return (
      <div class="cqc-loading">
        <div class="cqc-spinner" />
        <div>
          <strong>{t('loadingTitle')}</strong>
          <span>{t('loadingHint')}</span>
        </div>
      </div>
    );
  }

  function ErrorState({ error }) {
    return (
      <div class="cqc-error">
        <strong>{t('errorTitle')}</strong>
        <p>{error?.message || error || t('errorUnknown')}</p>
        <button type="button" class="cqc-refresh" data-action="refresh">
          {t('actionRetry')}
        </button>
      </div>
    );
  }

  // One entry component for every panel presentation.
  //   presentation: 'loading' | 'error' | 'snapshot'
  //   form: { draft, onDraft } for the sync form (see SyncForm)
  function Panel({ presentation = 'snapshot', error = null, viewModel = null, state = {}, form }) {
    if (presentation === 'loading') return <Loading />;
    if (presentation === 'error') return <ErrorState error={error} />;
    if (!viewModel) return null;
    return <Result viewModel={viewModel} state={state} form={form} />;
  }

  function installStyles(documentObject, rootId) {
    installQuotaPanelRendererStyles(documentObject, rootId);
  }

  return { Panel, normalizeActivePanelView, installStyles };
}

export { createQuotaPanelRenderer };
