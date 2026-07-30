import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

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

    const { resolvePlaywrightImport } = await import(
      '../scripts/browser-tools/playwright-loader.mjs'
    )
    const playwright = await resolvePlaywrightImport({ homeDir })

    assert.equal(playwright.source, 'npx-cache')
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }
})
