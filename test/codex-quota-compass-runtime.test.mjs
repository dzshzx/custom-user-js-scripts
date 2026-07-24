import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-contract.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-core.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-runtime.lib.js');

const { createDefaultQuotaRuntimeConfig, createQuotaRuntime } = globalThis.CodexQuotaCompassRuntimeLib;

function jsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    json: async () => body,
    text: async () => options.text ?? JSON.stringify(body),
  };
}

function createUsageFixture() {
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
}

function createDailyFixture(date) {
  return {
    data: [
      {
        date,
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
}

test('createQuotaRuntime runs quota calculation through injected browser adapters', async () => {
  const calls = [];
  const token = `header.${'x'.repeat(120)}.signature`;
  const runtime = createQuotaRuntime({
    config: createDefaultQuotaRuntimeConfig(),
    coreLib: globalThis.CodexQuotaCompassCoreLib,
    location: { hostname: 'chatgpt.com' },
    formatLocalTime: (ms) => `local:${new Date(ms).toISOString()}`,
    getBrowserTimeZone: () => 'Asia/Shanghai',
    fetchImpl: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === '/api/auth/session') {
        return jsonResponse({ nested: { accessToken: token } });
      }
      if (path === '/backend-api/wham/usage') {
        return jsonResponse({
          ...createUsageFixture(),
          rate_limit_reset_credits: { available_count: 3, applicable_available_count: 0 },
        });
      }
      if (path === '/backend-api/wham/rate-limit-reset-credits') {
        return jsonResponse({
          credits: [{ title: 'Full reset', status: 'available', expires_at: '2026-07-31T00:00:00.000Z' }],
          available_count: 3,
        });
      }
      if (path.startsWith('/backend-api/wham/usage/daily-token-usage-breakdown')) {
        return jsonResponse({
          data: [{ date: '2026-05-29', models: [{ model: 'gpt-5.6-sol', speed: 'standard', credits: 5 }] }],
          group_by: 'day',
        });
      }

      const parsed = new URL(path, 'https://chatgpt.com');
      return jsonResponse(createDailyFixture(parsed.searchParams.get('start_date')));
    },
  });

  const result = await runtime.run();

  assert.equal(result.时区诊断.浏览器本地时区, 'Asia/Shanghai');
  assert.equal(result.主7天窗口_上次重置至今.汇总.累计Credits, 10);
  assert.equal(result.主7天窗口_上次重置至今.反推周额度.反推周总Credits_包含重置日, 25);
  assert.deepEqual(calls.map((call) => call.path), [
    '/api/auth/session',
    '/backend-api/wham/usage',
    '/backend-api/wham/analytics/daily-workspace-usage-counts?start_date=2026-05-24&end_date=2026-05-31&group_by=day',
    '/backend-api/wham/analytics/daily-workspace-usage-counts?start_date=2026-05-01&end_date=2026-05-31&group_by=day',
    '/backend-api/wham/analytics/daily-workspace-usage-counts?start_date=2026-05-01&end_date=2026-05-31&group_by=day',
    '/backend-api/wham/usage/daily-token-usage-breakdown?start_date=2026-05-01&end_date=2026-05-31&group_by=day',
    '/backend-api/wham/rate-limit-reset-credits',
  ]);
  assert.equal(calls[1].options.headers.authorization, `Bearer ${token}`);
  assert.equal(calls[2].options.credentials, 'include');
  assert.deepEqual(result.近30天.模型汇总, [
    { 模型: 'gpt-5.6-sol', 速度: 'standard', Credits: 5, 占比百分比: 100 },
  ]);
  assert.equal(result.重置券.可用张数, 3);
  assert.equal(result.重置券.明细[0].标题, 'Full reset');
});

test('createQuotaRuntime preserves 401 recovery guidance without leaking token values', async () => {
  const runtime = createQuotaRuntime({
    config: createDefaultQuotaRuntimeConfig({ MANUAL_ACCESS_TOKEN: 'Bearer local-secret-token' }),
    coreLib: globalThis.CodexQuotaCompassCoreLib,
    location: { hostname: 'chatgpt.com' },
    fetchImpl: async (path) => {
      if (path === '/backend-api/wham/usage') {
        return jsonResponse({}, {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: 'private body',
        });
      }

      return jsonResponse({});
    },
  });

  await assert.rejects(
    () => runtime.run(),
    (error) => {
      assert.match(error.message, /HTTP 401 Unauthorized: \/backend-api\/wham\/usage/);
      assert.match(error.message, /CONFIG\.MANUAL_ACCESS_TOKEN/);
      assert.equal(error.message.includes('local-secret-token'), false);
      assert.equal(error.message.includes('private body'), false);
      return true;
    },
  );
});

test('createQuotaRuntime rejects non-chatgpt hosts before fetching', async () => {
  const calls = [];
  const runtime = createQuotaRuntime({
    coreLib: globalThis.CodexQuotaCompassCoreLib,
    location: { hostname: 'example.com' },
    fetchImpl: async () => {
      calls.push('fetch');
      return jsonResponse({});
    },
  });

  await assert.rejects(
    () => runtime.run(),
    /请在 chatgpt\.com 页面运行/,
  );
  assert.deepEqual(calls, []);
});
