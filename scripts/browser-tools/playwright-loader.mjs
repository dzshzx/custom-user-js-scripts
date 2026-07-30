import { access, readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PLAYWRIGHT_UNAVAILABLE_MESSAGE =
  'Playwright is not available. Run `npx --yes playwright --version` once to warm the npm cache, or install Playwright locally as a dev dependency.'

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function resolvePlaywrightImport({ homeDir = os.homedir() } = {}) {
  try {
    return await import('playwright')
  } catch {}

  const npxRoot = path.join(homeDir, '.npm', '_npx')
  if (!(await fileExists(npxRoot))) {
    throw new Error(PLAYWRIGHT_UNAVAILABLE_MESSAGE)
  }

  const entries = await readdir(npxRoot, { withFileTypes: true })
  const candidates = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const modulePath = path.join(
      npxRoot,
      entry.name,
      'node_modules',
      'playwright',
      'index.mjs',
    )
    if (!(await fileExists(modulePath))) continue
    const moduleStat = await stat(modulePath)
    candidates.push({ modulePath, mtimeMs: moduleStat.mtimeMs })
  }

  if (candidates.length === 0) {
    throw new Error(PLAYWRIGHT_UNAVAILABLE_MESSAGE)
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return import(pathToFileURL(candidates[0].modulePath).href)
}
