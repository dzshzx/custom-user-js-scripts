(function attachCodexQuotaCompassCoreLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassCoreLib';
  const MAIN_PRIMARY_WINDOW_KEY = 'main.primaryWindow';
  const MAIN_SEVEN_DAY_WINDOW_KEY = 'main.sevenDayWindow';

  function rollingPeriodKey(result) {
    return Object.keys(result || {}).find((key) => /^近\d+天$/.test(key)) || '';
  }

  function toNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function roundNumber(value, digits = 2) {
    return Number(Number(value).toFixed(digits));
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function lastItem(items) {
    return items.length ? items[items.length - 1] : undefined;
  }

  function isMainSevenDayWindow(row) {
    return row?.窗口Key === MAIN_SEVEN_DAY_WINDOW_KEY || row?.名称 === '主限制 - 7天窗口';
  }

  function ymdUTC(value) {
    const date = new Date(value);
    return [
      date.getUTCFullYear(),
      pad2(date.getUTCMonth() + 1),
      pad2(date.getUTCDate()),
    ].join('-');
  }

  function ymdLocal(value) {
    const date = new Date(value);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  function addDaysLocalMs(value, days) {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return date.getTime();
  }

  function firstDayOfMonthUTC(value) {
    const date = new Date(value);
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-01`;
  }

  function firstDayOfMonthLocal(value) {
    const date = new Date(value);
    return ymdLocal(new Date(date.getFullYear(), date.getMonth(), 1).getTime());
  }

  function tokenTotal(row = {}) {
    return toNumber(row.text_total_tokens)
      || toNumber(row.cached_text_input_tokens)
        + toNumber(row.uncached_text_input_tokens)
        + toNumber(row.text_output_tokens);
  }

  function utcOffsetLabel(value) {
    const offsetMinutes = -new Date(value).getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absolute = Math.abs(offsetMinutes);
    return `UTC${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
  }

  function buildQuotaSnapshotResult({
    config,
    diagnostics,
    windows,
    periods,
  }) {
    const rollingLabel = `近${config.ROLLING_DAYS}天`;
    return {
      配置: {
        日期桶模式: config.DATE_BUCKET_MODE,
        USD_PER_CREDIT: config.USD_PER_CREDIT,
        ROLLING_DAYS: config.ROLLING_DAYS,
      },
      时区诊断: diagnostics,
      限制窗口概览: windows,
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
      },
    };
  }

  function createQuotaCalculator({
    config,
    fetchUsage,
    fetchDailyUsage,
    now = () => Date.now(),
    formatLocalTime = (ms) => new Date(ms).toLocaleString(),
    getBrowserTimeZone = () => (
      globalObject.Intl?.DateTimeFormat?.().resolvedOptions().timeZone || '未知'
    ),
  }) {
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
    const ymdForApi = (ms) => (
      config.DATE_BUCKET_MODE === 'utc' ? ymdUTC(ms) : ymdLocal(ms)
    );
    const addDaysForApi = (ms, days) => (
      config.DATE_BUCKET_MODE === 'utc'
        ? ms + days * dayMs
        : addDaysLocalMs(ms, days)
    );
    const firstDayOfMonthForApi = (ms) => (
      config.DATE_BUCKET_MODE === 'utc'
        ? firstDayOfMonthUTC(ms)
        : firstDayOfMonthLocal(ms)
    );
    const fmtUTC = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('.000Z', ' UTC');

    function windowIdentity({
      key,
      label,
      backendField,
      sourceName = '',
    }) {
      return { key, label, backendField, sourceName };
    }

    function additionalWindowKey(name, suffix) {
      return `additional.${String(name || 'unknown').trim() || 'unknown'}.${suffix}`;
    }

    function parseWindow(identity, windowRow) {
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

    function collectWindows(usage) {
      const windows = [];
      if (usage?.rate_limit?.primary_window) {
        windows.push(parseWindow(windowIdentity({
          key: MAIN_PRIMARY_WINDOW_KEY,
          label: '主限制 - 5小时窗口',
          backendField: 'primary_window',
        }), usage.rate_limit.primary_window));
      }
      if (usage?.rate_limit?.secondary_window) {
        windows.push(parseWindow(windowIdentity({
          key: MAIN_SEVEN_DAY_WINDOW_KEY,
          label: '主限制 - 7天窗口',
          backendField: 'secondary_window',
        }), usage.rate_limit.secondary_window));
      }
      for (const item of usage?.additional_rate_limits ?? []) {
        const name = item.limit_name || item.metered_feature || '额外限制';
        if (item?.rate_limit?.primary_window) {
          windows.push(parseWindow(windowIdentity({
            key: additionalWindowKey(name, 'primaryWindow'),
            label: `${name} - 5小时窗口`,
            backendField: 'primary_window',
            sourceName: name,
          }), item.rate_limit.primary_window));
        }
        if (item?.rate_limit?.secondary_window) {
          windows.push(parseWindow(windowIdentity({
            key: additionalWindowKey(name, 'sevenDayWindow'),
            label: `${name} - 7天窗口`,
            backendField: 'secondary_window',
            sourceName: name,
          }), item.rate_limit.secondary_window));
        }
      }
      return windows;
    }

    function parseDailyRows(json) {
      return (json?.data ?? [])
        .slice()
        .sort((left, right) => String(left.date).localeCompare(String(right.date)))
        .map((day) => {
          const totals = day.totals ?? {};
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

    function summarizeClients(json) {
      const rowsByClient = new Map();

      for (const day of json?.data ?? []) {
        for (const client of day.clients ?? []) {
          const id = client.client_id ?? 'UNKNOWN';
          const row = rowsByClient.get(id) ?? {
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

    async function collectDailyUsage(startDate, endExclusiveDate) {
      const json = await fetchDailyUsage(startDate, endExclusiveDate);
      return {
        rows: parseDailyRows(json),
        clients: summarizeClients(json),
      };
    }

    function summarizeRows(rangeName, rows, startDate, endExclusiveDate) {
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

    function publicWindowRow(windowRow) {
      const { _windowStartMs, _resetAtMs, _serverNowMs, ...visible } = windowRow;
      return visible;
    }

    function buildWeeklyEstimate({
      mainSecondary,
      sinceResetRows,
      sinceResetSummary,
      sinceResetStartDate,
    }) {
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
        误差说明: 'daily analytics 只能按天聚合，不能切到具体小时分钟；实际值通常介于“排除重置日”和“包含重置日”之间。used_percent 也是整数，存在四舍五入或截断误差。',
      };
    }

    async function run() {
      const usage = await fetchUsage();
      const windows = collectWindows(usage);

      if (!usage?.rate_limit?.secondary_window) {
        throw new Error('没有找到 usage.rate_limit.secondary_window，无法反推主限制 - 7天窗口。');
      }

      const mainSecondary = parseWindow(windowIdentity({
        key: MAIN_SEVEN_DAY_WINDOW_KEY,
        label: '主限制 - 7天窗口',
        backendField: 'secondary_window',
      }), usage.rate_limit.secondary_window);
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

      return buildQuotaSnapshotResult({
        config,
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
          },
        },
      });
    }

    return { run };
  }

  function normalizePanelSyncStatus(syncStatus, storageBackend) {
    const backendId = syncStatus?.backendId || storageBackend?.id || 'pending';
    const backendLabel = syncStatus?.backendLabel || storageBackend?.label || backendId;
    const crossDeviceCapable = Boolean(syncStatus?.crossDeviceCapable ?? backendId === 'gm');
    const localOnly = Boolean(syncStatus?.localOnly ?? backendId === 'localStorage');
    const reason = syncStatus?.reason || (
      backendId === 'gm'
        ? 'Userscript manager storage is available; cross-device sync depends on the manager sync setting.'
        : backendId === 'localStorage'
          ? 'localStorage is browser-local and will not sync personal usage history across devices.'
          : 'Snapshot Archive storage has not been loaded yet.'
    );

    return {
      backendId,
      backendLabel,
      crossDeviceCapable,
      localOnly,
      reason,
    };
  }

  function createSyncBanner(syncStatus) {
    if (syncStatus.crossDeviceCapable) {
      return {
        tone: 'success',
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

  function dataColumn(key, options = {}) {
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

  function dataView(id, titleKey, rows, columns, options = {}) {
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

  function createOverviewSections({ weekly, sinceReset, month, rolling, archiveHealth }) {
    return [
      dataView('overview-status', 'sectionOverviewSummary', [
        { item: '7 天已用', value: weekly.已用百分比 !== undefined ? `${weekly.已用百分比}%` : '-' },
        { item: '上次重置至今', value: sinceReset.累计折算USD, detail: `${sinceReset.累计Credits ?? '-'} Credits` },
        { item: '本月累计', value: month.累计折算USD, detail: `${month.累计Credits ?? '-'} Credits` },
        { item: '近30天', value: rolling.累计折算USD, detail: `${rolling.累计Credits ?? '-'} Credits` },
        { item: '用量记录', value: archiveHealth.snapshotCount, detail: archiveHealth.storageBackendLabel },
      ], [
        dataColumn('item', { labelKey: 'columnItem', priority: 'primary' }),
        dataColumn('value', { labelKey: 'columnValue', priority: 'primary' }),
        dataColumn('detail', { labelKey: 'columnDetail', priority: 'secondary', wrap: true }),
      ]),
    ];
  }

  function createHistorySections(historyUsage) {
    const dayRows = historyUsage?.day?.rows || [];
    const daySummary = historyUsage?.day?.summary || {};
    const rollingSummary = historyUsage?.rolling?.summary || {};
    const monthSummary = historyUsage?.month?.summary || {};

    return [
      dataView('history-daily', 'sectionDailyQuery', dayRows.map((row) => ({
        date: row.date,
        credits: row.credits,
        usd: row.usd,
      })), [
        dataColumn('date', { labelKey: 'columnDateBucket', priority: 'primary' }),
        dataColumn('credits', { label: 'Credits', priority: 'primary' }),
        dataColumn('usd', { labelKey: 'columnUsd', priority: 'primary' }),
      ]),
      dataView('history-period-summary', 'sectionPeriodSummary', [{
        rollingCredits: rollingSummary.totalCredits,
        rollingUsd: rollingSummary.totalUsd,
        monthCredits: monthSummary.totalCredits,
        monthUsd: monthSummary.totalUsd,
        dayCredits: daySummary.totalCredits,
      }], [
        dataColumn('rollingCredits', { labelKey: 'columnRollingCredits', priority: 'primary' }),
        dataColumn('rollingUsd', { labelKey: 'columnRollingUsd', priority: 'primary' }),
        dataColumn('monthCredits', { labelKey: 'columnMonthCredits', priority: 'primary' }),
        dataColumn('monthUsd', { labelKey: 'columnMonthUsd', priority: 'secondary' }),
        dataColumn('dayCredits', { labelKey: 'columnDailyCredits', priority: 'secondary' }),
      ]),
    ];
  }

  function createDetailsSections({ weekly, sinceReset, month, rolling, result }) {
    return [
      dataView('details-weekly-estimate', 'sectionWeeklyEstimate', [weekly], [
        dataColumn('已用百分比', { priority: 'primary' }),
        dataColumn('剩余比例小数', { priority: 'secondary' }),
        dataColumn('包含重置日_已用折算USD', { labelKey: 'columnIncludedResetUsd', priority: 'primary' }),
        dataColumn('反推周总USD_包含重置日', { labelKey: 'columnIncludedResetTotalUsd', priority: 'primary' }),
        dataColumn('剩余USD_包含重置日口径', { labelKey: 'columnIncludedResetRemainingUsd', priority: 'primary' }),
        dataColumn('包含重置日_已用Credits', { priority: 'secondary' }),
        dataColumn('剩余Credits_包含重置日口径', { priority: 'secondary' }),
        dataColumn('排除重置日_已用折算USD', { priority: 'secondary' }),
        dataColumn('剩余USD_排除重置日口径', { priority: 'secondary' }),
        dataColumn('排除重置日_已用Credits', { priority: 'debug' }),
        dataColumn('剩余Credits_排除重置日口径', { priority: 'debug' }),
        dataColumn('误差说明', { priority: 'debug', wrap: true }),
      ]),
      dataView('details-range-summary', 'sectionRangeSummary', [sinceReset, month, rolling], [
        dataColumn('范围', { priority: 'primary', wrap: true }),
        dataColumn('累计折算USD', { priority: 'primary' }),
        dataColumn('累计Credits', { priority: 'primary' }),
        dataColumn('返回日期桶数', { priority: 'secondary' }),
        dataColumn('累计Token', { priority: 'debug' }),
        dataColumn('累计线程数', { priority: 'debug' }),
        dataColumn('累计轮数', { priority: 'debug' }),
      ]),
      dataView('details-windows', 'sectionWindows', result?.限制窗口概览 || [], [
        dataColumn('名称', { priority: 'primary', wrap: true }),
        dataColumn('已用百分比', { priority: 'primary' }),
        dataColumn('窗口天数', { priority: 'secondary' }),
        dataColumn('本轮开始_本地', { priority: 'secondary', truncate: true }),
        dataColumn('下次重置_本地', { priority: 'secondary', truncate: true }),
        dataColumn('距离重置小时', { priority: 'primary' }),
      ]),
    ];
  }

  function createPanelViews({ weekly, sinceReset, month, rolling, result, historyUsage, archiveHealth, transfer }) {
    const tabs = [
      { id: 'overview', labelKey: 'tabOverview' },
      { id: 'history', labelKey: 'tabHistory' },
      { id: 'details', labelKey: 'tabDetails' },
      { id: 'archive', labelKey: 'tabArchiveWorkspace' },
    ];

    return {
      tabs,
      views: {
        overview: {
          id: 'overview',
          labelKey: 'tabOverview',
          kind: 'sections',
          sections: createOverviewSections({ weekly, sinceReset, month, rolling, archiveHealth }),
        },
        history: {
          id: 'history',
          labelKey: 'tabHistory',
          kind: 'sections',
          sections: createHistorySections(historyUsage),
        },
        details: {
          id: 'details',
          labelKey: 'tabDetails',
          kind: 'sections',
          sections: createDetailsSections({ weekly, sinceReset, month, rolling, result }),
        },
        archive: {
          id: 'archive',
          labelKey: 'tabArchiveWorkspace',
          kind: 'archiveWorkspace',
          actionIds: transfer.actions.map((action) => action.action),
          sections: [
            { type: 'syncBanner' },
            { type: 'archiveSummary' },
            { type: 'note', noteKey: transfer.noteKey },
            { type: 'actions', actions: transfer.actions },
          ],
        },
      },
    };
  }

  function createPrimaryMetrics({ weekly, sinceReset, month, mainSevenDayWindow }) {
    return [
      {
        id: 'remainingUsdIncludingReset',
        type: 'credit',
        labelKey: 'metricRemainingUsdIncludingReset',
        label: '剩余 USD · 含重置日',
        usd: weekly.剩余USD_包含重置日口径,
      },
      {
        id: 'remainingUsdExcludingReset',
        type: 'credit',
        labelKey: 'metricRemainingUsdExcludingReset',
        label: '剩余 USD · 排除重置日',
        usd: weekly.剩余USD_排除重置日口径,
      },
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
        id: 'sevenDayUsedPercent',
        type: 'value',
        labelKey: 'metricSevenDayUsedPercent',
        label: '7 天已用',
        value: weekly.已用百分比 !== undefined ? `${weekly.已用百分比}%` : '-',
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
      {
        id: 'resetCountdown',
        type: 'reset',
        hours: mainSevenDayWindow?.距离重置小时,
      },
    ];
  }

  function createQuotaPanelViewModel({
    result,
    historyUsage,
    archiveSummary,
    importReport,
    storageBackend,
    syncStatus,
  }) {
    const rollingKey = rollingPeriodKey(result);
    const weekly = result?.主7天窗口_上次重置至今?.反推周额度 || {};
    const sinceReset = result?.主7天窗口_上次重置至今?.汇总 || {};
    const month = result?.本月初至今?.汇总 || {};
    const rolling = rollingKey ? result?.[rollingKey]?.汇总 || {} : {};
    const mainSevenDayWindow = (result?.限制窗口概览 || []).find(isMainSevenDayWindow) || null;
    const recentSnapshots = Array.isArray(archiveSummary?.recentSnapshots)
      ? archiveSummary.recentSnapshots.slice(0, 5).map((row) => ({
        capturedAt: row?.capturedAt || '-',
        snapshotId: row?.snapshotId || 'legacy',
        monthlyCredits: row?.monthlyCredits,
        weeklyUsedPercent: row?.weeklyUsedPercent,
      }))
      : [];
    const normalizedSyncStatus = normalizePanelSyncStatus(syncStatus, storageBackend);
    const archiveHealth = {
      isLoaded: Boolean(archiveSummary),
      snapshotCount: archiveSummary?.snapshotCount || 0,
      hasSnapshots: Boolean((archiveSummary?.snapshotCount || 0) > 0),
      earliestCapturedAt: archiveSummary?.earliestCapturedAt || null,
      latestCapturedAt: archiveSummary?.latestCapturedAt || null,
      storageBackendLabel: normalizedSyncStatus.backendLabel,
      importReport,
    };

    const transfer = {
      noteKey: 'transferNote',
      syncStatus: normalizedSyncStatus,
      actions: [
        { action: 'export-archive', labelKey: 'archiveExportAction' },
        { action: 'import-archive', labelKey: 'archiveImportAction' },
      ],
    };
    const panelViews = createPanelViews({
      weekly,
      sinceReset,
      month,
      rolling,
      result,
      historyUsage,
      archiveHealth,
      transfer,
    });

    return {
      rollingKey,
      weekly,
      sinceReset,
      month,
      rolling,
      syncStatus: normalizedSyncStatus,
      syncBanner: createSyncBanner(normalizedSyncStatus),
      archiveHealth,
      transfer,
      tabs: panelViews.tabs,
      views: panelViews.views,
      primaryMetrics: createPrimaryMetrics({
        weekly,
        sinceReset,
        month,
        mainSevenDayWindow,
      }),
      rollingRows: rollingKey ? result?.[rollingKey]?.每日明细 || [] : [],
      sinceResetRows: result?.主7天窗口_上次重置至今?.每日明细 || [],
      sinceResetClients: result?.主7天窗口_上次重置至今?.客户端汇总 || [],
      mainSevenDayWindow,
      history: {
        dayRows: historyUsage?.day?.rows || [],
        daySummary: historyUsage?.day?.summary || {},
        rollingSummary: historyUsage?.rolling?.summary || {},
        monthSummary: historyUsage?.month?.summary || {},
      },
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

  function createSnapshotSyncPort({ archiveStore, getBackendInfo = () => null }) {
    function getSyncStatus() {
      const backendInfo = typeof getBackendInfo === 'function' ? getBackendInfo() : null;
      const backendId = backendInfo?.id || 'unavailable';
      const backendLabel = backendInfo?.label || backendId;
      const crossDeviceCapable = backendId === 'gm';
      const localOnly = backendId === 'localStorage';
      const reason = (() => {
        if (backendId === 'gm') {
          return 'Userscript manager storage is available; cross-device sync depends on the manager sync setting.';
        }
        if (backendId === 'localStorage') {
          return 'localStorage is browser-local and will not sync personal usage history across devices.';
        }
        if (backendId === 'pending') {
          return 'Snapshot Archive storage has not been loaded yet.';
        }
        return 'Snapshot Archive storage is unavailable.';
      })();

      return {
        backendId,
        backendLabel,
        crossDeviceCapable,
        localOnly,
        reason,
      };
    }

    async function getLocalSummary() {
      if (!archiveStore) return null;
      return archiveStore.summarizeArchive();
    }

    async function saveLocalSnapshot(result) {
      if (!archiveStore) return { summary: null, report: null, snapshot: null, archive: null };
      return archiveStore.saveSnapshot(result);
    }

    async function buildSyncPayload() {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      return archiveStore.buildExportDocument();
    }

    async function previewIncomingArchive(documentObject) {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      if (typeof archiveStore.previewImportArchiveDocument !== 'function') {
        throw new Error('Snapshot Archive preview interface is unavailable.');
      }
      return archiveStore.previewImportArchiveDocument(documentObject);
    }

    async function mergeIncomingArchive(documentObject) {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      return archiveStore.importArchiveDocument(documentObject);
    }

    async function queryUsage(query) {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      if (typeof archiveStore.queryArchiveUsage !== 'function') {
        throw new Error('Snapshot Archive query interface is unavailable.');
      }
      return archiveStore.queryArchiveUsage(query || {});
    }

    async function queryHistory(query) {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      if (typeof archiveStore.queryHistory === 'function') {
        return archiveStore.queryHistory(query || {});
      }
      return {
        day: await queryUsage({ ...(query || {}), mode: 'day' }),
        rolling: await queryUsage({ ...(query || {}), mode: 'rolling' }),
        month: await queryUsage({ ...(query || {}), mode: 'month' }),
        timeline: [],
      };
    }

    return {
      getLocalSummary,
      summarize: getLocalSummary,
      saveLocalSnapshot,
      saveLatestResult: saveLocalSnapshot,
      buildSyncPayload,
      exportArchive: buildSyncPayload,
      previewIncomingArchive,
      mergeIncomingArchive,
      importArchiveDocument: mergeIncomingArchive,
      getSyncStatus,
      queryUsage,
      queryHistory,
    };
  }

  globalObject[LIB_NAME] = {
    rollingPeriodKey,
    buildQuotaSnapshotResult,
    createQuotaCalculator,
    createQuotaPanelViewModel,
    createSnapshotSyncPort,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
