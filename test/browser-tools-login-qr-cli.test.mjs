import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'

import { runCli, waitForManualConfirmation } from '../scripts/browser-tools/login-qr.mjs'

async function runManualConfirmationInPty(mode) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-manual-pty-'))
  const fixturePath = path.join(root, 'manual-confirmation.mjs')
  const moduleUrl = pathToFileURL(path.resolve('scripts/browser-tools/login-qr.mjs')).href
  await writeFile(fixturePath, `
    import { waitForManualConfirmation } from ${JSON.stringify(moduleUrl)}
    const controller = new AbortController()
    if (process.argv[2] === 'cancel') setTimeout(() => controller.abort(), 20)
    const result = await waitForManualConfirmation({ signal: controller.signal })
    process.stdout.write('RESULT:' + JSON.stringify(result) + '\\n')
  `)

  const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`
  const command = `${shellQuote(process.execPath)} ${shellQuote(fixturePath)} ${shellQuote(mode)}`
  const child = spawn('script', ['-qefc', command, '/dev/null'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  if (mode === 'enter') child.stdin.write('\n')

  let timeout
  try {
    const exit = await Promise.race([
      new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code, signal) => resolve({ code, signal }))
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('PTY child did not exit without EOF')), 1500)
      }),
    ])
    return { ...exit, output }
  } finally {
    clearTimeout(timeout)
    child.kill('SIGKILL')
    child.stdin.destroy()
    await rm(root, { recursive: true, force: true })
  }
}

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

  const trailingText = new PassThrough()
  trailingText.isTTY = true
  trailingText.end('not-enter')
  assert.deepEqual(
    await waitForManualConfirmation({ input: trailingText, output: new PassThrough() }),
    { confirmed: false, reason: 'EOF' },
  )

  const piped = new PassThrough()
  piped.isTTY = false
  assert.deepEqual(
    await waitForManualConfirmation({ input: piped, output: new PassThrough() }),
    { confirmed: false, reason: 'NOT_TTY' },
  )

  const alreadyFlowing = new PassThrough()
  alreadyFlowing.isTTY = true
  alreadyFlowing.resume()
  let pauses = 0
  const originalPause = alreadyFlowing.pause.bind(alreadyFlowing)
  alreadyFlowing.pause = () => {
    pauses += 1
    return originalPause()
  }
  const flowingConfirmation = waitForManualConfirmation({
    input: alreadyFlowing,
    output: new PassThrough(),
  })
  alreadyFlowing.write('\n')
  assert.deepEqual(await flowingConfirmation, { confirmed: true })
  assert.equal(pauses, 0)
  alreadyFlowing.destroy()
})

test('manual confirmation releases a real TTY after Enter and cancellation without EOF', async () => {
  const entered = await runManualConfirmationInPty('enter')
  assert.deepEqual({ code: entered.code, signal: entered.signal }, { code: 0, signal: null })
  assert.match(entered.output, /RESULT:\{"confirmed":true\}/)

  const cancelled = await runManualConfirmationInPty('cancel')
  assert.deepEqual({ code: cancelled.code, signal: cancelled.signal }, { code: 0, signal: null })
  assert.match(cancelled.output, /RESULT:\{"confirmed":false,"reason":"CANCELLED"\}/)
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
