import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { resolvePlaywrightImport } from './playwright-loader.mjs'
import { readPreviewImage } from '../../src/userscripts/feishu-preview-image-export/feishu-preview-image-export-extraction.lib.js'

const DEFAULT_URL = 'https://mi.feishu.cn/file/UxkDbtSZqo9Ya4xCGNZcWOmWnlf'
const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.local', 'share', 'codex-browser', 'feishu-login', 'playwright-profile')
const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), '.local', 'share', 'codex-browser', 'feishu-login', 'exports')
const DEFAULT_WAIT_MS = 12_000
const DEFAULT_TIMEOUT_MS = 45_000
const DIRECT_PROXY_ARGS = ['--proxy-server=direct://', '--proxy-bypass-list=*']

function printHelp() {
  console.log(`Usage:
  node scripts/browser-tools/export-image.mjs [options]

Options:
  --url <url>             Target Feishu file URL
  --profile-dir <dir>     Logged-in Playwright profile directory
  --output <file>         Output image path
  --wait-ms <ms>          Wait after navigation before reading the page
  --timeout-ms <ms>       Navigation timeout
  --no-play               Export from the normal preview page, not presentation mode
  --headful               Run with a visible browser window
  --debug                 Print extra runtime details
  --help                  Show this help

Notes:
  - This script uses Playwright bundled Chromium only.
  - Browser traffic is forced to direct mode for this session.
  - It exports original visible image data and exits if none can be extracted.`)
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
    url: DEFAULT_URL,
    profileDir: DEFAULT_PROFILE_DIR,
    output: '',
    waitMs: DEFAULT_WAIT_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    playMode: true,
    headless: true,
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
      case '--output':
        if (!next) throw new Error('--output requires a value')
        options.output = path.resolve(next)
        index += 1
        break
      case '--wait-ms':
        if (!next) throw new Error('--wait-ms requires a value')
        options.waitMs = parseInteger(next, '--wait-ms')
        index += 1
        break
      case '--timeout-ms':
        if (!next) throw new Error('--timeout-ms requires a value')
        options.timeoutMs = parseInteger(next, '--timeout-ms')
        index += 1
        break
      case '--no-play':
        options.playMode = false
        break
      case '--headful':
        options.headless = false
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

function guessOutputPath(output, mime, now = new Date()) {
  if (output) {
    return output
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'bin'
  const ts = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return path.join(DEFAULT_OUTPUT_DIR, `feishu-image-${ts}.${ext}`)
}

async function openPresentation(page) {
  await page.mouse.move(760, 2125)
  await page.waitForTimeout(1000)
  await page.locator("li[data-key='play']").click({ timeout: 5000 })
  await page.waitForTimeout(3000)
}

async function extractLargestImage(page) {
  const result = await page.evaluate(readPreviewImage, { profile: 'cli-v1', mode: 'read' })
  return result.kind === 'image' ? result : null
}

async function runExportImage(options, {
  resolvePlaywright = resolvePlaywrightImport,
  mkdirImpl = mkdir,
  writeFileImpl = writeFile,
  log = console.log,
} = {}) {
  const { chromium } = await resolvePlaywright()
  const context = await chromium.launchPersistentContext(options.profileDir, {
    headless: options.headless,
    args: DIRECT_PROXY_ARGS,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 2200 },
  })

  try {
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto(options.url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs,
    })
    await page.waitForTimeout(options.waitMs)

    if (options.playMode) {
      await openPresentation(page)
    }

    const image = await extractLargestImage(page)
    if (!image) {
      throw new Error('No visible image candidate found on the page')
    }

    const outputPath = guessOutputPath(options.output, image.mime)
    await mkdirImpl(path.dirname(outputPath), { recursive: true })
    await writeFileImpl(outputPath, Buffer.from(image.payload.data, 'base64'))

    log(`Saved image: ${outputPath}`)
    if (options.debug) {
      log(`Source mime: ${image.mime}`)
      log(`Visible size: ${image.width}x${image.height}`)
      log(`Mode: ${image.mode}`)
      log(`Page URL: ${page.url()}`)
    }
    return { outputPath, image }
  } finally {
    await context.close()
  }
}

async function main(argv = process.argv.slice(2), dependencies) {
  const options = parseArgs(argv)
  if (options.help) {
    printHelp()
    return
  }
  return runExportImage(options, dependencies)
}

function isMain(metaUrl, argvPath = process.argv[1]) {
  return Boolean(argvPath) && path.resolve(argvPath) === fileURLToPath(metaUrl)
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

export {
  extractLargestImage,
  guessOutputPath,
  isMain,
  main,
  parseArgs,
  runExportImage,
}
