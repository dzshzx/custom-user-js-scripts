import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/userscripts/codex-quota-compass/codex-quota-compass-contract.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-ledger.lib.js');
await import('../src/userscripts/codex-quota-compass/codex-quota-compass-archive.lib.js');

const {
  createSnapshotArchiveQuery,
  createSnapshotArchiveStore,
  migrateArchive,
  mergeSnapshots,
  normalizeSnapshotArchive,
  previewImportArchiveDocument,
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

test('two device Snapshot Archives converge after exchanging Snapshot Exports', async () => {
  const deviceAStorage = createMemoryStore();
  const deviceAStore = createSnapshotArchiveStore({
    read: deviceAStorage.read,
    write: deviceAStorage.write,
    now: () => '2026-05-30T10:00:00.000Z',
    createId: () => 'device-a-snapshot',
    scriptVersion: '0.1.9',
  });
  const deviceBStorage = createMemoryStore();
  const deviceBStore = createSnapshotArchiveStore({
    read: deviceBStorage.read,
    write: deviceBStorage.write,
    now: () => '2026-05-31T10:00:00.000Z',
    createId: () => 'device-b-snapshot',
    scriptVersion: '0.1.9',
  });

  await deviceAStore.saveSnapshot(createFixtureResult(), { capturedAt: '2026-05-30T10:00:00.000Z' });
  await deviceBStore.saveSnapshot(createFixtureResult({
    本月初至今: {
      ...createFixtureResult().本月初至今,
      汇总: {
        ...createFixtureResult().本月初至今.汇总,
        累计Credits: 456,
      },
    },
  }), { capturedAt: '2026-05-31T10:00:00.000Z' });

  const exportA = await deviceAStore.buildExportDocument();
  const exportB = await deviceBStore.buildExportDocument();

  await deviceAStore.importArchiveDocument(exportB);
  await deviceBStore.importArchiveDocument(exportA);

  const idsA = normalizeSnapshotArchive(deviceAStorage.dump()).snapshots.map((snapshot) => snapshot.snapshotId);
  const idsB = normalizeSnapshotArchive(deviceBStorage.dump()).snapshots.map((snapshot) => snapshot.snapshotId);

  assert.deepEqual(idsA, ['device-a-snapshot', 'device-b-snapshot']);
  assert.deepEqual(idsB, idsA);
});

test('previewImportArchiveDocument reports incoming changes without writing storage', async () => {
  const storage = createMemoryStore();
  const store = createSnapshotArchiveStore({
    read: storage.read,
    write: storage.write,
    now: () => '2026-05-30T10:00:00.000Z',
    createId: () => 'snapshot-1',
    scriptVersion: '0.1.9',
  });

  await store.saveSnapshot(createFixtureResult());
  const beforePreview = storage.dump();
  const preview = await store.previewImportArchiveDocument({
    format: 'codex-quota-compass.snapshot-archive',
    version: 1,
    exportedAt: '2026-05-30T11:00:00.000Z',
    snapshotCount: 2,
    snapshots: [
      beforePreview.snapshots[0],
      {
        snapshotId: 'snapshot-2',
        capturedAt: '2026-05-31T10:00:00.000Z',
        scriptVersion: '0.1.9',
        periodSummaries: {},
        periodDetails: {},
        sourceContext: {},
        windowSnapshot: [],
      },
      { snapshotId: 'invalid-without-captured-at' },
    ],
  });

  assert.deepEqual(preview.report, { added: 1, skipped: 1, invalid: 1 });
  assert.equal(preview.summary.snapshotCount, 2);
  assert.equal(storage.dump(), beforePreview);

  const directPreview = previewImportArchiveDocument(beforePreview, {
    format: 'codex-quota-compass.snapshot-archive',
    version: 1,
    snapshots: [{ snapshotId: 'invalid-without-captured-at' }],
  });
  assert.deepEqual(directPreview.report, { added: 0, skipped: 0, invalid: 1 });
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

  assert.equal(archive.schemaVersion, 2);
  assert.equal(archive.snapshots.length, 1);
  assert.equal(archive.snapshots[0].capturedAt, '2026-05-30T10:00:00.000Z');
});

test('mergeSnapshots deduplicates stable-key and legacy main seven-day windows', () => {
  const legacySnapshot = {
    snapshotId: null,
    capturedAt: '2026-05-30T10:00:00.000Z',
    scriptVersion: '0.2.0',
    periodSummaries: {
      sinceReset: {
        startDate: '2026-05-24',
        endExclusiveDate: '2026-05-31',
        totalCredits: 123.456,
      },
    },
    periodDetails: {},
    sourceContext: {},
    windowSnapshot: [
      {
        名称: '主限制 - 7天窗口',
        本轮开始_UTC: '2026-05-24 00:00:00 UTC',
        下次重置_UTC: '2026-05-31 00:00:00 UTC',
      },
    ],
  };
  const stableKeySnapshot = {
    ...legacySnapshot,
    windowSnapshot: [
      {
        窗口Key: 'main.sevenDayWindow',
        名称: '主 7 天窗口',
        本轮开始_UTC: '2026-05-24 00:00:00 UTC',
        下次重置_UTC: '2026-05-31 00:00:00 UTC',
      },
    ],
  };

  const merged = mergeSnapshots({ snapshots: [legacySnapshot] }, [stableKeySnapshot]);

  assert.deepEqual(merged.report, { added: 0, skipped: 1, invalid: 0 });
  assert.equal(merged.archive.snapshots.length, 1);
});

test('queryArchiveUsage returns day rows and period summary from stored snapshots', async () => {
  const storage = createMemoryStore();
  const store = createSnapshotArchiveStore({
    read: storage.read,
    write: storage.write,
    now: () => '2026-05-30T10:00:00.000Z',
    createId: () => 'snapshot-1',
    scriptVersion: '0.1.6',
  });

  await store.saveSnapshot(createFixtureResult());
  const dayQuery = await store.queryArchiveUsage({
    mode: 'day',
    startDate: '2026-05-30',
    endDate: '2026-05-31',
  });
  const rollingQuery = await store.queryArchiveUsage({
    mode: 'rolling',
    periodDays: 30,
  });

  assert.equal(dayQuery.mode, 'day');
  assert.equal(dayQuery.rows.length, 1);
  assert.equal(dayQuery.rows[0].date, '2026-05-30');
  assert.equal(dayQuery.summary.totalCredits, 10.5);
  assert.equal(rollingQuery.mode, 'rolling');
  assert.equal(rollingQuery.summary.periodDays, 30);
  assert.equal(rollingQuery.summary.totalCredits, 777.7);
});

test('queryHistory returns latest period summaries and snapshot timeline', async () => {
  const storage = createMemoryStore();
  const ids = ['snapshot-1', 'snapshot-2'];
  const store = createSnapshotArchiveStore({
    read: storage.read,
    write: storage.write,
    now: () => '2026-05-30T10:00:00.000Z',
    createId: () => ids.shift(),
    scriptVersion: '0.1.9',
  });
  const older = createFixtureResult();
  older['本月初至今'].汇总.累计Credits = 100;
  older['近30天'].汇总.累计Credits = 200;
  const newer = createFixtureResult();
  newer['本月初至今'].汇总.累计Credits = 300;
  newer['近30天'].汇总.累计Credits = 400;

  await store.saveSnapshot(older, { capturedAt: '2026-05-29T10:00:00.000Z' });
  await store.saveSnapshot(newer, { capturedAt: '2026-05-30T10:00:00.000Z' });

  const history = await store.queryHistory({
    startDate: '2026-05-30',
    endDate: '2026-05-31',
    periodDays: 30,
    timelineLimit: 2,
  });

  assert.equal(history.month.summary.totalCredits, 300);
  assert.equal(history.rolling.summary.totalCredits, 400);
  assert.equal(history.rolling.summary.periodDays, 30);
  assert.equal(history.day.rows.length, 1);
  assert.equal(history.timeline.length, 2);
  assert.equal(history.timeline[0].snapshotId, 'snapshot-2');
  assert.equal(history.timeline[1].snapshotId, 'snapshot-1');

  const directQuery = createSnapshotArchiveQuery(storage.dump());
  assert.equal(directQuery.latestPeriodSummaries().month.summary.totalCredits, 300);
  assert.equal(directQuery.queryPeriodSummaries({ periodDays: 30 }).rolling.summary.periodDays, 30);
  assert.equal(directQuery.queryLatestUsage({ mode: 'month' }).summary.totalCredits, 300);
  assert.equal(directQuery.queryTimeline({ limit: 1 }).length, 1);
  assert.equal(directQuery.queryTimeline({ limit: 1 })[0].snapshotId, 'snapshot-2');
});

function snapshotWithDays(snapshotId, capturedAt, days) {
  return {
    snapshotId,
    capturedAt,
    scriptVersion: '0.3.1',
    sourceContext: { usdPerCredit: 0.04 },
    windowSnapshot: [],
    periodSummaries: {},
    periodDetails: {
      rolling: {
        dailyBuckets: days.map(([date, credits]) => ({ 日期桶: date, Credits: credits, 折算USD: credits * 0.04 })),
      },
    },
  };
}

test('migrateArchive folds legacy snapshots into a one-row-per-date ledger (lossless, idempotent, capped)', () => {
  // 7 snapshots over 3 settled dates; 2026-06-13 grows across snapshots.
  const raw = {
    schemaVersion: 1,
    snapshots: [
      snapshotWithDays('s1', '2026-06-13T09:00:00.000Z', [['2026-06-11', 1000], ['2026-06-12', 2000], ['2026-06-13', 30]]),
      snapshotWithDays('s2', '2026-06-13T12:00:00.000Z', [['2026-06-11', 1000], ['2026-06-12', 2000], ['2026-06-13', 60]]),
      snapshotWithDays('s3', '2026-06-13T15:00:00.000Z', [['2026-06-11', 1000], ['2026-06-12', 2000], ['2026-06-13', 90]]),
      snapshotWithDays('s4', '2026-06-14T01:00:00.000Z', [['2026-06-13', 90], ['2026-06-14', 5]]),
      snapshotWithDays('s5', '2026-06-14T10:00:00.000Z', [['2026-06-13', 90], ['2026-06-14', 40]]),
      snapshotWithDays('s6', '2026-06-15T01:00:00.000Z', [['2026-06-14', 40], ['2026-06-15', 7]]),
      snapshotWithDays('s7', '2026-06-15T10:00:00.000Z', [['2026-06-14', 40], ['2026-06-15', 88]]),
    ],
  };
  const now = Date.parse('2026-06-16T02:00:00.000Z'); // all dates settled

  const migrated = migrateArchive(raw, now);

  // one row per distinct date, with the final/max value — no loss
  assert.deepEqual(Object.keys(migrated.ledger).sort(), ['2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15']);
  assert.equal(migrated.ledger['2026-06-13'].credits, 90);
  assert.equal(migrated.ledger['2026-06-14'].credits, 40);
  assert.equal(migrated.ledger['2026-06-15'].credits, 88);
  assert.equal(migrated.ledger['2026-06-11'].settled, true);

  // raw snapshots capped to last 5
  assert.equal(migrated.snapshots.length, 5);

  // idempotent: migrating the already-migrated archive yields the same ledger
  const again = migrateArchive(migrated, now);
  assert.deepEqual(again.ledger, migrated.ledger);
});

test('repeated same-day saves do not multiply ledger rows or exceed the snapshot cap', async () => {
  let raw = null;
  let seq = 0;
  const result = {
    配置: { 日期桶模式: 'utc', USD_PER_CREDIT: 0.04, ROLLING_DAYS: 30 },
    时区诊断: { 浏览器本地时区: 'Asia/Shanghai', API_end_date_排他: '2026-06-06' },
    限制窗口概览: [{ 名称: '主限制 - 7天窗口', 已用百分比: 10, 本轮开始_UTC: '2026-06-01 00:00:00 UTC' }],
    主7天窗口_上次重置至今: { 汇总: {}, 反推周额度: { 已用百分比: 10 }, 每日明细: [], 客户端汇总: [] },
    本月初至今: { 汇总: {}, 每日明细: [], 客户端汇总: [] },
    近30天: {
      汇总: {},
      每日明细: [
        { 日期桶: '2026-06-01', Credits: 100, 折算USD: 4 },
        { 日期桶: '2026-06-02', Credits: 200, 折算USD: 8 },
      ],
      客户端汇总: [],
    },
  };
  const store = createSnapshotArchiveStore({
    read: async () => raw,
    write: async (next) => { raw = next; return next; },
    now: () => '2026-06-05T12:00:00.000Z', // both dates settled
    createId: () => `snap-${(seq += 1)}`,
    scriptVersion: '0.3.1',
  });

  for (let i = 0; i < 7; i += 1) {
    await store.saveSnapshot(result, { capturedAt: `2026-06-05T0${i}:00:00.000Z` });
  }

  const dump = normalizeSnapshotArchive(raw);
  assert.deepEqual(Object.keys(dump.ledger).sort(), ['2026-06-01', '2026-06-02'], 'ledger rows == distinct dates, not 7x');
  assert.equal(dump.ledger['2026-06-02'].credits, 200);
  assert.equal(dump.snapshots.length, 5, 'snapshots capped at 5 regardless of save count');

  const cost = await store.queryLedgerCost({ nowMs: Date.parse('2026-06-05T12:00:00.000Z') });
  assert.equal(cost.cycleStartDate, '2026-06-01');
  assert.equal(cost.cycle.totalCredits, 300);
  assert.equal(cost.month.totalCredits, 300);
});
