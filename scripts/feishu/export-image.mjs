import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_URL = 'https://mi.feishu.cn/file/UxkDbtSZqo9Ya4xCGNZcWOmWnlf'
const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.local', 'share', 'codex-browser', 'feishu-login', 'playwright-profile')
const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), '.local', 'share', 'codex-browser', 'feishu-login', 'exports')
const DEFAULT_WAIT_MS = 12_000
const DEFAULT_TIMEOUT_MS = 45_000
const DIRECT_PROXY_ARGS = ['--proxy-server=direct://', '--proxy-bypass-list=*']

function printHelp() {
  console.log(`Usage:
  node scripts/feishu/export-image.mjs [options]

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
  - It prefers exporting the original visible image data; screenshot is fallback only.`)
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

function guessOutputPath(output, mime) {
  if (output) {
    return output
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'bin'
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return path.join(DEFAULT_OUTPUT_DIR, `feishu-image-${ts}.${ext}`)
}

async function ensureParentDirectory(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true })
}

async function loadPlaywright() {
  return import('/home/ubuntu/.npm/_npx/420ff84f11983ee5/node_modules/playwright/index.mjs')
}

async function openPresentation(page) {
  await page.mouse.move(760, 2125)
  await page.waitForTimeout(1000)
  await page.locator("li[data-key='play']").click({ timeout: 5000 })
  await page.waitForTimeout(3000)
}

async function extractLargestImage(page) {
  return page.evaluate(async () => {
    const visibleImages = [...document.querySelectorAll('img')]
      .map((img) => {
        const rect = img.getBoundingClientRect()
        const area = rect.width * rect.height
        return {
          src: img.getAttribute('src') || '',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          area,
        }
      })
      .filter((img) => img.area > 20000)
      .sort((left, right) => right.area - left.area)

    if (!visibleImages.length) {
      return null
    }

    const target = visibleImages[0]
    if (target.src.startsWith('data:')) {
      const match = target.src.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) {
        return null
      }
      return {
        mode: 'data-url',
        mime: match[1],
        payload: match[2],
        width: target.width,
        height: target.height,
      }
    }

    const response = await fetch(target.src)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
    }
    const mime = response.headers.get('content-type') || 'application/octet-stream'
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return {
      mode: 'fetched',
      mime,
      payload: btoa(binary),
      width: target.width,
      height: target.height,
    }
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const { chromium } = await loadPlaywright()
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
    await ensureParentDirectory(outputPath)
    await writeFile(outputPath, Buffer.from(image.payload, 'base64'))

    console.log(`Saved image: ${outputPath}`)
    if (options.debug) {
      console.log(`Source mime: ${image.mime}`)
      console.log(`Visible size: ${image.width}x${image.height}`)
      console.log(`Mode: ${image.mode}`)
      console.log(`Page URL: ${page.url()}`)
    }
  } finally {
    await context.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
