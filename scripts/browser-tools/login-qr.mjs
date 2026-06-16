import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'

const DEFAULT_TARGET_URL = 'https://mi.feishu.cn/file/UxkDbtSZqo9Ya4xCGNZcWOmWnlf'
const DEFAULT_ROOT_DIR = path.join(os.homedir(), '.local', 'share', 'codex-browser', 'feishu-login')
const DEFAULT_PROFILE_DIR = path.join(DEFAULT_ROOT_DIR, 'playwright-profile')
const DEFAULT_QR_PATH = path.join(DEFAULT_ROOT_DIR, 'qr.png')
const DEFAULT_STATE_PATH = path.join(DEFAULT_ROOT_DIR, 'storage-state.json')
const DEFAULT_QR_SELECTOR = 'img[src*="/qr_img?qr="]'
const DEFAULT_TENANT_SWITCH_TEXT = '切换租户'
const DEFAULT_SUCCESS_HOSTS = ['mi.feishu.cn', 'mi-p.feishu.cn']
const DEFAULT_PENDING_URL_PATTERNS = ['cas\\.mioffice\\.cn/login', 'accounts\\.feishu\\.cn']
const DEFAULT_PENDING_TEXTS = ['Login by scanning with Mier App', '使用小米人App扫码登录']
const DEFAULT_WAIT_AFTER_NAVIGATION_MS = 12_000
const DEFAULT_LOGIN_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000
const DIRECT_PROXY_ARGS = ['--proxy-server=direct://', '--proxy-bypass-list=*']

function printHelp() {
  console.log(`Usage:
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
  - The script never prints the QR token or cookies.`)
}

export function parseInteger(value, flagName) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flagName} expects a non-negative integer, got: ${value}`)
  }
  return parsed
}

function requireValue(flagName, value) {
  if (!value) throw new Error(`${flagName} requires a value`)
  return value
}

function addValue(values, value) {
  values.push(value)
}

export function parseArgs(argv) {
  const options = {
    url: DEFAULT_TARGET_URL,
    profileDir: DEFAULT_PROFILE_DIR,
    qrPath: DEFAULT_QR_PATH,
    statePath: DEFAULT_STATE_PATH,
    qrSelector: DEFAULT_QR_SELECTOR,
    tenant: '',
    tenantSwitchText: DEFAULT_TENANT_SWITCH_TEXT,
    successHosts: [...DEFAULT_SUCCESS_HOSTS],
    successUrlPatterns: [],
    successTexts: [],
    pendingUrlPatterns: [...DEFAULT_PENDING_URL_PATTERNS],
    pendingTexts: [...DEFAULT_PENDING_TEXTS],
    waitAfterNavigationMs: DEFAULT_WAIT_AFTER_NAVIGATION_MS,
    loginTimeoutMs: DEFAULT_LOGIN_TIMEOUT_MS,
    navigationTimeoutMs: DEFAULT_NAVIGATION_TIMEOUT_MS,
    headless: true,
    waitForLogin: true,
    manualConfirm: false,
    refresh: false,
    useDirectProxy: true,
    debug: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    switch (arg) {
      case '--url':
        options.url = requireValue('--url', next)
        index += 1
        break
      case '--profile-dir':
        options.profileDir = path.resolve(requireValue('--profile-dir', next))
        index += 1
        break
      case '--qr-path':
        options.qrPath = path.resolve(requireValue('--qr-path', next))
        index += 1
        break
      case '--state-path':
        options.statePath = path.resolve(requireValue('--state-path', next))
        index += 1
        break
      case '--qr-selector':
        options.qrSelector = requireValue('--qr-selector', next)
        index += 1
        break
      case '--tenant':
        options.tenant = requireValue('--tenant', next)
        index += 1
        break
      case '--tenant-switch-text':
        options.tenantSwitchText = requireValue('--tenant-switch-text', next)
        index += 1
        break
      case '--success-host':
        addValue(options.successHosts, requireValue('--success-host', next))
        index += 1
        break
      case '--success-url-pattern':
        addValue(options.successUrlPatterns, requireValue('--success-url-pattern', next))
        index += 1
        break
      case '--success-text':
        addValue(options.successTexts, requireValue('--success-text', next))
        index += 1
        break
      case '--pending-url-pattern':
        addValue(options.pendingUrlPatterns, requireValue('--pending-url-pattern', next))
        index += 1
        break
      case '--pending-text':
        addValue(options.pendingTexts, requireValue('--pending-text', next))
        index += 1
        break
      case '--wait-after-nav-ms':
        options.waitAfterNavigationMs = parseInteger(requireValue('--wait-after-nav-ms', next), '--wait-after-nav-ms')
        index += 1
        break
      case '--login-timeout-ms':
        options.loginTimeoutMs = parseInteger(requireValue('--login-timeout-ms', next), '--login-timeout-ms')
        index += 1
        break
      case '--navigation-timeout-ms':
        options.navigationTimeoutMs = parseInteger(requireValue('--navigation-timeout-ms', next), '--navigation-timeout-ms')
        index += 1
        break
      case '--headful':
        options.headless = false
        break
      case '--no-wait':
        options.waitForLogin = false
        break
      case '--manual-confirm':
        options.manualConfirm = true
        break
      case '--refresh':
        options.refresh = true
        break
      case '--use-shell-proxy':
        options.useDirectProxy = false
        break
      case '--debug':
        options.debug = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export function sanitizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return rawUrl
  }
}

function normalizeHost(rawHost) {
  const trimmed = rawHost.trim()
  if (!trimmed) {
    throw new Error('Host matchers cannot be empty')
  }

  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).host.toLowerCase()
  } catch {
    throw new Error(`--success-host expects a hostname or URL, got: ${rawHost}`)
  }
}

function compilePatterns(patterns, flagName) {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern)
    } catch {
      throw new Error(`${flagName} expects a valid regular expression, got: ${pattern}`)
    }
  })
}

export function compileLoginRules(options) {
  return {
    successHosts: options.successHosts.map(normalizeHost),
    successUrlPatterns: compilePatterns(options.successUrlPatterns, '--success-url-pattern'),
    successTexts: [...options.successTexts],
    pendingUrlPatterns: compilePatterns(options.pendingUrlPatterns, '--pending-url-pattern'),
    pendingTexts: [...options.pendingTexts],
  }
}

function urlHost(rawUrl) {
  try {
    return new URL(rawUrl).host.toLowerCase()
  } catch {
    return ''
  }
}

function includesAny(value, needles) {
  return needles.some((needle) => needle && value.includes(needle))
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value))
}

export function matchLoginState({ currentUrl, bodyText, qrVisible }, rules) {
  const currentHost = urlHost(currentUrl)
  const successMatches = []
  const pendingMatches = []

  if (currentHost && rules.successHosts.includes(currentHost)) {
    successMatches.push('success-host')
  }

  if (matchesAny(currentUrl, rules.successUrlPatterns)) {
    successMatches.push('success-url-pattern')
  }

  if (includesAny(bodyText, rules.successTexts)) {
    successMatches.push('success-text')
  }

  if (matchesAny(currentUrl, rules.pendingUrlPatterns)) {
    pendingMatches.push('pending-url-pattern')
  }

  if (includesAny(bodyText, rules.pendingTexts)) {
    pendingMatches.push('pending-text')
  }

  if (qrVisible) {
    pendingMatches.push('qr-visible')
  }

  return {
    success: successMatches.length > 0 && pendingMatches.length === 0,
    successMatches,
    pendingMatches,
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function ensureParentDirectory(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true })
}

async function resolvePlaywrightImport() {
  try {
    return await import('playwright')
  } catch {}

  const npxRoot = path.join(os.homedir(), '.npm', '_npx')
  const rootExists = await fileExists(npxRoot)
  if (!rootExists) {
    throw new Error(
      'Playwright is not available. Run `npx --yes playwright --version` once to warm the npm cache, or install Playwright locally as a dev dependency.',
    )
  }

  const entries = await readdir(npxRoot, { withFileTypes: true })
  const candidates = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const modulePath = path.join(npxRoot, entry.name, 'node_modules', 'playwright', 'index.mjs')
    if (!(await fileExists(modulePath))) continue
    const moduleStat = await stat(modulePath)
    candidates.push({ modulePath, mtimeMs: moduleStat.mtimeMs })
  }

  if (candidates.length === 0) {
    throw new Error(
      'Playwright is not available. Run `npx --yes playwright --version` once to warm the npm cache, or install Playwright locally as a dev dependency.',
    )
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return import(pathToFileURL(candidates[0].modulePath).href)
}

async function openLoginPage(page, options) {
  await page.goto(options.url, {
    waitUntil: 'domcontentloaded',
    timeout: options.navigationTimeoutMs,
  })
  await page.waitForTimeout(options.waitAfterNavigationMs)

  if (options.refresh) {
    await page.reload({
      waitUntil: 'domcontentloaded',
      timeout: options.navigationTimeoutMs,
    })
    await page.waitForTimeout(options.waitAfterNavigationMs)
  }
}

async function exportQrElement(page, qrPath, qrSelector) {
  const qrImage = page.locator(qrSelector).first()
  await qrImage.waitFor({ state: 'visible', timeout: 15_000 })

  await ensureParentDirectory(qrPath)

  try {
    const dataUrl = await qrImage.evaluate((image) => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('canvas context unavailable')
      }
      context.drawImage(image, 0, 0)
      return canvas.toDataURL('image/png')
    })

    const encoded = dataUrl.replace(/^data:image\/png;base64,/, '')
    await writeFile(qrPath, Buffer.from(encoded, 'base64'))
    return { qrImage, exportMethod: 'image-data' }
  } catch {
    await qrImage.screenshot({ path: qrPath })
    return { qrImage, exportMethod: 'element-screenshot' }
  }
}

async function selectTenant(page, options) {
  if (!options.tenant) {
    return false
  }

  const bodyText = await page.locator('body').innerText().catch(() => '')
  if (bodyText.includes(options.tenant)) {
    return false
  }

  const switchTenantButton = page.getByText(options.tenantSwitchText, { exact: true })
  await switchTenantButton.waitFor({ state: 'visible', timeout: 15_000 })
  await switchTenantButton.click()

  const tenantOption = page.getByText(options.tenant, { exact: true })
  await tenantOption.waitFor({ state: 'visible', timeout: 15_000 })
  await tenantOption.click()
  await page.waitForTimeout(1500)
  return true
}

async function readLoginSnapshot(page, qrSelector) {
  const currentUrl = page.url()
  const bodyText = await page.locator('body').innerText().catch(() => '')
  const qrVisible = await page.locator(qrSelector).first().isVisible().catch(() => false)
  return { currentUrl, bodyText, qrVisible }
}

async function waitForLogin(page, options, rules) {
  const deadline = Date.now() + options.loginTimeoutMs
  let lastUrl = page.url()

  while (Date.now() < deadline) {
    await page.waitForTimeout(3000)
    const snapshot = await readLoginSnapshot(page, options.qrSelector)
    const result = matchLoginState(snapshot, rules)

    if (result.success) {
      return {
        success: true,
        url: snapshot.currentUrl,
      }
    }

    lastUrl = snapshot.currentUrl
  }

  return {
    success: false,
    url: lastUrl,
  }
}

async function waitForManualConfirmation(input = process.stdin, output = process.stdout) {
  if (!input.isTTY) {
    throw new Error('--manual-confirm requires an interactive terminal')
  }

  const readline = createInterface({ input, output })
  try {
    await readline.question('Scan and finish login in the browser, then press Enter to save storage state.')
  } finally {
    readline.close()
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }
  const loginRules = compileLoginRules(options)

  const { chromium } = await resolvePlaywrightImport()
  await mkdir(options.profileDir, { recursive: true })
  await ensureParentDirectory(options.qrPath)
  await ensureParentDirectory(options.statePath)

  const launchOptions = {
    headless: options.headless,
    args: options.useDirectProxy ? DIRECT_PROXY_ARGS : [],
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 2200 },
  }

  const context = await chromium.launchPersistentContext(options.profileDir, launchOptions)

  try {
    const page = context.pages()[0] ?? (await context.newPage())
    await openLoginPage(page, options)
    const tenantChanged = await selectTenant(page, options)
    const { qrImage, exportMethod } = await exportQrElement(page, options.qrPath, options.qrSelector)

    console.log(`Saved QR image: ${options.qrPath} (${exportMethod})`)
    console.log(`Profile dir: ${options.profileDir}`)
    if (options.tenant) {
      console.log(`Tenant: ${options.tenant}${tenantChanged ? ' (selected)' : ' (already active)'}`)
    }

    if (options.debug) {
      const qrSrc = await qrImage.getAttribute('src')
      const qrBox = await qrImage.boundingBox()
      console.log(`Target page: ${sanitizeUrl(page.url())}`)
      console.log(`QR src host: ${qrSrc ? sanitizeUrl(qrSrc) : '(missing)'}`)
      if (qrBox) {
        console.log(`QR box: ${Math.round(qrBox.width)}x${Math.round(qrBox.height)}`)
      }
    }

    if (!options.waitForLogin) {
      return
    }

    if (options.manualConfirm) {
      await waitForManualConfirmation()
      await context.storageState({ path: options.statePath })
      console.log(`Saved storage state: ${options.statePath}`)
      console.log(`agent-browser reuse: agent-browser --state ${options.statePath} open ${sanitizeUrl(options.url)}`)
      return
    }

    console.log('Waiting for login redirect...')
    const result = await waitForLogin(page, options, loginRules)

    if (!result.success) {
      throw new Error(
        `Login was not detected before timeout. QR file is still at ${options.qrPath}. Refresh and rerun the script for a new code.`,
      )
    }

    await context.storageState({ path: options.statePath })
    console.log(`Login detected: ${sanitizeUrl(result.url)}`)
    console.log(`Saved storage state: ${options.statePath}`)
    console.log(`agent-browser reuse: agent-browser --state ${options.statePath} open ${sanitizeUrl(options.url)}`)
  } finally {
    await context.close()
  }
}

function isCliEntryPoint() {
  return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false
}

if (isCliEntryPoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
