import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { runLoginCapture } from './login-qr-flow.mjs'
import {
  DEFAULT_ROOT_DIR,
  compileLoginRules,
  matchLoginState,
  parseArgs,
  parseInteger,
  sanitizeUrl,
} from './login-qr-options.mjs'
import { createPlaywrightLoginBrowser } from './login-qr-playwright.mjs'

export { compileLoginRules, matchLoginState, parseArgs, parseInteger, sanitizeUrl }

function printHelp(output = process.stdout) {
  output.write(`Usage:
  node scripts/browser-tools/login-qr.mjs [options]

Options:
  --url <url>                 Target URL to open
  --profile-dir <dir>         Persistent browser profile directory
  --qr-path <file>            Where to write the QR PNG
  --state-path <file>         Where to write Playwright storage state after login
  --qr-selector <selector>    CSS selector for the QR image element
  --tenant <name>             Feishu tenant name to select before exporting the QR
  --tenant-switch-text <text> Text of the tenant switch button
  --success-host <host>       Host that means login succeeded; repeatable
  --success-url-pattern <re>  URL regex that means login succeeded; repeatable
  --success-text <text>       Page text that means login succeeded; repeatable
  --pending-url-pattern <re>  URL regex that still means login is pending; repeatable
  --pending-text <text>       Page text that still means login is pending; repeatable
  --wait-after-nav-ms <ms>    Extra wait after navigation before reading the QR
  --login-timeout-ms <ms>     How long to wait for the login redirect
  --navigation-timeout-ms <ms> Playwright navigation timeout
  --headful                   Run with a visible browser window instead of headless
  --no-wait                   Export the QR and exit immediately
  --manual-confirm            Save state after you press Enter instead of URL/text polling
  --refresh                   Force one reload before exporting the QR
  --use-shell-proxy           Do not force Chromium direct proxy mode
  --debug                     Print extra runtime details
  --help                      Show this help

Notes:
  - Defaults preserve the Xiaomi Feishu flow.
  - For other sites pass --url, --qr-selector, and a success rule or --manual-confirm.
  - Browser traffic is forced to direct mode by default; pass --use-shell-proxy to keep your shell proxy.
  - Playwright uses its bundled Chromium only; this script does not launch system Chrome.
  - QR image, browser profile, and storage state default to ${DEFAULT_ROOT_DIR}
  - The saved storage state can be reused with agent-browser: agent-browser --state <state-path> open <url>
  - The script never prints the QR token, page body, cookies, or storage state contents.\n`)
}

export async function waitForManualConfirmation({
  input = process.stdin,
  output = process.stdout,
  signal,
} = {}) {
  if (!input.isTTY) return { confirmed: false, reason: 'NOT_TTY' }
  output.write('Scan and finish login in the browser, then press Enter to save storage state.')
  return new Promise((resolve) => {
    let settled = false
    const cleanup = () => {
      input.removeListener('data', onData)
      input.removeListener('end', onEnd)
      input.removeListener('close', onEnd)
      input.removeListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const finish = (result) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const onData = (chunk) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      if (text.includes('\n') || text.includes('\r')) finish({ confirmed: true })
    }
    const onEnd = () => finish({ confirmed: false, reason: 'EOF' })
    const onError = () => finish({ confirmed: false, reason: 'TERMINAL_ERROR' })
    const onAbort = () => finish({ confirmed: false, reason: 'CANCELLED' })
    input.on('data', onData)
    input.once('end', onEnd)
    input.once('close', onEnd)
    input.once('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
    else input.resume?.()
  })
}

function writeLine(stream, line) {
  stream.write(`${line}\n`)
}

function eventLogger(options, output) {
  return async (event) => {
    switch (event.type) {
      case 'qr-ready':
        writeLine(output, `Saved QR image: ${event.path} (${event.method})`)
        writeLine(output, `Profile dir: ${options.profileDir}`)
        if (options.tenant) {
          writeLine(output, `Tenant: ${options.tenant}${event.tenantChanged ? ' (selected)' : ' (already active)'}`)
        }
        if (options.debug) {
          writeLine(output, `Target page: ${event.diagnostics?.targetPage ?? sanitizeUrl(options.url)}`)
          writeLine(output, `QR src host: ${event.diagnostics?.qrSourceOrigin ?? '(unavailable)'}`)
          if (event.diagnostics?.qrBox) {
            writeLine(output, `QR box: ${event.diagnostics.qrBox.width}x${event.diagnostics.qrBox.height}`)
          }
        }
        break
      case 'waiting':
        writeLine(output, 'Waiting for login redirect...')
        break
      case 'state-saved':
        writeLine(output, `Saved storage state: ${event.path}`)
        break
      default:
        break
    }
  }
}

function reportResult(result, options, output, errorOutput) {
  if (result.artifacts.state.committed) {
    writeLine(output, `agent-browser reuse: agent-browser --state ${options.statePath} open ${sanitizeUrl(options.url)}`)
  }
  if (result.status === 'timeout') {
    writeLine(errorOutput, `Login was not detected before timeout. QR file remains at ${options.qrPath}.`)
  } else if (result.status === 'error') {
    writeLine(errorOutput, `Login capture failed (${result.error?.code ?? 'UNKNOWN_ERROR'}) at ${result.error?.phase ?? result.phase}.`)
    if (result.artifacts.state.committed) writeLine(errorOutput, 'Storage state was committed before the later failure.')
  }
  if (result.cleanup.status === 'failed' && result.error?.code !== 'CLOSE_FAILED') {
    writeLine(errorOutput, `Browser cleanup also failed (${result.cleanup.code}).`)
  }
}

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const runtime = dependencies.runtime ?? process
  const output = dependencies.stdout ?? process.stdout
  const errorOutput = dependencies.stderr ?? process.stderr
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    writeLine(errorOutput, error instanceof Error ? error.message : 'Invalid arguments')
    return 1
  }
  if (options.help) {
    printHelp(output)
    return 0
  }

  const abortController = new AbortController()
  let signalExitCode = null
  const onSigint = () => {
    signalExitCode ??= 130
    abortController.abort(new Error('SIGINT'))
  }
  const onSigterm = () => {
    signalExitCode ??= 143
    abortController.abort(new Error('SIGTERM'))
  }
  runtime.once('SIGINT', onSigint)
  runtime.once('SIGTERM', onSigterm)

  try {
    const capture = dependencies.capture ?? runLoginCapture
    const browser = dependencies.browser ?? createPlaywrightLoginBrowser()
    const confirm = dependencies.confirm ?? (({ signal }) => waitForManualConfirmation({ signal }))
    const result = await capture(options, {
      browser,
      clock: dependencies.clock,
      confirm,
      onEvent: dependencies.onEvent ?? eventLogger(options, output),
      signal: abortController.signal,
    })
    reportResult(result, options, output, errorOutput)
    if (signalExitCode !== null) return signalExitCode
    return result.status === 'saved' || result.status === 'qr-only' ? 0 : 1
  } finally {
    runtime.removeListener('SIGINT', onSigint)
    runtime.removeListener('SIGTERM', onSigterm)
  }
}

function isCliEntryPoint() {
  return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false
}

if (isCliEntryPoint()) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode
  }).catch(() => {
    process.stderr.write('Login capture failed unexpectedly.\n')
    process.exitCode = 1
  })
}
