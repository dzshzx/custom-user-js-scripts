import { UTCDate } from '@date-fns/utc';
import { addDays, lightFormat } from 'date-fns';

const MAIN_PRIMARY_WINDOW_KEY = 'main.primaryWindow';
const MAIN_SEVEN_DAY_WINDOW_KEY = 'main.sevenDayWindow';

type MaybePromise<T> = T | PromiseLike<T>;
type NumericLike = number | string | null | undefined;

/** Calculator settings; the runtime config is a superset. */
export interface QuotaCalculatorConfig {
  DATE_BUCKET_MODE: string;
  USD_PER_CREDIT: number;
  ROLLING_DAYS: number;
}

// ---- Backend payloads (untrusted JSON; every numeric read goes through toNumber) ----
export interface TokenCounts {
  text_total_tokens?: NumericLike;
  cached_text_input_tokens?: NumericLike;
  uncached_text_input_tokens?: NumericLike;
  text_output_tokens?: NumericLike;
}
export interface UsageWindowPayload {
  used_percent?: NumericLike;
  limit_window_seconds?: NumericLike;
  reset_after_seconds?: NumericLike;
  reset_at?: NumericLike;
}
export interface RateLimitPayload {
  primary_window?: UsageWindowPayload | null;
  secondary_window?: UsageWindowPayload | null;
}
export interface AdditionalRateLimitPayload {
  limit_name?: string | null;
  metered_feature?: string | null;
  rate_limit?: RateLimitPayload | null;
}
export interface UsagePayload {
  rate_limit?: RateLimitPayload | null;
  additional_rate_limits?: AdditionalRateLimitPayload[] | null;
  rate_limit_reset_credits?: { available_count?: NumericLike; applicable_available_count?: NumericLike } | null;
}
export interface DailyUsageTotalsPayload extends TokenCounts {
  credits?: NumericLike;
  users?: NumericLike;
  threads?: NumericLike;
  turns?: NumericLike;
}
export interface DailyUsageClientPayload extends DailyUsageTotalsPayload {
  client_id?: string | null;
}
export interface DailyUsagePayload {
  data?: { date: string; totals?: DailyUsageTotalsPayload | null; clients?: DailyUsageClientPayload[] | null }[] | null;
}
export interface DailyTokenBreakdownPayload {
  data?: { models?: { model?: string | null; speed?: string | null; credits?: NumericLike }[] | null }[] | null;
}
export interface ResetCreditPayload {
  title?: string | null;
  reset_type?: string | null;
  status?: string | null;
  expires_at?: string | null;
}
export interface ResetCreditsPayload {
  credits?: (ResetCreditPayload | null)[] | null;
}
type WindowField = 'primary_window' | 'secondary_window';
interface MainWindowEntry {
  field: WindowField;
  row: UsageWindowPayload;
}
type WindowIdentityInput = Omit<WindowIdentity, 'sourceName'> & { sourceName?: string };
interface WeekInput {
  mainSecondary: ParsedQuotaWindow;
  sinceResetRows: QuotaDailyRow[];
  sinceResetSummary: QuotaPeriodSummary;
  sinceResetStartDate: string;
}
interface WindowIdentity {
  key: string;
  label: string;
  backendField: string;
  sourceName: string;
}

// ---- Quota Snapshot result (the calculator output) ----
export interface QuotaWindowRow {
  窗口Key: string;
  名称: string;
  后端字段: string;
  来源: string;
  已用百分比: number;
  已用比例小数: number;
  窗口秒数: number;
  窗口天数: number;
  本轮开始_UTC: string;
  本轮开始_本地: string;
  下次重置_UTC: string;
  下次重置_本地: string;
  后端当前_UTC: string;
  后端当前_本地: string;
  距离重置小时: number;
}
interface ParsedQuotaWindow extends QuotaWindowRow {
  _windowStartMs: number;
  _resetAtMs: number;
  _serverNowMs: number;
}
export interface QuotaDailyRow {
  日期桶: string;
  Credits: number;
  折算USD: number;
  用户数: number;
  线程数: number;
  轮数: number;
  Token总量: number;
  缓存输入Token: number;
  非缓存输入Token: number;
  输出Token: number;
  客户端数量: number;
  客户端Credits: string;
}
export interface QuotaClientSummary {
  客户端: string;
  Credits: number;
  折算USD: number;
  线程数: number;
  轮数: number;
  Token总量: number;
  缓存输入Token: number;
  非缓存输入Token: number;
  输出Token: number;
}
export interface QuotaModelSummary {
  模型: string;
  速度: string;
  Credits: number;
  折算USD: number;
  占比百分比: number;
}
export interface QuotaResetCreditRow {
  标题: string;
  状态: string;
  过期时间_本地: string;
}
export interface QuotaResetCreditsSection {
  可用张数: number | null;
  当前适用张数: number | null;
  明细: QuotaResetCreditRow[];
  明细错误?: string;
}
export interface QuotaPeriodSummary {
  范围: string;
  日期桶口径: string;
  API_start_date: string;
  API_end_date_排他: string;
  返回日期桶数: number;
  首个返回日期桶: string;
  最后返回日期桶: string;
  累计Credits: number;
  累计折算USD: number;
  累计Token: number;
  累计线程数: number;
  累计轮数: number;
}
/** Only `依据`, `已用百分比` and `说明` are present when used_percent is 0. */
export interface QuotaWeeklyEstimate {
  依据: string;
  已用百分比: number;
  说明: string;
  已用比例小数?: number;
  剩余比例小数?: number;
  日期桶口径?: string;
  包含重置日_已用Credits?: number;
  包含重置日_已用折算USD?: number;
  重置日整天Credits?: number;
  重置日整天折算USD?: number;
  排除重置日_已用Credits?: number;
  排除重置日_已用折算USD?: number;
  反推周总Credits_包含重置日?: number;
  反推周总USD_包含重置日?: number;
  反推周总Credits_排除重置日?: number;
  反推周总USD_排除重置日?: number;
  剩余Credits_包含重置日口径?: number;
  剩余USD_包含重置日口径?: number;
  剩余Credits_排除重置日口径?: number;
  剩余USD_排除重置日口径?: number;
  误差说明?: string;
}
export interface QuotaDiagnostics {
  浏览器本地时区: string;
  浏览器UTC偏移: string;
  后端当前_UTC: string;
  后端当前_本地: string;
  七天窗口开始_UTC: string;
  七天窗口开始_本地: string;
  下次重置_UTC: string;
  下次重置_本地: string;
  API_start_date_上次重置至今: string;
  API_start_date_本月初至今: string;
  API_end_date_排他: string;
  [rollingStartKey: `API_start_date_近${number}天`]: string;
}
export interface QuotaPeriodSection {
  汇总: QuotaPeriodSummary;
  反推周额度?: QuotaWeeklyEstimate;
  每日明细: QuotaDailyRow[];
  客户端汇总: QuotaClientSummary[];
  模型汇总?: QuotaModelSummary[];
  模型汇总错误?: string;
}
export type QuotaRollingKey = `近${number}天`;
/** One calculator run, as shown in the panel and projected into the Snapshot Archive. */
export interface QuotaSnapshotResult {
  配置: { 日期桶模式: string; USD_PER_CREDIT: number; ROLLING_DAYS: number };
  时区诊断: QuotaDiagnostics;
  限制窗口概览: QuotaWindowRow[];
  重置券?: QuotaResetCreditsSection;
  主7天窗口_上次重置至今: QuotaPeriodSection;
  本月初至今: QuotaPeriodSection;
  [rollingKey: QuotaRollingKey]: QuotaPeriodSection;
}
interface QuotaPeriodInput {
  summary: QuotaPeriodSummary;
  rows: QuotaDailyRow[];
  clients: QuotaClientSummary[];
}
export interface QuotaResultInput {
  config: QuotaCalculatorConfig;
  diagnostics: QuotaDiagnostics;
  windows: QuotaWindowRow[];
  periods: {
    sinceReset: QuotaPeriodInput & { weeklyEstimate: QuotaWeeklyEstimate };
    monthToDate: QuotaPeriodInput;
    rolling: QuotaPeriodInput & { modelSummaries?: QuotaModelSummary[] | null; modelSummaryError?: string };
  };
  resetCredits?: QuotaResetCreditsSection | null;
}
export interface QuotaCalculatorOptions {
  config: QuotaCalculatorConfig;
  fetchUsage: () => MaybePromise<UsagePayload>;
  fetchDailyUsage: (startDate: string, endExclusiveDate: string) => MaybePromise<DailyUsagePayload>;
  fetchDailyTokenBreakdown?:
    ((startDate: string, endExclusiveDate: string) => MaybePromise<DailyTokenBreakdownPayload>) | null;
  fetchRateLimitResetCredits?: (() => MaybePromise<ResetCreditsPayload>) | null;
  now?: () => number;
  formatLocalTime?: (ms: number) => string;
  getBrowserTimeZone?: () => string;
}
export interface QuotaCalculator {
  run(): Promise<QuotaSnapshotResult>;
}

function toNumber(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function roundNumber(value: unknown, digits = 2): number {
  return Number(Number(value).toFixed(digits));
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function lastItem<T>(items: readonly T[]): T | undefined {
  return items.length ? items[items.length - 1] : undefined;
}

function ymdUTC(value: number | Date): string {
  return lightFormat(new UTCDate(value), 'yyyy-MM-dd');
}

function ymdLocal(value: number | Date): string {
  return lightFormat(new Date(value), 'yyyy-MM-dd');
}

function addDaysLocalMs(value: number | Date, days: number): number {
  return addDays(value, days).getTime();
}

function firstDayOfMonthUTC(value: number | Date): string {
  return lightFormat(new UTCDate(value), 'yyyy-MM-01');
}

function firstDayOfMonthLocal(value: number | Date): string {
  return lightFormat(new Date(value), 'yyyy-MM-01');
}

function tokenTotal(row: TokenCounts = {}): number {
  return (
    toNumber(row.text_total_tokens) ||
    toNumber(row.cached_text_input_tokens) + toNumber(row.uncached_text_input_tokens) + toNumber(row.text_output_tokens)
  );
}

function utcOffsetLabel(value: number): string {
  const offsetMinutes = -new Date(value).getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return `UTC${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
}

function buildQuotaSnapshotResult({ config, diagnostics, windows, periods, resetCredits = null }: QuotaResultInput) {
  const rollingLabel: QuotaRollingKey = `近${config.ROLLING_DAYS}天`;
  return {
    配置: {
      日期桶模式: config.DATE_BUCKET_MODE,
      USD_PER_CREDIT: config.USD_PER_CREDIT,
      ROLLING_DAYS: config.ROLLING_DAYS,
    },
    时区诊断: diagnostics,
    限制窗口概览: windows,
    ...(resetCredits ? { 重置券: resetCredits } : {}),
    主7天窗口_上次重置至今: {
      汇总: periods.sinceReset.summary,
      反推周额度: periods.sinceReset.weeklyEstimate,
      每日明细: periods.sinceReset.rows,
      客户端汇总: periods.sinceReset.clients,
    },
    本月初至今: {
      汇总: periods.monthToDate.summary,
      每日明细: periods.monthToDate.rows,
      客户端汇总: periods.monthToDate.clients,
    },
    [rollingLabel]: {
      汇总: periods.rolling.summary,
      每日明细: periods.rolling.rows,
      客户端汇总: periods.rolling.clients,
      ...(periods.rolling.modelSummaries ? { 模型汇总: periods.rolling.modelSummaries } : {}),
      ...(periods.rolling.modelSummaryError ? { 模型汇总错误: periods.rolling.modelSummaryError } : {}),
    },
  };
}

function createQuotaCalculator({
  config,
  fetchUsage,
  fetchDailyUsage,
  fetchDailyTokenBreakdown = null,
  fetchRateLimitResetCredits = null,
  now = () => Date.now(),
  formatLocalTime = (ms) => new Date(ms).toLocaleString(),
  getBrowserTimeZone = () => globalThis.Intl?.DateTimeFormat?.().resolvedOptions().timeZone || '未知',
}: QuotaCalculatorOptions): QuotaCalculator {
  if (!config || typeof config !== 'object') {
    throw new Error('Codex quota calculator requires config.');
  }
  if (typeof fetchUsage !== 'function') {
    throw new Error('Codex quota calculator requires fetchUsage.');
  }
  if (typeof fetchDailyUsage !== 'function') {
    throw new Error('Codex quota calculator requires fetchDailyUsage.');
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const ymdForApi = (ms: number): string => (config.DATE_BUCKET_MODE === 'utc' ? ymdUTC(ms) : ymdLocal(ms));
  const addDaysForApi = (ms: number, days: number): number =>
    config.DATE_BUCKET_MODE === 'utc' ? ms + days * dayMs : addDaysLocalMs(ms, days);
  const firstDayOfMonthForApi = (ms: number): string =>
    config.DATE_BUCKET_MODE === 'utc' ? firstDayOfMonthUTC(ms) : firstDayOfMonthLocal(ms);
  const fmtUTC = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').replace('.000Z', ' UTC');

  function windowIdentity({ key, label, backendField, sourceName = '' }: WindowIdentityInput): WindowIdentity {
    return { key, label, backendField, sourceName };
  }

  // 2026-07 起后端把 7 天主窗口挪进 primary_window（secondary_window 恒为 null），
  // 窗口角色只能按 limit_window_seconds 时长判断，不能按字段位置。
  const SEVEN_DAY_CLASS_MIN_SECONDS = 6 * 86400;

  function isSevenDayClassWindow(windowRow: UsageWindowPayload | null | undefined): boolean {
    return toNumber(windowRow?.limit_window_seconds) >= SEVEN_DAY_CLASS_MIN_SECONDS;
  }

  function mainWindowEntries(usage: UsagePayload | null | undefined): MainWindowEntry[] {
    return (['primary_window', 'secondary_window'] as const)
      .map((field) => ({ field, row: usage?.rate_limit?.[field] }))
      .filter((entry) => entry.row) as MainWindowEntry[];
  }

  function findMainSevenDayEntry(usage: UsagePayload | null | undefined): MainWindowEntry | null {
    return (
      mainWindowEntries(usage)
        .filter((entry) => isSevenDayClassWindow(entry.row))
        .sort((left, right) => toNumber(right.row.limit_window_seconds) - toNumber(left.row.limit_window_seconds))[0] ??
      null
    );
  }

  function additionalWindowKey(name: string, suffix: string): string {
    return `additional.${String(name || 'unknown').trim() || 'unknown'}.${suffix}`;
  }

  function parseWindow(identity: WindowIdentity, windowRow: UsageWindowPayload): ParsedQuotaWindow {
    const usedPercent = toNumber(windowRow?.used_percent);
    const windowSeconds = toNumber(windowRow?.limit_window_seconds);
    const resetAfterSeconds = toNumber(windowRow?.reset_after_seconds);
    const resetAtSeconds = toNumber(windowRow?.reset_at);
    const resetAtMs = resetAtSeconds * 1000;
    const windowStartMs = resetAtMs - windowSeconds * 1000;
    const serverNowMs = resetAtMs - resetAfterSeconds * 1000;

    return {
      窗口Key: identity.key,
      名称: identity.label,
      后端字段: identity.backendField,
      来源: identity.sourceName,
      已用百分比: usedPercent,
      已用比例小数: roundNumber(usedPercent / 100, 4),
      窗口秒数: windowSeconds,
      窗口天数: roundNumber(windowSeconds / 86400, 4),
      本轮开始_UTC: fmtUTC(windowStartMs),
      本轮开始_本地: formatLocalTime(windowStartMs),
      下次重置_UTC: fmtUTC(resetAtMs),
      下次重置_本地: formatLocalTime(resetAtMs),
      后端当前_UTC: fmtUTC(serverNowMs),
      后端当前_本地: formatLocalTime(serverNowMs),
      距离重置小时: roundNumber(resetAfterSeconds / 3600, 2),
      _windowStartMs: windowStartMs,
      _resetAtMs: resetAtMs,
      _serverNowMs: serverNowMs,
    };
  }

  function collectWindows(usage: UsagePayload | null | undefined): ParsedQuotaWindow[] {
    const windows: ParsedQuotaWindow[] = [];
    const sevenDayEntry = findMainSevenDayEntry(usage);
    for (const entry of mainWindowEntries(usage)) {
      const isSevenDay = entry.field === sevenDayEntry?.field;
      windows.push(
        parseWindow(
          windowIdentity({
            key: isSevenDay ? MAIN_SEVEN_DAY_WINDOW_KEY : MAIN_PRIMARY_WINDOW_KEY,
            label: isSevenDay ? '主限制 - 7天窗口' : '主限制 - 5小时窗口',
            backendField: entry.field,
          }),
          entry.row,
        ),
      );
    }
    for (const item of usage?.additional_rate_limits ?? []) {
      const name = item.limit_name || item.metered_feature || '额外限制';
      for (const field of ['primary_window', 'secondary_window'] as const) {
        const row = item?.rate_limit?.[field];
        if (!row) continue;
        const isSevenDay = isSevenDayClassWindow(row);
        windows.push(
          parseWindow(
            windowIdentity({
              key: additionalWindowKey(name, isSevenDay ? 'sevenDayWindow' : 'primaryWindow'),
              label: `${name} - ${isSevenDay ? '7天窗口' : '5小时窗口'}`,
              backendField: field,
              sourceName: name,
            }),
            row,
          ),
        );
      }
    }
    return windows;
  }

  function parseDailyRows(json: DailyUsagePayload | null | undefined): QuotaDailyRow[] {
    return (json?.data ?? [])
      .slice()
      .sort((left, right) => String(left.date).localeCompare(String(right.date)))
      .map((day) => {
        const totals: DailyUsageTotalsPayload = day.totals ?? {};
        const credits = toNumber(totals.credits);

        return {
          日期桶: day.date,
          Credits: roundNumber(credits, 6),
          折算USD: roundNumber(credits * config.USD_PER_CREDIT, 2),
          用户数: toNumber(totals.users),
          线程数: toNumber(totals.threads),
          轮数: toNumber(totals.turns),
          Token总量: tokenTotal(totals),
          缓存输入Token: toNumber(totals.cached_text_input_tokens),
          非缓存输入Token: toNumber(totals.uncached_text_input_tokens),
          输出Token: toNumber(totals.text_output_tokens),
          客户端数量: Array.isArray(day.clients) ? day.clients.length : 0,
          客户端Credits: (day.clients ?? [])
            .map((client) => `${client.client_id ?? 'UNKNOWN'}:${roundNumber(toNumber(client.credits), 2)}`)
            .join(' | '),
        };
      });
  }

  function summarizeClients(json: DailyUsagePayload | null | undefined): QuotaClientSummary[] {
    const rowsByClient = new Map<string, QuotaClientSummary>();

    for (const day of json?.data ?? []) {
      for (const client of day.clients ?? []) {
        const id = client.client_id ?? 'UNKNOWN';
        const row: QuotaClientSummary = rowsByClient.get(id) ?? {
          客户端: id,
          Credits: 0,
          折算USD: 0,
          线程数: 0,
          轮数: 0,
          Token总量: 0,
          缓存输入Token: 0,
          非缓存输入Token: 0,
          输出Token: 0,
        };
        const credits = toNumber(client.credits);

        row.Credits += credits;
        row.折算USD += credits * config.USD_PER_CREDIT;
        row.线程数 += toNumber(client.threads);
        row.轮数 += toNumber(client.turns);
        row.Token总量 += tokenTotal(client);
        row.缓存输入Token += toNumber(client.cached_text_input_tokens);
        row.非缓存输入Token += toNumber(client.uncached_text_input_tokens);
        row.输出Token += toNumber(client.text_output_tokens);

        rowsByClient.set(id, row);
      }
    }

    return [...rowsByClient.values()]
      .map((row) => ({
        ...row,
        Credits: roundNumber(row.Credits, 6),
        折算USD: roundNumber(row.折算USD, 2),
      }))
      .sort((left, right) => right.Credits - left.Credits);
  }

  async function collectDailyUsage(
    startDate: string,
    endExclusiveDate: string,
  ): Promise<{ rows: QuotaDailyRow[]; clients: QuotaClientSummary[] }> {
    const json = await fetchDailyUsage(startDate, endExclusiveDate);
    return {
      rows: parseDailyRows(json),
      clients: summarizeClients(json),
    };
  }

  // breakdown 接口给的是相对值（units=percent，查询区间内用量最大的一天记 100），与每日 Credits
  // 严格成正比。用同一区间 daily analytics 的 Credits 合计换算成绝对 Credits 与折算 USD。
  function summarizeModels(
    json: DailyTokenBreakdownPayload | null | undefined,
    rangeCredits: number,
  ): QuotaModelSummary[] {
    const rowsByModel = new Map<string, { 模型: string; 速度: string; Credits: number }>();

    for (const day of json?.data ?? []) {
      for (const entry of day.models ?? []) {
        const model = entry.model ?? 'UNKNOWN';
        const speed = entry.speed ?? '';
        const key = `${model}::${speed}`;
        const row = rowsByModel.get(key) ?? { 模型: model, 速度: speed, Credits: 0 };
        row.Credits += toNumber(entry.credits);
        rowsByModel.set(key, row);
      }
    }

    const rows = [...rowsByModel.values()];
    const totalRelative = rows.reduce((sum, row) => sum + row.Credits, 0);
    const scale = totalRelative > 0 ? toNumber(rangeCredits) / totalRelative : 0;
    return rows
      .map((row) => ({
        模型: row.模型,
        速度: row.速度,
        Credits: roundNumber(row.Credits * scale, 2),
        折算USD: roundNumber(row.Credits * scale * config.USD_PER_CREDIT, 2),
        占比百分比: totalRelative > 0 ? roundNumber((row.Credits / totalRelative) * 100, 1) : 0,
      }))
      .sort((left, right) => right.Credits - left.Credits || right.占比百分比 - left.占比百分比);
  }

  // 模型汇总是增强数据：失败不拖垮主报告，但错误必须显式写进结果。
  async function collectModelSummaries(
    startDate: string,
    endExclusiveDate: string,
    rangeCredits: number,
  ): Promise<{ modelSummaries: QuotaModelSummary[] | null; modelSummaryError: string }> {
    if (typeof fetchDailyTokenBreakdown !== 'function') {
      return { modelSummaries: null, modelSummaryError: '' };
    }
    try {
      const json = await fetchDailyTokenBreakdown(startDate, endExclusiveDate);
      return { modelSummaries: summarizeModels(json, rangeCredits), modelSummaryError: '' };
    } catch (error) {
      return { modelSummaries: [], modelSummaryError: String((error as Error | null)?.message || error) };
    }
  }

  function parseResetCreditRows(json: ResetCreditsPayload | null | undefined): QuotaResetCreditRow[] {
    return (json?.credits ?? [])
      .slice()
      .sort((left, right) => String(left?.expires_at || '').localeCompare(String(right?.expires_at || '')))
      .map((credit) => ({
        标题: credit?.title || credit?.reset_type || '-',
        状态: credit?.status || '-',
        过期时间_本地: credit?.expires_at ? formatLocalTime(Date.parse(credit.expires_at)) : '-',
      }));
  }

  // 重置券同为增强数据：计数来自 usage 响应，明细来自独立接口，明细失败时保留计数。
  async function collectResetCredits(usage: UsagePayload | null | undefined): Promise<QuotaResetCreditsSection | null> {
    const counts = usage?.rate_limit_reset_credits;
    const hasDetailFetch = typeof fetchRateLimitResetCredits === 'function';
    if (!counts && !hasDetailFetch) return null;

    const section: QuotaResetCreditsSection = {
      可用张数: counts ? toNumber(counts.available_count) : null,
      当前适用张数: counts ? toNumber(counts.applicable_available_count) : null,
      明细: [],
    };

    if (hasDetailFetch) {
      try {
        section.明细 = parseResetCreditRows(await fetchRateLimitResetCredits!());
      } catch (error) {
        section.明细错误 = String((error as Error | null)?.message || error);
      }
    }

    return section;
  }

  function summarizeRows(
    rangeName: string,
    rows: QuotaDailyRow[],
    startDate: string,
    endExclusiveDate: string,
  ): QuotaPeriodSummary {
    const credits = rows.reduce((sum, row) => sum + toNumber(row.Credits), 0);
    return {
      范围: rangeName,
      日期桶口径: config.DATE_BUCKET_MODE === 'utc' ? 'UTC日期桶' : '本地日期桶',
      API_start_date: startDate,
      API_end_date_排他: endExclusiveDate,
      返回日期桶数: rows.length,
      首个返回日期桶: rows[0]?.日期桶 ?? '',
      最后返回日期桶: lastItem(rows)?.日期桶 ?? '',
      累计Credits: roundNumber(credits, 6),
      累计折算USD: roundNumber(credits * config.USD_PER_CREDIT, 2),
      累计Token: rows.reduce((sum, row) => sum + toNumber(row.Token总量), 0),
      累计线程数: rows.reduce((sum, row) => sum + toNumber(row.线程数), 0),
      累计轮数: rows.reduce((sum, row) => sum + toNumber(row.轮数), 0),
    };
  }

  function publicWindowRow(windowRow: ParsedQuotaWindow): QuotaWindowRow {
    const { _windowStartMs, _resetAtMs, _serverNowMs, ...visible } = windowRow;
    return visible;
  }

  function buildWeeklyEstimate({ mainSecondary, sinceResetRows, sinceResetSummary, sinceResetStartDate }: WeekInput) {
    const usedPercent = toNumber(mainSecondary.已用百分比);
    const usedRatio = usedPercent / 100;
    const includedCredits = toNumber(sinceResetSummary.累计Credits);
    const resetDayRow = sinceResetRows.find((row) => row.日期桶 === sinceResetStartDate);
    const resetDayCredits = toNumber(resetDayRow?.Credits);
    const excludedCredits = Math.max(0, includedCredits - resetDayCredits);

    if (usedRatio <= 0) {
      return {
        依据: '主限制 - 7天窗口',
        已用百分比: usedPercent,
        说明: '已用比例为 0，无法反推总额度。',
      };
    }

    const totalWithResetDay = includedCredits / usedRatio;
    const totalWithoutResetDay = excludedCredits / usedRatio;
    const remainingWithResetDay = Math.max(0, totalWithResetDay - includedCredits);
    const remainingWithoutResetDay = Math.max(0, totalWithoutResetDay - excludedCredits);

    return {
      依据: '主限制 - 7天窗口',
      已用百分比: usedPercent,
      已用比例小数: roundNumber(usedRatio, 4),
      剩余比例小数: roundNumber(1 - usedRatio, 4),
      说明: 'used_percent 表示已经用掉的比例；例如 45 = 已用 45%，不是剩余 45%。',
      日期桶口径: config.DATE_BUCKET_MODE === 'utc' ? 'UTC日期桶' : '本地日期桶',
      包含重置日_已用Credits: roundNumber(includedCredits, 6),
      包含重置日_已用折算USD: roundNumber(includedCredits * config.USD_PER_CREDIT, 2),
      重置日整天Credits: roundNumber(resetDayCredits, 6),
      重置日整天折算USD: roundNumber(resetDayCredits * config.USD_PER_CREDIT, 2),
      排除重置日_已用Credits: roundNumber(excludedCredits, 6),
      排除重置日_已用折算USD: roundNumber(excludedCredits * config.USD_PER_CREDIT, 2),
      反推周总Credits_包含重置日: roundNumber(totalWithResetDay, 2),
      反推周总USD_包含重置日: roundNumber(totalWithResetDay * config.USD_PER_CREDIT, 2),
      反推周总Credits_排除重置日: roundNumber(totalWithoutResetDay, 2),
      反推周总USD_排除重置日: roundNumber(totalWithoutResetDay * config.USD_PER_CREDIT, 2),
      剩余Credits_包含重置日口径: roundNumber(remainingWithResetDay, 2),
      剩余USD_包含重置日口径: roundNumber(remainingWithResetDay * config.USD_PER_CREDIT, 2),
      剩余Credits_排除重置日口径: roundNumber(remainingWithoutResetDay, 2),
      剩余USD_排除重置日口径: roundNumber(remainingWithoutResetDay * config.USD_PER_CREDIT, 2),
      误差说明:
        'daily analytics 只能按天聚合，不能切到具体小时分钟；实际值通常介于“排除重置日”和“包含重置日”之间。used_percent 也是整数，存在四舍五入或截断误差。',
    };
  }

  async function run(): Promise<QuotaSnapshotResult> {
    const usage = await fetchUsage();
    const windows = collectWindows(usage);
    const sevenDayEntry = findMainSevenDayEntry(usage);

    if (!sevenDayEntry) {
      throw new Error('rate_limit 的 primary/secondary_window 均不含 7 天级别窗口，无法反推主限制 - 7天窗口。');
    }

    const mainSecondary = parseWindow(
      windowIdentity({
        key: MAIN_SEVEN_DAY_WINDOW_KEY,
        label: '主限制 - 7天窗口',
        backendField: sevenDayEntry.field,
      }),
      sevenDayEntry.row,
    );
    const apiNowMs = mainSecondary._serverNowMs || now();
    const apiTodayDate = ymdForApi(apiNowMs);
    const endExclusiveDate = ymdForApi(addDaysForApi(apiNowMs, 1));
    const sinceResetStartDate = ymdForApi(mainSecondary._windowStartMs);
    const monthStartDate = firstDayOfMonthForApi(apiNowMs);
    const rollingStartDate = ymdForApi(addDaysForApi(apiNowMs, -(config.ROLLING_DAYS - 1)));

    const sinceReset = await collectDailyUsage(sinceResetStartDate, endExclusiveDate);
    const sinceResetSummary = summarizeRows(
      `上次重置至今近似 ${sinceResetStartDate} ~ ${apiTodayDate}`,
      sinceReset.rows,
      sinceResetStartDate,
      endExclusiveDate,
    );
    const weeklyEstimate = buildWeeklyEstimate({
      mainSecondary,
      sinceResetRows: sinceReset.rows,
      sinceResetSummary,
      sinceResetStartDate,
    });

    const monthToDate = await collectDailyUsage(monthStartDate, endExclusiveDate);
    const monthToDateSummary = summarizeRows(
      `本月初至今 ${monthStartDate} ~ ${apiTodayDate}`,
      monthToDate.rows,
      monthStartDate,
      endExclusiveDate,
    );

    const rolling = await collectDailyUsage(rollingStartDate, endExclusiveDate);
    const rollingSummary = summarizeRows(
      `近${config.ROLLING_DAYS}天 ${rollingStartDate} ~ ${apiTodayDate}`,
      rolling.rows,
      rollingStartDate,
      endExclusiveDate,
    );
    const rollingModels = await collectModelSummaries(
      rollingStartDate,
      endExclusiveDate,
      rolling.rows.reduce((sum, row) => sum + toNumber(row.Credits), 0),
    );
    const resetCredits = await collectResetCredits(usage);

    return buildQuotaSnapshotResult({
      config,
      resetCredits,
      diagnostics: {
        浏览器本地时区: getBrowserTimeZone(),
        浏览器UTC偏移: utcOffsetLabel(apiNowMs),
        后端当前_UTC: fmtUTC(apiNowMs),
        后端当前_本地: formatLocalTime(apiNowMs),
        七天窗口开始_UTC: fmtUTC(mainSecondary._windowStartMs),
        七天窗口开始_本地: formatLocalTime(mainSecondary._windowStartMs),
        下次重置_UTC: fmtUTC(mainSecondary._resetAtMs),
        下次重置_本地: formatLocalTime(mainSecondary._resetAtMs),
        API_start_date_上次重置至今: sinceResetStartDate,
        API_start_date_本月初至今: monthStartDate,
        [`API_start_date_近${config.ROLLING_DAYS}天`]: rollingStartDate,
        API_end_date_排他: endExclusiveDate,
      },
      windows: windows.map(publicWindowRow),
      periods: {
        sinceReset: {
          summary: sinceResetSummary,
          weeklyEstimate,
          rows: sinceReset.rows,
          clients: sinceReset.clients,
        },
        monthToDate: {
          summary: monthToDateSummary,
          rows: monthToDate.rows,
          clients: monthToDate.clients,
        },
        rolling: {
          summary: rollingSummary,
          rows: rolling.rows,
          clients: rolling.clients,
          modelSummaries: rollingModels.modelSummaries,
          modelSummaryError: rollingModels.modelSummaryError,
        },
      },
    });
  }

  return { run };
}

export {
  addDaysLocalMs,
  buildQuotaSnapshotResult,
  createQuotaCalculator,
  firstDayOfMonthLocal,
  firstDayOfMonthUTC,
  ymdLocal,
  ymdUTC,
};
