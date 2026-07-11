import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-ledger.lib.js');

const {
  SETTLE_BUFFER_MS,
  isSettled,
  upsertLedgerRow,
  foldSnapshotsIntoLedger,
  mergeLedgers,
  aggregateDaily,
  aggregateCycle,
  aggregateMonth,
  aggregateWeekly,
  aggregateMonthlyList,
  aggregateAllTime,
} = globalThis.CodexQuotaCompassLedgerLib;

const USD = 0.04;
const ms = (iso) => Date.parse(iso);

test('isSettled flips only after UTC day end + buffer', () => {
  const date = '2026-06-13';
  // UTC day 13 ends 2026-06-14T00:00:00Z; +15min buffer => 00:15Z
  assert.equal(isSettled(date, ms('2026-06-13T23:59:00Z')), false);
  assert.equal(isSettled(date, ms('2026-06-14T00:05:00Z')), false, 'before buffer still unsettled');
  assert.equal(isSettled(date, ms('2026-06-14T00:20:00Z')), true, 'after buffer settled');
});

test('upsert grows by max while unsettled, then locks once settled', () => {
  const ledger = {};
  const now = ms('2026-06-13T10:00:00Z'); // 13th in progress
  upsertLedgerRow(ledger, { date: '2026-06-13', credits: 100 }, now, { usdPerCredit: USD });
  assert.equal(ledger['2026-06-13'].credits, 100);
  assert.equal(ledger['2026-06-13'].settled, false);

  // lower reading must not shrink an unsettled day
  upsertLedgerRow(ledger, { date: '2026-06-13', credits: 80 }, now, { usdPerCredit: USD });
  assert.equal(ledger['2026-06-13'].credits, 100);

  // higher reading grows it
  upsertLedgerRow(ledger, { date: '2026-06-13', credits: 250 }, now, { usdPerCredit: USD });
  assert.equal(ledger['2026-06-13'].credits, 250);
  assert.equal(ledger['2026-06-13'].usd, 10);

  // next day after buffer => settle + lock; later glitchy value ignored
  const later = ms('2026-06-14T01:00:00Z');
  upsertLedgerRow(ledger, { date: '2026-06-13', credits: 300 }, later, { usdPerCredit: USD });
  assert.equal(ledger['2026-06-13'].settled, true);
  assert.equal(ledger['2026-06-13'].credits, 300);
  upsertLedgerRow(ledger, { date: '2026-06-13', credits: 5 }, later, { usdPerCredit: USD });
  assert.equal(ledger['2026-06-13'].credits, 300, 'settled day is locked');
});

function sampleSnapshots() {
  const day = (date, credits) => ({ '日期桶': date, Credits: credits, '折算USD': credits * USD });
  return [
    {
      capturedAt: '2026-06-13T09:00:00.000Z',
      periodDetails: { rolling: { dailyBuckets: [day('2026-06-11', 1000), day('2026-06-12', 2000), day('2026-06-13', 30)] } },
    },
    {
      // same-day later snapshot: 13th grew; duplicates of settled days repeated verbatim
      capturedAt: '2026-06-13T15:00:00.000Z',
      periodDetails: {
        rolling: { dailyBuckets: [day('2026-06-11', 1000), day('2026-06-12', 2000), day('2026-06-13', 90)] },
        monthToDate: { dailyBuckets: [day('2026-06-11', 1000), day('2026-06-12', 2000), day('2026-06-13', 90)] },
      },
    },
  ];
}

test('fold collapses repeated snapshots to one row per date (final/max), idempotent', () => {
  const now = ms('2026-06-14T02:00:00Z'); // 11/12/13 all settled
  const ledgerA = foldSnapshotsIntoLedger({}, sampleSnapshots(), now, { usdPerCredit: USD });
  assert.deepEqual(Object.keys(ledgerA).sort(), ['2026-06-11', '2026-06-12', '2026-06-13']);
  assert.equal(ledgerA['2026-06-13'].credits, 90, 'takes the grown/final value');
  assert.equal(ledgerA['2026-06-13'].settled, true);

  // idempotent: folding again yields identical content
  const ledgerB = foldSnapshotsIntoLedger(ledgerA, sampleSnapshots(), now, { usdPerCredit: USD });
  assert.deepEqual(ledgerB, ledgerA);
});

test('aggregates: daily / cycle / month sum only settled days, in-progress reported separately', () => {
  const now = ms('2026-06-13T15:00:00Z'); // 13th in progress; 11,12 settled
  const ledger = foldSnapshotsIntoLedger({}, sampleSnapshots(), now, { usdPerCredit: USD });

  const daily = aggregateDaily(ledger, { nowMs: now });
  assert.equal(daily.totalCredits, 3000, '1000 + 2000 settled only');
  assert.equal(daily.inProgress?.date, '2026-06-13');
  assert.equal(daily.inProgress?.credits, 90);

  const cycle = aggregateCycle(ledger, '2026-06-11', { nowMs: now });
  assert.equal(cycle.totalCredits, 3000);
  assert.equal(cycle.totalUsd, 120);

  const month = aggregateMonth(ledger, '2026-06', { nowMs: now });
  assert.equal(month.totalCredits, 3000);

  // cycle anchored later excludes earlier settled days
  const cycle2 = aggregateCycle(ledger, '2026-06-12', { nowMs: now });
  assert.equal(cycle2.totalCredits, 2000);
});

test('aggregates exclude the previous day while it is still inside the settle buffer', () => {
  const ledger = {};
  // 2026-06-13 last seen in-progress on the 13th, so stored settled:false.
  upsertLedgerRow(ledger, { date: '2026-06-13', credits: 500 }, ms('2026-06-13T20:00:00Z'), { usdPerCredit: USD });

  // now = 2026-06-14T00:05Z: past UTC midnight but before the +15min buffer => 06-13 NOT settled yet.
  const inBuffer = aggregateDaily(ledger, { nowMs: ms('2026-06-14T00:05:00Z') });
  assert.equal(inBuffer.totalCredits, 0, 'within-buffer previous day is not counted as settled');
  assert.equal(inBuffer.inProgress?.date, '2026-06-13', 'within-buffer previous day is the in-progress/estimate day');

  // now = 2026-06-14T00:20Z: past the buffer => 06-13 settles.
  const afterBuffer = aggregateDaily(ledger, { nowMs: ms('2026-06-14T00:20:00Z') });
  assert.equal(afterBuffer.totalCredits, 500);
  assert.equal(afterBuffer.inProgress, null);
});

test('mergeLedgers: per-date max credits and OR settled', () => {
  const a = { '2026-06-11': { date: '2026-06-11', credits: 1000, usd: 40, settled: true, settledAt: '2026-06-12T00:20:00Z' } };
  const b = {
    '2026-06-11': { date: '2026-06-11', credits: 1200, usd: 48, settled: true, settledAt: '2026-06-12T00:18:00Z' },
    '2026-06-12': { date: '2026-06-12', credits: 500, usd: 20, settled: false, settledAt: null },
  };
  const merged = mergeLedgers(a, b);
  assert.equal(merged['2026-06-11'].credits, 1200);
  assert.equal(merged['2026-06-11'].settledAt, '2026-06-12T00:18:00Z', 'earliest settledAt');
  assert.equal(merged['2026-06-12'].credits, 500);
  assert.equal(merged['2026-06-12'].settled, false);
});

test('settle buffer constant is 15 minutes', () => {
  assert.equal(SETTLE_BUFFER_MS, 15 * 60 * 1000);
});

// Shared fixture for the multi-granularity aggregates. now = 2026-06-20T12:00Z,
// so today (06-20) is in progress and every earlier day below is settled.
const STATS_LEDGER = {
  '2026-06-20': { date: '2026-06-20', credits: 5 },   // today, unsettled
  '2026-06-18': { date: '2026-06-18', credits: 10 },  // current rolling week, settled
  '2026-06-10': { date: '2026-06-10', credits: 20 },  // prior week
  '2026-06-03': { date: '2026-06-03', credits: 30 },  // week before that
};
const STATS_NOW = ms('2026-06-20T12:00:00Z');

test('aggregateWeekly: rolling 7-day blocks, current block estimates incl today', () => {
  const weekly = aggregateWeekly(STATS_LEDGER, { nowMs: STATS_NOW, count: 3 });

  // Current block is the trailing 7 days ending today and is a raw estimate
  // (includes today's unsettled 5 + the settled 10).
  assert.equal(weekly.current.from, '2026-06-14');
  assert.equal(weekly.current.to, '2026-06-20');
  assert.equal(weekly.current.totalCredits, 15);
  assert.equal(weekly.current.settled, false);

  // Two fully-past settled blocks, newest first.
  assert.equal(weekly.blocks.length, 2);
  assert.deepEqual([weekly.blocks[0].from, weekly.blocks[0].to], ['2026-06-07', '2026-06-13']);
  assert.equal(weekly.blocks[0].totalCredits, 20);
  assert.deepEqual([weekly.blocks[1].from, weekly.blocks[1].to], ['2026-05-31', '2026-06-06']);
  assert.equal(weekly.blocks[1].totalCredits, 30);
});

test('aggregateMonthlyList: current month estimate plus prior settled months', () => {
  const monthly = aggregateMonthlyList(STATS_LEDGER, { nowMs: STATS_NOW, count: 3 });

  // Current month sums every June day incl. today (estimate).
  assert.equal(monthly.current.month, '2026-06');
  assert.equal(monthly.current.totalCredits, 65);
  assert.equal(monthly.current.settled, false);

  assert.equal(monthly.months.length, 2);
  assert.equal(monthly.months[0].month, '2026-05');
  assert.equal(monthly.months[0].totalCredits, 0);
  assert.equal(monthly.months[1].month, '2026-04');
});

test('aggregateMonthlyList: ranges end on the real UTC month boundary', () => {
  const cases = [
    ['2026-02-15T12:00:00Z', '2026-02-28'],
    ['2028-02-15T12:00:00Z', '2028-02-29'],
    ['2026-04-15T12:00:00Z', '2026-04-30'],
    ['2026-07-15T12:00:00Z', '2026-07-31'],
  ];

  for (const [nowIso, expectedTo] of cases) {
    const monthly = aggregateMonthlyList({}, { nowMs: ms(nowIso), count: 1 });
    assert.equal(monthly.current.to, expectedTo, nowIso);
  }

  const priorMonths = aggregateMonthlyList({}, {
    nowMs: ms('2026-05-15T12:00:00Z'),
    count: 3,
  });
  assert.deepEqual(
    priorMonths.months.map((month) => month.to),
    ['2026-04-30', '2026-03-31'],
  );
});

test('aggregateAllTime: settled-only total with coverage range, excludes today', () => {
  const all = aggregateAllTime(STATS_LEDGER, { nowMs: STATS_NOW });

  // Today (06-20) is unsettled, so excluded from the total: 10 + 20 + 30.
  assert.equal(all.totalCredits, 60);
  assert.equal(all.coverDays, 3);
  assert.equal(all.fromDate, '2026-06-03');
  assert.equal(all.toDate, '2026-06-18');
  assert.equal(all.inProgress.date, '2026-06-20');
});
