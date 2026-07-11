import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomWindow, domSkip } from './helpers/dom-env.mjs';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-stats-styles.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-panel-stats.lib.js');

const { buildStatsView } = globalThis.CodexQuotaCompassPanelStatsLib;
const { createQuotaPanelStatsStyles } = globalThis.CodexQuotaCompassPanelStatsStylesLib;

// Stub the renderer helpers so the view builder can be exercised without a DOM
// or the real renderer. tableHtml echoes its rows as JSON so assertions can read
// exactly which rows reached the table.
const helpers = {
  t: (key) => key,
  sectionHtml: (title, body) => `<section data-title="${title}">${body}</section>`,
  tableHtml: (rows) => `<table data-rows="${rows.length}">${JSON.stringify(rows)}</table>`,
  escapeHtml: (value) => String(value ?? ''),
};

const COST = {
  cycleStartDate: '2026-06-01',
  today: { date: '2026-06-20', credits: 5, usd: 0.2 },
  day: {
    rows: [
      { date: '2026-06-02', credits: 200, usd: 8 },
      { date: '2026-06-10', credits: 100, usd: 4 },
    ],
    today: { date: '2026-06-20', credits: 5, usd: 0.2 },
  },
  week: {
    current: { from: '2026-06-14', to: '2026-06-20', credits: 15, usd: 0.6 },
    blocks: [{ from: '2026-06-07', to: '2026-06-13', credits: 100, usd: 4 }],
  },
  month: {
    current: { month: '2026-06', credits: 305, usd: 12.2 },
    rows: [{ month: '2026-05', from: '2026-05-01', to: '2026-05-31', credits: 80, usd: 3.2 }],
  },
  all: {
    totalCredits: 300,
    totalUsd: 12,
    coverDays: 2,
    fromDate: '2026-06-02',
    toDate: '2026-06-10',
    rows: [
      { date: '2026-06-02', credits: 200, usd: 8 },
      { date: '2026-06-10', credits: 100, usd: 4 },
    ],
  },
  allDays: [
    { date: '2026-06-02', credits: 200, usd: 8 },
    { date: '2026-06-10', credits: 100, usd: 4 },
    { date: '2026-06-18', credits: 30, usd: 1.2 },
  ],
};

const ROLLING = { 累计折算USD: 8, 累计Credits: 200 };

test('buildStatsView requires renderer helpers', () => {
  assert.throws(() => buildStatsView({ cost: COST }, {}), /helpers/);
});

test('buildStatsView (no cost) shows period tabs and an empty state', () => {
  const html = buildStatsView({ cost: null, period: 'day' }, helpers);
  assert.match(html, /cqc-stats-tabs/);
  assert.match(html, /statsEmpty/);
});

test('day period is a flat list with a today estimate and no drill rows', () => {
  const html = buildStatsView({ cost: COST, rolling: ROLLING, period: 'day' }, helpers);
  assert.match(html, /data-action="switch-stats-period"/);
  assert.match(html, /data-period="day"/);
  // Live rolling line is shown on summaries.
  assert.match(html, /statsRollingLive/);
  // Today estimate line.
  assert.match(html, /cqc-stats-estimate/);
  assert.match(html, /2026-06-20/);
  // Daily table carries the two settled rows.
  assert.match(html, /data-rows="2"/);
  // A day is the finest grain: no drill affordance.
  assert.doesNotMatch(html, /data-action="stats-drill"/);
});

test('week period renders drillable buckets carrying a range payload', () => {
  const html = buildStatsView({ cost: COST, rolling: ROLLING, period: 'week' }, helpers);
  assert.match(html, /data-action="stats-drill"/);
  assert.match(html, /data-from="2026-06-07"/);
  assert.match(html, /data-to="2026-06-13"/);
  // Current in-progress week is an estimate row.
  assert.match(html, /cqc-stats-estimate/);
});

test('month period renders drillable month rows', () => {
  const html = buildStatsView({ cost: COST, rolling: ROLLING, period: 'month' }, helpers);
  assert.match(html, /data-action="stats-drill"/);
  assert.match(html, /data-from="2026-05-01"/);
  assert.match(html, /data-to="2026-05-31"/);
  assert.match(html, /2026-05/);
});

test('all period shows a settled total and a flat list, no drill rows', () => {
  const html = buildStatsView({ cost: COST, rolling: ROLLING, period: 'all' }, helpers);
  assert.match(html, /statsAllTotal/);
  assert.match(html, /statsCoverDays/);
  assert.match(html, /data-rows="2"/);
  assert.doesNotMatch(html, /data-action="stats-drill"/);
});

test('drill filters allDays to the selected range and hides the live line', () => {
  const html = buildStatsView({
    cost: COST,
    rolling: ROLLING,
    period: 'week',
    drill: { from: '2026-06-08', to: '2026-06-14', label: '2026-06-08 ~ 2026-06-14' },
  }, helpers);

  assert.match(html, /data-action="stats-drill-back"/);
  assert.match(html, /2026-06-08 ~ 2026-06-14/);
  // Only 2026-06-10 falls inside [06-08, 06-14].
  assert.match(html, /data-rows="1"/);
  assert.match(html, /2026-06-10/);
  assert.doesNotMatch(html, /2026-06-02/);
  // The live rolling line is summary-only.
  assert.doesNotMatch(html, /statsRollingLive/);
});

test('unknown period falls back to day', () => {
  const html = buildStatsView({ cost: COST, rolling: ROLLING, period: 'bogus' }, helpers);
  // The active highlight lands on the day tab (markup spreads attributes across lines).
  assert.match(html, /is-active"[\s\S]*?data-period="day"/);
});

test('period controls expose a single perceivable selected state', () => {
  const html = buildStatsView({ cost: COST, rolling: ROLLING, period: 'month' }, helpers);

  assert.match(html, /role="group"/);
  assert.match(html, /data-period="month"[\s\S]*?aria-pressed="true"/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 3);
});

test('statistics controls and focus treatment survive DOM rendering', { skip: domSkip }, () => {
  const window = createDomWindow();
  window.document.body.innerHTML = buildStatsView({
    cost: COST,
    rolling: ROLLING,
    period: 'week',
  }, helpers);

  const periodButtons = [...window.document.querySelectorAll('[data-action="switch-stats-period"]')];
  const selected = periodButtons.filter((button) => button.getAttribute('aria-pressed') === 'true');
  const drillButton = window.document.querySelector('[data-action="stats-drill"]');

  assert.equal(periodButtons.length, 4);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].dataset.period, 'week');
  assert.equal(drillButton?.tagName, 'BUTTON');
  assert.equal(drillButton?.getAttribute('type'), 'button');

  const styles = createQuotaPanelStatsStyles('stats-test-root');
  assert.match(styles, /#stats-test-root \.cqc-stats-tab:focus-visible/);
  assert.match(styles, /#stats-test-root \.cqc-stats-row:focus-visible/);
  assert.match(styles, /#stats-test-root \.cqc-stats-back:focus-visible/);
  assert.match(styles, /--cqc-stats-space-control: 0\.5rem/);
  assert.match(styles, /--cqc-stats-motion-duration: 160ms/);
  assert.doesNotMatch(styles, /\n\s*\.cqc-stats-/);
});

test('statistics styles require an explicit root scope', () => {
  assert.throws(() => createQuotaPanelStatsStyles(), /requires rootId/);
});
