import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-contract.lib.js');

const {
  createQuotaSnapshotAccess,
  isMainSevenDayWindow,
  projectQuotaSnapshotForArchive,
  rollingPeriodKey,
} = globalThis.CodexQuotaCompassContractLib;

function createFixtureResult() {
  return {
    配置: {
      日期桶模式: 'utc',
      USD_PER_CREDIT: 0.04,
      ROLLING_DAYS: 30,
    },
    时区诊断: {
      浏览器本地时区: 'Asia/Shanghai',
      API_end_date_排他: '2026-05-31',
    },
    限制窗口概览: [
      { 窗口Key: 'other', 名称: 'Other' },
      {
        窗口Key: 'main.sevenDayWindow',
        名称: '主限制 - 7天窗口',
        距离重置小时: 12,
      },
    ],
    主7天窗口_上次重置至今: {
      汇总: {
        范围: 'Reset to now',
        API_start_date: '2026-05-24',
        API_end_date_排他: '2026-05-31',
        累计Credits: 20,
        累计折算USD: 0.8,
        返回日期桶数: 7,
      },
      反推周额度: { 已用百分比: 40 },
      每日明细: [{ 日期桶: '2026-05-30', Credits: 20 }],
      客户端汇总: [{ 客户端: 'chatgpt-web' }],
    },
    本月初至今: {
      汇总: {
        范围: 'Month',
        API_start_date: '2026-05-01',
        API_end_date_排他: '2026-05-31',
        累计Credits: 100,
        累计折算USD: 4,
        返回日期桶数: 30,
      },
      每日明细: [],
      客户端汇总: [],
    },
    近30天: {
      汇总: {
        范围: 'Rolling',
        API_start_date: '2026-05-01',
        API_end_date_排他: '2026-05-31',
        累计Credits: 200,
        累计折算USD: 8,
        返回日期桶数: 30,
      },
      每日明细: [{ 日期桶: '2026-05-29', Credits: 10 }],
      客户端汇总: [],
    },
  };
}

test('contract access centralizes rolling period and main window lookup', () => {
  const result = createFixtureResult();
  const access = createQuotaSnapshotAccess(result);

  assert.equal(rollingPeriodKey(result), '近30天');
  assert.equal(isMainSevenDayWindow({ 名称: '主限制 - 7天窗口' }), true);
  assert.equal(access.rollingKey, '近30天');
  assert.equal(access.mainSevenDayWindow.距离重置小时, 12);
  assert.equal(access.sinceReset.weeklyEstimate.已用百分比, 40);
  assert.equal(access.rolling.dailyRows.length, 1);
});

test('contract projection produces Snapshot Archive fields without changing schema names', () => {
  const projection = projectQuotaSnapshotForArchive(createFixtureResult());

  assert.equal(projection.sourceContext.dateBucketMode, 'utc');
  assert.equal(projection.windowSnapshot.length, 2);
  assert.equal(projection.periodSummaries.sinceReset.periodKey, 'sinceReset');
  assert.equal(projection.periodSummaries.sinceReset.usedPercent, 40);
  assert.equal(projection.periodSummaries.monthToDate.totalCredits, 100);
  assert.equal(projection.periodSummaries.rolling.periodName, '近30天');
  assert.equal(projection.periodDetails.sinceReset.dailyBuckets.length, 1);
  assert.equal(projection.periodDetails.sinceReset.weeklyEstimate.已用百分比, 40);
});
