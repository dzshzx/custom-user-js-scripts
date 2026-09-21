import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  extractLargestImage,
  guessOutputPath,
  isMain,
  parseArgs,
  runExportImage,
} from '../scripts/browser-tools/export-image.mjs';
import { readPreviewImage } from '../src/userscripts/feishu-preview-image-export/feishu-preview-image-export-extraction.lib.js';

test('CLI module imports without running and retains argument behavior', () => {
  assert.equal(
    isMain(new URL('../scripts/browser-tools/export-image.mjs', import.meta.url).href),
    false,
  );
  assert.deepEqual(parseArgs(['--url', 'https://example.test/file', '--no-play', '--headful']), {
    url: 'https://example.test/file',
    profileDir: path.join(os.homedir(), '.local', 'share', 'codex-browser', 'feishu-login', 'playwright-profile'),
    output: '',
    waitMs: 12_000,
    timeoutMs: 45_000,
    playMode: false,
    headless: false,
    debug: false,
  });
  assert.match(guessOutputPath('', 'image/jpeg', new Date('2026-09-21T01:02:03Z')), /feishu-image-20260921010203\.jpg$/);
});

test('extractLargestImage evaluates the shared reader with the CLI profile', async () => {
  const expected = { kind: 'empty', reason: 'no-candidate' };
  const page = {
    evaluate: async (fn, options) => {
      assert.equal(fn, readPreviewImage);
      assert.deepEqual(options, { profile: 'cli-v1', mode: 'read' });
      return expected;
    },
  };
  assert.equal(await extractLargestImage(page), null);
});

test('runExportImage writes the exact decoded bytes and closes its context', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'feishu-export-image-'));
  const output = path.join(root, 'nested', 'image.bin');
  let closed = 0;
  const image = {
    kind: 'image',
    mime: 'application/octet-stream',
    width: 300,
    height: 100,
    mode: 'fetched',
    payload: { encoding: 'base64', data: 'AP9B' },
  };
  const page = {
    goto: async () => {},
    waitForTimeout: async () => {},
    evaluate: async () => image,
    url: () => 'https://mi.feishu.cn/file/test',
  };
  const context = {
    pages: () => [page],
    close: async () => { closed += 1; },
  };
  const options = {
    ...parseArgs(['--url', 'https://mi.feishu.cn/file/test', '--no-play']),
    output,
  };

  const result = await runExportImage(options, {
    resolvePlaywright: async () => ({
      chromium: { launchPersistentContext: async () => context },
    }),
    log: () => {},
  });

  assert.equal(result.outputPath, output);
  assert.deepEqual([...await readFile(output)], [0, 255, 65]);
  assert.equal(closed, 1);
});

test('runExportImage does not write when extraction is empty', async () => {
  let writes = 0;
  let closed = 0;
  const page = {
    goto: async () => {},
    waitForTimeout: async () => {},
    evaluate: async () => ({ kind: 'empty', reason: 'no-candidate' }),
  };
  const context = {
    pages: () => [page],
    close: async () => { closed += 1; },
  };

  await assert.rejects(
    runExportImage(parseArgs(['--no-play']), {
      resolvePlaywright: async () => ({
        chromium: { launchPersistentContext: async () => context },
      }),
      writeFileImpl: async () => { writes += 1; },
      mkdirImpl: async () => {},
      log: () => {},
    }),
    /No visible image candidate found on the page/,
  );
  assert.equal(writes, 0);
  assert.equal(closed, 1);
});
