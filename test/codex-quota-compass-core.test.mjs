import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-contract.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-core.lib.js');

const {
  buildQuotaSnapshotResult,
  createQuotaCalculator,
  rollingPeriodKey,
} = globalThis.CodexQuotaCompassCoreLib;

test('rollingPeriodKey returns the first matching rolling period key', () => {
  const key = rollingPeriodKey({
    配置: {},
    近7天: { 汇总: {} },
    近30天: { 汇总: {} },
  });

  assert.equal(key, '近7天');
});

test('core exports quota calculation interfaces only', () => {
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
