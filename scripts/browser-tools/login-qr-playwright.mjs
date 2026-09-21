import { randomUUID } from 'node:crypto'
import * as nodeFs from 'node:fs/promises'
import path from 'node:path'

import { resolvePlaywrightImport } from './playwright-loader.mjs'

const DIRECT_PROXY_ARGS = ['--proxy-server=direct://', '--proxy-bypass-list=*']

function codedError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw codedError('CANCELLED')
}

function safePageUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return '(invalid URL)'
  }
}

function safeOrigin(rawUrl, baseUrl) {
  if (!rawUrl) return '(missing)'
  try { return new URL(rawUrl, baseUrl).origin } catch { return '(invalid URL)' }
}

async function ensureParentDirectory(filePath, fileSystem) {
  await fileSystem.mkdir(path.dirname(filePath), { recursive: true })
}

async function validateStateTarget(statePath, fileSystem) {
  try {
    const target = await fileSystem.lstat(statePath)
    if (!target.isFile() || target.isSymbolicLink()) throw codedError('STATE_TARGET_INVALID')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function reserveTemporaryStatePath(statePath, fileSystem, makeId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = path.join(path.dirname(statePath), `.${path.basename(statePath)}.tmp-${makeId()}`)
    try {
      const handle = await fileSystem.open(candidate, 'wx', 0o600)
      await handle.close()
      return candidate
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
  }
  throw codedError('STATE_TEMP_UNAVAILABLE')
}

function createSession({ context, page, options, fileSystem, makeId }) {
  let navigationRevision = 0
  let observationGeneration = 0
  let observationSequence = 0
  let currentObservation = null
  let closed = false
  let closing = null

  const disposeObservation = () => {
    const old = currentObservation
    currentObservation = null
    old?.documentHandle.dispose().catch(() => {})
  }
  const invalidateDocument = () => {
    navigationRevision += 1
    observationGeneration += 1
    disposeObservation()
  }
  const onFrameNavigated = (frame) => {
    if (frame === page.mainFrame()) invalidateDocument()
  }
  const onPageClosed = () => {
    closed = true
    invalidateDocument()
  }
  page.on('framenavigated', onFrameNavigated)
  page.on('close', onPageClosed)

  async function validateObservation(observationId) {
    const observation = currentObservation
    if (
      closed || !observation || observation.id !== observationId ||
      observation.revision !== navigationRevision || page.isClosed()
    ) return false

    try {
      return await observation.documentHandle.evaluate(
        function isSameDocument(documentObject, expectedUrl) {
          return documentObject === document && documentObject.location.href === expectedUrl
        },
        observation.currentUrl,
      )
    } catch {
      disposeObservation()
      return false
    }
  }

  return {
    async navigate({ signal } = {}) {
      throwIfAborted(signal)
      await page.goto(options.url, {
        waitUntil: 'domcontentloaded',
        timeout: options.navigationTimeoutMs,
      })
      await page.waitForTimeout(options.waitAfterNavigationMs)
      throwIfAborted(signal)

      if (options.refresh) {
        await page.reload({
          waitUntil: 'domcontentloaded',
          timeout: options.navigationTimeoutMs,
        })
        await page.waitForTimeout(options.waitAfterNavigationMs)
        throwIfAborted(signal)
      }
    },

    async selectTenant({ signal } = {}) {
      if (!options.tenant) return false
      throwIfAborted(signal)
      const bodyText = await page.locator('body').innerText()
      if (bodyText.includes(options.tenant)) return false

      const switchTenantButton = page.getByText(options.tenantSwitchText, { exact: true })
      await switchTenantButton.waitFor({ state: 'visible', timeout: 15_000 })
      await switchTenantButton.click()
      const tenantOption = page.getByText(options.tenant, { exact: true })
      await tenantOption.waitFor({ state: 'visible', timeout: 15_000 })
      await tenantOption.click()
      await page.waitForTimeout(1500)
      throwIfAborted(signal)
      return true
    },

    async exportQr({ signal } = {}) {
      throwIfAborted(signal)
      const qrImage = page.locator(options.qrSelector).first()
      await qrImage.waitFor({ state: 'visible', timeout: 15_000 })
      await ensureParentDirectory(options.qrPath, fileSystem)
      const qrSource = await qrImage.getAttribute('src').catch(() => null)
      const qrBox = await qrImage.boundingBox().catch(() => null)
      const diagnostics = {
        targetPage: safePageUrl(page.url()),
        qrSourceOrigin: safeOrigin(qrSource, page.url()),
        qrBox: qrBox ? {
          width: Math.round(qrBox.width),
          height: Math.round(qrBox.height),
        } : null,
      }

      try {
        const dataUrl = await qrImage.evaluate((image) => {
          const canvas = document.createElement('canvas')
          canvas.width = image.naturalWidth
          canvas.height = image.naturalHeight
          const context2d = canvas.getContext('2d')
          if (!context2d) throw new Error('canvas context unavailable')
          context2d.drawImage(image, 0, 0)
          return canvas.toDataURL('image/png')
        })
        throwIfAborted(signal)
        const encoded = dataUrl.replace(/^data:image\/png;base64,/, '')
        await fileSystem.writeFile(options.qrPath, Buffer.from(encoded, 'base64'))
        return { written: true, method: 'image-data', diagnostics }
      } catch (error) {
        if (error?.code === 'CANCELLED') throw error
        throwIfAborted(signal)
        await qrImage.screenshot({ path: options.qrPath })
        return { written: true, method: 'element-screenshot', diagnostics }
      }
    },

    async readSnapshot({ signal } = {}) {
      throwIfAborted(signal)
      if (closed || page.isClosed()) throw codedError('PAGE_CLOSED')
      disposeObservation()
      observationGeneration += 1
      const generation = observationGeneration
      const revision = navigationRevision
      let documentHandle
      try {
        documentHandle = await page.evaluateHandle(() => document)
      } catch {
        return { kind: 'unreadable', reason: 'DOCUMENT_UNREADABLE' }
      }

      let documentSnapshot
      try {
        documentSnapshot = await documentHandle.evaluate(function readDocumentSnapshot(documentObject) {
          if (!documentObject.body) return { bodyMissing: true }
          return {
            currentUrl: documentObject.location.href,
            bodyText: documentObject.body.innerText,
          }
        })
      } catch {
        await documentHandle.dispose().catch(() => {})
        return { kind: 'unreadable', reason: 'BODY_UNREADABLE' }
      }
      if (documentSnapshot.bodyMissing) {
        await documentHandle.dispose().catch(() => {})
        return { kind: 'unreadable', reason: 'BODY_MISSING' }
      }

      let qrVisible
      try {
        qrVisible = await page.locator(options.qrSelector).first().isVisible()
      } catch {
        await documentHandle.dispose().catch(() => {})
        return { kind: 'unreadable', reason: 'QR_UNREADABLE' }
      }

      if (signal?.aborted) {
        await documentHandle.dispose().catch(() => {})
        throw codedError('CANCELLED')
      }
      let sameDocument = false
      try {
        sameDocument = generation === observationGeneration &&
          revision === navigationRevision &&
          await documentHandle.evaluate(
            function isSameDocument(documentObject, expectedUrl) {
              return documentObject === document && documentObject.location.href === expectedUrl
            },
            documentSnapshot.currentUrl,
          )
      } catch {
        sameDocument = false
      }
      if (!sameDocument || closed || page.isClosed() || generation !== observationGeneration) {
        await documentHandle.dispose().catch(() => {})
        return { kind: 'unreadable', reason: 'DOCUMENT_CHANGED' }
      }

      disposeObservation()
      observationSequence += 1
      const observationId = `observation-${observationSequence}`
      currentObservation = {
        id: observationId,
        revision,
        currentUrl: documentSnapshot.currentUrl,
        documentHandle,
      }
      return {
        kind: 'readable',
        currentUrl: documentSnapshot.currentUrl,
        bodyText: documentSnapshot.bodyText,
        qrVisible,
        observationId,
      }
    },

    validateObservation,

    async saveState({ observationId, signal, deadline = null, clock = null } = {}) {
      throwIfAborted(signal)

      const invalidCommitReason = async () => {
        throwIfAborted(signal)
        if (deadline !== null && clock.now() >= deadline) return 'DEADLINE_EXPIRED'
        if (observationId !== null && !(await validateObservation(observationId))) {
          return 'OBSERVATION_CHANGED'
        }
        if (deadline !== null && clock.now() >= deadline) return 'DEADLINE_EXPIRED'
        return null
      }

      const initialReason = await invalidCommitReason()
      if (initialReason) return { committed: false, reason: initialReason }
      await ensureParentDirectory(options.statePath, fileSystem)
      await validateStateTarget(options.statePath, fileSystem)
      const temporaryPath = await reserveTemporaryStatePath(options.statePath, fileSystem, makeId)
      let committed = false
      let outcome = null
      let primaryError = null

      try {
        await context.storageState({ path: temporaryPath })
        const afterExportReason = await invalidCommitReason()
        if (afterExportReason) {
          outcome = { committed: false, reason: afterExportReason }
        } else {
          await fileSystem.chmod(temporaryPath, 0o600)
          const beforeRenameReason = await invalidCommitReason()
          if (beforeRenameReason) {
            outcome = { committed: false, reason: beforeRenameReason }
          } else {
            await fileSystem.rename(temporaryPath, options.statePath)
            committed = true
            outcome = { committed: true }
          }
        }
      } catch (error) {
        primaryError = error
      }

      if (!committed) {
        try {
          await fileSystem.unlink(temporaryPath)
        } catch {
          if (outcome) outcome.warning = 'STATE_TEMP_CLEANUP_FAILED'
          else primaryError.secondaryCode = 'STATE_TEMP_CLEANUP_FAILED'
        }
      }
      if (primaryError) throw primaryError
      return outcome
    },

    async close() {
      if (closing) return closing
      closing = (async () => {
        closed = true
        page.off('framenavigated', onFrameNavigated)
        page.off('close', onPageClosed)
        disposeObservation()
        await context.close()
      })()
      return closing
    },
  }
}

export function createPlaywrightLoginBrowser({
  loadPlaywright = resolvePlaywrightImport,
  fileSystem: fileSystemOverrides = {},
  makeId = randomUUID,
} = {}) {
  const fileSystem = { ...nodeFs, ...fileSystemOverrides }

  return {
    async open(options, { signal } = {}) {
      throwIfAborted(signal)
      const playwright = await loadPlaywright()
      await fileSystem.mkdir(options.profileDir, { recursive: true })
      let context = null
      try {
        context = await playwright.chromium.launchPersistentContext(options.profileDir, {
          headless: options.headless,
          args: options.useDirectProxy ? DIRECT_PROXY_ARGS : [],
          ignoreHTTPSErrors: true,
          viewport: { width: 1440, height: 2200 },
        })
        throwIfAborted(signal)
        const page = context.pages()[0] ?? (await context.newPage())
        return createSession({ context, page, options, fileSystem, makeId })
      } catch (error) {
        if (context) {
          try {
            await context.close()
            error.cleanup = { status: 'closed' }
          } catch {
            error.cleanup = { status: 'failed', code: 'CLOSE_FAILED' }
          }
        }
        throw error
      }
    },
  }
}
