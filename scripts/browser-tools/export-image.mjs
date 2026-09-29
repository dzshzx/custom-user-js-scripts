import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createCli, integerValue, parseCli, requireValue } from './cli-args.mjs';
import { resolvePlaywrightImport } from './playwright-loader.mjs';
import { readPreviewImage } from '../../src/userscripts/feishu-preview-image-export/feishu-preview-image-export-extraction.lib.js';
import { extensionFromMime } from '../../src/userscripts/feishu-preview-image-export/feishu-preview-image-export-logic.lib.js';

const DEFAULT_URL = 'https://mi.feishu.cn/file/UxkDbtSZqo9Ya4xCGNZcWOmWnlf';
const DEFAULT_PROFILE_DIR = path.join(
  os.homedir(),
  '.local',
  'share',
  'codex-browser',
  'feishu-login',
  'playwright-profile',
);
const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), '.local', 'share', 'codex-browser', 'feishu-login', 'exports');
const DEFAULT_WAIT_MS = 12_000;
const DEFAULT_TIMEOUT_MS = 45_000;
const DIRECT_PROXY_ARGS = ['--proxy-server=direct://', '--proxy-bypass-list=*'];

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
  - It exports original visible image data and exits if none can be extracted.`);
}

function parseArgs(argv) {
  const resolvedPath = (flagName) => {
    const check = requireValue(flagName);
    return (value) => path.resolve(check(value));
  };
  const program = createCli()
    .option('--url <url>', '', requireValue('--url'), DEFAULT_URL)
    .option('--profile-dir <dir>', '', resolvedPath('--profile-dir'), DEFAULT_PROFILE_DIR)
    .option('--output <file>', '', resolvedPath('--output'), '')
    .option('--wait-ms <ms>', '', integerValue('--wait-ms'), DEFAULT_WAIT_MS)
    .option('--timeout-ms <ms>', '', integerValue('--timeout-ms'), DEFAULT_TIMEOUT_MS)
    .option('--no-play')
    .option('--headful')
    .option('--debug');
  const opts = parseCli(program, argv);
  const options = {
    url: opts.url,
    profileDir: opts.profileDir,
    output: opts.output,
    waitMs: opts.waitMs,
    timeoutMs: opts.timeoutMs,
    playMode: opts.play,
    headless: !opts.headful,
    debug: Boolean(opts.debug),
  };
  if (opts.help) options.help = true;
  return options;
}

function guessOutputPath(output, mime, now = new Date()) {
  if (output) {
    return output;
  }

  const ext = extensionFromMime(mime);
  const ts = now
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  return path.join(DEFAULT_OUTPUT_DIR, `feishu-image-${ts}.${ext}`);
}

async function openPresentation(page) {
  await page.mouse.move(760, 2125);
  await page.waitForTimeout(1000);
  await page.locator("li[data-key='play']").click({ timeout: 5000 });
  await page.waitForTimeout(3000);
}

async function extractLargestImage(page) {
  const result = await page.evaluate(readPreviewImage, { profile: 'cli-v1', mode: 'read' });
  return result.kind === 'image' ? result : null;
}

async function runExportImage(
  options,
  { resolvePlaywright = resolvePlaywrightImport, mkdirImpl = mkdir, writeFileImpl = writeFile, log = console.log } = {},
) {
  const { chromium } = await resolvePlaywright();
  const context = await chromium.launchPersistentContext(options.profileDir, {
    headless: options.headless,
    args: DIRECT_PROXY_ARGS,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 2200 },
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(options.url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs,
    });
    await page.waitForTimeout(options.waitMs);

    if (options.playMode) {
      await openPresentation(page);
    }

    const image = await extractLargestImage(page);
    if (!image) {
      throw new Error('No visible image candidate found on the page');
    }

    const outputPath = guessOutputPath(options.output, image.mime);
    await mkdirImpl(path.dirname(outputPath), { recursive: true });
    await writeFileImpl(outputPath, Buffer.from(image.payload.data, 'base64'));

    log(`Saved image: ${outputPath}`);
    if (options.debug) {
      log(`Source mime: ${image.mime}`);
      log(`Visible size: ${image.width}x${image.height}`);
      log(`Mode: ${image.mode}`);
      log(`Page URL: ${page.url()}`);
    }
    return { outputPath, image };
  } finally {
    await context.close();
  }
}

async function main(argv = process.argv.slice(2), dependencies) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  return runExportImage(options, dependencies);
}

function isMain(metaUrl, argvPath = process.argv[1]) {
  return Boolean(argvPath) && path.resolve(argvPath) === fileURLToPath(metaUrl);
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { extractLargestImage, guessOutputPath, isMain, main, parseArgs, runExportImage };
