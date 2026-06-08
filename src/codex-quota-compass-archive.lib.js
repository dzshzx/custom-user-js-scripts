(function attachCodexQuotaCompassArchiveLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassArchiveLib';
  const ARCHIVE_SCHEMA_VERSION = 1;
  const EXPORT_FORMAT = 'codex-quota-compass.snapshot-archive';
  const EXPORT_VERSION = 1;
  const contractLib = globalObject.CodexQuotaCompassContractLib;

  if (!contractLib?.projectQuotaSnapshotForArchive || !contractLib?.isMainSevenDayWindow) {
    throw new Error('CodexQuotaCompassContractLib is required before CodexQuotaCompassArchiveLib.');
  }

  const {
    isMainSevenDayWindow,
    projectQuotaSnapshotForArchive,
  } = contractLib;

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
      snapshots: sortSnapshotsByCaptureTime(snapshots),
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
    const normalized = normalizeSnapshotArchive(archive);

    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt,
      snapshotCount: normalized.snapshots.length,
      snapshots: normalized.snapshots.map((snapshot) => sanitizeValue(snapshot)),
    };
  }

  function previewImportArchiveDocument(currentArchive, documentObject) {
    if (!isPlainObject(documentObject) || documentObject.format !== EXPORT_FORMAT || documentObject.version !== EXPORT_VERSION) {
      throw new Error('Unsupported Snapshot Export document.');
    }

    const merged = mergeSnapshots(
      currentArchive,
      Array.isArray(documentObject.snapshots) ? documentObject.snapshots : [],
    );

    return {
      archive: merged.archive,
      summary: summarizeSnapshotArchive(merged.archive),
      report: merged.report,
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

    function latestPeriodSummaries(query = {}) {
      return {
        rolling: periodSummary('rolling', { periodDays: Number(query.periodDays) || null }),
        month: periodSummary('monthToDate'),
        sinceReset: periodSummary('sinceReset'),
      };
    }

    function snapshotTimeline(limit = 12) {
      const count = Math.max(0, Number(limit) || 0);
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

    return {
      dailyUsageForLatestSinceReset,
      latestPeriodSummaries,
      snapshotTimeline,
      queryHistory(query = {}) {
        const periods = latestPeriodSummaries(query);
        return {
          day: dailyUsageForLatestSinceReset(query),
          rolling: periods.rolling,
          month: periods.month,
          sinceReset: periods.sinceReset,
          timeline: snapshotTimeline(query.timelineLimit ?? 12),
        };
      },
    };
  }

  function queryArchiveUsage(archive, query = {}) {
    const mode = query.mode || 'day';
    const archiveQuery = createSnapshotArchiveQuery(archive);
    if (mode === 'rolling') return archiveQuery.latestPeriodSummaries(query).rolling;
    if (mode === 'month') return archiveQuery.latestPeriodSummaries(query).month;
    return archiveQuery.dailyUsageForLatestSinceReset(query);
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

    async function loadArchive() {
      return normalizeSnapshotArchive(await read());
    }

    async function writeArchive(archive) {
      const normalized = normalizeSnapshotArchive(archive);
      if (!normalized.createdAt) {
        normalized.createdAt = now();
      }
      normalized.updatedAt = now();
      await write(normalized);
      return normalized;
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
        const nextArchive = await writeArchive(merged.archive);

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
        return previewImportArchiveDocument(await loadArchive(), documentObject);
      },

      async importArchiveDocument(documentObject) {
        const merged = previewImportArchiveDocument(await loadArchive(), documentObject);
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
        return queryArchiveUsage(await loadArchive(), query);
      },

      async queryHistory(query) {
        return createSnapshotArchiveQuery(await loadArchive()).queryHistory(query);
      },
    };
  }

  globalObject[LIB_NAME] = Object.freeze({
    ARCHIVE_SCHEMA_VERSION,
    EXPORT_FORMAT,
    EXPORT_VERSION,
    createQuotaSnapshot,
    createSnapshotArchiveQuery,
    normalizeSnapshotArchive,
    summarizeSnapshotArchive,
    queryArchiveUsage,
    buildSnapshotExportDocument,
    previewImportArchiveDocument,
    mergeSnapshots,
    createSnapshotArchiveStore,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
