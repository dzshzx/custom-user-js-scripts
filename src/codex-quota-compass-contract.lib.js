(function attachCodexQuotaCompassContractLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassContractLib';
  const MAIN_SEVEN_DAY_WINDOW_KEY = 'main.sevenDayWindow';
  const SINCE_RESET_KEY = '主7天窗口_上次重置至今';
  const MONTH_TO_DATE_KEY = '本月初至今';

  function rollingPeriodKey(result) {
    return Object.keys(result || {}).find((key) => /^近\d+天$/.test(key)) || '';
  }

  function isMainSevenDayWindow(row) {
    return row?.窗口Key === MAIN_SEVEN_DAY_WINDOW_KEY || row?.名称 === '主限制 - 7天窗口';
  }

  function arrayOrEmpty(value) {
    return Array.isArray(value) ? value : [];
  }

  function objectOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function createPeriodAccess(section, periodName = '') {
    const period = objectOrEmpty(section);
    return {
      raw: period,
      periodName,
      summary: objectOrEmpty(period['汇总']),
      weeklyEstimate: objectOrEmpty(period['反推周额度']),
      dailyRows: arrayOrEmpty(period['每日明细']),
      clientSummaries: arrayOrEmpty(period['客户端汇总']),
    };
  }

  function createQuotaSnapshotAccess(result) {
    const source = objectOrEmpty(result);
    const rollingKey = rollingPeriodKey(source);
    const windows = arrayOrEmpty(source['限制窗口概览']);
    const sinceReset = createPeriodAccess(source[SINCE_RESET_KEY], SINCE_RESET_KEY);
    const monthToDate = createPeriodAccess(source[MONTH_TO_DATE_KEY], MONTH_TO_DATE_KEY);
    const rolling = createPeriodAccess(rollingKey ? source[rollingKey] : null, rollingKey);

    return {
      result: source,
      rollingKey,
      config: objectOrEmpty(source['配置']),
      diagnostics: objectOrEmpty(source['时区诊断']),
      windows,
      mainSevenDayWindow: windows.find(isMainSevenDayWindow) || null,
      sinceReset,
      monthToDate,
      rolling,
    };
  }

  function projectPeriodSummary(period, periodKey, overrides = {}) {
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

  function projectPeriodDetails(period, extra = {}) {
    return {
      dailyBuckets: period.dailyRows,
      clientSummaries: period.clientSummaries,
      ...extra,
    };
  }

  function projectQuotaSnapshotForArchive(result) {
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

  globalObject[LIB_NAME] = Object.freeze({
    rollingPeriodKey,
    isMainSevenDayWindow,
    createQuotaSnapshotAccess,
    projectQuotaSnapshotForArchive,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
