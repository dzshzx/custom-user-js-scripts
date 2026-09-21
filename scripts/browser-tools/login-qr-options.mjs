import os from 'node:os'
import path from 'node:path'

export const DEFAULT_TARGET_URL = 'https://mi.feishu.cn/file/UxkDbtSZqo9Ya4xCGNZcWOmWnlf'
export const DEFAULT_ROOT_DIR = path.join(os.homedir(), '.local', 'share', 'codex-browser', 'feishu-login')
export const DEFAULT_PROFILE_DIR = path.join(DEFAULT_ROOT_DIR, 'playwright-profile')
export const DEFAULT_QR_PATH = path.join(DEFAULT_ROOT_DIR, 'qr.png')
export const DEFAULT_STATE_PATH = path.join(DEFAULT_ROOT_DIR, 'storage-state.json')
export const DEFAULT_QR_SELECTOR = 'img[src*="/qr_img?qr="]'
export const DEFAULT_TENANT_SWITCH_TEXT = '切换租户'
export const DEFAULT_SUCCESS_HOSTS = ['mi.feishu.cn', 'mi-p.feishu.cn']
export const DEFAULT_PENDING_URL_PATTERNS = ['cas\\.mioffice\\.cn/login', 'accounts\\.feishu\\.cn']
export const DEFAULT_PENDING_TEXTS = ['Login by scanning with Mier App', '使用小米人App扫码登录']
export const DEFAULT_WAIT_AFTER_NAVIGATION_MS = 12_000
export const DEFAULT_LOGIN_TIMEOUT_MS = 10 * 60 * 1000
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000

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
      case '--url': options.url = requireValue('--url', next); index += 1; break
      case '--profile-dir': options.profileDir = path.resolve(requireValue('--profile-dir', next)); index += 1; break
      case '--qr-path': options.qrPath = path.resolve(requireValue('--qr-path', next)); index += 1; break
      case '--state-path': options.statePath = path.resolve(requireValue('--state-path', next)); index += 1; break
      case '--qr-selector': options.qrSelector = requireValue('--qr-selector', next); index += 1; break
      case '--tenant': options.tenant = requireValue('--tenant', next); index += 1; break
      case '--tenant-switch-text': options.tenantSwitchText = requireValue('--tenant-switch-text', next); index += 1; break
      case '--success-host': options.successHosts.push(requireValue('--success-host', next)); index += 1; break
      case '--success-url-pattern': options.successUrlPatterns.push(requireValue('--success-url-pattern', next)); index += 1; break
      case '--success-text': options.successTexts.push(requireValue('--success-text', next)); index += 1; break
      case '--pending-url-pattern': options.pendingUrlPatterns.push(requireValue('--pending-url-pattern', next)); index += 1; break
      case '--pending-text': options.pendingTexts.push(requireValue('--pending-text', next)); index += 1; break
      case '--wait-after-nav-ms': options.waitAfterNavigationMs = parseInteger(requireValue('--wait-after-nav-ms', next), '--wait-after-nav-ms'); index += 1; break
      case '--login-timeout-ms': options.loginTimeoutMs = parseInteger(requireValue('--login-timeout-ms', next), '--login-timeout-ms'); index += 1; break
      case '--navigation-timeout-ms': options.navigationTimeoutMs = parseInteger(requireValue('--navigation-timeout-ms', next), '--navigation-timeout-ms'); index += 1; break
      case '--headful': options.headless = false; break
      case '--no-wait': options.waitForLogin = false; break
      case '--manual-confirm': options.manualConfirm = true; break
      case '--refresh': options.refresh = true; break
      case '--use-shell-proxy': options.useDirectProxy = false; break
      case '--debug': options.debug = true; break
      case '--help':
      case '-h': options.help = true; break
      default: throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export function sanitizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return '(invalid URL)'
  }
}

function normalizeHost(rawHost) {
  const trimmed = rawHost.trim()
  if (!trimmed) throw new Error('Host matchers cannot be empty')
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
  try { return new URL(rawUrl).host.toLowerCase() } catch { return '' }
}

export function matchLoginState({ currentUrl, bodyText, qrVisible }, rules) {
  const successMatches = []
  const pendingMatches = []
  const currentHost = urlHost(currentUrl)

  if (currentHost && rules.successHosts.includes(currentHost)) successMatches.push('success-host')
  if (rules.successUrlPatterns.some((pattern) => pattern.test(currentUrl))) successMatches.push('success-url-pattern')
  if (rules.successTexts.some((text) => text && bodyText.includes(text))) successMatches.push('success-text')
  if (rules.pendingUrlPatterns.some((pattern) => pattern.test(currentUrl))) pendingMatches.push('pending-url-pattern')
  if (rules.pendingTexts.some((text) => text && bodyText.includes(text))) pendingMatches.push('pending-text')
  if (qrVisible) pendingMatches.push('qr-visible')

  return {
    success: successMatches.length > 0 && pendingMatches.length === 0,
    successMatches,
    pendingMatches,
  }
}
