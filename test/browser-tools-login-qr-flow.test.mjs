import test from 'node:test'
import assert from 'node:assert/strict'

import { parseArgs } from '../scripts/browser-tools/login-qr.mjs'
import { runLoginCapture } from '../scripts/browser-tools/login-qr-flow.mjs'

function makeClock(start = 0) {
  let now = start
  return {
    now: () => now,
    advance: (ms) => { now += ms },
    async sleep(ms, { signal } = {}) {
      if (signal?.aborted) throw signal.reason
      await new Promise((resolve) => setImmediate(resolve))
      if (signal?.aborted) throw signal.reason
      now += ms
    },
  }
}

function makeHarness(overrides = {}) {
  const calls = []
  const observations = [...(overrides.observations ?? [])]
  const session = {
    async navigate() { calls.push('navigate') },
    async selectTenant() { calls.push('tenant'); return false },
    async exportQr() { calls.push('qr'); return { written: true, method: 'image-data' } },
    async readSnapshot() {
      calls.push('read')
      const next = observations.shift()
      return typeof next === 'function' ? next() : next
    },
    async validateObservation(id) {
      calls.push(`validate:${id}`)
      return overrides.validateObservation ? overrides.validateObservation(id) : true
    },
    async saveState(input) {
      calls.push(`save:${input.observationId ?? 'manual'}`)
      return overrides.saveState?.(input) ?? { committed: true }
    },
    async close() {
      calls.push('close')
      if (overrides.closeError) throw overrides.closeError
    },
  }
  return {
    calls,
    browser: {
      async open() {
        calls.push('open')
        return session
      },
    },
  }
}

function options(overrides = {}) {
  return {
    ...parseArgs(['--login-timeout-ms', '6001', '--wait-after-nav-ms', '0']),
    ...overrides,
  }
}

test('automatic capture saves only from a complete, still-current observation', async () => {
  const harness = makeHarness({
    observations: [{
      kind: 'readable',
      currentUrl: 'https://mi.feishu.cn/file/example',
      bodyText: 'Home',
      qrVisible: false,
      observationId: 'observation-1',
    }],
  })

  const result = await runLoginCapture(options(), {
    browser: harness.browser,
    clock: makeClock(),
    confirm: async () => ({ confirmed: true }),
  })

  assert.equal(result.status, 'saved')
  assert.equal(result.confirmation, 'automatic')
  assert.equal(result.artifacts.state.committed, true)
  assert.deepEqual(harness.calls, [
    'open', 'navigate', 'tenant', 'qr', 'read',
    'validate:observation-1', 'save:observation-1', 'close',
  ])
})

test('automatic deadline starts when QR export completes, before event delivery', async () => {
  const clock = makeClock()
  const harness = makeHarness({ observations: [] })
  const result = await runLoginCapture(options({ loginTimeoutMs: 3000 }), {
    browser: harness.browser,
    clock,
    confirm: async () => ({ confirmed: true }),
    onEvent: async (event) => {
      if (event.type === 'qr-ready') clock.advance(3000)
    },
  })

  assert.equal(result.status, 'timeout')
  assert.equal(harness.calls.includes('read'), false)
})

test('unreadable body or QR observations never become empty successful snapshots', async () => {
  for (const reason of ['BODY_UNREADABLE', 'QR_UNREADABLE', 'BODY_MISSING']) {
    const harness = makeHarness({
      observations: [
        { kind: 'unreadable', reason },
        { kind: 'unreadable', reason },
      ],
    })
    const result = await runLoginCapture(options(), {
      browser: harness.browser,
      clock: makeClock(),
      confirm: async () => ({ confirmed: true }),
    })

    assert.equal(result.status, 'timeout')
    assert.equal(result.error.code, 'LOGIN_TIMEOUT')
    assert.equal(harness.calls.some((call) => call.startsWith('save:')), false)
  }
})

test('navigation or reload invalidates successful observations without resetting the deadline', async () => {
  const harness = makeHarness({
    observations: [
      {
        kind: 'readable', currentUrl: 'https://mi.feishu.cn/file/example', bodyText: 'Home',
        qrVisible: false, observationId: 'before-reload',
      },
      { kind: 'unreadable', reason: 'DOCUMENT_CHANGED' },
    ],
    validateObservation: () => false,
  })

  const result = await runLoginCapture(options(), {
    browser: harness.browser,
    clock: makeClock(),
    confirm: async () => ({ confirmed: true }),
  })

  assert.equal(result.status, 'timeout')
  assert.equal(harness.calls.includes('save:before-reload'), false)
  assert.equal(harness.calls.filter((call) => call === 'read').length, 2)
})

test('state export that detects a changed observation retries within the original deadline', async () => {
  let saves = 0
  const harness = makeHarness({
    observations: [
      {
        kind: 'readable', currentUrl: 'https://mi.feishu.cn/file/one', bodyText: 'Home',
        qrVisible: false, observationId: 'one',
      },
      {
        kind: 'readable', currentUrl: 'https://mi.feishu.cn/file/two', bodyText: 'Home',
        qrVisible: false, observationId: 'two',
      },
    ],
    saveState: async () => {
      saves += 1
      return saves === 1 ? { committed: false, reason: 'OBSERVATION_CHANGED' } : { committed: true }
    },
  })

  const result = await runLoginCapture(options({ loginTimeoutMs: 7000 }), {
    browser: harness.browser,
    clock: makeClock(),
    confirm: async () => ({ confirmed: true }),
  })

  assert.equal(result.status, 'saved')
  assert.equal(saves, 2)
})

test('deadline expiry reported by state export becomes the original timeout', async () => {
  let saveInput
  const harness = makeHarness({
    observations: [{
      kind: 'readable', currentUrl: 'https://mi.feishu.cn/file/example', bodyText: 'Home',
      qrVisible: false, observationId: 'before-slow-export',
    }],
    saveState: async (input) => {
      saveInput = input
      return { committed: false, reason: 'DEADLINE_EXPIRED' }
    },
  })
  const clock = makeClock()

  const result = await runLoginCapture(options({ loginTimeoutMs: 4000 }), {
    browser: harness.browser,
    clock,
    confirm: async () => ({ confirmed: true }),
  })

  assert.equal(result.status, 'timeout')
  assert.equal(result.error.code, 'LOGIN_TIMEOUT')
  assert.equal(result.artifacts.state.committed, false)
  assert.equal(saveInput.deadline, 4000)
  assert.equal(saveInput.clock, clock)
})

test('deadline rejects zero-length, boundary, and slow observations', async () => {
  for (const timeout of [0, 2999, 3000]) {
    const harness = makeHarness({ observations: [] })
    const result = await runLoginCapture(options({ loginTimeoutMs: timeout }), {
      browser: harness.browser,
      clock: makeClock(),
      confirm: async () => ({ confirmed: true }),
    })
    assert.equal(result.status, 'timeout')
    assert.equal(harness.calls.includes('read'), false)
  }

  let settleLateRead
  const lateRead = new Promise((resolve) => { settleLateRead = resolve })
  const harness = makeHarness({ observations: [() => lateRead] })
  const result = await runLoginCapture(options({ loginTimeoutMs: 4000 }), {
    browser: harness.browser,
    clock: makeClock(),
    confirm: async () => ({ confirmed: true }),
  })
  settleLateRead({
    kind: 'readable', currentUrl: 'https://mi.feishu.cn/file/example', bodyText: 'Home',
    qrVisible: false, observationId: 'late',
  })
  await Promise.resolve()

  assert.equal(result.status, 'timeout')
  assert.equal(harness.calls.some((call) => call.startsWith('save:')), false)
})

test('no-wait takes priority over manual confirmation and never reads or saves', async () => {
  const harness = makeHarness()
  let confirmations = 0
  const result = await runLoginCapture(options({ waitForLogin: false, manualConfirm: true }), {
    browser: harness.browser,
    clock: makeClock(),
    confirm: async () => { confirmations += 1; return { confirmed: true } },
  })

  assert.equal(result.status, 'qr-only')
  assert.equal(confirmations, 0)
  assert.equal(harness.calls.includes('read'), false)
  assert.equal(harness.calls.some((call) => call.startsWith('save:')), false)
})

test('manual mode saves only after an explicit Enter confirmation', async () => {
  for (const confirmation of [
    { confirmed: true },
    { confirmed: false, reason: 'EOF' },
    { confirmed: false, reason: 'NOT_TTY' },
  ]) {
    const harness = makeHarness()
    const result = await runLoginCapture(options({ manualConfirm: true }), {
      browser: harness.browser,
      clock: makeClock(),
      confirm: async () => confirmation,
    })

    assert.equal(result.status, confirmation.confirmed ? 'saved' : 'error')
    assert.equal(harness.calls.some((call) => call.startsWith('save:')), confirmation.confirmed)
  }
})

test('timeout remains the primary result when cleanup also fails', async () => {
  const harness = makeHarness({ closeError: new Error('sensitive close detail') })
  const result = await runLoginCapture(options({ loginTimeoutMs: 0 }), {
    browser: harness.browser,
    clock: makeClock(),
    confirm: async () => ({ confirmed: true }),
  })

  assert.equal(result.status, 'timeout')
  assert.equal(result.error.code, 'LOGIN_TIMEOUT')
  assert.deepEqual(result.cleanup, { status: 'failed', code: 'CLOSE_FAILED' })
  assert.equal(JSON.stringify(result).includes('sensitive'), false)
})

test('a committed state remains reported when cleanup fails', async () => {
  const harness = makeHarness({ closeError: new Error('close failed') })
  const result = await runLoginCapture(options({ manualConfirm: true }), {
    browser: harness.browser,
    clock: makeClock(),
    confirm: async () => ({ confirmed: true }),
  })

  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'CLOSE_FAILED')
  assert.equal(result.artifacts.state.committed, true)
})

test('event failures are reduced to a fixed warning and cannot expose observations', async () => {
  const harness = makeHarness({ observations: [] })
  const events = []
  const result = await runLoginCapture(options({ loginTimeoutMs: 0 }), {
    browser: harness.browser,
    clock: makeClock(),
    confirm: async () => ({ confirmed: true }),
    onEvent: async (event) => {
      events.push(event)
      throw new Error('event sink secret')
    },
  })

  assert.ok(result.warnings.includes('EVENT_HANDLER_FAILED'))
  assert.equal(JSON.stringify({ result, events }).includes('event sink secret'), false)
  assert.equal(events.some((event) => 'bodyText' in event || 'currentUrl' in event), false)
})
