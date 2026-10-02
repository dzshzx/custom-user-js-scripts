import stableStringify from 'fast-json-stable-stringify';
import pLimit from 'p-limit';
import * as v from 'valibot';
import { isMainSevenDayWindow, projectQuotaSnapshotForArchive } from './codex-quota-compass-contract.lib.ts';
import {
  foldSnapshotsIntoLedger,
  mergeLedgers,
  normalizeLedger,
  aggregateDaily,
  aggregateCycle,
  aggregateMonth,
  aggregateWeekly,
  aggregateMonthlyList,
  aggregateAllTime,
} from './codex-quota-compass-ledger.lib.ts';
import type { LedgerTotals } from './codex-quota-compass-ledger.lib.ts';
import type {
  ArchivePeriodDetailsProjection,
  ArchivePeriodKey,
  ArchivePeriodSummaryProjection,
  ArchiveSourceContext,
} from './codex-quota-compass-contract.lib.ts';
import type { QuotaWindowRow } from './codex-quota-compass-core.lib.ts';

/** A JSON-safe value as produced by `sanitizeValue`. */
export type JsonValue = string | number | boolean | null | JsonArray | JsonObject;
export interface JsonArray extends Array<JsonValue> {}
export interface JsonObject {
  [key: string]: JsonValue;
}
/** Archived (sanitized, possibly old-version) projections: every field may be missing. */
export type ArchivedSourceContext = Partial<ArchiveSourceContext>;
export type ArchivedPeriodSummaries = Partial<Record<ArchivePeriodKey, Partial<ArchivePeriodSummaryProjection>>>;
export type ArchivedPeriodDetails = Partial<Record<ArchivePeriodKey, Partial<ArchivePeriodDetailsProjection>>>;
type ArchivedWindowRow = Partial<QuotaWindowRow> | null | undefined;

const ARCHIVE_SCHEMA_VERSION = 2;
const EXPORT_FORMAT = 'codex-quota-compass.snapshot-archive';
const EXPORT_VERSION = 2;
const SUPPORTED_EXPORT_VERSIONS = new Set([1, 2]);
const MAX_RETAINED_SNAPSHOTS = 5;
const DEFAULT_USD_PER_CREDIT = 40 / 1000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// JSON-safe value: Dates become ISO strings, non-finite numbers become null,
// undefined becomes null and any other primitive is stringified.
const JsonValueSchema: v.GenericSchema<unknown, JsonValue> = v.lazy(() =>
  v.union([
    v.pipe(
      v.date(),
      v.transform((date) => date.toISOString()),
    ),
    v.array(JsonValueSchema),
    v.record(v.string(), JsonValueSchema),
    v.pipe(
      v.custom<number>((value) => typeof value === 'number'),
      v.transform((value) => (Number.isFinite(value) ? value : null)),
    ),
    v.string(),
    v.boolean(),
    v.null(),
    v.pipe(
      v.unknown(),
      v.transform((value) => (value == null ? null : String(value))),
    ),
  ]),
);

function sanitizeValue(value: unknown): JsonValue {
  return v.parse(JsonValueSchema, value);
}

function sortSnapshotsByCaptureTime<T extends { capturedAt?: string | null }>(snapshots: readonly T[]): T[] {
  return snapshots
    .slice()
    .sort((left, right) => String(left.capturedAt || '').localeCompare(String(right.capturedAt || '')));
}

// Missing keys still run through the transform, so defaults apply uniformly.
const coerce = <T>(transform: (value: unknown) => T) =>
  v.pipe(
    v.optional(v.unknown(), () => undefined),
    v.transform(transform),
  );
const plainObjectValue = coerce((value) => sanitizeValue(isPlainObject(value) ? value : {}) as JsonObject);
const nullableString: v.GenericSchema<unknown, string | null> = v.fallback(v.string(), null as never);

// A snapshot without a usable capture time is dropped (silently when reading an archive).
const SnapshotSchema = v.pipe(
  v.custom<Record<string, unknown>>(isPlainObject),
  v.object({
    snapshotId: coerce((value) => (typeof value === 'string' && value.trim() ? value.trim() : null)),
    capturedAt: v.pipe(
      v.string(),
      v.check((value) => value.trim() !== ''),
    ),
    scriptVersion: v.fallback(v.string(), ''),
    sourceContext: plainObjectValue,
    windowSnapshot: v.fallback(v.array(JsonValueSchema), []),
    periodSummaries: plainObjectValue,
    periodDetails: plainObjectValue,
  }),
);

// Archive shell; legacy archives were a bare snapshot array. Ledger rules stay in the ledger module.
const SnapshotArchiveSchema = v.object({
  createdAt: nullableString,
  updatedAt: nullableString,
  ledger: coerce((ledger) => normalizeLedger(ledger)),
  snapshots: coerce((snapshots) => (Array.isArray(snapshots) ? snapshots.map(normalizeSnapshot).filter(Boolean) : [])),
});

const SupportedExportDocumentSchema = v.object({
  format: v.literal(EXPORT_FORMAT),
  version: v.picklist([...SUPPORTED_EXPORT_VERSIONS]),
});

type SnapshotSchemaOutput = v.InferOutput<typeof SnapshotSchema>;
/** One retained Quota Snapshot in the Snapshot Archive. */
export type QuotaSnapshot = Omit<SnapshotSchemaOutput, 'sourceContext' | 'periodSummaries' | 'periodDetails'> & {
  storageSchemaVersion: number;
  sourceContext: ArchivedSourceContext;
  periodSummaries: ArchivedPeriodSummaries;
  periodDetails: ArchivedPeriodDetails;
};
/** Normalized Snapshot Archive (ledger + retained snapshots). */
export type SnapshotArchive = Omit<v.InferOutput<typeof SnapshotArchiveSchema>, 'snapshots'> & {
  schemaVersion: number;
  snapshots: QuotaSnapshot[];
};
export interface ArchiveMergeReport {
  added: number;
  skipped: number;
  invalid: number;
}
export interface ArchiveMergeResult {
  archive: SnapshotArchive;
  report: ArchiveMergeReport;
}
export interface LedgerCostOptions {
  nowMs?: number;
  cycleStartDate?: string | null;
  dailyLimit?: number;
  month?: string;
  weekCount?: number;
  monthCount?: number;
}
export type LedgerCostViews = ReturnType<typeof buildLedgerCostViews>;
export type SnapshotArchiveSummary = ReturnType<typeof summarizeSnapshotArchive>;
export type SnapshotExportDocument = ReturnType<typeof buildSnapshotExportDocument>;
export type ArchiveImportPreview = ReturnType<typeof previewImportArchiveDocument>;
export interface ArchiveUsageRow {
  date: string;
  credits: number;
  usd: number;
}
export interface ArchiveUsageSummary extends LedgerTotals {
  startDate?: string | null;
  endDateExclusive?: string | null;
  periodDays?: number | null;
}
export interface ArchiveUsageView {
  mode: string;
  rows: ArchiveUsageRow[];
  summary: ArchiveUsageSummary;
}
export interface ArchiveUsageQuery {
  mode?: string;
  startDate?: string;
  endDate?: string;
  periodDays?: unknown;
  limit?: number;
  timelineLimit?: number;
}
export type SnapshotArchiveQuery = ReturnType<typeof createSnapshotArchiveQuery>;
export interface SnapshotArchiveStoreOptions {
  read: () => unknown;
  write: (archive: SnapshotArchive) => unknown;
  now?: () => string;
  createId?: () => string;
  scriptVersion?: string;
}
interface SaveSnapshotOptions {
  capturedAt?: string;
  snapshotId?: string;
}
interface SumRowLike {
  credits?: unknown;
  Credits?: unknown;
  usd?: unknown;
  折算USD?: unknown;
}

function normalizeSnapshot(input: unknown): QuotaSnapshot | null {
  const result = v.safeParse(SnapshotSchema, input);
  if (!result.success) return null;
  const snapshot = result.output;
  return {
    snapshotId: snapshot.snapshotId,
    capturedAt: snapshot.capturedAt,
    scriptVersion: snapshot.scriptVersion,
    storageSchemaVersion: ARCHIVE_SCHEMA_VERSION,
    sourceContext: snapshot.sourceContext as ArchivedSourceContext,
    windowSnapshot: snapshot.windowSnapshot,
    periodSummaries: snapshot.periodSummaries as ArchivedPeriodSummaries,
    periodDetails: snapshot.periodDetails as ArchivedPeriodDetails,
  };
}

function normalizeSnapshotArchive(rawArchive: unknown): SnapshotArchive {
  const archiveObject = Array.isArray(rawArchive)
    ? { snapshots: rawArchive }
    : isPlainObject(rawArchive)
      ? rawArchive
      : {};
  const archive = v.parse(SnapshotArchiveSchema, archiveObject);

  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    createdAt: archive.createdAt,
    updatedAt: archive.updatedAt,
    ledger: archive.ledger,
    snapshots: sortSnapshotsByCaptureTime(archive.snapshots as QuotaSnapshot[]),
  };
}

function archiveUsdPerCredit(snapshots: readonly QuotaSnapshot[]): number {
  const latest = Array.isArray(snapshots) ? snapshots[snapshots.length - 1] : null;
  const value = Number(latest?.sourceContext?.usdPerCredit);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_USD_PER_CREDIT;
}

// Fold all snapshots into the ledger (idempotent) and cap retained raw snapshots.
// `nowMs` drives the settle rule, so this runs where a clock is available.
function migrateArchive(rawArchive: unknown, nowMs: number = Date.now()): SnapshotArchive {
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

function cycleStartDateFromArchive(archive: unknown): string | null {
  const snapshots = normalizeSnapshotArchive(archive).snapshots;
  const latest = snapshots[snapshots.length - 1];
  const win = (
    Array.isArray(latest?.windowSnapshot) ? latest.windowSnapshot.find(isMainSevenDayWindow) : null
  ) as ArchivedWindowRow;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(win?.['本轮开始_UTC'] || ''));
  return match ? match[1] : null;
}

function buildLedgerCostViews(archive: unknown, options: LedgerCostOptions = {}) {
  const migrated = migrateArchive(archive, options.nowMs);
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs! : Date.now();
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

function summarizeSnapshotArchive(archive: unknown) {
  const normalized = normalizeSnapshotArchive(archive);
  const first = normalized.snapshots[0] || null;
  const last = normalized.snapshots[normalized.snapshots.length - 1] || null;

  return {
    snapshotCount: normalized.snapshots.length,
    earliestCapturedAt: first?.capturedAt || null,
    latestCapturedAt: last?.capturedAt || null,
    recentSnapshots: normalized.snapshots
      .slice(-5)
      .reverse()
      .map((snapshot) => ({
        snapshotId: snapshot.snapshotId,
        capturedAt: snapshot.capturedAt,
        scriptVersion: snapshot.scriptVersion,
        rollingLabel:
          Object.values(snapshot.periodSummaries || {}).find((period) => period?.periodKey === 'rolling')?.label || '',
        monthlyCredits: snapshot.periodSummaries?.monthToDate?.totalCredits ?? null,
        weeklyUsedPercent: snapshot.periodSummaries?.sinceReset?.usedPercent ?? null,
      })),
  };
}

function snapshotFallbackKey(snapshot: QuotaSnapshot): string {
  const sinceReset: Partial<ArchivePeriodSummaryProjection> = snapshot?.periodSummaries?.sinceReset || {};
  const primaryWindow = (
    Array.isArray(snapshot?.windowSnapshot) ? snapshot.windowSnapshot.find(isMainSevenDayWindow) : null
  ) as ArchivedWindowRow;

  return JSON.stringify({
    capturedAt: snapshot?.capturedAt || '',
    sinceResetStart: sinceReset.startDate || '',
    sinceResetEnd: sinceReset.endExclusiveDate || '',
    sinceResetCredits: sinceReset.totalCredits || 0,
    windowStart: primaryWindow?.本轮开始_UTC || '',
    windowReset: primaryWindow?.下次重置_UTC || '',
  });
}

function createQuotaSnapshot({ result, capturedAt, scriptVersion, snapshotId }: QuotaSnapshotInput) {
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

function mergeSnapshots(currentArchive: unknown, incomingSnapshots: readonly unknown[]): ArchiveMergeResult {
  const archive = normalizeSnapshotArchive(currentArchive);
  const existingIds = new Set(archive.snapshots.map((snapshot) => snapshot.snapshotId).filter(Boolean));
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
      ledger: archive.ledger,
      snapshots: sortSnapshotsByCaptureTime(nextSnapshots),
    },
    report: { added, skipped, invalid },
  };
}

// The single content key for sync convergence: ledger + retained snapshots,
// serialized independent of key order. Undefined object fields are dropped
// (JSON semantics), so a local object and its JSON round-trip compare equal.
function contentKey(ledger: unknown, snapshots: unknown): string {
  return stableStringify({
    ledger: isPlainObject(ledger) ? ledger : {},
    snapshots: Array.isArray(snapshots) ? snapshots : [],
  });
}

function archiveContentKey(archive: unknown): string {
  const normalized = normalizeSnapshotArchive(archive);
  return contentKey(normalized.ledger, normalized.snapshots);
}

// Export documents are already normalized; compare them without re-normalizing.
function exportDocumentContentKey(
  documentObject: { ledger?: unknown; snapshots?: unknown } | null | undefined,
): string {
  return contentKey(documentObject?.ledger, documentObject?.snapshots);
}

function mergeSnapshotArchives(primary: unknown, incoming: unknown, { nowMs = Date.now() }: { nowMs?: number } = {}) {
  const current = normalizeSnapshotArchive(primary);
  const other = normalizeSnapshotArchive(incoming);
  const merged = mergeSnapshots(current, other.snapshots);
  // Fold both complete inputs before deduplication/retention: a duplicate snapshot
  // may carry historical rows missing from the other storage backend.
  const ledger = foldSnapshotsIntoLedger(
    mergeLedgers(current.ledger, other.ledger),
    [...current.snapshots, ...other.snapshots],
    nowMs,
    { usdPerCredit: archiveUsdPerCredit(merged.archive.snapshots) },
  );
  const archive = {
    ...merged.archive,
    createdAt: current.createdAt || other.createdAt,
    ledger,
    snapshots: merged.archive.snapshots.slice(-MAX_RETAINED_SNAPSHOTS),
  };
  return { archive, report: merged.report, changed: archiveContentKey(current) !== archiveContentKey(archive) };
}

function buildSnapshotExportDocument(archive: unknown, exportedAt: string) {
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

function previewImportArchiveDocument(currentArchive: unknown, documentObject: unknown, nowMs: number = Date.now()) {
  if (!isPlainObject(documentObject) || !v.is(SupportedExportDocumentSchema, documentObject)) {
    throw new Error('Unsupported Snapshot Export document.');
  }

  const incomingSnapshots: unknown[] = Array.isArray((documentObject as Record<string, unknown>).snapshots)
    ? ((documentObject as Record<string, unknown>).snapshots as unknown[])
    : [];
  const merged = mergeSnapshotArchives(currentArchive, documentObject, { nowMs });
  const { archive } = merged;
  merged.report.invalid = incomingSnapshots.filter((snapshot) => !normalizeSnapshot(snapshot)).length;

  return {
    archive,
    summary: summarizeSnapshotArchive(archive),
    report: merged.report,
    changed: merged.changed,
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumRows(rows: readonly SumRowLike[]): LedgerTotals {
  return rows.reduce(
    (acc, row) => {
      acc.totalCredits += toNumber(row?.credits ?? row?.Credits);
      acc.totalUsd += toNumber(row?.usd ?? row?.折算USD);
      return acc;
    },
    { totalCredits: 0, totalUsd: 0 },
  );
}

function createSnapshotArchiveQuery(archive: unknown) {
  const normalized = normalizeSnapshotArchive(archive);
  const latest = normalized.snapshots[normalized.snapshots.length - 1];

  function emptyUsage(mode = 'day'): ArchiveUsageView {
    return { mode, rows: [], summary: { totalCredits: 0, totalUsd: 0 } };
  }

  function periodSummary(periodKey: ArchivePeriodKey, extra: { periodDays?: number | null } = {}): ArchiveUsageView {
    if (!latest) return emptyUsage(periodKey);
    const period: Partial<ArchivePeriodSummaryProjection> = latest.periodSummaries?.[periodKey] || {};
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

  function dailyUsageForLatestSinceReset(query: ArchiveUsageQuery = {}): ArchiveUsageView {
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

  function queryPeriodSummaries(query: ArchiveUsageQuery = {}) {
    return {
      rolling: periodSummary('rolling', { periodDays: Number(query.periodDays) || null }),
      month: periodSummary('monthToDate'),
      sinceReset: periodSummary('sinceReset'),
    };
  }

  function queryTimeline(query: ArchiveUsageQuery = {}) {
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

  function queryLatestUsage(query: ArchiveUsageQuery = {}): ArchiveUsageView {
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
  function queryHistory(query: ArchiveUsageQuery = {}) {
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

function queryArchiveUsage(archive: unknown, query: ArchiveUsageQuery = {}): ArchiveUsageView {
  return createSnapshotArchiveQuery(archive).queryLatestUsage(query);
}

function createSnapshotArchiveStore({
  read,
  write,
  now = () => new Date().toISOString(),
  createId = () =>
    globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  scriptVersion = '',
}: SnapshotArchiveStoreOptions) {
  if (typeof read !== 'function' || typeof write !== 'function') {
    throw new Error('Snapshot Archive store requires read and write functions.');
  }

  function nowMs(): number {
    const parsed = Date.parse(now());
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  async function loadArchive(): Promise<SnapshotArchive> {
    return migrateArchive(await read(), nowMs());
  }

  async function writeArchive(archive: unknown): Promise<SnapshotArchive> {
    const migrated = migrateArchive(archive, nowMs());
    if (!migrated.createdAt) {
      migrated.createdAt = now();
    }
    migrated.updatedAt = now();
    await write(migrated);
    return migrated;
  }

  const operations = {
    async loadArchive() {
      return loadArchive();
    },

    async saveSnapshot(result: unknown, options: SaveSnapshotOptions = {}) {
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

    async previewImportArchiveDocument(documentObject: unknown) {
      return previewImportArchiveDocument(await loadArchive(), documentObject, nowMs());
    },

    async queryLedgerCost(options: LedgerCostOptions = {}) {
      const archive = await loadArchive();
      return buildLedgerCostViews(archive, {
        nowMs: nowMs(),
        ...options,
      });
    },

    async readView(options: LedgerCostOptions = {}) {
      const timestamp = nowMs();
      const archive = migrateArchive(await read(), timestamp);
      return {
        summary: summarizeSnapshotArchive(archive),
        ledgerCost: buildLedgerCostViews(archive, { ...options, nowMs: timestamp }),
      };
    },

    async importArchiveDocument(documentObject: unknown) {
      const merged = previewImportArchiveDocument(await loadArchive(), documentObject, nowMs());
      const nextArchive = merged.changed ? await writeArchive(merged.archive) : merged.archive;

      return {
        archive: nextArchive,
        summary: summarizeSnapshotArchive(nextArchive),
        report: merged.report,
      };
    },

    async summarizeArchive() {
      return summarizeSnapshotArchive(await loadArchive());
    },

    async queryArchiveUsage(query?: ArchiveUsageQuery) {
      return createSnapshotArchiveQuery(await loadArchive()).queryLatestUsage(query || {});
    },

    async queryHistory(query?: ArchiveUsageQuery) {
      return createSnapshotArchiveQuery(await loadArchive()).queryHistory(query || {});
    },
  };
  // All reads (including adapter migrations) and mutations share one local queue.
  // Operations call private implementations, never their queued public siblings.
  const queue = pLimit(1);
  return Object.fromEntries(
    Object.entries<Op>(operations).map(([name, operation]) => [name, (...args: A) => queue(() => operation(...args))]),
  ) as SnapshotArchiveStore;
}

// Arguments are forwarded opaquely. Short aliases keep the queued-wrapper line (and so the bundle layout) unchanged.
type A = never[];
type Op = (...args: A) => Promise<unknown>;
interface QuotaSnapshotInput {
  result: unknown;
  capturedAt: string;
  scriptVersion: string;
  snapshotId?: string | null;
}
/** Every operation is serialized through one local queue. */
// A type alias, not an interface: the queued wrapper is built through Object.fromEntries and cast here.
export type SnapshotArchiveStore = {
  loadArchive(): Promise<SnapshotArchive>;
  saveSnapshot(
    result: unknown,
    options?: SaveSnapshotOptions,
  ): Promise<{
    archive: SnapshotArchive;
    snapshot: QuotaSnapshot | null;
    report: ArchiveMergeReport;
    summary: SnapshotArchiveSummary;
  }>;
  buildExportDocument(): Promise<SnapshotExportDocument>;
  previewImportArchiveDocument(documentObject: unknown): Promise<ArchiveImportPreview>;
  queryLedgerCost(options?: LedgerCostOptions): Promise<LedgerCostViews>;
  readView(options?: LedgerCostOptions): Promise<{ summary: SnapshotArchiveSummary; ledgerCost: LedgerCostViews }>;
  importArchiveDocument(
    documentObject: unknown,
  ): Promise<{ archive: SnapshotArchive; summary: SnapshotArchiveSummary; report: ArchiveMergeReport }>;
  summarizeArchive(): Promise<SnapshotArchiveSummary>;
  queryArchiveUsage(query?: ArchiveUsageQuery): Promise<ArchiveUsageView>;
  queryHistory(query?: ArchiveUsageQuery): Promise<ReturnType<SnapshotArchiveQuery['queryHistory']>>;
};

export {
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
  mergeSnapshotArchives,
  archiveContentKey,
  exportDocumentContentKey,
  cycleStartDateFromArchive,
  buildLedgerCostViews,
  createSnapshotArchiveStore,
};
