import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createPlaywrightLoginBrowser } from '../scripts/browser-tools/login-qr-playwright.mjs'
import { parseArgs } from '../scripts/browser-tools/login-qr.mjs'

function fakePlaywright({ onStorageState, canvasError = false } = {}) {
  const pageEvents = new EventEmitter()
  const mainFrame = {}
  let documentObject = { url: 'https://login.example.test/qr', bodyText: 'Scan', qrVisible: true }
  let closed = false

  const page = {
    on: pageEvents.on.bind(pageEvents),
    off: pageEvents.off.bind(pageEvents),
    mainFrame: () => mainFrame,
    isClosed: () => closed,
    url: () => documentObject.url,
    async evaluateHandle() {
      const captured = documentObject
      return {
        async evaluate(callback, argument) {
          if (callback.name === 'readDocumentSnapshot') {
            if (captured.bodyText === null) return { bodyMissing: true }
            return { currentUrl: captured.url, bodyText: captured.bodyText }
          }
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
            async isVisible() { return documentObject.qrVisible },
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
      await writeFile(statePath, '{"cookies":[]}', 'utf8')
      await onStorageState?.({ page, statePath })
    },
    async close() { closed = true },
  }

  return {
    page,
    context,
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

test('rename is the commit point and an abort after it starts waits for its outcome', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'login-qr-rename-'))
  const fake = fakePlaywright()
  let releaseRename
  let renameStarted
  const started = new Promise((resolve) => { renameStarted = resolve })
  const release = new Promise((resolve) => { releaseRename = resolve })
  const { options, session } = await openSession(root, fake, {
    fileSystem: {
      async rename(from, to) {
        renameStarted()
        await release
        const fs = await import('node:fs/promises')
        await fs.rename(from, to)
      },
    },
  })
  const controller = new AbortController()

  const saving = session.saveState({ observationId: null, signal: controller.signal })
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
