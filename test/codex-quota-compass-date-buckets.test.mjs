// Node re-reads TZ on assignment; set it before any Date is formatted so the
// local-bucket helpers run against a zone with daylight-saving transitions.
process.env.TZ = 'America/New_York';

import test from 'node:test';
import assert from 'node:assert/strict';

const { addDaysLocalMs, firstDayOfMonthLocal, firstDayOfMonthUTC, ymdLocal, ymdUTC } =
  await import('../src/userscripts/codex-quota-compass/codex-quota-compass-core.lib.js');

test('local date buckets follow the wall clock across the spring-forward transition', () => {
  // 2026-03-08 02:00 EST -> 03:00 EDT.
  const lateEvening = Date.parse('2026-03-08T03:30:00Z'); // 22:30 EST on 03-07
  assert.equal(ymdLocal(lateEvening), '2026-03-07');
  assert.equal(ymdUTC(lateEvening), '2026-03-08');

  const localMidnight = new Date(2026, 2, 7).getTime();
  assert.equal(ymdLocal(addDaysLocalMs(localMidnight, 1)), '2026-03-08');
  const afterGap = addDaysLocalMs(localMidnight, 2);
  assert.equal(ymdLocal(afterGap), '2026-03-09');
  assert.equal(new Date(afterGap).getHours(), 0);
  assert.equal(afterGap - localMidnight, 47 * 60 * 60 * 1000);
});

test('local date buckets follow the wall clock across the fall-back transition', () => {
  // 2026-11-01 02:00 EDT -> 01:00 EST.
  const localMidnight = new Date(2026, 9, 31).getTime();
  const afterOverlap = addDaysLocalMs(localMidnight, 2);
  assert.equal(ymdLocal(afterOverlap), '2026-11-02');
  assert.equal(afterOverlap - localMidnight, 49 * 60 * 60 * 1000);

  const monthEdge = Date.parse('2026-11-01T03:00:00Z'); // 23:00 EDT on 10-31
  assert.equal(firstDayOfMonthLocal(monthEdge), '2026-10-01');
  assert.equal(firstDayOfMonthUTC(monthEdge), '2026-11-01');
  assert.equal(ymdLocal(monthEdge), '2026-10-31');
});
