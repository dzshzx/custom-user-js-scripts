(function attachCodexQuotaCompassPanelStatsLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassPanelStatsLib';
  const PERIODS = ['day', 'week', 'month', 'all'];

  function round(value) {
    return Math.round(Number(value || 0));
  }

  function usd(value) {
    return Number(value || 0).toFixed(2);
  }

  function normalizePeriod(period) {
    return PERIODS.includes(period) ? period : 'day';
  }

  // Pure HTML builder for the Statistics view. Receives the renderer's own
  // helpers (t / sectionHtml / tableHtml / escapeHtml) so it stays DOM-free and
  // unit-testable with stub helpers, and never duplicates the renderer's table
  // markup. Drillable rows are real <button>s carrying a data-action payload the
  // shell's event delegation routes back to the entry.
  function buildStatsView({ cost, rolling, period, drill } = {}, helpers = {}) {
    const { t, sectionHtml, tableHtml, escapeHtml } = helpers;
    if (typeof t !== 'function' || typeof sectionHtml !== 'function'
      || typeof tableHtml !== 'function' || typeof escapeHtml !== 'function') {
      throw new Error(`${LIB_NAME}.buildStatsView requires t/sectionHtml/tableHtml/escapeHtml helpers.`);
    }

    const activePeriod = normalizePeriod(period);

    function emptyHtml() {
      return `<div class="cqc-empty">${escapeHtml(t('statsEmpty'))}</div>`;
    }

    function periodTabsHtml() {
      const items = [
        ['day', 'statsPeriodDay'],
        ['week', 'statsPeriodWeek'],
        ['month', 'statsPeriodMonth'],
        ['all', 'statsPeriodAll'],
      ];
      return `
        <div class="cqc-stats-tabs" role="group" aria-label="${escapeHtml(t('tabStats'))}">
          ${items.map(([id, key]) => `
            <button
              type="button"
              class="cqc-stats-tab${activePeriod === id ? ' is-active' : ''}"
              data-action="switch-stats-period"
              data-period="${escapeHtml(id)}"
              aria-pressed="${activePeriod === id ? 'true' : 'false'}"
            >${escapeHtml(t(key))}</button>
          `).join('')}
        </div>
      `;
    }

    // Compact "live, real-time" rolling-30 line sourced from the latest snapshot
    // (not the settled ledger), clearly labelled to avoid the old confusion of
    // mixing live and settled figures.
    function rollingLiveHtml() {
      if (!rolling) return '';
      const usdValue = usd(rolling['累计折算USD']);
      const creditsValue = round(rolling['累计Credits']);
      return `<div class="cqc-stats-live cqc-table-note">${escapeHtml(t('statsRollingLive'))}: $${escapeHtml(usdValue)} · ${escapeHtml(String(creditsValue))} Credits</div>`;
    }

    function dailyTableHtml(rows) {
      const mapped = (Array.isArray(rows) ? rows : []).map((row) => ({
        日期桶: row.date,
        Credits: round(row.credits),
        折算USD: usd(row.usd),
      }));
      return mapped.length
        ? tableHtml(mapped, { columns: ['日期桶', 'Credits', '折算USD'], limit: mapped.length })
        : emptyHtml();
    }

    function estimateLineHtml(label, range, creditsValue, usdValue) {
      return `
        <div class="cqc-stats-estimate">
          <span class="cqc-stats-estimate-label">${escapeHtml(label)}</span>
          <span class="cqc-stats-estimate-tag">${escapeHtml(t('statsEstimate'))}</span>
          <span class="cqc-stats-estimate-range">${escapeHtml(range)}</span>
          <span class="cqc-stats-estimate-figure">$${escapeHtml(usd(usdValue))} · ${escapeHtml(String(round(creditsValue)))} Credits</span>
        </div>
      `;
    }

    // Drillable list of period buckets. Each row is a real button whose
    // data-from/data-to/data-label drive the in-panel drill-down.
    function drillableListHtml(items) {
      if (!items.length) return emptyHtml();
      return `
        <div class="cqc-stats-list">
          ${items.map((item) => `
            <button
              type="button"
              class="cqc-stats-row"
              data-action="stats-drill"
              data-from="${escapeHtml(item.from)}"
              data-to="${escapeHtml(item.to)}"
              data-label="${escapeHtml(item.label)}"
            >
              <span class="cqc-stats-row-label">${escapeHtml(item.label)}</span>
              <span class="cqc-stats-row-usd">$${escapeHtml(usd(item.usd))}</span>
              <span class="cqc-stats-row-credits">${escapeHtml(String(round(item.credits)))} Credits</span>
            </button>
          `).join('')}
        </div>
      `;
    }

    function dayBody() {
      const day = cost.day || {};
      const today = day.today
        ? estimateLineHtml(t('costTodayLabel'), day.today.date, day.today.credits, day.today.usd)
        : '';
      return sectionHtml(t('statsPeriodDay'), today + dailyTableHtml(day.rows));
    }

    function weekBody() {
      const week = cost.week || {};
      const current = week.current
        ? estimateLineHtml(t('statsPeriodWeek'), `${week.current.from} ~ ${week.current.to}`, week.current.credits, week.current.usd)
        : '';
      const list = drillableListHtml((week.blocks || []).map((block) => ({
        from: block.from,
        to: block.to,
        label: `${block.from} ~ ${block.to}`,
        usd: block.usd,
        credits: block.credits,
      })));
      return sectionHtml(t('statsPeriodWeek'), current + list);
    }

    function monthBody() {
      const month = cost.month || {};
      const current = month.current
        ? estimateLineHtml(t('statsPeriodMonth'), month.current.month, month.current.credits, month.current.usd)
        : '';
      const list = drillableListHtml((month.rows || []).map((row) => ({
        from: row.from,
        to: row.to,
        label: row.month,
        usd: row.usd,
        credits: row.credits,
      })));
      return sectionHtml(t('statsPeriodMonth'), current + list);
    }

    function allBody() {
      const all = cost.all || {};
      const header = `
        <div class="cqc-stats-all-total">${escapeHtml(t('statsAllTotal'))}: $${escapeHtml(usd(all.totalUsd))} · ${escapeHtml(String(round(all.totalCredits)))} Credits</div>
        <div class="cqc-table-note">${escapeHtml(t('statsCoverDays', { days: all.coverDays || 0 }))} · ${escapeHtml(all.fromDate || '-')} ~ ${escapeHtml(all.toDate || '-')}</div>
      `;
      return sectionHtml(t('statsPeriodAll'), header + dailyTableHtml(all.rows));
    }

    function drillBody() {
      const rows = (cost.allDays || []).filter((row) => row.date >= drill.from && row.date <= drill.to);
      const back = `<button type="button" class="cqc-stats-back" data-action="stats-drill-back">${escapeHtml(t('statsDrillBack'))}</button>`;
      const title = `<div class="cqc-stats-drill-title">${escapeHtml(drill.label || `${drill.from} ~ ${drill.to}`)}</div>`;
      return `<div class="cqc-stats-drill">${back}${title}${dailyTableHtml(rows)}</div>`;
    }

    if (!cost) {
      return periodTabsHtml() + emptyHtml();
    }

    if (drill && drill.from && drill.to) {
      return periodTabsHtml() + drillBody();
    }

    let body;
    if (activePeriod === 'week') body = weekBody();
    else if (activePeriod === 'month') body = monthBody();
    else if (activePeriod === 'all') body = allBody();
    else body = dayBody();

    return periodTabsHtml() + rollingLiveHtml() + body;
  }

  globalObject[LIB_NAME] = Object.freeze({
    PERIODS,
    buildStatsView,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
