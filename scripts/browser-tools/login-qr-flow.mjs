import { compileLoginRules, matchLoginState } from './login-qr-options.mjs'

const POLL_INTERVAL_MS = 3000

function cloneOptions(options) {
  return {
    ...options,
    successHosts: [...options.successHosts],
    successUrlPatterns: [...options.successUrlPatterns],
    successTexts: [...options.successTexts],
    pendingUrlPatterns: [...options.pendingUrlPatterns],
    pendingTexts: [...options.pendingTexts],
  }
}

function abortError(signal) {
  const error = new Error('Login capture cancelled')
  error.code = 'CANCELLED'
  error.cause = signal?.reason
  return error
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal)
}

function systemSleep(ms, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal))
      return
    }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      cleanup()
      reject(abortError(signal))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const systemClock = { now: () => Date.now(), sleep: systemSleep }

function resultTemplate(options) {
  return {
    status: 'error',
    phase: 'validate',
    confirmation: null,
    artifacts: {
      qr: { path: options.qrPath, written: false },
      state: { path: options.statePath, committed: false },
      profile: { path: options.profileDir, opened: false },
    },
    error: null,
    cleanup: { status: 'not-opened' },
    lastObservation: null,
    warnings: [],
  }
}

function errorCode(error, phase) {
  if (error?.code && /^[A-Z][A-Z0-9_]+$/.test(error.code)) return error.code
  return `${phase.toUpperCase().replaceAll('-', '_')}_FAILED`
}

async function beforeDeadline(operation, deadline, clock, signal) {
  const remaining = deadline - clock.now()
  if (remaining <= 0) return { kind: 'deadline' }

  const timerController = new AbortController()
  const timerSignal = signal ? AbortSignal.any([signal, timerController.signal]) : timerController.signal
  const operationPromise = Promise.resolve().then(operation)
  operationPromise.catch(() => {})
  const deadlinePromise = clock.sleep(remaining, { signal: timerSignal })
    .then(() => ({ kind: 'deadline' }))
  deadlinePromise.catch(() => {})

  try {
    return await Promise.race([
      operationPromise.then((value) => ({ kind: 'value', value })),
      deadlinePromise,
    ])
  } finally {
    timerController.abort()
  }
}

export async function runLoginCapture(rawOptions, dependencies) {
  const options = cloneOptions(rawOptions)
  const { browser, confirm, onEvent, signal } = dependencies
  const clock = dependencies.clock ?? systemClock
  const result = resultTemplate(options)
  let session = null

  const emit = async (event) => {
    if (!onEvent) return
    try {
      await onEvent(event)
    } catch {
      if (!result.warnings.includes('EVENT_HANDLER_FAILED')) result.warnings.push('EVENT_HANDLER_FAILED')
    }
  }

  const fail = (code, phase) => {
    result.status = 'error'
    result.phase = phase
    result.error = { code, phase }
  }

  try {
    result.phase = 'validate'
    const rules = compileLoginRules(options)
    throwIfAborted(signal)

    result.phase = 'open'
    await emit({ type: 'phase', phase: 'open' })
    session = await browser.open(options, { signal })
    result.artifacts.profile.opened = true

    result.phase = 'navigate'
    await emit({ type: 'phase', phase: 'navigate' })
    await session.navigate({ signal })

    result.phase = 'tenant'
    const tenantChanged = await session.selectTenant({ signal })

    result.phase = 'qr'
    const qr = await session.exportQr({ signal })
    const qrCompletedAt = clock.now()
    result.artifacts.qr.written = Boolean(qr.written)
    await emit({
      type: 'qr-ready',
      path: options.qrPath,
      method: qr.method,
      tenantChanged,
      diagnostics: qr.diagnostics ?? null,
    })

    if (!options.waitForLogin) {
      result.status = 'qr-only'
      result.phase = 'qr'
    } else if (options.manualConfirm) {
      result.phase = 'confirm'
      const confirmation = await confirm({ signal })
      throwIfAborted(signal)
      if (!confirmation?.confirmed) {
        fail(`MANUAL_CONFIRM_${confirmation?.reason ?? 'CANCELLED'}`, 'confirm')
      } else {
        result.phase = 'save'
        const saved = await session.saveState({ observationId: null, signal })
        if (saved.warning && !result.warnings.includes(saved.warning)) result.warnings.push(saved.warning)
        result.artifacts.state.committed = Boolean(saved.committed)
        if (!saved.committed) fail(saved.reason ?? 'STATE_NOT_COMMITTED', 'save')
        else {
          result.status = 'saved'
          result.confirmation = 'manual'
          await emit({ type: 'state-saved', path: options.statePath })
        }
      }
    } else {
      result.phase = 'wait'
      result.confirmation = 'automatic'
      const deadline = qrCompletedAt + options.loginTimeoutMs
      await emit({ type: 'waiting', timeoutMs: options.loginTimeoutMs })

      while (result.status === 'error' && result.error === null) {
        const remaining = deadline - clock.now()
        if (remaining <= 0) break
        await clock.sleep(Math.min(POLL_INTERVAL_MS, remaining), { signal })
        throwIfAborted(signal)
        if (clock.now() >= deadline) break

        const observed = await beforeDeadline(
          () => session.readSnapshot({ signal }),
          deadline,
          clock,
          signal,
        )
        throwIfAborted(signal)
        if (observed.kind === 'deadline' || clock.now() >= deadline) break

        const snapshot = observed.value
        if (snapshot.kind !== 'readable') {
          result.lastObservation = { kind: 'unreadable', reasonCodes: [snapshot.reason] }
          await emit({ type: 'observation', kind: 'unreadable', reasonCodes: [snapshot.reason] })
          continue
        }

        const matched = matchLoginState(snapshot, rules)
        result.lastObservation = {
          kind: 'readable',
          reasonCodes: matched.success ? matched.successMatches : matched.pendingMatches,
        }
        await emit({
          type: 'observation',
          kind: 'readable',
          reasonCodes: result.lastObservation.reasonCodes,
        })
        if (!matched.success) continue
        const validated = await beforeDeadline(
          () => session.validateObservation(snapshot.observationId),
          deadline,
          clock,
          signal,
        )
        if (validated.kind === 'deadline' || clock.now() >= deadline) break
        if (!validated.value) continue
        throwIfAborted(signal)

        result.phase = 'save'
        const saved = await session.saveState({
          observationId: snapshot.observationId,
          signal,
          deadline,
          clock,
        })
        if (saved.warning && !result.warnings.includes(saved.warning)) result.warnings.push(saved.warning)
        if (!saved.committed && ['OBSERVATION_CHANGED', 'DEADLINE_EXPIRED'].includes(saved.reason)) {
          result.phase = 'wait'
          continue
        }
        if (!saved.committed) {
          fail(saved.reason ?? 'STATE_NOT_COMMITTED', 'save')
          break
        }

        result.artifacts.state.committed = true
        result.status = 'saved'
        await emit({ type: 'state-saved', path: options.statePath })
      }

      if (result.status === 'error' && result.error === null) {
        result.status = 'timeout'
        result.phase = 'wait'
        result.error = { code: 'LOGIN_TIMEOUT', phase: 'wait' }
      }
    }
  } catch (error) {
    if (error?.secondaryCode && !result.warnings.includes(error.secondaryCode)) {
      result.warnings.push(error.secondaryCode)
    }
    fail(signal?.aborted ? 'CANCELLED' : errorCode(error, result.phase), result.phase)
    if (!session && error?.cleanup) result.cleanup = error.cleanup
  } finally {
    if (session) {
      try {
        await session.close()
        result.cleanup = { status: 'closed' }
      } catch {
        result.cleanup = { status: 'failed', code: 'CLOSE_FAILED' }
        if (result.status === 'saved' || result.status === 'qr-only') fail('CLOSE_FAILED', 'cleanup')
      }
    }
    await emit({ type: 'cleanup', ...result.cleanup })
    await emit({
      type: 'completed',
      status: result.status,
      stateCommitted: result.artifacts.state.committed,
    })
  }

  return result
}
