import os from 'node:os';
import path from 'node:path';

import { appendValue, createCli, integerValue, parseCli, parseInteger, requireValue } from './cli-args.mjs';

export const DEFAULT_TARGET_URL = 'https://mi.feishu.cn/file/UxkDbtSZqo9Ya4xCGNZcWOmWnlf';
export const DEFAULT_ROOT_DIR = path.join(os.homedir(), '.local', 'share', 'codex-browser', 'feishu-login');
export const DEFAULT_PROFILE_DIR = path.join(DEFAULT_ROOT_DIR, 'playwright-profile');
export const DEFAULT_QR_PATH = path.join(DEFAULT_ROOT_DIR, 'qr.png');
export const DEFAULT_STATE_PATH = path.join(DEFAULT_ROOT_DIR, 'storage-state.json');
export const DEFAULT_QR_SELECTOR = 'img[src*="/qr_img?qr="]';
export const DEFAULT_TENANT_SWITCH_TEXT = '切换租户';
export const DEFAULT_SUCCESS_HOSTS = ['mi.feishu.cn', 'mi-p.feishu.cn'];
export const DEFAULT_PENDING_URL_PATTERNS = ['cas\\.mioffice\\.cn/login', 'accounts\\.feishu\\.cn'];
export const DEFAULT_PENDING_TEXTS = ['Login by scanning with Mier App', '使用小米人App扫码登录'];
export const DEFAULT_WAIT_AFTER_NAVIGATION_MS = 12_000;
export const DEFAULT_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;

export { parseInteger };

const resolvedPath = (flagName) => {
  const check = requireValue(flagName);
  return (value) => path.resolve(check(value));
};

export function parseArgs(argv) {
  const program = createCli()
    .option('--url <url>', '', requireValue('--url'), DEFAULT_TARGET_URL)
    .option('--profile-dir <dir>', '', resolvedPath('--profile-dir'), DEFAULT_PROFILE_DIR)
    .option('--qr-path <file>', '', resolvedPath('--qr-path'), DEFAULT_QR_PATH)
    .option('--state-path <file>', '', resolvedPath('--state-path'), DEFAULT_STATE_PATH)
    .option('--qr-selector <selector>', '', requireValue('--qr-selector'), DEFAULT_QR_SELECTOR)
    .option('--tenant <name>', '', requireValue('--tenant'), '')
    .option('--tenant-switch-text <text>', '', requireValue('--tenant-switch-text'), DEFAULT_TENANT_SWITCH_TEXT)
    .option('--success-host <host>', '', appendValue('--success-host'), [...DEFAULT_SUCCESS_HOSTS])
    .option('--success-url-pattern <regex>', '', appendValue('--success-url-pattern'), [])
    .option('--success-text <text>', '', appendValue('--success-text'), [])
    .option('--pending-url-pattern <regex>', '', appendValue('--pending-url-pattern'), [
      ...DEFAULT_PENDING_URL_PATTERNS,
    ])
    .option('--pending-text <text>', '', appendValue('--pending-text'), [...DEFAULT_PENDING_TEXTS])
    .option('--wait-after-nav-ms <ms>', '', integerValue('--wait-after-nav-ms'), DEFAULT_WAIT_AFTER_NAVIGATION_MS)
    .option('--login-timeout-ms <ms>', '', integerValue('--login-timeout-ms'), DEFAULT_LOGIN_TIMEOUT_MS)
    .option('--navigation-timeout-ms <ms>', '', integerValue('--navigation-timeout-ms'), DEFAULT_NAVIGATION_TIMEOUT_MS)
    .option('--headful')
    .option('--no-wait')
    .option('--manual-confirm')
    .option('--refresh')
    .option('--use-shell-proxy')
    .option('--debug');
  const opts = parseCli(program, argv);
  const options = {
    url: opts.url,
    profileDir: opts.profileDir,
    qrPath: opts.qrPath,
    statePath: opts.statePath,
    qrSelector: opts.qrSelector,
    tenant: opts.tenant,
    tenantSwitchText: opts.tenantSwitchText,
    successHosts: opts.successHost,
    successUrlPatterns: opts.successUrlPattern,
    successTexts: opts.successText,
    pendingUrlPatterns: opts.pendingUrlPattern,
    pendingTexts: opts.pendingText,
    waitAfterNavigationMs: opts.waitAfterNavMs,
    loginTimeoutMs: opts.loginTimeoutMs,
    navigationTimeoutMs: opts.navigationTimeoutMs,
    headless: !opts.headful,
    waitForLogin: opts.wait,
    manualConfirm: Boolean(opts.manualConfirm),
    refresh: Boolean(opts.refresh),
    useDirectProxy: !opts.useShellProxy,
    debug: Boolean(opts.debug),
  };
  if (opts.help) options.help = true;
  return options;
}

export function sanitizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '(invalid URL)';
  }
}

function normalizeHost(rawHost) {
  const trimmed = rawHost.trim();
  if (!trimmed) throw new Error('Host matchers cannot be empty');
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).host.toLowerCase();
  } catch {
    throw new Error(`--success-host expects a hostname or URL, got: ${rawHost}`);
  }
}

function compilePatterns(patterns, flagName) {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch {
      throw new Error(`${flagName} expects a valid regular expression, got: ${pattern}`);
    }
  });
}

export function compileLoginRules(options) {
  return {
    successHosts: options.successHosts.map(normalizeHost),
    successUrlPatterns: compilePatterns(options.successUrlPatterns, '--success-url-pattern'),
    successTexts: [...options.successTexts],
    pendingUrlPatterns: compilePatterns(options.pendingUrlPatterns, '--pending-url-pattern'),
    pendingTexts: [...options.pendingTexts],
  };
}

function urlHost(rawUrl) {
  try {
    return new URL(rawUrl).host.toLowerCase();
  } catch {
    return '';
  }
}

export function matchLoginState({ currentUrl, bodyText, qrVisible }, rules) {
  const successMatches = [];
  const pendingMatches = [];
  const currentHost = urlHost(currentUrl);

  if (currentHost && rules.successHosts.includes(currentHost)) successMatches.push('success-host');
  if (rules.successUrlPatterns.some((pattern) => pattern.test(currentUrl))) successMatches.push('success-url-pattern');
  if (rules.successTexts.some((text) => text && bodyText.includes(text))) successMatches.push('success-text');
  if (rules.pendingUrlPatterns.some((pattern) => pattern.test(currentUrl))) pendingMatches.push('pending-url-pattern');
  if (rules.pendingTexts.some((text) => text && bodyText.includes(text))) pendingMatches.push('pending-text');
  if (qrVisible) pendingMatches.push('qr-visible');

  return {
    success: successMatches.length > 0 && pendingMatches.length === 0,
    successMatches,
    pendingMatches,
  };
}
