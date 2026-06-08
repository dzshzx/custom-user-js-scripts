import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const DEFAULT_TARGET_URL = 'https://mi.feishu.cn/file/UxkDbtSZqo9Ya4xCGNZcWOmWnlf'
const DEFAULT_ROOT_DIR = path.join(os.homedir(), '.local', 'share', 'codex-browser', 'feishu-login')
const DEFAULT_PROFILE_DIR = path.join(DEFAULT_ROOT_DIR, 'playwright-profile')
const DEFAULT_QR_PATH = path.join(DEFAULT_ROOT_DIR, 'qr.png')
const DEFAULT_STATE_PATH = path.join(DEFAULT_ROOT_DIR, 'storage-state.json')
const DEFAULT_WAIT_AFTER_NAVIGATION_MS = 12_000
const DEFAULT_LOGIN_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000
const DIRECT_PROXY_ARGS = ['--proxy-server=direct://', '--proxy-bypass-list=*']

function printHelp() {
  console.log(`Usage:
  node scripts/feishu/login-qr.mjs [options]

Options:
  --url <url>                 Target Feishu URL to open
  --profile-dir <dir>         Persistent browser profile directory
  --qr-path <file>            Where to write the QR PNG
  --state-path <file>         Where to write Playwright storage state after login
  --tenant <name>             Tenant name to select before exporting the QR
  --wait-after-nav-ms <ms>    Extra wait after navigation before reading the QR
  --login-timeout-ms <ms>     How long to wait for the login redirect
  --navigation-timeout-ms <ms> Playwright navigation timeout
  --headful                   Run with a visible browser window instead of headless
  --no-wait                   Export the QR and exit immediately
  --refresh                   Force one reload before exporting the QR
  --debug                     Print extra runtime details
  --help                      Show this help

Notes:
  - Browser traffic is forced to direct mode for this session; Feishu/CAS will not use your shell proxy.
  - Playwright uses its bundled Chromium only; this script does not launch system Chrome.
  - QR image, browser profile, and storage state default to ${DEFAULT_ROOT_DIR}
  - The script never prints the QR token or cookies.`)
}

function parseInteger(value, flagName) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flagName} expects a non-negative integer, got: ${value}`)
  }
  return parsed
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_TARGET_URL,
    profileDir: DEFAULT_PROFILE_DIR,
    qrPath: DEFAULT_QR_PATH,
    statePath: DEFAULT_STATE_PATH,
    tenant: '',
    waitAfterNavigationMs: DEFAULT_WAIT_AFTER_NAVIGATION_MS,
    loginTimeoutMs: DEFAULT_LOGIN_TIMEOUT_MS,
    navigationTimeoutMs: DEFAULT_NAVIGATION_TIMEOUT_MS,
    headless: true,
    waitForLogin: true,
    refresh: false,
    debug: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    switch (arg) {
      case '--url':
        if (!next) throw new Error('--url requires a value')
        options.url = next
        index += 1
        break
      case '--profile-dir':
        if (!next) throw new Error('--profile-dir requires a value')
        options.profileDir = path.resolve(next)
        index += 1
        break
      case '--qr-path':
        if (!next) throw new Error('--qr-path requires a value')
        options.qrPath = path.resolve(next)
        index += 1
        break
      case '--state-path':
        if (!next) throw new Error('--state-path requires a value')
        options.statePath = path.resolve(next)
        index += 1
        break
      case '--tenant':
        if (!next) throw new Error('--tenant requires a value')
        options.tenant = next
        index += 1
        break
      case '--wait-after-nav-ms':
        if (!next) throw new Error('--wait-after-nav-ms requires a value')
        options.waitAfterNavigationMs = parseInteger(next, '--wait-after-nav-ms')
        index += 1
        break
      case '--login-timeout-ms':
        if (!next) throw new Error('--login-timeout-ms requires a value')
        options.loginTimeoutMs = parseInteger(next, '--login-timeout-ms')
        index += 1
        break
      case '--navigation-timeout-ms':
        if (!next) throw new Error('--navigation-timeout-ms requires a value')
        options.navigationTimeoutMs = parseInteger(next, '--navigation-timeout-ms')
        index += 1
        break
      case '--headful':
        options.headless = false
        break
      case '--no-wait':
        options.waitForLogin = false
        break
      case '--refresh':
        options.refresh = true
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

function sanitizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return rawUrl
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

async function exportQrElement(page, qrPath) {
  const qrImage = page.locator('img[src*="/qr_img?qr="]').first()
  await qrImage.waitFor({ state: 'visible', timeout: 15_000 })

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
  await ensureParentDirectory(qrPath)
  await writeFile(qrPath, Buffer.from(encoded, 'base64'))

  return qrImage
}

async function selectTenant(page, tenantName) {
  if (!tenantName) {
    return false
  }

  const bodyText = await page.locator('body').innerText().catch(() => '')
  if (bodyText.includes(tenantName)) {
    return false
  }

  const switchTenantButton = page.getByText('切换租户', { exact: true })
  await switchTenantButton.waitFor({ state: 'visible', timeout: 15_000 })
  await switchTenantButton.click()

  const tenantOption = page.getByText(tenantName, { exact: true })
  await tenantOption.waitFor({ state: 'visible', timeout: 15_000 })
  await tenantOption.click()
  await page.waitForTimeout(1500)
  return true
}

async function waitForLogin(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastUrl = page.url()

  while (Date.now() < deadline) {
    await page.waitForTimeout(3000)
    const currentUrl = page.url()
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const isCasLogin = /cas\.mioffice\.cn\/login/.test(currentUrl)
    const isIntermediateFeishuLogin = /accounts\.feishu\.cn/.test(currentUrl)
    const hasScanPrompt =
      bodyText.includes('Login by scanning with Mier App') || bodyText.includes('使用小米人App扫码登录')
    const reachedTargetFeishuHost = /https:\/\/(?:mi|mi-p)\.feishu\.cn\//.test(currentUrl)

    if (reachedTargetFeishuHost && !hasScanPrompt) {
      return {
        success: true,
        url: currentUrl,
      }
    }

    if (!isCasLogin && !isIntermediateFeishuLogin && !hasScanPrompt) {
      lastUrl = currentUrl
    }

    lastUrl = currentUrl
  }

  return {
    success: false,
    url: lastUrl,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const { chromium } = await resolvePlaywrightImport()
  await mkdir(options.profileDir, { recursive: true })
  await ensureParentDirectory(options.qrPath)
  await ensureParentDirectory(options.statePath)

  const launchOptions = {
    headless: options.headless,
    args: DIRECT_PROXY_ARGS,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 2200 },
  }

  const context = await chromium.launchPersistentContext(options.profileDir, launchOptions)

  try {
    const page = context.pages()[0] ?? (await context.newPage())
    await openLoginPage(page, options)
    const tenantChanged = await selectTenant(page, options.tenant)
    const qrImage = await exportQrElement(page, options.qrPath)

    console.log(`Saved QR image: ${options.qrPath}`)
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

    console.log('Waiting for login redirect...')
    const result = await waitForLogin(page, options.loginTimeoutMs)
    await context.storageState({ path: options.statePath })

    if (!result.success) {
      throw new Error(
        `Login was not detected before timeout. QR file is still at ${options.qrPath}. Refresh and rerun the script for a new code.`,
      )
    }

    console.log(`Login detected: ${sanitizeUrl(result.url)}`)
    console.log(`Saved storage state: ${options.statePath}`)
  } finally {
    await context.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
