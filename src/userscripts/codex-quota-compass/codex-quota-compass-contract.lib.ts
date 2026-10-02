import type {
  QuotaClientSummary,
  QuotaDailyRow,
  QuotaDiagnostics,
  QuotaModelSummary,
  QuotaPeriodSection,
  QuotaPeriodSummary,
  QuotaResetCreditsSection,
  QuotaSnapshotResult,
  QuotaWeeklyEstimate,
  QuotaWindowRow,
} from './codex-quota-compass-core.lib.ts';

/** Defensive read view of one period of a (possibly partial or stale) Quota Snapshot result. */
export interface QuotaPeriodAccess {
  raw: Partial<QuotaPeriodSection>;
  periodName: string;
  summary: Partial<QuotaPeriodSummary>;
  weeklyEstimate: Partial<QuotaWeeklyEstimate>;
  dailyRows: QuotaDailyRow[];
  clientSummaries: QuotaClientSummary[];
  modelSummaries: QuotaModelSummary[];
}
/** Defensive read view of a whole Quota Snapshot result. */
export interface QuotaSnapshotAccess {
  result: Record<string, unknown>;
  rollingKey: string;
  config: Partial<QuotaSnapshotResult['配置']>;
  diagnostics: Partial<QuotaDiagnostics>;
  windows: QuotaWindowRow[];
  mainSevenDayWindow: QuotaWindowRow | null;
  resetCredits: Partial<QuotaResetCreditsSection> | null;
  sinceReset: QuotaPeriodAccess;
  monthToDate: QuotaPeriodAccess;
  rolling: QuotaPeriodAccess;
}
export type ArchivePeriodKey = 'sinceReset' | 'monthToDate' | 'rolling';
export interface ArchivePeriodSummaryProjection {
  periodKey: ArchivePeriodKey;
  label: string;
  startDate: string;
  endExclusiveDate: string;
  totalCredits: number | null;
  totalUsd: number | null;
  returnedBuckets: number | null;
  usedPercent?: number | null;
  periodName?: string;
}
export interface ArchivePeriodDetailsProjection {
  dailyBuckets: QuotaDailyRow[];
  clientSummaries: QuotaClientSummary[];
  weeklyEstimate?: Partial<QuotaWeeklyEstimate>;
  periodName?: string;
}
export interface ArchiveSourceContext {
  dateBucketMode: string;
  usdPerCredit: number | null;
  rollingDays: number | null;
  browserTimeZone: string;
  apiEndExclusiveDate: string;
}
/** The archive-facing projection of a Quota Snapshot result (before sanitizing). */
export interface QuotaSnapshotArchiveProjection {
  sourceContext: ArchiveSourceContext;
  windowSnapshot: QuotaWindowRow[];
  periodSummaries: Record<ArchivePeriodKey, ArchivePeriodSummaryProjection>;
  periodDetails: Record<ArchivePeriodKey, ArchivePeriodDetailsProjection>;
}
interface WindowKeyLike {
  窗口Key?: unknown;
  名称?: unknown;
}

const MAIN_SEVEN_DAY_WINDOW_KEY = 'main.sevenDayWindow';
const SINCE_RESET_KEY = '主7天窗口_上次重置至今';
const MONTH_TO_DATE_KEY = '本月初至今';

function rollingPeriodKey(result: unknown): string {
  return Object.keys(result || {}).find((key) => /^近\d+天$/.test(key)) || '';
}

function isMainSevenDayWindow(row: unknown): boolean {
  return (
    (row as WindowKeyLike | null | undefined)?.窗口Key === MAIN_SEVEN_DAY_WINDOW_KEY ||
    (row as WindowKeyLike | null | undefined)?.名称 === '主限制 - 7天窗口'
  );
}

function arrayOrEmpty<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty<T extends object = Record<string, unknown>>(value: unknown): Partial<T> {
  return (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Partial<T>;
}

function createPeriodAccess(section: unknown, periodName = ''): QuotaPeriodAccess {
  const period = objectOrEmpty<QuotaPeriodSection>(section);
  return {
    raw: period,
    periodName,
    summary: objectOrEmpty<QuotaPeriodSummary>(period['汇总']),
    weeklyEstimate: objectOrEmpty<QuotaWeeklyEstimate>(period['反推周额度']),
    dailyRows: arrayOrEmpty<QuotaDailyRow>(period['每日明细']),
    clientSummaries: arrayOrEmpty<QuotaClientSummary>(period['客户端汇总']),
    modelSummaries: arrayOrEmpty<QuotaModelSummary>(period['模型汇总']),
  };
}

function createQuotaSnapshotAccess(result: unknown): QuotaSnapshotAccess {
  const source = objectOrEmpty(result);
  const rollingKey = rollingPeriodKey(source);
  const windows = arrayOrEmpty<QuotaWindowRow>(source['限制窗口概览']);
  const sinceReset = createPeriodAccess(source[SINCE_RESET_KEY], SINCE_RESET_KEY);
  const monthToDate = createPeriodAccess(source[MONTH_TO_DATE_KEY], MONTH_TO_DATE_KEY);
  const rolling = createPeriodAccess(rollingKey ? source[rollingKey] : null, rollingKey);

  return {
    result: source,
    rollingKey,
    config: objectOrEmpty<QuotaSnapshotResult['配置']>(source['配置']),
    diagnostics: objectOrEmpty<QuotaDiagnostics>(source['时区诊断']),
    windows,
    mainSevenDayWindow: windows.find(isMainSevenDayWindow) || null,
    resetCredits: source['重置券'] ? objectOrEmpty<QuotaResetCreditsSection>(source['重置券']) : null,
    sinceReset,
    monthToDate,
    rolling,
  };
}

function projectPeriodSummary(
  period: QuotaPeriodAccess,
  periodKey: ArchivePeriodKey,
  overrides: Partial<ArchivePeriodSummaryProjection> = {},
): ArchivePeriodSummaryProjection {
  const summary = period.summary;
  return {
    periodKey,
    label: summary['范围'] || period.periodName || '',
    startDate: summary['API_start_date'] || '',
    endExclusiveDate: summary['API_end_date_排他'] || '',
    totalCredits: summary['累计Credits'] ?? null,
    totalUsd: summary['累计折算USD'] ?? null,
    returnedBuckets: summary['返回日期桶数'] ?? null,
    ...overrides,
  };
}

function projectPeriodDetails(
  period: QuotaPeriodAccess,
  extra: Partial<ArchivePeriodDetailsProjection> = {},
): ArchivePeriodDetailsProjection {
  return {
    dailyBuckets: period.dailyRows,
    clientSummaries: period.clientSummaries,
    ...extra,
  };
}

function projectQuotaSnapshotForArchive(result: unknown): QuotaSnapshotArchiveProjection {
  const access = createQuotaSnapshotAccess(result);

  return {
    sourceContext: {
      dateBucketMode: access.config['日期桶模式'] || '',
      usdPerCredit: access.config.USD_PER_CREDIT ?? null,
      rollingDays: access.config.ROLLING_DAYS ?? null,
      browserTimeZone: access.diagnostics['浏览器本地时区'] || '',
      apiEndExclusiveDate: access.diagnostics['API_end_date_排他'] || '',
    },
    windowSnapshot: access.windows,
    periodSummaries: {
      sinceReset: projectPeriodSummary(access.sinceReset, 'sinceReset', {
        usedPercent: access.sinceReset.weeklyEstimate['已用百分比'] ?? null,
      }),
      monthToDate: projectPeriodSummary(access.monthToDate, 'monthToDate'),
      rolling: projectPeriodSummary(access.rolling, 'rolling', {
        label: access.rolling.summary['范围'] || access.rollingKey,
        periodName: access.rollingKey,
      }),
    },
    periodDetails: {
      sinceReset: projectPeriodDetails(access.sinceReset, {
        weeklyEstimate: access.sinceReset.weeklyEstimate,
      }),
      monthToDate: projectPeriodDetails(access.monthToDate),
      rolling: projectPeriodDetails(access.rolling, {
        periodName: access.rollingKey,
      }),
    },
  };
}

export { rollingPeriodKey, isMainSevenDayWindow, createQuotaSnapshotAccess, projectQuotaSnapshotForArchive };
