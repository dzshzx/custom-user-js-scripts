import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { runCli, waitForManualConfirmation } from '../scripts/browser-tools/login-qr.mjs'

test('manual confirmation distinguishes Enter, EOF, and non-TTY input', async () => {
  const entered = new PassThrough()
  entered.isTTY = true
  entered.end('\n')
  assert.deepEqual(
    await waitForManualConfirmation({ input: entered, output: new PassThrough() }),
    { confirmed: true },
  )

  const ended = new PassThrough()
  ended.isTTY = true
  ended.end()
  assert.deepEqual(
    await waitForManualConfirmation({ input: ended, output: new PassThrough() }),
    { confirmed: false, reason: 'EOF' },
  )

  const piped = new PassThrough()
  piped.isTTY = false
  assert.deepEqual(
    await waitForManualConfirmation({ input: piped, output: new PassThrough() }),
    { confirmed: false, reason: 'NOT_TTY' },
  )
})

test('CLI waits for cleanup and maps SIGINT and SIGTERM to 130 and 143', async () => {
  for (const [signalName, expectedCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const runtime = new EventEmitter()
    const lines = []
    let cleaned = false
    const capture = async (_options, { signal }) => new Promise((resolve) => {
      signal.addEventListener('abort', () => {
        queueMicrotask(() => {
          cleaned = true
          resolve({
            status: 'error', phase: 'wait', confirmation: null,
            artifacts: { qr: { path: '/qr', written: true }, state: { path: '/state', committed: false }, profile: { path: '/profile', opened: true } },
            error: { code: 'CANCELLED', phase: 'wait' }, cleanup: { status: 'closed' },
            lastObservation: null, warnings: [],
          })
        })
      }, { once: true })
    })

    const running = runCli([], {
      runtime,
      capture,
      browser: {},
      stdout: { write: (line) => lines.push(line) },
      stderr: { write: (line) => lines.push(line) },
      confirm: async () => ({ confirmed: true }),
    })
    runtime.emit(signalName)
    const code = await running

    assert.equal(code, expectedCode)
    assert.equal(cleaned, true)
    assert.equal(runtime.listenerCount('SIGINT'), 0)
    assert.equal(runtime.listenerCount('SIGTERM'), 0)
    assert.equal(lines.join('').includes('cookie'), false)
  }
})
