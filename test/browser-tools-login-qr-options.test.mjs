import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compileLoginRules,
  matchLoginState,
  parseArgs,
  sanitizeUrl,
} from '../scripts/browser-tools/login-qr.mjs'

test('login QR defaults preserve the Xiaomi Feishu completion rules', () => {
  const options = parseArgs([])
  const rules = compileLoginRules(options)

  assert.equal(options.qrSelector, 'img[src*="/qr_img?qr="]')
  assert.deepEqual(options.successHosts, ['mi.feishu.cn', 'mi-p.feishu.cn'])
  assert.equal(
    matchLoginState({
      currentUrl: 'https://mi.feishu.cn/file/example',
      bodyText: '',
      qrVisible: false,
    }, rules).success,
    true,
  )
  assert.equal(
    matchLoginState({
      currentUrl: 'https://mi.feishu.cn/file/example',
      bodyText: '使用小米人App扫码登录',
      qrVisible: false,
    }, rules).success,
    false,
  )
  assert.equal(
    matchLoginState({
      currentUrl: 'https://accounts.feishu.cn/login',
      bodyText: '',
      qrVisible: false,
    }, rules).success,
    false,
  )
})

test('login QR accepts custom QR selector and non-Feishu success rules', () => {
  const options = parseArgs([
    '--url',
    'https://login.example.com/qr',
    '--qr-selector',
    'img#login-qr',
    '--success-host',
    'https://App.Example.com/dashboard',
    '--success-url-pattern',
    '^https://auth\\.example\\.com/callback',
    '--success-text',
    'Welcome back',
    '--pending-url-pattern',
    '/qr',
    '--pending-text',
    'Scan with app',
    '--manual-confirm',
    '--use-shell-proxy',
  ])
  const rules = compileLoginRules(options)

  assert.equal(options.url, 'https://login.example.com/qr')
  assert.equal(options.qrSelector, 'img#login-qr')
  assert.equal(options.manualConfirm, true)
  assert.equal(options.useDirectProxy, false)
  assert.ok(rules.successHosts.includes('app.example.com'))
  assert.equal(
    matchLoginState({
      currentUrl: 'https://app.example.com/dashboard',
      bodyText: 'Home',
      qrVisible: false,
    }, rules).success,
    true,
  )
  assert.equal(
    matchLoginState({
      currentUrl: 'https://auth.example.com/callback?code=hidden',
      bodyText: '',
      qrVisible: false,
    }, rules).success,
    true,
  )
  assert.equal(
    matchLoginState({
      currentUrl: 'https://app.example.com/dashboard',
      bodyText: '',
      qrVisible: true,
    }, rules).success,
    false,
  )
  assert.equal(
    matchLoginState({
      currentUrl: 'https://login.example.com/qr',
      bodyText: 'Welcome back',
      qrVisible: false,
    }, rules).success,
    false,
  )
})

test('login QR rejects invalid custom URL patterns', () => {
  const options = parseArgs(['--success-url-pattern', '['])

  assert.throws(
    () => compileLoginRules(options),
    /--success-url-pattern expects a valid regular expression/,
  )
})

test('sanitizeUrl strips query strings and hashes from diagnostic output', () => {
  assert.equal(
    sanitizeUrl('https://example.com/path/to/page?token=secret#fragment'),
    'https://example.com/path/to/page',
  )
})
