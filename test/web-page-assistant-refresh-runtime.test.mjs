import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInstallableBlock } from './helpers/installable-block-loader.mjs';

const loadRefreshRuntimeFactory = () => loadInstallableBlock({
  markerPrefix: 'WEB_PAGE_ASSISTANT_REFRESH_RUNTIME',
  returnExpression: 'createRefreshRuntime',
});

function createHarness() {
  let nowMs = 0;
  let intervalHandler = null;
  let nextTimer = 1;
  const clearedTimers = [];
  const reloads = [];
  const states = [];
  const createRefreshRuntime = createHarness.factory;
  const runtime = createRefreshRuntime({
    minIntervalMs: 1000,
    tickMs: 1000,
    now: () => nowMs,
    setInterval(handler, delay) {
      intervalHandler = handler;
      return { id: nextTimer++, delay };
    },
    clearInterval(timer) {
      clearedTimers.push(timer);
    },
    reload() {
      reloads.push(nowMs);
    },
    onStateChange(state) {
      states.push(state);
    },
  });

  return {
    runtime,
    states,
    reloads,
    clearedTimers,
    get intervalHandler() {
      return intervalHandler;
    },
    setNow(value) {
      nowMs = value;
    },
  };
}

createHarness.factory = await loadRefreshRuntimeFactory();

test('refresh runtime starts active countdown and emits remaining time', () => {
  const harness = createHarness();

  harness.runtime.restart({ scope: 'page', setting: { intervalMs: 5000 } });
  assert.equal(harness.states.at(-1).remainingMs, 5000);

  harness.setNow(2000);
  harness.intervalHandler();
  assert.equal(harness.states.at(-1).remainingMs, 3000);
  assert.deepEqual(harness.reloads, []);
});

test('refresh runtime pauses and resumes against the fake clock', () => {
  const harness = createHarness();

  harness.runtime.restart({ scope: 'site', setting: { intervalMs: 5000 } });
  harness.setNow(2000);
  const paused = harness.runtime.togglePause();

  assert.equal(paused.isPaused, true);
  assert.equal(paused.remainingMs, 3000);
  assert.equal(harness.clearedTimers.length, 1);

  harness.setNow(10000);
  const resumed = harness.runtime.togglePause();
  assert.equal(resumed.isPaused, false);
  assert.equal(resumed.remainingMs, 3000);
});

test('refresh runtime clears timer and reloads when countdown expires', () => {
  const harness = createHarness();

  harness.runtime.restart({ scope: 'page', setting: { intervalMs: 1000 } });
  harness.setNow(1001);
  harness.intervalHandler();

  assert.deepEqual(harness.reloads, [1001]);
  assert.equal(harness.states.at(-1).isRefreshing, true);
  assert.equal(harness.clearedTimers.length, 1);
});

test('refresh runtime stop clears active match and timer', () => {
  const harness = createHarness();

  harness.runtime.restart({ scope: 'page', setting: { intervalMs: 5000 } });
  harness.runtime.stop();

  assert.equal(harness.runtime.getState().activeMatch, null);
  assert.equal(harness.runtime.getState().remainingMs, 0);
  assert.equal(harness.clearedTimers.length, 1);
});
