(function attachCodexQuotaCompassRuntimeLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassRuntimeLib';

  function createDefaultQuotaRuntimeConfig(overrides = {}) {
    return {
      DEBUG: false,
      DATE_BUCKET_MODE: 'utc',
      USD_PER_CREDIT: 40 / 1000,
      ROLLING_DAYS: 30,
      MANUAL_ACCESS_TOKEN: '',
      USAGE_PATH: '/backend-api/wham/usage',
      DAILY_USAGE_PATH: '/backend-api/wham/analytics/daily-workspace-usage-counts',
      DAILY_TOKEN_BREAKDOWN_PATH: '/backend-api/wham/usage/daily-token-usage-breakdown',
      RESET_CREDITS_PATH: '/backend-api/wham/rate-limit-reset-credits',
      ...overrides,
    };
  }

  function stripBearer(value) {
    return String(value || '')
      .replace(/^Bearer\s+/i, '')
      .trim();
  }

  function looksLikeJwt(value) {
    return typeof value === 'string' && value.length > 100 && value.split('.').length >= 3;
  }

  function findAccessToken(input, depth = 0) {
    if (!input || typeof input !== 'object' || depth > 8) return '';

    for (const [key, value] of Object.entries(input)) {
      if (
        typeof value === 'string'
        && /access/i.test(key)
        && looksLikeJwt(value)
      ) {
        return value;
      }

      if (value && typeof value === 'object') {
        const found = findAccessToken(value, depth + 1);
        if (found) return found;
      }
    }

    return '';
  }

  function createUnauthorizedError(path) {
    return new Error(
      [
        `HTTP 401 Unauthorized: ${path}`,
        '',
        '没有拿到有效 Authorization。',
        '处理方式：',
        '1. 先确认你已经登录 chatgpt.com，并在同一个页面运行脚本。',
        '2. 刷新 Codex Usage / Analytics 页面后重试。',
        '3. 仍失败时，可在 Network 面板找到成功的 /backend-api/wham/usage 请求，',
        '   复制 Authorization: Bearer 后面的 token，只在自己电脑临时填到 CONFIG.MANUAL_ACCESS_TOKEN。',
        '',
        '不要把 token、Cookie、填过 token 的脚本或截图发给任何人。',
      ].join('\n'),
    );
  }

  function createQuotaRuntime({
    config = createDefaultQuotaRuntimeConfig(),
    coreLib,
    fetchImpl = globalObject.fetch?.bind(globalObject),
    location = globalObject.location,
    now = () => Date.now(),
    formatLocalTime = (ms) => new Date(ms).toLocaleString(),
    getBrowserTimeZone = () => (
      globalObject.Intl?.DateTimeFormat?.().resolvedOptions().timeZone || '未知'
    ),
  } = {}) {
    if (!coreLib?.createQuotaCalculator) {
      throw new Error('CodexQuotaCompassCoreLib calculator is unavailable.');
    }
    if (typeof fetchImpl !== 'function') {
      throw new Error('Codex quota runtime requires fetchImpl.');
    }

    async function getAccessToken() {
      const manual = stripBearer(config.MANUAL_ACCESS_TOKEN);
      if (manual) return manual;

      try {
        const response = await fetchImpl('/api/auth/session', {
          credentials: 'include',
          headers: { accept: 'application/json' },
        });

        if (!response.ok) return '';

        return findAccessToken(await response.json());
      } catch {
        return '';
      }
    }

    async function run() {
      if (location?.hostname !== 'chatgpt.com') {
        throw new Error('请在 chatgpt.com 页面运行，例如 Codex Usage / Analytics 页面。');
      }

      const accessToken = await getAccessToken();
      const headers = { accept: 'application/json' };

      if (accessToken) {
        headers.authorization = `Bearer ${accessToken}`;
      }

      async function apiGet(path) {
        const response = await fetchImpl(path, {
          method: 'GET',
          credentials: 'include',
          headers,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');

          if (response.status === 401) {
            throw createUnauthorizedError(path);
          }

          throw new Error(`HTTP ${response.status} ${response.statusText}: ${path}\n${text.slice(0, 800)}`);
        }

        return response.json();
      }

      function dailyRangeQuery(startDate, endExclusiveDate) {
        return new URLSearchParams({
          start_date: startDate,
          end_date: endExclusiveDate,
          group_by: 'day',
        });
      }

      return coreLib.createQuotaCalculator({
        config,
        fetchUsage: () => apiGet(config.USAGE_PATH),
        fetchDailyUsage: (startDate, endExclusiveDate) => (
          apiGet(`${config.DAILY_USAGE_PATH}?${dailyRangeQuery(startDate, endExclusiveDate)}`)
        ),
        fetchDailyTokenBreakdown: (startDate, endExclusiveDate) => (
          apiGet(`${config.DAILY_TOKEN_BREAKDOWN_PATH}?${dailyRangeQuery(startDate, endExclusiveDate)}`)
        ),
        fetchRateLimitResetCredits: () => apiGet(config.RESET_CREDITS_PATH),
        now,
        formatLocalTime,
        getBrowserTimeZone,
      }).run();
    }

    return { run };
  }

  globalObject[LIB_NAME] = Object.freeze({
    createDefaultQuotaRuntimeConfig,
    createQuotaRuntime,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
