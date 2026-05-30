import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/codex-quota-compass-archive.lib.js');

const {
  createSnapshotArchiveStore,
  normalizeSnapshotArchive,
} = globalThis.CodexQuotaCompassArchiveLib;

function createFixtureResult(overrides = {}) {
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
      {
        名称: '主限制 - 7天窗口',
        已用百分比: 42,
        本轮开始_UTC: '2026-05-24 00:00:00 UTC',
        下次重置_UTC: '2026-05-31 00:00:00 UTC',
      },
    ],
    主7天窗口_上次重置至今: {
      汇总: {
        范围: '上次重置至今近似 2026-05-24 ~ 2026-05-30',
        API_start_date: '2026-05-24',
        API_end_date_排他: '2026-05-31',
        返回日期桶数: 7,
        累计Credits: 123.456,
        累计折算USD: 4.94,
      },
      反推周额度: {
        已用百分比: 42,
      },
      每日明细: [
        { 日期桶: '2026-05-30', Credits: 10.5, 折算USD: 0.42 },
      ],
      客户端汇总: [
        { 客户端: 'chatgpt-web', Credits: 10.5, 折算USD: 0.42 },
      ],
    },
    本月初至今: {
      汇总: {
        范围: '本月初至今 2026-05-01 ~ 2026-05-30',
        API_start_date: '2026-05-01',
        API_end_date_排他: '2026-05-31',
        返回日期桶数: 30,
        累计Credits: 999.1,
        累计折算USD: 39.96,
      },
      每日明细: [],
      客户端汇总: [],
    },
    近30天: {
      汇总: {
        范围: '近30天 2026-05-01 ~ 2026-05-30',
        API_start_date: '2026-05-01',
        API_end_date_排他: '2026-05-31',
        返回日期桶数: 30,
        累计Credits: 777.7,
        累计折算USD: 31.11,
      },
      每日明细: [],
      客户端汇总: [],
    },
    ...overrides,
  };
}

function createMemoryStore(initialRaw = null) {
  let raw = initialRaw;

  return {
    read: async () => raw,
    write: async (value) => {
      raw = value;
      return value;
    },
    dump: () => raw,
  };
}

test('saveSnapshot records one Quota Snapshot in an empty Snapshot Archive', async () => {
  const storage = createMemoryStore();
  const store = createSnapshotArchiveStore({
    read: storage.read,
    write: storage.write,
    now: () => '2026-05-30T10:00:00.000Z',
    createId: () => 'snapshot-1',
    scriptVersion: '0.1.3',
  });

  const saved = await store.saveSnapshot(createFixtureResult());

  assert.equal(saved.report.added, 1);
  assert.equal(saved.summary.snapshotCount, 1);
  assert.equal(saved.snapshot.snapshotId, 'snapshot-1');
  assert.equal(saved.snapshot.periodSummaries.monthToDate.totalCredits, 999.1);
  assert.equal(saved.snapshot.periodDetails.sinceReset.dailyBuckets.length, 1);
  assert.equal(storage.dump().snapshots.length, 1);
});

test('importArchiveDocument merges new Quota Snapshots and skips duplicate Snapshot IDs', async () => {
  const sourceStorage = createMemoryStore();
  const sourceStore = createSnapshotArchiveStore({
    read: sourceStorage.read,
    write: sourceStorage.write,
    now: () => '2026-05-30T10:00:00.000Z',
    createId: () => 'snapshot-1',
    scriptVersion: '0.1.3',
  });

  await sourceStore.saveSnapshot(createFixtureResult());
  const exportDocument = await sourceStore.buildExportDocument();

  const targetStorage = createMemoryStore();
  const targetStore = createSnapshotArchiveStore({
    read: targetStorage.read,
    write: targetStorage.write,
    now: () => '2026-05-30T11:00:00.000Z',
    createId: () => 'snapshot-2',
    scriptVersion: '0.1.3',
  });

  const firstImport = await targetStore.importArchiveDocument(exportDocument);
  const secondImport = await targetStore.importArchiveDocument(exportDocument);

  assert.deepEqual(firstImport.report, { added: 1, skipped: 0, invalid: 0 });
  assert.deepEqual(secondImport.report, { added: 0, skipped: 1, invalid: 0 });
  assert.equal(secondImport.summary.snapshotCount, 1);
});

test('normalizeSnapshotArchive upgrades a legacy snapshot array into the Snapshot Archive shape', () => {
  const archive = normalizeSnapshotArchive([
    {
      snapshotId: null,
      capturedAt: '2026-05-30T10:00:00.000Z',
      scriptVersion: '0.1.2',
      periodSummaries: {},
      periodDetails: {},
      sourceContext: {},
      windowSnapshot: [],
    },
  ]);

  assert.equal(archive.schemaVersion, 1);
  assert.equal(archive.snapshots.length, 1);
  assert.equal(archive.snapshots[0].capturedAt, '2026-05-30T10:00:00.000Z');
});
