(function attachCodexQuotaCompassCoreLib(globalObject) {
  'use strict';

  const LIB_NAME = 'CodexQuotaCompassCoreLib';

  function rollingPeriodKey(result) {
    return Object.keys(result || {}).find((key) => /^近\d+天$/.test(key)) || '';
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

  function createSnapshotSyncPort({ archiveStore }) {
    async function summarize() {
      if (!archiveStore) return null;
      return archiveStore.summarizeArchive();
    }

    async function saveLatestResult(result) {
      if (!archiveStore) return { summary: null, report: null, snapshot: null, archive: null };
      return archiveStore.saveSnapshot(result);
    }

    async function exportArchive() {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      return archiveStore.buildExportDocument();
    }

    async function importArchiveDocument(documentObject) {
      if (!archiveStore) {
        throw new Error('Snapshot Archive library is unavailable.');
      }
      return archiveStore.importArchiveDocument(documentObject);
    }

    return {
      summarize,
      saveLatestResult,
      exportArchive,
      importArchiveDocument,
    };
  }

  globalObject[LIB_NAME] = {
    rollingPeriodKey,
    buildQuotaSnapshotResult,
    createSnapshotSyncPort,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

