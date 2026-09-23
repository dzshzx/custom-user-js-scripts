import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { chmod, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { runLoginCapture } from '../scripts/browser-tools/login-qr-flow.mjs'
import { createPlaywrightLoginBrowser } from '../scripts/browser-tools/login-qr-playwright.mjs'
import { parseArgs } from '../scripts/browser-tools/login-qr.mjs'
import { loadTestPlaywright } from '../scripts/test-playwright.mjs'

function controlledClock(start = 0) {
  let now = start
  const sleepers = new Set()
  const settleDue = () => {
    for (const sleeper of [...sleepers]) {
      if (sleeper.target > now) continue
      sleepers.delete(sleeper)
      sleeper.cleanup()
      sleeper.resolve()
    }
  }
  return {
    now: () => now,
    advance(ms) {
      now += ms
      settleDue()
    },
    sleep(ms, { signal } = {}) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('timer cancelled'))
          return
        }
        const sleeper = {
          target: now + ms,
          resolve,
          cleanup: () => signal?.removeEventListener('abort', onAbort),
        }
        const onAbort = () => {
          sleepers.delete(sleeper)
          reject(new Error('timer cancelled'))
        }
        sleepers.add(sleeper)
        signal?.addEventListener('abort', onAbort, { once: true })
        settleDue()
      })
    },
  }
}

const wallClock = {
  now: () => Date.now(),
  sleep(ms, { signal } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('timer cancelled'))
      }, { once: true })
    })
  },
}

function fakePlaywright({
  onStorageState,
  onDocumentSnapshot,
  onSameDocument,
  onQrVisible,
  initialDocument,
  canvasError = false,
} = {}) {
  const pageEvents = new EventEmitter()
  const mainFrame = {}
  let documentObject = initialDocument ?? {
    url: 'https://login.example.test/qr',
    bodyText: 'Scan',
    qrVisible: true,
  }
  let closed = false
  let storageStateCalls = 0

  const page = {
    on: pageEvents.on.bind(pageEvents),
    off: pageEvents.off.bind(pageEvents),
    mainFrame: () => mainFrame,
    isClosed: () => closed,
    url: () => documentObject.url,
    async goto() {},
    async waitForTimeout() {},
    async evaluateHandle() {
      const captured = documentObject
      return {
        async evaluate(callback, argument) {
          if (callback.name === 'readDocumentSnapshot') {
            await onDocumentSnapshot?.()
            if (captured.bodyText === null) return { bodyMissing: true }
            return { currentUrl: captured.url, bodyText: captured.bodyText }
          }
          await onSameDocument?.()
          return captured === documentObject && captured.url === argument
        },
        async dispose() {},
      }
    },
    locator() {
      return {
        first() {
          return {
            async waitFor() {},
            async isVisible() {
              await onQrVisible?.({ page })
              return documentObject.qrVisible
            },
            async getAttribute() { return '/qr_img?qr=synthetic-secret' },
            async boundingBox() { return { width: 240.4, height: 239.6 } },
            async evaluate() {
              if (canvasError) throw new Error('canvas blocked')
              return `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`
            },
            async screenshot({ path: outputPath }) { await writeFile(outputPath, 'screenshot-bytes') },
          }
        },
      }
    },
    emitReload(next = { ...documentObject }) {
      documentObject = next
      pageEvents.emit('framenavigated', mainFrame)
    },
    closeForTest() {
      closed = true
      pageEvents.emit('close')
    },
  }

  const context = {
    pages: () => [page],
    async storageState({ path: statePath }) {
      storageStateCalls += 1
      await writeFile(statePath, '{"cookies":[]}', 'utf8')
      await onStorageState?.({ page, statePath })
    },
    async close() { closed = true },
  }

  return {
    page,
    context,
    get storageStateCalls() { return storageStateCalls },
    module: {
      chromium: {
        async launchPersistentContext() { return context },
      },
    },
  }
}

async function openSession(root, fake, overrides = {}) {
  const browser = createPlaywrightLoginBrowser({
    loadPlaywright: async () => fake.module,
    ...overrides,
  })
  const options = {
    ...parseArgs([]),
    profileDir: path.join(root, 'profile'),
    qrPath: path.join(root, 'qr.png'),
    statePath: path.join(root, 'state.json'),
  }
  return { options, session: await browser.open(options) }
}

test('same-URL reload invalidates the prior document observation token', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-document-'))
  const fake = fakePlaywright()
  const { session } = await openSession(root, fake)

  const snapshot = await session.readSnapshot()
  assert.equal(snapshot.kind, 'readable')
  assert.equal(await session.validateObservation(snapshot.observationId), true)

  fake.page.emitReload({ url: snapshot.currentUrl, bodyText: 'Home', qrVisible: false })
  assert.equal(await session.validateObservation(snapshot.observationId), false)
  await session.close()
})

test('a later-started observation supersedes an older in-flight read', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-observation-order-'))
  let readCount = 0
  let releaseFirst
  let firstStarted
  const firstGate = new Promise((resolve) => { releaseFirst = resolve })
  const started = new Promise((resolve) => { firstStarted = resolve })
  const fake = fakePlaywright({
    onDocumentSnapshot: async () => {
      readCount += 1
      if (readCount === 1) {
        firstStarted()
        await firstGate
      }
    },
  })
  const { session } = await openSession(root, fake)

  const olderRead = session.readSnapshot()
  await started
  const newer = await session.readSnapshot()
  releaseFirst()
  const older = await olderRead

  assert.equal(newer.kind, 'readable')
  assert.deepEqual(older, { kind: 'unreadable', reason: 'DOCUMENT_CHANGED' })
  assert.equal(await session.validateObservation(newer.observationId), true)
  await session.close()
})

test('closing during an observation prevents the late read from becoming current', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-close-observation-'))
  const fake = fakePlaywright({
    onQrVisible: async ({ page }) => page.closeForTest(),
  })
  const { session } = await openSession(root, fake)

  assert.deepEqual(
    await session.readSnapshot(),
    { kind: 'unreadable', reason: 'DOCUMENT_CHANGED' },
  )
  assert.equal(await session.validateObservation('observation-1'), false)
  await session.close()
})

test('QR export preserves canvas bytes and element-screenshot fallback without exposing its token', async () => {
  for (const [canvasError, method, bytes] of [
    [false, 'image-data', 'png-bytes'],
    [true, 'element-screenshot', 'screenshot-bytes'],
  ]) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-export-'))
    const fake = fakePlaywright({ canvasError })
    const { options, session } = await openSession(root, fake)

    const result = await session.exportQr()

    assert.equal(result.method, method)
    assert.equal(await readFile(options.qrPath, 'utf8'), bytes)
    assert.equal(result.diagnostics.qrSourceOrigin, 'https://login.example.test')
    assert.deepEqual(result.diagnostics.qrBox, { width: 240, height: 240 })
    assert.equal(JSON.stringify(result).includes('synthetic-secret'), false)
    await session.close()
  }
})

test('missing body and QR read errors are unreadable observations', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-unreadable-'))
  const fake = fakePlaywright()
  const { session } = await openSession(root, fake)

  fake.page.emitReload({ url: 'https://login.example.test/qr', bodyText: null, qrVisible: true })
  assert.deepEqual(await session.readSnapshot(), { kind: 'unreadable', reason: 'BODY_MISSING' })

  fake.page.emitReload({
    url: 'https://login.example.test/qr',
    bodyText: 'Scan',
    get qrVisible() { throw new Error('synthetic QR read failure') },
  })
  assert.deepEqual(await session.readSnapshot(), { kind: 'unreadable', reason: 'QR_UNREADABLE' })
  await session.close()
})

test('state is staged as mode 0600 and observation change preserves the old target', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-state-'))
  let fake
  fake = fakePlaywright({
    onStorageState: async () => {
      fake.page.emitReload({ url: 'https://login.example.test/qr', bodyText: 'Reloaded', qrVisible: true })
    },
  })
  const { options, session } = await openSession(root, fake)
  await writeFile(options.statePath, 'old-state', { mode: 0o600 })
  const snapshot = await session.readSnapshot()

  const result = await session.saveState({ observationId: snapshot.observationId })

  assert.deepEqual(result, { committed: false, reason: 'OBSERVATION_CHANGED' })
  assert.equal(await readFile(options.statePath, 'utf8'), 'old-state')
  assert.deepEqual((await readdir(root)).filter((name) => name.includes('.tmp-')), [])
  await session.close()
})

test('state export checks the original deadline before export, after export, and before rename', async () => {
  {
    const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-expired-before-export-'))
    const fake = fakePlaywright()
    const { session } = await openSession(root, fake)
    const snapshot = await session.readSnapshot()
    const clock = controlledClock(10)
    assert.deepEqual(
      await session.saveState({ observationId: snapshot.observationId, deadline: 10, clock }),
      { committed: false, reason: 'DEADLINE_EXPIRED' },
    )
    assert.equal(fake.storageStateCalls, 0)
    await session.close()
  }

  {
    const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-expired-after-export-'))
    const clock = controlledClock()
    const fake = fakePlaywright({ onStorageState: async () => clock.advance(11) })
    const { options, session } = await openSession(root, fake)
    await writeFile(options.statePath, 'old-state', { mode: 0o600 })
    const snapshot = await session.readSnapshot()
    assert.deepEqual(
      await session.saveState({ observationId: snapshot.observationId, deadline: 10, clock }),
      { committed: false, reason: 'DEADLINE_EXPIRED' },
    )
    assert.equal(await readFile(options.statePath, 'utf8'), 'old-state')
    await session.close()
  }

  {
    const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-expired-before-rename-'))
    const clock = controlledClock()
    const fake = fakePlaywright()
    let renames = 0
    const { options, session } = await openSession(root, fake, {
      fileSystem: {
        async chmod(filePath, mode) {
          await chmod(filePath, mode)
          clock.advance(11)
        },
        async rename() { renames += 1 },
      },
    })
    await writeFile(options.statePath, 'old-state', { mode: 0o600 })
    const snapshot = await session.readSnapshot()
    assert.deepEqual(
      await session.saveState({ observationId: snapshot.observationId, deadline: 10, clock }),
      { committed: false, reason: 'DEADLINE_EXPIRED' },
    )
    assert.equal(renames, 0)
    assert.equal(await readFile(options.statePath, 'utf8'), 'old-state')
    await session.close()
  }
})

test('abort during the final asynchronous observation check prevents rename', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-abort-validation-'))
  const controller = new AbortController()
  let checks = 0
  let renames = 0
  const fake = fakePlaywright({
    onSameDocument: async () => {
      checks += 1
      if (checks === 4) controller.abort(new Error('cancel during final validation'))
    },
  })
  const { session } = await openSession(root, fake, {
    fileSystem: {
      async rename() { renames += 1 },
    },
  })
  const snapshot = await session.readSnapshot()

  await assert.rejects(
    session.saveState({ observationId: snapshot.observationId, signal: controller.signal }),
    (error) => error?.code === 'CANCELLED',
  )
  assert.equal(renames, 0)
  await session.close()
})

test('a hung state export returns at the original deadline without a late rename', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-hung-export-'))
  let exportStarted
  const started = new Promise((resolve) => { exportStarted = resolve })
  let releaseExport
  const stalled = new Promise((resolve) => { releaseExport = resolve })
  let renames = 0
  const fake = fakePlaywright({
    onStorageState: async () => {
      exportStarted()
      await stalled
    },
  })
  const clock = controlledClock()
  const { session } = await openSession(root, fake, {
    fileSystem: {
      async rename() { renames += 1 },
    },
  })
  const snapshot = await session.readSnapshot()
  const saving = session.saveState({
    observationId: snapshot.observationId,
    deadline: 10,
    clock,
  })
  await started
  clock.advance(10)

  const outcome = await Promise.race([
    saving,
    new Promise((resolve) => setTimeout(() => resolve({ timedOutInTest: true }), 50)),
  ])
  assert.deepEqual(outcome, { committed: false, reason: 'DEADLINE_EXPIRED' })
  assert.equal(renames, 0)
  releaseExport()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(renames, 0)
  assert.deepEqual((await readdir(root)).filter((name) => name.includes('.tmp-')), [])
  await session.close()
})

test('Flow returns its original timeout when the production adapter state export hangs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-flow-hung-export-'))
  let exportStarted
  const started = new Promise((resolve) => { exportStarted = resolve })
  const fake = fakePlaywright({
    initialDocument: {
      url: 'https://login.example.test/done',
      bodyText: 'Home',
      qrVisible: false,
    },
    onStorageState: async () => {
      exportStarted()
      await new Promise(() => {})
    },
  })
  const browser = createPlaywrightLoginBrowser({ loadPlaywright: async () => fake.module })
  const clock = controlledClock()
  let waiting
  const waitingStarted = new Promise((resolve) => { waiting = resolve })
  const options = {
    ...parseArgs([]),
    url: 'https://login.example.test/qr',
    profileDir: path.join(root, 'profile'),
    qrPath: path.join(root, 'qr.png'),
    statePath: path.join(root, 'state.json'),
    qrSelector: '#qr',
    waitAfterNavigationMs: 0,
    loginTimeoutMs: 10,
    successHosts: ['login.example.test'],
    pendingUrlPatterns: [],
    pendingTexts: [],
  }

  const running = runLoginCapture(options, {
    browser,
    clock,
    confirm: async () => ({ confirmed: true }),
    onEvent: async (event) => {
      if (event.type === 'waiting') waiting()
    },
  })
  await waitingStarted
  clock.advance(3)
  await exportStarted
  clock.advance(7)
  const result = await running

  assert.equal(result.status, 'timeout')
  assert.equal(result.error.code, 'LOGIN_TIMEOUT')
  assert.equal(result.artifacts.state.committed, false)
  assert.deepEqual(result.cleanup, { status: 'closed' })
})

test('rename is the commit point and an abort after it starts waits for its outcome', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-rename-'))
  const fake = fakePlaywright()
  let releaseRename
  let renameStarted
  const started = new Promise((resolve) => { renameStarted = resolve })
  const release = new Promise((resolve) => { releaseRename = resolve })
  const clock = controlledClock()
  const { options, session } = await openSession(root, fake, {
    fileSystem: {
      async rename(from, to) {
        renameStarted()
        clock.advance(11)
        await release
        const fs = await import('node:fs/promises')
        await fs.rename(from, to)
      },
    },
  })
  const controller = new AbortController()

  const saving = session.saveState({
    observationId: null,
    signal: controller.signal,
    deadline: 10,
    clock,
  })
  await started
  controller.abort(new Error('cancelled after rename'))
  let settled = false
  saving.finally(() => { settled = true })
  await Promise.resolve()
  assert.equal(settled, false)

  releaseRename()
  assert.deepEqual(await saving, { committed: true })
  assert.equal(await readFile(options.statePath, 'utf8'), '{"cookies":[]}')
  const stat = await import('node:fs/promises').then((fs) => fs.stat(options.statePath))
  assert.equal(stat.mode & 0o777, 0o600)
  await session.close()
})

test('state target directories and symbolic links are rejected without replacement', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-target-'))
  const fake = fakePlaywright()
  const { options, session } = await openSession(root, fake)
  await import('node:fs/promises').then((fs) => fs.mkdir(options.statePath))

  await assert.rejects(
    session.saveState({ observationId: null }),
    (error) => error?.code === 'STATE_TARGET_INVALID',
  )
  await session.close()

  const symlinkRoot = await mkdtemp(path.join(os.tmpdir(), 'login-qr-symlink-'))
  const symlinkFake = fakePlaywright()
  const opened = await openSession(symlinkRoot, symlinkFake)
  const realTarget = path.join(symlinkRoot, 'real-state.json')
  await writeFile(realTarget, 'old-state', { mode: 0o600 })
  await import('node:fs/promises').then((fs) => fs.symlink(realTarget, opened.options.statePath))
  await assert.rejects(
    opened.session.saveState({ observationId: null }),
    (error) => error?.code === 'STATE_TARGET_INVALID',
  )
  assert.equal(await readFile(realTarget, 'utf8'), 'old-state')
  await opened.session.close()
})

test('an abort before rename removes the staged state and preserves the target', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-abort-state-'))
  const controller = new AbortController()
  const fake = fakePlaywright({
    onStorageState: async () => controller.abort(new Error('cancel before rename')),
  })
  const { options, session } = await openSession(root, fake)
  await writeFile(options.statePath, 'old-state', { mode: 0o600 })

  await assert.rejects(
    session.saveState({ observationId: null, signal: controller.signal }),
    (error) => error?.code === 'CANCELLED',
  )
  assert.equal(await readFile(options.statePath, 'utf8'), 'old-state')
  assert.deepEqual((await readdir(root)).filter((name) => name.includes('.tmp-')), [])
  await session.close()
})

test('a temporary-file cleanup failure remains secondary to observation invalidation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-temp-cleanup-'))
  let fake
  fake = fakePlaywright({
    onStorageState: async () => fake.page.emitReload(),
  })
  const { session } = await openSession(root, fake, {
    fileSystem: {
      async unlink() { throw new Error('synthetic cleanup failure') },
    },
  })
  const snapshot = await session.readSnapshot()

  assert.deepEqual(
    await session.saveState({ observationId: snapshot.observationId }),
    {
      committed: false,
      reason: 'OBSERVATION_CHANGED',
      warning: 'STATE_TEMP_CLEANUP_FAILED',
    },
  )
  await session.close()
})

test('adapter cleans a partially opened context before reporting open failure', async () => {
  let closes = 0
  const browser = createPlaywrightLoginBrowser({
    loadPlaywright: async () => ({
      chromium: {
        async launchPersistentContext() {
          return {
            pages: () => [],
            async newPage() { throw new Error('synthetic page failure') },
            async close() { closes += 1 },
          }
        },
      },
    }),
  })
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-partial-open-'))
  const options = {
    ...parseArgs([]),
    profileDir: path.join(root, 'profile'),
    qrPath: path.join(root, 'qr.png'),
    statePath: path.join(root, 'state.json'),
  }

  await assert.rejects(
    browser.open(options),
    (error) => error?.cleanup?.status === 'closed',
  )
  assert.equal(closes, 1)
})

test('real Playwright fixture observes one document and commits private state', async () => {
  const playwright = await loadTestPlaywright();

  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-real-browser-'))
  let context
  const browser = createPlaywrightLoginBrowser({
    loadPlaywright: async () => ({
      chromium: {
        async launchPersistentContext(profileDir, launchOptions) {
          context = await playwright.chromium.launchPersistentContext(profileDir, {
            ...launchOptions,
          })
          return context
        },
      },
    }),
  })
  const markup = '<!doctype html><body>Pending login<img id="qr" width="64" height="64" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22black%22/%3E%3C/svg%3E"></body>'
  const options = {
    ...parseArgs(['--wait-after-nav-ms', '0', '--use-shell-proxy']),
    url: `data:text/html,${markup}`,
    qrSelector: '#qr',
    profileDir: path.join(root, 'profile'),
    qrPath: path.join(root, 'qr.png'),
    statePath: path.join(root, 'state.json'),
  }
  const session = await browser.open(options)
  try {
    await session.navigate()
    const qr = await session.exportQr()
    assert.equal(qr.written, true)
    assert.ok((await stat(options.qrPath)).size > 0)

    const snapshot = await session.readSnapshot()
    assert.equal(snapshot.kind, 'readable')
    assert.equal(snapshot.bodyText.includes('Pending login'), true)
    assert.equal(snapshot.qrVisible, true)
    assert.equal(await session.validateObservation(snapshot.observationId), true)

    assert.deepEqual(
      await session.saveState({
        observationId: snapshot.observationId,
        deadline: wallClock.now() + 10_000,
        clock: wallClock,
      }),
      { committed: true },
    )
    assert.equal((await stat(options.statePath)).mode & 0o777, 0o600)

    await context.pages()[0].reload({ waitUntil: 'domcontentloaded' })
    assert.equal(await session.validateObservation(snapshot.observationId), false)
  } finally {
    await session.close()
  }
})
