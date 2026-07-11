(function attachCodexQuotaCompassArchiveLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassArchiveLib';
  const ARCHIVE_SCHEMA_VERSION = 2;
  const EXPORT_FORMAT = 'codex-quota-compass.snapshot-archive';
  const EXPORT_VERSION = 2;
  const SUPPORTED_EXPORT_VERSIONS = new Set([1, 2]);
  const MAX_RETAINED_SNAPSHOTS = 5;
  const DEFAULT_USD_PER_CREDIT = 40 / 1000;
  const contractLib = globalObject.CodexQuotaCompassContractLib;
  const ledgerLib = globalObject.CodexQuotaCompassLedgerLib;

  if (!contractLib?.projectQuotaSnapshotForArchive || !contractLib?.isMainSevenDayWindow) {
    throw new Error('CodexQuotaCompassContractLib is required before CodexQuotaCompassArchiveLib.');
  }

  if (!ledgerLib?.foldSnapshotsIntoLedger || !ledgerLib?.mergeLedgers) {
    throw new Error('CodexQuotaCompassLedgerLib is required before CodexQuotaCompassArchiveLib.');
  }

  const {
    isMainSevenDayWindow,
    projectQuotaSnapshotForArchive,
  } = contractLib;

  const {
    foldSnapshotsIntoLedger,
    mergeLedgers,
    normalizeLedger,
    aggregateDaily,
    aggregateCycle,
    aggregateMonth,
    aggregateWeekly,
    aggregateMonthlyList,
    aggregateAllTime,
  } = ledgerLib;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function sanitizeValue(value) {
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }

    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [key, sanitizeValue(nestedValue)]),
      );
    }

    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' || typeof value === 'boolean' || value === null) {
      return value;
    }

    return value == null ? null : String(value);
  }

  function sortSnapshotsByCaptureTime(snapshots) {
    return snapshots
      .slice()
      .sort((left, right) => String(left.capturedAt || '').localeCompare(String(right.capturedAt || '')));
  }

  function normalizeDailyRows(rows) {
    return Array.isArray(rows) ? rows.map((row) => sanitizeValue(row)) : [];
  }

  function normalizeSnapshot(input) {
    if (!isPlainObject(input)) return null;

    const snapshotId = typeof input.snapshotId === 'string' && input.snapshotId.trim()
      ? input.snapshotId.trim()
      : null;
    const capturedAt = typeof input.capturedAt === 'string' && input.capturedAt.trim()
      ? input.capturedAt
      : null;

    if (!capturedAt) return null;

    return {
      snapshotId,
      capturedAt,
      scriptVersion: typeof input.scriptVersion === 'string' ? input.scriptVersion : '',
      storageSchemaVersion: ARCHIVE_SCHEMA_VERSION,
      sourceContext: sanitizeValue(isPlainObject(input.sourceContext) ? input.sourceContext : {}),
      windowSnapshot: normalizeDailyRows(input.windowSnapshot),
      periodSummaries: sanitizeValue(isPlainObject(input.periodSummaries) ? input.periodSummaries : {}),
      periodDetails: sanitizeValue(isPlainObject(input.periodDetails) ? input.periodDetails : {}),
    };
  }

  function normalizeSnapshotArchive(rawArchive) {
    const archiveObject = Array.isArray(rawArchive)
      ? { snapshots: rawArchive }
      : (isPlainObject(rawArchive) ? rawArchive : {});

    const snapshots = Array.isArray(archiveObject.snapshots)
      ? archiveObject.snapshots.map(normalizeSnapshot).filter(Boolean)
      : [];

    return {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      createdAt: typeof archiveObject.createdAt === 'string' ? archiveObject.createdAt : null,
      updatedAt: typeof archiveObject.updatedAt === 'string' ? archiveObject.updatedAt : null,
      ledger: normalizeLedger(archiveObject.ledger),
      snapshots: sortSnapshotsByCaptureTime(snapshots),
    };
  }

  function archiveUsdPerCredit(snapshots) {
    const latest = Array.isArray(snapshots) ? snapshots[snapshots.length - 1] : null;
    const value = Number(latest?.sourceContext?.usdPerCredit);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_USD_PER_CREDIT;
  }

  // Fold all snapshots into the ledger (idempotent) and cap retained raw snapshots.
  // `nowMs` drives the settle rule, so this runs where a clock is available.
  function migrateArchive(rawArchive, nowMs = Date.now()) {
    const normalized = normalizeSnapshotArchive(rawArchive);
    const usdPerCredit = archiveUsdPerCredit(normalized.snapshots);
    const ledger = foldSnapshotsIntoLedger(normalized.ledger, normalized.snapshots, nowMs, { usdPerCredit });
    return {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
      ledger,
      snapshots: normalized.snapshots.slice(-MAX_RETAINED_SNAPSHOTS),
    };
  }

  function cycleStartDateFromArchive(archive) {
    const snapshots = normalizeSnapshotArchive(archive).snapshots;
    const latest = snapshots[snapshots.length - 1];
    const win = Array.isArray(latest?.windowSnapshot)
      ? latest.windowSnapshot.find(isMainSevenDayWindow)
      : null;
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(win?.['本轮开始_UTC'] || ''));
    return match ? match[1] : null;
  }

  function buildLedgerCostViews(archive, options = {}) {
    const migrated = migrateArchive(archive, options.nowMs);
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const cycleStartDate = options.cycleStartDate || cycleStartDateFromArchive(migrated);
    return {
      cycleStartDate,
      daily: aggregateDaily(migrated.ledger, { nowMs, limit: options.dailyLimit }),
      cycle: aggregateCycle(migrated.ledger, cycleStartDate, { nowMs }),
      month: aggregateMonth(migrated.ledger, options.month, { nowMs }),
      weekly: aggregateWeekly(migrated.ledger, { nowMs, count: options.weekCount }),
      monthly: aggregateMonthlyList(migrated.ledger, { nowMs, count: options.monthCount }),
      allTime: aggregateAllTime(migrated.ledger, { nowMs }),
    };
  }

  function summarizeSnapshotArchive(archive) {
    const normalized = normalizeSnapshotArchive(archive);
    const first = normalized.snapshots[0] || null;
    const last = normalized.snapshots[normalized.snapshots.length - 1] || null;

    return {
      snapshotCount: normalized.snapshots.length,
      earliestCapturedAt: first?.capturedAt || null,
      latestCapturedAt: last?.capturedAt || null,
      recentSnapshots: normalized.snapshots.slice(-5).reverse().map((snapshot) => ({
        snapshotId: snapshot.snapshotId,
        capturedAt: snapshot.capturedAt,
        scriptVersion: snapshot.scriptVersion,
        rollingLabel: Object.values(snapshot.periodSummaries || {}).find((period) => period?.periodKey === 'rolling')?.label || '',
        monthlyCredits: snapshot.periodSummaries?.monthToDate?.totalCredits ?? null,
        weeklyUsedPercent: snapshot.periodSummaries?.sinceReset?.usedPercent ?? null,
      })),
    };
  }

  function snapshotFallbackKey(snapshot) {
    const sinceReset = snapshot?.periodSummaries?.sinceReset || {};
    const primaryWindow = Array.isArray(snapshot?.windowSnapshot)
      ? snapshot.windowSnapshot.find(isMainSevenDayWindow)
      : null;

    return JSON.stringify({
      capturedAt: snapshot?.capturedAt || '',
      sinceResetStart: sinceReset.startDate || '',
      sinceResetEnd: sinceReset.endExclusiveDate || '',
      sinceResetCredits: sinceReset.totalCredits || 0,
      windowStart: primaryWindow?.本轮开始_UTC || '',
      windowReset: primaryWindow?.下次重置_UTC || '',
    });
  }

  function createQuotaSnapshot({ result, capturedAt, scriptVersion, snapshotId }) {
    if (!isPlainObject(result)) {
      throw new Error('Cannot create Quota Snapshot without a result object.');
    }

    return normalizeSnapshot({
      snapshotId,
      capturedAt,
      scriptVersion,
      ...projectQuotaSnapshotForArchive(result),
    });
  }

  function mergeSnapshots(currentArchive, incomingSnapshots) {
    const archive = normalizeSnapshotArchive(currentArchive);
    const existingIds = new Set(
      archive.snapshots.map((snapshot) => snapshot.snapshotId).filter(Boolean),
    );
    const existingFallbackKeys = new Set(
      archive.snapshots.filter((snapshot) => !snapshot.snapshotId).map(snapshotFallbackKey),
    );

    const nextSnapshots = archive.snapshots.slice();
    let added = 0;
    let skipped = 0;
    let invalid = 0;

    for (const entry of incomingSnapshots) {
      const snapshot = normalizeSnapshot(entry);
      if (!snapshot) {
        invalid += 1;
        continue;
      }

      if (snapshot.snapshotId) {
        if (existingIds.has(snapshot.snapshotId)) {
          skipped += 1;
          continue;
        }

        existingIds.add(snapshot.snapshotId);
      } else {
        const fallbackKey = snapshotFallbackKey(snapshot);
        if (existingFallbackKeys.has(fallbackKey)) {
          skipped += 1;
          continue;
        }

        existingFallbackKeys.add(fallbackKey);
      }

      nextSnapshots.push(snapshot);
      added += 1;
    }

    return {
      archive: {
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        createdAt: archive.createdAt,
        updatedAt: archive.updatedAt,
        snapshots: sortSnapshotsByCaptureTime(nextSnapshots),
      },
      report: { added, skipped, invalid },
    };
  }

  function buildSnapshotExportDocument(archive, exportedAt) {
    const migrated = migrateArchive(archive, Date.parse(exportedAt) || Date.now());

    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt,
      snapshotCount: migrated.snapshots.length,
      ledger: migrated.ledger,
      snapshots: migrated.snapshots.map((snapshot) => sanitizeValue(snapshot)),
    };
  }

  function previewImportArchiveDocument(currentArchive, documentObject, nowMs = Date.now()) {
    if (!isPlainObject(documentObject)
      || documentObject.format !== EXPORT_FORMAT
      || !SUPPORTED_EXPORT_VERSIONS.has(documentObject.version)) {
      throw new Error('Unsupported Snapshot Export document.');
    }

    const current = migrateArchive(currentArchive, nowMs);
    const incomingSnapshots = Array.isArray(documentObject.snapshots) ? documentObject.snapshots : [];

    // Snapshot-level merge keeps the existing added/skipped/invalid report semantics.
    const mergedSnap = mergeSnapshots({ snapshots: current.snapshots }, incomingSnapshots);
    const usdPerCredit = archiveUsdPerCredit(mergedSnap.archive.snapshots);

    // Ledger merge: current + (v2 doc ledger) + fold incoming snapshots (covers v1 docs and gaps).
    let ledger = current.ledger;
    if (isPlainObject(documentObject.ledger)) {
      ledger = mergeLedgers(ledger, documentObject.ledger);
    }
    ledger = foldSnapshotsIntoLedger(ledger, incomingSnapshots, nowMs, { usdPerCredit });

    const archive = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      ledger,
      snapshots: mergedSnap.archive.snapshots.slice(-MAX_RETAINED_SNAPSHOTS),
    };

    return {
      archive,
      summary: summarizeSnapshotArchive(archive),
      report: mergedSnap.report,
    };
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function sumRows(rows) {
    return rows.reduce((acc, row) => {
      acc.totalCredits += toNumber(row?.credits ?? row?.Credits);
      acc.totalUsd += toNumber(row?.usd ?? row?.折算USD);
      return acc;
    }, { totalCredits: 0, totalUsd: 0 });
  }

  function createSnapshotArchiveQuery(archive) {
    const normalized = normalizeSnapshotArchive(archive);
    const latest = normalized.snapshots[normalized.snapshots.length - 1];

    function emptyUsage(mode = 'day') {
      return { mode, rows: [], summary: { totalCredits: 0, totalUsd: 0 } };
    }

    function periodSummary(periodKey, extra = {}) {
      if (!latest) return emptyUsage(periodKey);
      const period = latest.periodSummaries?.[periodKey] || {};
      return {
        mode: periodKey === 'monthToDate' ? 'month' : periodKey,
        rows: [],
        summary: {
          ...extra,
          totalCredits: toNumber(period.totalCredits),
          totalUsd: toNumber(period.totalUsd),
          startDate: period.startDate || '',
          endDateExclusive: period.endExclusiveDate || '',
        },
      };
    }

    function dailyUsageForLatestSinceReset(query = {}) {
      if (!latest) return emptyUsage('day');
      const dayRows = Array.isArray(latest.periodDetails?.sinceReset?.dailyBuckets)
        ? latest.periodDetails.sinceReset.dailyBuckets
        : [];
      const startDate = query.startDate || '';
      const endDate = query.endDate || '';
      const filtered = dayRows
        .filter((row) => {
          const date = String(row?.日期桶 || '');
          if (!date) return false;
          if (startDate && date < startDate) return false;
          if (endDate && date >= endDate) return false;
          return true;
        })
        .map((row) => ({
          date: row?.日期桶 || '',
          credits: toNumber(row?.Credits),
          usd: toNumber(row?.折算USD),
        }));

      const summary = sumRows(filtered);
      return {
        mode: 'day',
        rows: filtered,
        summary: {
          ...summary,
          startDate: startDate || null,
          endDateExclusive: endDate || null,
        },
      };
    }

    function queryPeriodSummaries(query = {}) {
      return {
        rolling: periodSummary('rolling', { periodDays: Number(query.periodDays) || null }),
        month: periodSummary('monthToDate'),
        sinceReset: periodSummary('sinceReset'),
      };
    }

    function queryTimeline(query = {}) {
      const count = Math.max(0, Number(query.limit ?? query.timelineLimit ?? 12) || 0);
      return normalized.snapshots
        .slice(count ? -count : 0)
        .reverse()
        .map((snapshot) => ({
          snapshotId: snapshot.snapshotId,
          capturedAt: snapshot.capturedAt,
          scriptVersion: snapshot.scriptVersion,
          monthlyCredits: toNumber(snapshot.periodSummaries?.monthToDate?.totalCredits),
          rollingCredits: toNumber(snapshot.periodSummaries?.rolling?.totalCredits),
          weeklyUsedPercent: snapshot.periodSummaries?.sinceReset?.usedPercent ?? null,
        }));
    }

    function queryLatestUsage(query = {}) {
      const mode = query.mode || 'day';
      const periods = queryPeriodSummaries(query);
      if (mode === 'rolling') return periods.rolling;
      if (mode === 'month') return periods.month;
      if (mode === 'sinceReset') return periods.sinceReset;
      return dailyUsageForLatestSinceReset(query);
    }

    // Compatibility aggregate retained for existing callers. The Statistics
    // view reads Cost Ledger projections instead, but removing this public
    // query shape would break integrations that still consume Snapshot Archive
    // history directly.
    function queryHistory(query = {}) {
      const periods = queryPeriodSummaries(query);
      return {
        day: dailyUsageForLatestSinceReset(query),
        rolling: periods.rolling,
        month: periods.month,
        sinceReset: periods.sinceReset,
        timeline: queryTimeline(query),
      };
    }

    return {
      dailyUsageForLatestSinceReset,
      latestPeriodSummaries: queryPeriodSummaries,
      snapshotTimeline: (limit = 12) => queryTimeline({ limit }),
      queryLatestUsage,
      queryPeriodSummaries,
      queryTimeline,
      queryHistory,
    };
  }

  function queryArchiveUsage(archive, query = {}) {
    return createSnapshotArchiveQuery(archive).queryLatestUsage(query);
  }

  function createSnapshotArchiveStore({
    read,
    write,
    now = () => new Date().toISOString(),
    createId = () => (globalObject.crypto?.randomUUID ? globalObject.crypto.randomUUID() : `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    scriptVersion = '',
  }) {
    if (typeof read !== 'function' || typeof write !== 'function') {
      throw new Error('Snapshot Archive store requires read and write functions.');
    }

    function nowMs() {
      const parsed = Date.parse(now());
      return Number.isFinite(parsed) ? parsed : Date.now();
    }

    async function loadArchive() {
      return migrateArchive(await read(), nowMs());
    }

    async function writeArchive(archive) {
      const migrated = migrateArchive(archive, nowMs());
      if (!migrated.createdAt) {
        migrated.createdAt = now();
      }
      migrated.updatedAt = now();
      await write(migrated);
      return migrated;
    }

    return {
      async loadArchive() {
        return loadArchive();
      },

      async saveSnapshot(result, options = {}) {
        const archive = await loadArchive();
        const capturedAt = options.capturedAt || now();
        const snapshot = createQuotaSnapshot({
          result,
          capturedAt,
          scriptVersion,
          snapshotId: options.snapshotId || createId(),
        });
        const merged = mergeSnapshots(archive, [snapshot]);
        const nextArchive = await writeArchive({ ...archive, snapshots: merged.archive.snapshots });

        return {
          archive: nextArchive,
          snapshot,
          report: merged.report,
          summary: summarizeSnapshotArchive(nextArchive),
        };
      },

      async buildExportDocument() {
        return buildSnapshotExportDocument(await loadArchive(), now());
      },

      async previewImportArchiveDocument(documentObject) {
        return previewImportArchiveDocument(await loadArchive(), documentObject, nowMs());
      },

      async queryLedgerCost(options = {}) {
        const archive = await loadArchive();
        return buildLedgerCostViews(archive, {
          nowMs: nowMs(),
          ...options,
        });
      },

      async importArchiveDocument(documentObject) {
        const merged = previewImportArchiveDocument(await loadArchive(), documentObject, nowMs());
        const nextArchive = await writeArchive(merged.archive);

        return {
          archive: nextArchive,
          summary: summarizeSnapshotArchive(nextArchive),
          report: merged.report,
        };
      },

      async summarizeArchive() {
        return summarizeSnapshotArchive(await loadArchive());
      },

      async queryArchiveUsage(query) {
        return createSnapshotArchiveQuery(await loadArchive()).queryLatestUsage(query || {});
      },

      async queryHistory(query) {
        return createSnapshotArchiveQuery(await loadArchive()).queryHistory(query || {});
      },
    };
  }

  globalObject[LIB_NAME] = Object.freeze({
    ARCHIVE_SCHEMA_VERSION,
    EXPORT_FORMAT,
    EXPORT_VERSION,
    MAX_RETAINED_SNAPSHOTS,
    createQuotaSnapshot,
    createSnapshotArchiveQuery,
    normalizeSnapshotArchive,
    migrateArchive,
    summarizeSnapshotArchive,
    queryArchiveUsage,
    buildSnapshotExportDocument,
    previewImportArchiveDocument,
    mergeSnapshots,
    cycleStartDateFromArchive,
    buildLedgerCostViews,
    createSnapshotArchiveStore,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
