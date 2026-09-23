import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

test('browser tools load Playwright from the current user npx cache', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'playwright-loader-'))
  const modulePath = path.join(
    homeDir,
    '.npm',
    '_npx',
    'fixture',
    'node_modules',
    'playwright',
    'index.mjs',
  )

  try {
    await mkdir(path.dirname(modulePath), { recursive: true })
    await writeFile(modulePath, "export const source = 'npx-cache'\n")

    // Load the real module outside this checkout so the project's dependency
    // cannot mask the daily tool's cache compatibility path.
    const loaderPath = path.join(homeDir, 'playwright-loader.mjs')
    await copyFile(new URL('../scripts/browser-tools/playwright-loader.mjs', import.meta.url), loaderPath)
    const { resolvePlaywrightImport } = await import(pathToFileURL(loaderPath).href)
    const playwright = await resolvePlaywrightImport({ homeDir })

    assert.equal(playwright.source, 'npx-cache')
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }
})
