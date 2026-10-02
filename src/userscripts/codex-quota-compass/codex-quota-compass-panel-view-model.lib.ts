import { createQuotaSnapshotAccess } from './codex-quota-compass-contract.lib.ts';
import type { QuotaPeriodAccess, QuotaSnapshotAccess } from './codex-quota-compass-contract.lib.ts';
import type { QuotaMessageKey } from './codex-quota-compass-i18n.lib.ts';
import type { ArchiveMergeReport, LedgerCostViews, SnapshotArchiveSummary } from './codex-quota-compass-archive.lib.ts';
import type { LedgerMonthBlock, LedgerRecord, LedgerWeekBlock } from './codex-quota-compass-ledger.lib.ts';
import type { RemoteSyncStatus } from './codex-quota-compass-remote-sync.lib.ts';
import type { StorageBackendInfo } from './codex-quota-compass-storage.lib.ts';
import type { QuotaSnapshotResult } from './codex-quota-compass-core.lib.ts';

/** Loose union of the sync-status shapes the panel accepts (backend info or a richer sync status). */
interface PanelSyncStatusInput {
  id?: string;
  label?: string;
  backendId?: string;
  backendLabel?: string;
  crossDeviceCapable?: unknown;
  localOnly?: unknown;
  reason?: string;
}
export interface PanelSyncStatus {
  backendId: string;
  backendLabel: string;
  crossDeviceCapable: boolean;
  localOnly: boolean;
  reason: string;
}
type RemoteSyncStatusInput = Partial<Record<keyof RemoteSyncStatus, unknown>>;
export interface PanelRemoteSyncStatus {
  enabled: boolean;
  configured: boolean;
  endpoint: string;
  gistId: string;
  hasToken: boolean;
  lastSyncedAt: string;
  lastError: string;
}
export type PanelTone = 'warning' | 'success' | 'muted';
export interface PanelSyncBanner {
  tone: PanelTone;
  titleKey: QuotaMessageKey;
  detailKey: QuotaMessageKey;
  backendLabel: string;
  endpoint?: string;
  lastSyncedAt?: string;
  lastError?: string;
}
export type PanelTransferActionId = 'export-archive' | 'import-archive';
export interface PanelTransferAction {
  action: PanelTransferActionId;
  labelKey: QuotaMessageKey;
}
export type DataColumnPriority = 'primary' | 'secondary' | 'debug';
export interface DataColumnOptions {
  label?: string;
  labelKey?: QuotaMessageKey;
  priority?: DataColumnPriority;
  truncate?: boolean;
  wrap?: boolean;
  compact?: boolean;
}
export interface DataColumn {
  key: string;
  label: string;
  labelKey: QuotaMessageKey | '';
  priority: DataColumnPriority;
  truncate: boolean;
  wrap: boolean;
  compact: boolean;
}
/** A table row: a record keyed by column key (Chinese result field names). */
export type DataRow = object;
export interface DataViewOptions {
  emptyKey?: QuotaMessageKey;
  compactOnMobile?: boolean;
  limit?: number;
}
export interface DataViewSection {
  type: 'dataView';
  id: string;
  titleKey: QuotaMessageKey;
  rows: DataRow[];
  columns: DataColumn[];
  emptyKey: QuotaMessageKey;
  compactOnMobile: boolean;
  limit: number | undefined;
}
export interface PanelCreditMetric {
  id: string;
  type: 'credit';
  labelKey: QuotaMessageKey;
  label: string;
  usd: number | undefined;
  resetHours?: number;
}
export interface PanelValueMetric {
  id: string;
  type: 'value';
  labelKey: QuotaMessageKey;
  label: string;
  value: string;
}
export type PanelMetric = PanelCreditMetric | PanelValueMetric;
export interface MetricsSection {
  type: 'metrics';
  titleKey: QuotaMessageKey;
  metrics: PanelMetric[];
}
export type DetailsSection = MetricsSection | DataViewSection;
export type ArchiveWorkspaceSection =
  | { type: 'syncForm' }
  | { type: 'archiveSummary' }
  | { type: 'note'; noteKey: QuotaMessageKey }
  | { type: 'actions'; actions: PanelTransferAction[] };
export type PanelSection = DetailsSection | ArchiveWorkspaceSection;
export type PanelViewId = 'details' | 'stats' | 'archive';
export interface PanelTab {
  id: PanelViewId;
  labelKey: QuotaMessageKey;
}
export interface PanelTransfer {
  noteKey: QuotaMessageKey;
  syncStatus: PanelSyncStatus;
  remoteSyncStatus: PanelRemoteSyncStatus;
  actions: PanelTransferAction[];
}
export interface PanelStatsView {
  id: 'stats';
  labelKey: QuotaMessageKey;
  kind: 'stats';
}
export interface PanelSectionsView {
  id: 'details';
  labelKey: QuotaMessageKey;
  kind: 'sections';
  sections: DetailsSection[];
}
export interface PanelArchiveView {
  id: 'archive';
  labelKey: QuotaMessageKey;
  kind: 'archiveWorkspace';
  actionIds: PanelTransferActionId[];
  sections: ArchiveWorkspaceSection[];
}
export type PanelView = PanelStatsView | PanelSectionsView | PanelArchiveView;
export interface PanelViews {
  tabs: PanelTab[];
  views: { stats: PanelStatsView; details: PanelSectionsView; archive: PanelArchiveView };
}
type WeeklyEstimate = QuotaPeriodAccess['weeklyEstimate'];
type PeriodSummary = QuotaPeriodAccess['summary'];
interface DetailsSectionsInput {
  weekly: WeeklyEstimate;
  sinceReset: PeriodSummary;
  month: PeriodSummary;
  rolling: PeriodSummary;
  windows: QuotaSnapshotAccess['windows'];
  modelSummaries: QuotaPeriodAccess['modelSummaries'];
  resetCredits: QuotaSnapshotAccess['resetCredits'];
  detailMetrics: PanelMetric[];
}
interface PanelViewsInput extends DetailsSectionsInput {
  transfer: PanelTransfer;
}
export interface CostDayRow {
  date: string;
  credits: number;
  usd: number;
}
type LedgerBucketInput = LedgerWeekBlock & Partial<LedgerMonthBlock>;
export interface CostBucket {
  from: string;
  to: string;
  month: string | undefined;
  credits: number;
  usd: number;
}
export interface CostViewModel {
  cycleStartDate: string | null;
  today: CostDayRow | null;
  day: { rows: CostDayRow[]; today: CostDayRow | null };
  week: { current: CostBucket | null; blocks: CostBucket[] };
  month: { current: CostBucket | null; rows: CostBucket[] };
  all: {
    totalCredits: number;
    totalUsd: number;
    coverDays: number;
    fromDate: string | null;
    toDate: string | null;
    rows: CostDayRow[];
  };
  allDays: CostDayRow[];
}
interface WeeklyInput {
  weekly: WeeklyEstimate;
}
interface HeroMetricInput extends WeeklyInput {
  mainSevenDayWindow: QuotaSnapshotAccess['mainSevenDayWindow'];
}
interface DetailMetricsInput extends WeeklyInput {
  sinceReset: PeriodSummary;
  month: PeriodSummary;
  resetCredits: QuotaSnapshotAccess['resetCredits'];
}
export interface PanelArchiveHealth {
  isLoaded: boolean;
  snapshotCount: number;
  hasSnapshots: boolean;
  earliestCapturedAt: string | null;
  latestCapturedAt: string | null;
  storageBackendLabel: string;
  importReport: ArchiveMergeReport | null | undefined;
}
export interface QuotaPanelViewModelInput {
  result: QuotaSnapshotResult | Record<string, unknown> | null | undefined;
  ledgerCost?: LedgerCostViews | null;
  archiveSummary?: SnapshotArchiveSummary | null;
  importReport?: ArchiveMergeReport | null;
  storageBackend?: StorageBackendInfo | null;
  syncStatus?: PanelSyncStatusInput | null;
  remoteSyncStatus?: RemoteSyncStatusInput | RemoteSyncStatus | null;
}

function normalizePanelSyncStatus(
  syncStatus: PanelSyncStatusInput | null | undefined,
  storageBackend: StorageBackendInfo | null | undefined,
): PanelSyncStatus {
  const source: PanelSyncStatusInput = syncStatus || storageBackend || { id: 'pending', label: 'pending' };
  const backendId = source.backendId || source.id || 'pending';
  const backendLabel = source.backendLabel || source.label || backendId;

  return {
    backendId,
    backendLabel,
    crossDeviceCapable: Boolean(source.crossDeviceCapable),
    localOnly: Boolean(source.localOnly),
    reason: source.reason || '',
  };
}

function normalizeRemoteSyncStatus(remoteSyncStatus: RemoteSyncStatusInput | null | undefined): PanelRemoteSyncStatus {
  const source: RemoteSyncStatusInput =
    remoteSyncStatus && typeof remoteSyncStatus === 'object' ? remoteSyncStatus : {};

  return {
    enabled: Boolean(source.enabled),
    configured: Boolean(source.configured),
    endpoint: typeof source.endpoint === 'string' ? source.endpoint : '',
    gistId: typeof source.gistId === 'string' ? source.gistId : '',
    hasToken: Boolean(source.hasToken),
    lastSyncedAt: typeof source.lastSyncedAt === 'string' ? source.lastSyncedAt : '',
    lastError: typeof source.lastError === 'string' ? source.lastError : '',
  };
}

function createSyncBanner(syncStatus: PanelSyncStatus, remoteSyncStatus: PanelRemoteSyncStatus): PanelSyncBanner {
  if (remoteSyncStatus.enabled && remoteSyncStatus.configured) {
    if (remoteSyncStatus.lastError) {
      return {
        tone: 'warning',
        titleKey: 'remoteSyncErrorTitle',
        detailKey: 'remoteSyncErrorDetail',
        backendLabel: syncStatus.backendLabel,
        endpoint: remoteSyncStatus.endpoint,
        lastSyncedAt: remoteSyncStatus.lastSyncedAt,
        lastError: remoteSyncStatus.lastError,
      };
    }

    return {
      tone: 'success',
      titleKey: 'remoteSyncEnabledTitle',
      detailKey: 'remoteSyncEnabledDetail',
      backendLabel: syncStatus.backendLabel,
      endpoint: remoteSyncStatus.endpoint,
      lastSyncedAt: remoteSyncStatus.lastSyncedAt,
    };
  }

  if (remoteSyncStatus.enabled) {
    return {
      tone: 'warning',
      titleKey: 'remoteSyncMissingTitle',
      detailKey: 'remoteSyncMissingDetail',
      backendLabel: syncStatus.backendLabel,
      endpoint: remoteSyncStatus.endpoint,
    };
  }

  if (syncStatus.backendId === 'gm') {
    return {
      tone: 'warning',
      titleKey: 'syncBannerGmTitle',
      detailKey: 'syncBannerGmDetail',
      backendLabel: syncStatus.backendLabel,
    };
  }

  if (syncStatus.localOnly) {
    return {
      tone: 'warning',
      titleKey: 'syncBannerLocalTitle',
      detailKey: 'syncBannerLocalDetail',
      backendLabel: syncStatus.backendLabel,
    };
  }

  return {
    tone: 'muted',
    titleKey: 'syncBannerPendingTitle',
    detailKey: 'syncBannerPendingDetail',
    backendLabel: syncStatus.backendLabel,
  };
}

function createTransferActions(): PanelTransferAction[] {
  // Gist sync configuration now lives in the in-panel sync form; only the
  // manual backup paths remain as footer actions.
  return [
    { action: 'export-archive', labelKey: 'archiveExportAction' },
    { action: 'import-archive', labelKey: 'archiveImportAction' },
  ];
}

function dataColumn(key: string, options: DataColumnOptions = {}): DataColumn {
  return {
    key,
    label: options.label || key,
    labelKey: options.labelKey || '',
    priority: options.priority || 'secondary',
    truncate: Boolean(options.truncate),
    wrap: Boolean(options.wrap),
    compact: options.compact !== false,
  };
}

function dataView(
  id: string,
  titleKey: QuotaMessageKey,
  rows: readonly DataRow[] | null | undefined,
  columns: DataColumn[],
  options: DataViewOptions = {},
): DataViewSection {
  return {
    type: 'dataView',
    id,
    titleKey,
    rows: Array.isArray(rows) ? rows : [],
    columns,
    emptyKey: options.emptyKey || 'tableNoData',
    compactOnMobile: options.compactOnMobile !== false,
    limit: options.limit,
  };
}

function createDetailsSections({
  weekly,
  sinceReset,
  month,
  rolling,
  windows,
  modelSummaries,
  resetCredits,
  detailMetrics,
}: DetailsSectionsInput): DetailsSection[] {
  return [
    { type: 'metrics', titleKey: 'sectionKeyMetrics', metrics: detailMetrics },
    dataView(
      'details-weekly-estimate',
      'sectionWeeklyEstimate',
      [weekly],
      [
        dataColumn('已用百分比', { labelKey: 'columnUsedPercent', priority: 'primary' }),
        dataColumn('剩余比例小数', { labelKey: 'columnRemainingRatio', priority: 'secondary' }),
        dataColumn('包含重置日_已用折算USD', { labelKey: 'columnIncludedResetUsd', priority: 'primary' }),
        dataColumn('反推周总USD_包含重置日', { labelKey: 'columnIncludedResetTotalUsd', priority: 'primary' }),
        dataColumn('剩余USD_包含重置日口径', { labelKey: 'columnIncludedResetRemainingUsd', priority: 'primary' }),
        dataColumn('包含重置日_已用Credits', { labelKey: 'columnIncludedResetUsedCredits', priority: 'secondary' }),
        dataColumn('剩余Credits_包含重置日口径', {
          labelKey: 'columnIncludedResetRemainingCredits',
          priority: 'secondary',
        }),
        dataColumn('排除重置日_已用折算USD', { labelKey: 'columnExcludedResetUsedUsd', priority: 'secondary' }),
        dataColumn('剩余USD_排除重置日口径', { labelKey: 'columnExcludedResetRemainingUsd', priority: 'secondary' }),
        dataColumn('排除重置日_已用Credits', { labelKey: 'columnExcludedResetUsedCredits', priority: 'debug' }),
        dataColumn('剩余Credits_排除重置日口径', {
          labelKey: 'columnExcludedResetRemainingCredits',
          priority: 'debug',
        }),
        dataColumn('误差说明', { labelKey: 'columnErrorNote', priority: 'debug', wrap: true }),
      ],
    ),
    dataView(
      'details-range-summary',
      'sectionRangeSummary',
      [sinceReset, month, rolling],
      [
        dataColumn('范围', { labelKey: 'columnRange', priority: 'primary', wrap: true }),
        dataColumn('累计折算USD', { labelKey: 'columnTotalUsd', priority: 'primary' }),
        dataColumn('累计Credits', { labelKey: 'columnTotalCredits', priority: 'primary' }),
        dataColumn('返回日期桶数', { labelKey: 'columnBucketCount', priority: 'secondary' }),
        dataColumn('累计Token', { labelKey: 'columnTotalTokens', priority: 'debug' }),
        dataColumn('累计线程数', { labelKey: 'columnTotalThreads', priority: 'debug' }),
        dataColumn('累计轮数', { labelKey: 'columnTotalTurns', priority: 'debug' }),
      ],
    ),
    dataView('details-windows', 'sectionWindows', windows, [
      dataColumn('名称', { labelKey: 'columnName', priority: 'primary', wrap: true }),
      dataColumn('已用百分比', { labelKey: 'columnUsedPercent', priority: 'primary' }),
      dataColumn('窗口天数', { labelKey: 'columnWindowDays', priority: 'secondary' }),
      dataColumn('本轮开始_本地', { labelKey: 'columnWindowStartLocal', priority: 'secondary', truncate: true }),
      dataColumn('下次重置_本地', { labelKey: 'columnNextResetLocal', priority: 'secondary', truncate: true }),
      dataColumn('距离重置小时', { labelKey: 'columnHoursToReset', priority: 'primary' }),
    ]),
    dataView('details-model-summary', 'sectionModelSummary', modelSummaries, [
      dataColumn('模型', { labelKey: 'columnModel', priority: 'primary', wrap: true }),
      dataColumn('速度', { labelKey: 'columnSpeed', priority: 'secondary' }),
      dataColumn('占比百分比', { labelKey: 'columnSharePercent', priority: 'primary' }),
      dataColumn('Credits', { labelKey: 'columnCredits', priority: 'secondary' }),
      dataColumn('折算USD', { labelKey: 'statsColumnUsd', priority: 'secondary' }),
    ]),
    dataView(
      'details-reset-credits',
      'sectionResetCredits',
      resetCredits?.明细,
      [
        dataColumn('标题', { labelKey: 'columnTitle', priority: 'primary', wrap: true }),
        dataColumn('状态', { labelKey: 'columnStatus', priority: 'secondary' }),
        dataColumn('过期时间_本地', { labelKey: 'columnExpiresLocal', priority: 'primary', truncate: true }),
      ],
      { emptyKey: 'resetCreditsEmpty' },
    ),
  ];
}

function createPanelViews({
  weekly,
  sinceReset,
  month,
  rolling,
  windows,
  modelSummaries,
  resetCredits,
  transfer,
  detailMetrics,
}: PanelViewsInput): PanelViews {
  const tabs: PanelTab[] = [
    { id: 'details', labelKey: 'tabDetails' },
    { id: 'stats', labelKey: 'tabStats' },
    { id: 'archive', labelKey: 'tabArchiveWorkspace' },
  ];

  return {
    tabs,
    views: {
      stats: {
        id: 'stats',
        labelKey: 'tabStats',
        kind: 'stats',
      },
      details: {
        id: 'details',
        labelKey: 'tabDetails',
        kind: 'sections',
        sections: createDetailsSections({
          weekly,
          sinceReset,
          month,
          rolling,
          windows,
          modelSummaries,
          resetCredits,
          detailMetrics,
        }),
      },
      archive: {
        id: 'archive',
        labelKey: 'tabArchiveWorkspace',
        kind: 'archiveWorkspace',
        actionIds: transfer.actions.map((action) => action.action),
        sections: [
          { type: 'syncForm' },
          { type: 'archiveSummary' },
          { type: 'note', noteKey: transfer.noteKey },
          { type: 'actions', actions: transfer.actions },
        ],
      },
    },
  };
}

function mapDailyRow(row: LedgerRecord): CostDayRow {
  return { date: row?.date, credits: row?.credits || 0, usd: row?.usd || 0 };
}

function mapBucket(bucket: LedgerBucketInput | null | undefined): CostBucket | null {
  if (!bucket) return null;
  return {
    from: bucket.from,
    to: bucket.to,
    month: bucket.month,
    credits: bucket.totalCredits || 0,
    usd: bucket.totalUsd || 0,
  };
}

// Shape the ledger-derived cost views into the structure the Statistics tab
// (CodexQuotaCompassPanelStatsLib.buildStatsView) consumes: four dimensions
// plus a flat allDays list used for in-panel drill-down filtering.
function buildCostViewModel(ledgerCost: LedgerCostViews | null | undefined): CostViewModel | null {
  if (!ledgerCost) return null;
  const allDays = (ledgerCost.daily?.days || []).map(mapDailyRow);
  const today = ledgerCost.daily?.inProgress ? mapDailyRow(ledgerCost.daily.inProgress) : null;
  const allTime: Partial<LedgerCostViews['allTime']> = ledgerCost.allTime || {};

  return {
    cycleStartDate: ledgerCost.cycleStartDate || null,
    today,
    day: {
      rows: allDays.slice(0, 30),
      today,
    },
    week: {
      current: mapBucket(ledgerCost.weekly?.current),
      blocks: (ledgerCost.weekly?.blocks || []).map(mapBucket) as CostBucket[],
    },
    month: {
      current: mapBucket(ledgerCost.monthly?.current),
      rows: (ledgerCost.monthly?.months || []).map(mapBucket) as CostBucket[],
    },
    all: {
      totalCredits: allTime.totalCredits || 0,
      totalUsd: allTime.totalUsd || 0,
      coverDays: allTime.coverDays || 0,
      fromDate: allTime.fromDate || null,
      toDate: allTime.toDate || null,
      rows: allDays,
    },
    allDays,
  };
}

// First-screen hierarchy: one hero metric (remaining USD incl reset day, with
// the reset countdown as its sub-line), two compact secondary metrics, and the
// remaining figures demoted to a grid at the top of the Details tab.
function createHeroMetric({ weekly, mainSevenDayWindow }: HeroMetricInput): PanelCreditMetric {
  return {
    id: 'remainingUsdIncludingReset',
    type: 'credit',
    labelKey: 'metricRemainingUsdIncludingReset',
    label: '剩余 USD · 含重置日',
    usd: weekly.剩余USD_包含重置日口径,
    resetHours: mainSevenDayWindow?.距离重置小时,
  };
}

function createSecondaryMetrics({ weekly }: WeeklyInput): PanelMetric[] {
  return [
    {
      id: 'remainingUsdExcludingReset',
      type: 'credit',
      labelKey: 'metricRemainingUsdExcludingReset',
      label: '剩余 USD · 排除重置日',
      usd: weekly.剩余USD_排除重置日口径,
    },
    {
      id: 'sevenDayUsedPercent',
      type: 'value',
      labelKey: 'metricSevenDayUsedPercent',
      label: '7 天已用',
      value: weekly.已用百分比 !== undefined ? `${weekly.已用百分比}%` : '-',
    },
  ];
}

function createDetailMetrics({ weekly, sinceReset, month, resetCredits }: DetailMetricsInput): PanelMetric[] {
  const metrics: PanelMetric[] = [
    {
      id: 'weeklyTotalIncludingReset',
      type: 'credit',
      labelKey: 'metricWeeklyTotalIncludingReset',
      label: '周总额度 · 含重置日',
      usd: weekly.反推周总USD_包含重置日,
    },
    {
      id: 'weeklyTotalExcludingReset',
      type: 'credit',
      labelKey: 'metricWeeklyTotalExcludingReset',
      label: '周总额度 · 排除重置日',
      usd: weekly.反推周总USD_排除重置日,
    },
    {
      id: 'sinceResetTotal',
      type: 'credit',
      labelKey: 'metricSinceResetTotal',
      label: '上次重置至今',
      usd: sinceReset.累计折算USD,
    },
    {
      id: 'monthTotal',
      type: 'credit',
      labelKey: 'metricMonthTotal',
      label: '本月累计',
      usd: month.累计折算USD,
    },
  ];
  if (resetCredits) {
    metrics.push({
      id: 'resetCreditsAvailable',
      type: 'value',
      labelKey: 'metricResetCredits',
      label: '重置券 可用/适用',
      value: `${resetCredits.可用张数 ?? '-'} / ${resetCredits.当前适用张数 ?? '-'}`,
    });
  }
  return metrics;
}

function createQuotaPanelViewModel({
  result,
  ledgerCost,
  archiveSummary,
  importReport,
  storageBackend,
  syncStatus,
  remoteSyncStatus,
}: QuotaPanelViewModelInput) {
  const snapshotAccess = createQuotaSnapshotAccess(result);
  const rollingKey = snapshotAccess.rollingKey;
  const weekly = snapshotAccess.sinceReset.weeklyEstimate;
  const sinceReset = snapshotAccess.sinceReset.summary;
  const month = snapshotAccess.monthToDate.summary;
  const rolling = snapshotAccess.rolling.summary;
  const mainSevenDayWindow = snapshotAccess.mainSevenDayWindow;
  const recentSnapshots = Array.isArray(archiveSummary?.recentSnapshots)
    ? archiveSummary.recentSnapshots.slice(0, 5).map((row) => ({
        capturedAt: row?.capturedAt || '-',
        snapshotId: row?.snapshotId || 'legacy',
        monthlyCredits: row?.monthlyCredits,
        weeklyUsedPercent: row?.weeklyUsedPercent,
      }))
    : [];
  const normalizedSyncStatus = normalizePanelSyncStatus(syncStatus, storageBackend);
  const normalizedRemoteSyncStatus = normalizeRemoteSyncStatus(remoteSyncStatus);
  const archiveHealth: PanelArchiveHealth = {
    isLoaded: Boolean(archiveSummary),
    snapshotCount: archiveSummary?.snapshotCount || 0,
    hasSnapshots: Boolean((archiveSummary?.snapshotCount || 0) > 0),
    earliestCapturedAt: archiveSummary?.earliestCapturedAt || null,
    latestCapturedAt: archiveSummary?.latestCapturedAt || null,
    storageBackendLabel: normalizedSyncStatus.backendLabel,
    importReport,
  };

  const transfer: PanelTransfer = {
    noteKey: 'transferNote',
    syncStatus: normalizedSyncStatus,
    remoteSyncStatus: normalizedRemoteSyncStatus,
    actions: createTransferActions(),
  };
  const detailMetrics = createDetailMetrics({
    weekly,
    sinceReset,
    month,
    resetCredits: snapshotAccess.resetCredits,
  });
  const panelViews = createPanelViews({
    weekly,
    sinceReset,
    month,
    rolling,
    windows: snapshotAccess.windows,
    modelSummaries: snapshotAccess.rolling.modelSummaries,
    resetCredits: snapshotAccess.resetCredits,
    transfer,
    detailMetrics,
  });

  return {
    rollingKey,
    weekly,
    sinceReset,
    month,
    rolling,
    syncStatus: normalizedSyncStatus,
    remoteSyncStatus: normalizedRemoteSyncStatus,
    syncBanner: createSyncBanner(normalizedSyncStatus, normalizedRemoteSyncStatus),
    archiveHealth,
    transfer,
    tabs: panelViews.tabs,
    views: panelViews.views,
    heroMetric: createHeroMetric({
      weekly,
      mainSevenDayWindow,
    }),
    secondaryMetrics: createSecondaryMetrics({ weekly }),
    detailMetrics,
    rollingRows: snapshotAccess.rolling.dailyRows,
    sinceResetRows: snapshotAccess.sinceReset.dailyRows,
    sinceResetClients: snapshotAccess.sinceReset.clientSummaries,
    mainSevenDayWindow,
    cost: buildCostViewModel(ledgerCost),
    archive: {
      isLoaded: Boolean(archiveSummary),
      snapshotCount: archiveSummary?.snapshotCount || 0,
      earliestCapturedAt: archiveSummary?.earliestCapturedAt || null,
      latestCapturedAt: archiveSummary?.latestCapturedAt || null,
      recentSnapshots,
      storageBackend,
      importReport,
    },
  };
}

export type QuotaPanelViewModel = ReturnType<typeof createQuotaPanelViewModel>;

export { createQuotaPanelViewModel };
