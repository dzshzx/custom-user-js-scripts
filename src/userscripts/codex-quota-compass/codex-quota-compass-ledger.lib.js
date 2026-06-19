(function attachCodexQuotaCompassLedgerLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassLedgerLib';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SETTLE_BUFFER_MS = 15 * 60 * 1000;
  const DEFAULT_USD_PER_CREDIT = 40 / 1000;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function round2(value) {
    return Number(Number(value).toFixed(2));
  }

  function isDateKey(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function utcDayStartMs(dateStr) {
    return Date.parse(`${dateStr}T00:00:00Z`);
  }

  function utcDayEndMs(dateStr) {
    return utcDayStartMs(dateStr) + DAY_MS;
  }

  function isSettled(dateStr, nowMs, buffer = SETTLE_BUFFER_MS) {
    if (!isDateKey(dateStr)) return false;
    const end = utcDayEndMs(dateStr);
    if (!Number.isFinite(end) || !Number.isFinite(nowMs)) return false;
    return nowMs >= end + buffer;
  }

  function makeRecord(date, credits, usdPerCredit, settled, settledAt) {
    const creditsNum = toNumber(credits);
    return {
      date,
      credits: creditsNum,
      usd: round2(creditsNum * usdPerCredit),
      settled: Boolean(settled),
      settledAt: settled ? (settledAt || null) : null,
    };
  }

  // Insert / grow-by-max / lock-when-settled. Mutates and returns `ledger`.
  function upsertLedgerRow(ledger, row, nowMs, options = {}) {
    if (!isPlainObject(ledger) || !isPlainObject(row)) return ledger;
    const date = isDateKey(row.date) ? row.date : null;
    if (!date) return ledger;

    const usdPerCredit = Number.isFinite(options.usdPerCredit) ? options.usdPerCredit : DEFAULT_USD_PER_CREDIT;
    const buffer = Number.isFinite(options.buffer) ? options.buffer : SETTLE_BUFFER_MS;
    const nowIso = options.nowIso || (Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : null);
    const credits = toNumber(row.credits);
    const settledNow = isSettled(date, nowMs, buffer);
    const existing = ledger[date];

    if (!existing) {
      ledger[date] = makeRecord(date, credits, usdPerCredit, settledNow, nowIso);
      return ledger;
    }

    // Always take max (a settled day can never shrink; this also rejects low glitch reads),
    // and settled only ever flips false -> true.
    const nextCredits = Math.max(toNumber(existing.credits), credits);
    const settled = existing.settled || settledNow;
    const settledAt = existing.settled
      ? existing.settledAt
      : (settledNow ? nowIso : null);
    ledger[date] = makeRecord(date, nextCredits, usdPerCredit, settled, settledAt);
    return ledger;
  }

  function foldDailyRowsIntoLedger(ledger, rows, nowMs, options = {}) {
    if (!Array.isArray(rows)) return ledger;
    for (const row of rows) {
      upsertLedgerRow(ledger, row, nowMs, options);
    }
    return ledger;
  }

  // Pull {date, credits} rows from a snapshot's periodDetails (rolling widest, others fill gaps).
  function extractDailyRowsFromSnapshot(snapshot) {
    const details = isPlainObject(snapshot?.periodDetails) ? snapshot.periodDetails : {};
    const periods = ['rolling', 'monthToDate', 'sinceReset'];
    const rows = [];
    for (const key of periods) {
      const buckets = details?.[key]?.dailyBuckets;
      if (!Array.isArray(buckets)) continue;
      for (const bucket of buckets) {
        const date = bucket?.['日期桶'];
        if (!isDateKey(date)) continue;
        rows.push({ date, credits: toNumber(bucket?.Credits ?? bucket?.credits) });
      }
    }
    return rows;
  }

  function foldSnapshotsIntoLedger(ledger, snapshots, nowMs, options = {}) {
    if (!Array.isArray(snapshots)) return ledger;
    const ordered = snapshots
      .slice()
      .sort((left, right) => String(left?.capturedAt || '').localeCompare(String(right?.capturedAt || '')));
    for (const snapshot of ordered) {
      foldDailyRowsIntoLedger(ledger, extractDailyRowsFromSnapshot(snapshot), nowMs, options);
    }
    return ledger;
  }

  function normalizeLedger(rawLedger, options = {}) {
    const ledger = {};
    if (!isPlainObject(rawLedger)) return ledger;
    const usdPerCredit = Number.isFinite(options.usdPerCredit) ? options.usdPerCredit : DEFAULT_USD_PER_CREDIT;
    for (const [date, record] of Object.entries(rawLedger)) {
      if (!isDateKey(date) || !isPlainObject(record)) continue;
      const settled = Boolean(record.settled);
      ledger[date] = {
        date,
        credits: toNumber(record.credits),
        usd: Number.isFinite(Number(record.usd)) ? round2(Number(record.usd)) : round2(toNumber(record.credits) * usdPerCredit),
        settled,
        settledAt: settled ? (typeof record.settledAt === 'string' ? record.settledAt : null) : null,
      };
    }
    return ledger;
  }

  // Cross-device merge: per-date max credits, OR settled, earliest settledAt.
  function mergeLedgers(left, right, options = {}) {
    const usdPerCredit = Number.isFinite(options.usdPerCredit) ? options.usdPerCredit : DEFAULT_USD_PER_CREDIT;
    const out = normalizeLedger(left, { usdPerCredit });
    const other = normalizeLedger(right, { usdPerCredit });
    for (const [date, record] of Object.entries(other)) {
      const existing = out[date];
      if (!existing) {
        out[date] = record;
        continue;
      }
      const credits = Math.max(existing.credits, record.credits);
      const settled = existing.settled || record.settled;
      let settledAt = null;
      if (settled) {
        const candidates = [existing.settledAt, record.settledAt].filter(Boolean).sort();
        settledAt = candidates[0] || null;
      }
      // usd stays a strict function of the chosen credits (single source of
      // truth, fixed ratio) instead of an independently-maxed field, so a stale
      // usd on either side can never desync from credits.
      out[date] = makeRecord(date, credits, usdPerCredit, settled, settledAt);
    }
    return out;
  }

  function sortedRecordsDesc(ledger) {
    return Object.values(normalizeLedger(ledger)).sort((a, b) => b.date.localeCompare(a.date));
  }

  function sumRecords(records) {
    return records.reduce(
      (acc, record) => {
        acc.totalCredits += toNumber(record.credits);
        acc.totalUsd += toNumber(record.usd);
        return acc;
      },
      { totalCredits: 0, totalUsd: 0 },
    );
  }

  function currentUtcDate(nowMs) {
    return new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString().slice(0, 10);
  }

  function splitSettled(records, nowMs, buffer = SETTLE_BUFFER_MS) {
    const settled = [];
    let inProgress = null;
    for (const record of records) {
      // Single source of truth for "settled": the record is already locked
      // settled, or the settle rule (UTC day end + buffer) has elapsed. A day
      // that is neither — today, a future day, or the just-passed day still
      // inside the settle buffer — is the in-progress/estimate day and must
      // never be folded into settled totals.
      if (record.settled || isSettled(record.date, nowMs, buffer)) {
        settled.push({ ...record, settled: true });
      } else if (!inProgress || record.date > inProgress.date) {
        inProgress = { ...record, settled: false };
      }
    }
    return { settled, inProgress };
  }

  function aggregateRange(ledger, { from, to, nowMs, buffer = SETTLE_BUFFER_MS } = {}) {
    const inRange = sortedRecordsDesc(ledger).filter((record) => {
      if (from && record.date < from) return false;
      if (to && record.date > to) return false;
      return true;
    });
    const { settled, inProgress } = splitSettled(inRange, nowMs, buffer);
    return { ...sumRecords(settled), days: settled, inProgress };
  }

  function aggregateDaily(ledger, { limit, nowMs, buffer = SETTLE_BUFFER_MS } = {}) {
    const result = aggregateRange(ledger, { nowMs, buffer });
    const days = Number.isFinite(limit) && limit > 0 ? result.days.slice(0, limit) : result.days;
    return { ...result, days };
  }

  function aggregateCycle(ledger, cycleStartDate, { nowMs, buffer = SETTLE_BUFFER_MS } = {}) {
    const from = isDateKey(cycleStartDate) ? cycleStartDate : null;
    return aggregateRange(ledger, { from, to: currentUtcDate(nowMs), nowMs, buffer });
  }

  function aggregateMonth(ledger, yyyymm, { nowMs, buffer = SETTLE_BUFFER_MS } = {}) {
    const month = typeof yyyymm === 'string' && /^\d{4}-\d{2}$/.test(yyyymm)
      ? yyyymm
      : currentUtcDate(nowMs).slice(0, 7);
    return aggregateRange(ledger, { from: `${month}-01`, to: `${month}-31`, nowMs, buffer });
  }

  globalObject[LIB_NAME] = Object.freeze({
    SETTLE_BUFFER_MS,
    DEFAULT_USD_PER_CREDIT,
    DAY_MS,
    isDateKey,
    isSettled,
    utcDayStartMs,
    utcDayEndMs,
    currentUtcDate,
    upsertLedgerRow,
    foldDailyRowsIntoLedger,
    extractDailyRowsFromSnapshot,
    foldSnapshotsIntoLedger,
    normalizeLedger,
    mergeLedgers,
    aggregateDaily,
    aggregateCycle,
    aggregateMonth,
    aggregateRange,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
