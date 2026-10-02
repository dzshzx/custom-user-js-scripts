import type { ComponentType } from 'preact';
import type { QuotaMessageKey, QuotaTranslate } from './codex-quota-compass-i18n.lib.ts';
import type { CostDayRow, CostViewModel } from './codex-quota-compass-panel-view-model.lib.ts';
import type { DataTableProps, SectionProps } from './codex-quota-compass-panel-renderer.lib.tsx';
import type { QuotaPeriodAccess } from './codex-quota-compass-contract.lib.ts';

export type StatsPeriod = 'day' | 'week' | 'month' | 'all';
/** In-panel drill-down range (inclusive `YYYY-MM-DD` bounds). */
export interface StatsDrill {
  from: string;
  to: string;
  label?: string;
}
export interface StatsViewProps {
  cost: CostViewModel | null | undefined;
  rolling: QuotaPeriodAccess['summary'] | null | undefined;
  period: string | null | undefined;
  drill: StatsDrill | null | undefined;
  t: QuotaTranslate;
  Section: ComponentType<SectionProps>;
  DataTable: ComponentType<DataTableProps>;
}
interface DrillableItem {
  from: string;
  to: string;
  label: string | undefined;
  usd: number;
  credits: number;
}

const LIB_NAME = 'CodexQuotaCompassPanelStatsLib';
const PERIODS: readonly StatsPeriod[] = ['day', 'week', 'month', 'all'];
const PERIOD_TABS: readonly (readonly [StatsPeriod, QuotaMessageKey])[] = [
  ['day', 'statsPeriodDay'],
  ['week', 'statsPeriodWeek'],
  ['month', 'statsPeriodMonth'],
  ['all', 'statsPeriodAll'],
];

function round(value: unknown): number {
  return Math.round(Number(value || 0));
}

function usd(value: unknown): string {
  return Number(value || 0).toFixed(2);
}

function normalizePeriod(period: string | null | undefined): StatsPeriod {
  return PERIODS.includes(period as StatsPeriod) ? (period as StatsPeriod) : 'day';
}

// Statistics view component. Receives the renderer's Section and DataTable
// components (plus t) so it never duplicates the renderer's table markup and
// stays testable with stub components. Drillable rows are real <button>s
// carrying a data-action payload the shell's event delegation routes back to
// the controller.
function StatsView({ cost, rolling, period, drill, t, Section, DataTable }: StatsViewProps) {
  if (typeof t !== 'function' || typeof Section !== 'function' || typeof DataTable !== 'function') {
    throw new Error(`${LIB_NAME}.StatsView requires t/Section/DataTable.`);
  }
  const activePeriod = normalizePeriod(period);

  const empty = <div class="cqc-empty">{t('statsEmpty')}</div>;

  const periodTabs = (
    <div class="cqc-stats-tabs" role="group" aria-label={t('tabStats')}>
      {PERIOD_TABS.map(([id, key]) => (
        <button
          key={id}
          type="button"
          class={`cqc-stats-tab${activePeriod === id ? ' is-active' : ''}`}
          data-action="switch-stats-period"
          data-period={id}
          aria-pressed={activePeriod === id ? 'true' : 'false'}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );

  // Compact "live, real-time" rolling-30 line sourced from the latest snapshot
  // (not the settled ledger), clearly labelled so live and settled figures
  // are never mixed.
  function rollingLive() {
    if (!rolling) return null;
    return (
      <div class="cqc-stats-live cqc-table-note">
        {t('statsRollingLive')}: ${usd(rolling['累计折算USD'])} · {String(round(rolling['累计Credits']))} Credits
      </div>
    );
  }

  // Last-30-days settled USD as pure CSS bars; the daily table below is the
  // text equivalent, so the chart itself is hidden from assistive technology.
  function chart() {
    const days = (cost!.allDays || []).slice(-30);
    if (!days.length) return null;
    const max = Math.max(...days.map((row) => Number(row.usd) || 0));
    if (!(max > 0)) return null;
    return (
      <div class="cqc-stats-chart" aria-hidden="true">
        {days.map((row, index) => (
          <span
            key={row.date || index}
            class="cqc-stats-chart-bar"
            style={{ height: `${Math.max(2, Math.round(((Number(row.usd) || 0) / max) * 100))}%` }}
          />
        ))}
      </div>
    );
  }

  function dailyTable(rows: CostDayRow[] | undefined) {
    const mapped = (Array.isArray(rows) ? rows : []).map((row) => ({
      date: row.date,
      credits: round(row.credits),
      usd: usd(row.usd),
    }));
    return mapped.length ? (
      <DataTable
        rows={mapped}
        columns={[
          { key: 'date', labelKey: 'statsColumnDate', priority: 'primary' },
          { key: 'credits', labelKey: 'statsColumnCredits' },
          { key: 'usd', labelKey: 'statsColumnUsd' },
        ]}
        limit={mapped.length}
      />
    ) : (
      empty
    );
  }

  function estimateLine(label: string, range: string | undefined, creditsValue: number, usdValue: number) {
    return (
      <div class="cqc-stats-estimate">
        <span class="cqc-stats-estimate-label">{label}</span>
        <span class="cqc-stats-estimate-tag">{t('statsEstimate')}</span>
        <span class="cqc-stats-estimate-range">{range}</span>
        <span class="cqc-stats-estimate-figure">
          ${usd(usdValue)} · {String(round(creditsValue))} Credits
        </span>
      </div>
    );
  }

  // Drillable list of period buckets. Each row is a real button whose
  // data-from/data-to/data-label drive the in-panel drill-down.
  function drillableList(items: DrillableItem[]) {
    if (!items.length) return empty;
    return (
      <div class="cqc-stats-list">
        {items.map((item) => (
          <button
            key={`${item.from}~${item.to}`}
            type="button"
            class="cqc-stats-row"
            data-action="stats-drill"
            data-from={item.from}
            data-to={item.to}
            data-label={item.label}
          >
            <span class="cqc-stats-row-label">{item.label}</span>
            <span class="cqc-stats-row-usd">${usd(item.usd)}</span>
            <span class="cqc-stats-row-credits">{String(round(item.credits))} Credits</span>
          </button>
        ))}
      </div>
    );
  }

  function dayBody() {
    const day = cost!.day || {};
    return (
      <Section title={t('statsPeriodDay')}>
        {day.today ? estimateLine(t('costTodayLabel'), day.today.date, day.today.credits, day.today.usd) : null}
        {dailyTable(day.rows)}
      </Section>
    );
  }

  function weekBody() {
    const week = cost!.week || {};
    return (
      <Section title={t('statsPeriodWeek')}>
        {week.current
          ? estimateLine(
              t('statsPeriodWeek'),
              `${week.current.from} ~ ${week.current.to}`,
              week.current.credits,
              week.current.usd,
            )
          : null}
        {drillableList(
          (week.blocks || []).map((block) => ({
            from: block.from,
            to: block.to,
            label: `${block.from} ~ ${block.to}`,
            usd: block.usd,
            credits: block.credits,
          })),
        )}
      </Section>
    );
  }

  function monthBody() {
    const month = cost!.month || {};
    return (
      <Section title={t('statsPeriodMonth')}>
        {month.current
          ? estimateLine(t('statsPeriodMonth'), month.current.month, month.current.credits, month.current.usd)
          : null}
        {drillableList(
          (month.rows || []).map((row) => ({
            from: row.from,
            to: row.to,
            label: row.month,
            usd: row.usd,
            credits: row.credits,
          })),
        )}
      </Section>
    );
  }

  function allBody() {
    const all = cost!.all || {};
    return (
      <Section title={t('statsPeriodAll')}>
        <div class="cqc-stats-all-total">
          {t('statsAllTotal')}: ${usd(all.totalUsd)} · {String(round(all.totalCredits))} Credits
        </div>
        <div class="cqc-table-note">
          {t('statsCoverDays', { days: all.coverDays || 0 })} · {all.fromDate || '-'} ~ {all.toDate || '-'}
        </div>
        {dailyTable(all.rows)}
      </Section>
    );
  }

  function drillBody() {
    const rows = (cost!.allDays || []).filter((row) => row.date >= drill!.from && row.date <= drill!.to);
    return (
      <div class="cqc-stats-drill">
        <button type="button" class="cqc-stats-back" data-action="stats-drill-back">
          {t('statsDrillBack')}
        </button>
        <div class="cqc-stats-drill-title">{drill!.label || `${drill!.from} ~ ${drill!.to}`}</div>
        {dailyTable(rows)}
      </div>
    );
  }

  if (!cost) {
    return (
      <>
        {periodTabs}
        {empty}
      </>
    );
  }

  if (drill && drill.from && drill.to) {
    return (
      <>
        {periodTabs}
        {drillBody()}
      </>
    );
  }

  const body =
    activePeriod === 'week'
      ? weekBody()
      : activePeriod === 'month'
        ? monthBody()
        : activePeriod === 'all'
          ? allBody()
          : dayBody();

  return (
    <>
      {periodTabs}
      {chart()}
      {rollingLive()}
      {body}
    </>
  );
}

export { PERIODS, StatsView };
