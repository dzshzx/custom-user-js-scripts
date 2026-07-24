import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-contract.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-core.lib.js');

const {
  buildQuotaSnapshotResult,
  createQuotaCalculator,
} = globalThis.CodexQuotaCompassCoreLib;
const { rollingPeriodKey } = globalThis.CodexQuotaCompassContractLib;

test('rollingPeriodKey returns the first matching rolling period key', () => {
  const key = rollingPeriodKey({
    配置: {},
    近7天: { 汇总: {} },
    近30天: { 汇总: {} },
  });

  assert.equal(key, '近7天');
});

test('core exports quota calculation interfaces only', () => {
  assert.equal(Object.hasOwn(globalThis.CodexQuotaCompassCoreLib, 'rollingPeriodKey'), false);
  assert.equal(Object.hasOwn(globalThis.CodexQuotaCompassCoreLib, 'createSnapshotSyncPort'), false);
  assert.equal(Object.hasOwn(globalThis.CodexQuotaCompassCoreLib, 'createSnapshotSyncStatus'), false);
  assert.equal(Object.hasOwn(globalThis.CodexQuotaCompassCoreLib, 'createQuotaPanelViewModel'), false);
});

test('buildQuotaSnapshotResult builds stable Quota Snapshot contract shape', () => {
  const result = buildQuotaSnapshotResult({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    diagnostics: { 浏览器本地时区: 'Asia/Shanghai' },
    windows: [{ 名称: '主限制 - 7天窗口', 已用百分比: 40 }],
    periods: {
      sinceReset: { summary: { 范围: 'A' }, weeklyEstimate: { 已用百分比: 40 }, rows: [], clients: [] },
      monthToDate: { summary: { 范围: 'B' }, rows: [], clients: [] },
      rolling: { summary: { 范围: 'C' }, rows: [], clients: [] },
    },
  });

  assert.equal(result.配置.ROLLING_DAYS, 30);
  assert.equal(result.主7天窗口_上次重置至今.反推周额度.已用百分比, 40);
  assert.equal(result.本月初至今.汇总.范围, 'B');
  assert.ok(result.近30天);
});

test('createQuotaCalculator computes quota result through injected fetch adapters', async () => {
  const usageCalls = [];
  const dailyCalls = [];
  const calculator = createQuotaCalculator({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    formatLocalTime: (ms) => `local:${new Date(ms).toISOString()}`,
    getBrowserTimeZone: () => 'Asia/Shanghai',
    fetchUsage: async () => {
      usageCalls.push('usage');
      return {
        rate_limit: {
          primary_window: {
            used_percent: 20,
            limit_window_seconds: 5 * 60 * 60,
            reset_after_seconds: 60 * 60,
            reset_at: Date.parse('2026-05-31T00:00:00.000Z') / 1000,
          },
          secondary_window: {
            used_percent: 40,
            limit_window_seconds: 7 * 24 * 60 * 60,
            reset_after_seconds: 24 * 60 * 60,
            reset_at: Date.parse('2026-05-31T00:00:00.000Z') / 1000,
          },
        },
      };
    },
    fetchDailyUsage: async (startDate, endDate) => {
      dailyCalls.push([startDate, endDate]);
      return {
        data: [
          {
            date: startDate,
            totals: {
              credits: 10,
              users: 1,
              threads: 2,
              turns: 3,
              text_total_tokens: 100,
            },
            clients: [
              {
                client_id: 'chatgpt-web',
                credits: 10,
                threads: 2,
                turns: 3,
                text_total_tokens: 100,
              },
            ],
          },
        ],
      };
    },
  });

  const result = await calculator.run();

  assert.deepEqual(usageCalls, ['usage']);
  assert.deepEqual(dailyCalls, [
    ['2026-05-24', '2026-05-31'],
    ['2026-05-01', '2026-05-31'],
    ['2026-05-01', '2026-05-31'],
  ]);
  assert.equal(result.时区诊断.浏览器本地时区, 'Asia/Shanghai');
  assert.equal(result.限制窗口概览.length, 2);
  assert.equal(result.限制窗口概览[1].窗口Key, 'main.sevenDayWindow');
  assert.equal(result.限制窗口概览[1].后端字段, 'secondary_window');
  assert.equal(result.主7天窗口_上次重置至今.汇总.累计Credits, 10);
  assert.equal(result.主7天窗口_上次重置至今.反推周额度.反推周总Credits_包含重置日, 25);
  assert.equal(result.主7天窗口_上次重置至今.客户端汇总[0].客户端, 'chatgpt-web');
  assert.equal(result.本月初至今.汇总.API_start_date, '2026-05-01');
  assert.ok(result.近30天);
});

test('createQuotaCalculator identifies the seven-day window by duration when secondary_window is null', async () => {
  // 2026-07 起 /wham/usage 只返回 primary_window（7 天窗口），secondary_window 恒为 null。
  const calculator = createQuotaCalculator({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    formatLocalTime: (ms) => `local:${new Date(ms).toISOString()}`,
    getBrowserTimeZone: () => 'Asia/Shanghai',
    fetchUsage: async () => ({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 40,
          limit_window_seconds: 7 * 24 * 60 * 60,
          reset_after_seconds: 24 * 60 * 60,
          reset_at: Date.parse('2026-05-31T00:00:00.000Z') / 1000,
        },
        secondary_window: null,
      },
    }),
    fetchDailyUsage: async (startDate) => ({
      data: [
        {
          date: startDate,
          totals: { credits: 10, users: 1, threads: 2, turns: 3, text_total_tokens: 100 },
          clients: [],
        },
      ],
    }),
  });

  const result = await calculator.run();

  assert.equal(result.限制窗口概览.length, 1);
  assert.equal(result.限制窗口概览[0].窗口Key, 'main.sevenDayWindow');
  assert.equal(result.限制窗口概览[0].名称, '主限制 - 7天窗口');
  assert.equal(result.限制窗口概览[0].后端字段, 'primary_window');
  assert.equal(result.主7天窗口_上次重置至今.反推周额度.反推周总Credits_包含重置日, 25);
});

test('createQuotaCalculator classifies additional rate limit windows by duration', async () => {
  const sevenDayWindow = {
    used_percent: 10,
    limit_window_seconds: 7 * 24 * 60 * 60,
    reset_after_seconds: 24 * 60 * 60,
    reset_at: Date.parse('2026-05-31T00:00:00.000Z') / 1000,
  };
  const calculator = createQuotaCalculator({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    formatLocalTime: (ms) => `local:${new Date(ms).toISOString()}`,
    getBrowserTimeZone: () => 'Asia/Shanghai',
    fetchUsage: async () => ({
      rate_limit: { primary_window: { ...sevenDayWindow, used_percent: 40 }, secondary_window: null },
      additional_rate_limits: [
        {
          limit_name: 'GPT-5.3-Codex-Spark',
          metered_feature: 'codex_bengalfox',
          rate_limit: { primary_window: sevenDayWindow, secondary_window: null },
        },
      ],
    }),
    fetchDailyUsage: async (startDate) => ({
      data: [{ date: startDate, totals: { credits: 10 }, clients: [] }],
    }),
  });

  const result = await calculator.run();
  const additionalRow = result.限制窗口概览.find((row) => row.来源 === 'GPT-5.3-Codex-Spark');

  assert.equal(additionalRow.窗口Key, 'additional.GPT-5.3-Codex-Spark.sevenDayWindow');
  assert.equal(additionalRow.名称, 'GPT-5.3-Codex-Spark - 7天窗口');
  assert.equal(additionalRow.后端字段, 'primary_window');
});

function newShapeUsageFixture(extra = {}) {
  return {
    rate_limit: {
      primary_window: {
        used_percent: 40,
        limit_window_seconds: 7 * 24 * 60 * 60,
        reset_after_seconds: 24 * 60 * 60,
        reset_at: Date.parse('2026-05-31T00:00:00.000Z') / 1000,
      },
      secondary_window: null,
    },
    ...extra,
  };
}

function emptyDailyFixture(startDate) {
  return { data: [{ date: startDate, totals: { credits: 10 }, clients: [] }] };
}

test('createQuotaCalculator aggregates rolling model summaries from daily token breakdown', async () => {
  const breakdownCalls = [];
  const calculator = createQuotaCalculator({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    formatLocalTime: (ms) => `local:${new Date(ms).toISOString()}`,
    getBrowserTimeZone: () => 'Asia/Shanghai',
    fetchUsage: async () => newShapeUsageFixture(),
    fetchDailyUsage: async (startDate) => emptyDailyFixture(startDate),
    fetchDailyTokenBreakdown: async (startDate, endExclusiveDate) => {
      breakdownCalls.push([startDate, endExclusiveDate]);
      return {
        data: [
          {
            date: '2026-05-29',
            models: [
              { model: 'gpt-5.6-sol', speed: 'standard', credits: 30 },
              { model: 'gpt-5.3-codex', speed: 'fast', credits: 5 },
            ],
          },
          {
            date: '2026-05-30',
            models: [
              { model: 'gpt-5.6-sol', speed: 'standard', credits: 20 },
            ],
          },
        ],
        units: 'percent',
        group_by: 'day',
      };
    },
  });

  const result = await calculator.run();

  assert.deepEqual(breakdownCalls, [['2026-05-01', '2026-05-31']]);
  assert.deepEqual(result.近30天.模型汇总, [
    { 模型: 'gpt-5.6-sol', 速度: 'standard', Credits: 50, 占比百分比: 90.9 },
    { 模型: 'gpt-5.3-codex', 速度: 'fast', Credits: 5, 占比百分比: 9.1 },
  ]);
});

test('createQuotaCalculator records an explicit model summary error without failing the run', async () => {
  const calculator = createQuotaCalculator({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    formatLocalTime: (ms) => `local:${new Date(ms).toISOString()}`,
    getBrowserTimeZone: () => 'Asia/Shanghai',
    fetchUsage: async () => newShapeUsageFixture(),
    fetchDailyUsage: async (startDate) => emptyDailyFixture(startDate),
    fetchDailyTokenBreakdown: async () => {
      throw new Error('HTTP 500 Internal Server Error');
    },
  });

  const result = await calculator.run();

  assert.deepEqual(result.近30天.模型汇总, []);
  assert.equal(result.近30天.模型汇总错误, 'HTTP 500 Internal Server Error');
});

test('createQuotaCalculator surfaces rate limit reset credits with detail rows', async () => {
  const calculator = createQuotaCalculator({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    formatLocalTime: (ms) => `local:${new Date(ms).toISOString()}`,
    getBrowserTimeZone: () => 'Asia/Shanghai',
    fetchUsage: async () => newShapeUsageFixture({
      rate_limit_reset_credits: { available_count: 3, applicable_available_count: 0 },
    }),
    fetchDailyUsage: async (startDate) => emptyDailyFixture(startDate),
    fetchRateLimitResetCredits: async () => ({
      credits: [
        {
          id: 'RateLimitResetCredit_b',
          title: 'Full reset',
          status: 'available',
          expires_at: '2026-08-15T00:00:00.000Z',
        },
        {
          id: 'RateLimitResetCredit_a',
          title: 'Full reset',
          status: 'available',
          expires_at: '2026-07-31T00:00:00.000Z',
        },
      ],
      available_count: 3,
      total_earned_count: 0,
    }),
  });

  const result = await calculator.run();

  assert.equal(result.重置券.可用张数, 3);
  assert.equal(result.重置券.当前适用张数, 0);
  assert.deepEqual(result.重置券.明细, [
    { 标题: 'Full reset', 状态: 'available', 过期时间_本地: 'local:2026-07-31T00:00:00.000Z' },
    { 标题: 'Full reset', 状态: 'available', 过期时间_本地: 'local:2026-08-15T00:00:00.000Z' },
  ]);
});

test('createQuotaCalculator keeps reset credit counts when the detail fetch fails', async () => {
  const calculator = createQuotaCalculator({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    formatLocalTime: (ms) => `local:${new Date(ms).toISOString()}`,
    getBrowserTimeZone: () => 'Asia/Shanghai',
    fetchUsage: async () => newShapeUsageFixture({
      rate_limit_reset_credits: { available_count: 3, applicable_available_count: 0 },
    }),
    fetchDailyUsage: async (startDate) => emptyDailyFixture(startDate),
    fetchRateLimitResetCredits: async () => {
      throw new Error('HTTP 503 Service Unavailable');
    },
  });

  const result = await calculator.run();

  assert.equal(result.重置券.可用张数, 3);
  assert.deepEqual(result.重置券.明细, []);
  assert.equal(result.重置券.明细错误, 'HTTP 503 Service Unavailable');
});

test('createQuotaCalculator omits the reset credit section without counts or adapter', async () => {
  const calculator = createQuotaCalculator({
    config: { DATE_BUCKET_MODE: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    formatLocalTime: (ms) => `local:${new Date(ms).toISOString()}`,
    getBrowserTimeZone: () => 'Asia/Shanghai',
    fetchUsage: async () => newShapeUsageFixture(),
    fetchDailyUsage: async (startDate) => emptyDailyFixture(startDate),
  });

  const result = await calculator.run();

  assert.equal(Object.hasOwn(result, '重置券'), false);
});
