import test from 'node:test';
import assert from 'node:assert/strict';

import { readPreviewImage } from '../src/userscripts/feishu-preview-image-export/feishu-preview-image-export-extraction.lib.js';
import { loadTestPlaywright } from '../scripts/test-playwright.mjs';

function image({
  src = '',
  currentSrc = '',
  width = 200,
  height = 100,
} = {}) {
  return {
    src,
    currentSrc,
    getAttribute: (name) => (name === 'src' ? src : null),
    getBoundingClientRect: () => ({ width, height }),
  };
}

function environment(images, overrides = {}) {
  const documentObject = {
    images,
    getElementsByTagName: () => images,
    querySelectorAll: () => images,
  };
  return { documentObject, ...overrides };
}

test('profiles preserve threshold, rounding, source and stable ordering differences', async () => {
  const exact = image({ src: 'exact-relative.png', currentSrc: 'https://cdn.test/exact.png' });
  const fractional = image({ src: 'fractional.png', width: 199.6, height: 100.2 });
  const tiedFirst = image({ src: 'first.png', width: 400, height: 100 });
  const tiedSecond = image({ src: 'second.png', width: 200, height: 200 });
  const env = environment([exact, fractional, tiedFirst, tiedSecond]);

  assert.deepEqual(readPreviewImage({ profile: 'userscript-v1', mode: 'inspect' }, env), {
    kind: 'candidates',
    items: [
      { src: 'first.png', width: 400, height: 100, area: 40_000 },
      { src: 'second.png', width: 200, height: 200, area: 40_000 },
      { src: 'https://cdn.test/exact.png', width: 200, height: 100, area: 20_000 },
      { src: 'fractional.png', width: 200, height: 100, area: 20_000 },
    ],
  });

  assert.deepEqual(readPreviewImage({ profile: 'cli-v1', mode: 'inspect' }, env), {
    kind: 'candidates',
    items: [
      { src: 'first.png', width: 400, height: 100, area: 40_000 },
      { src: 'second.png', width: 200, height: 200, area: 40_000 },
    ],
  });
});

test('data URL profiles keep their historical payload and invalid-format behavior', async () => {
  const valid = environment([image({ src: 'data:image/png;base64,aGk=', width: 300 })]);
  assert.deepEqual(await readPreviewImage({ profile: 'userscript-v1' }, valid), {
    kind: 'image',
    mime: 'image/png',
    width: 300,
    height: 100,
    mode: 'data-url',
    payload: { encoding: 'data-url', data: 'data:image/png;base64,aGk=' },
  });
  assert.deepEqual(await readPreviewImage({ profile: 'cli-v1' }, valid), {
    kind: 'image',
    mime: 'image/png',
    width: 300,
    height: 100,
    mode: 'data-url',
    payload: { encoding: 'base64', data: 'aGk=' },
  });

  const invalid = environment([image({ src: 'data:image/png;charset=utf-8;base64,aGk=', width: 300 })]);
  await assert.rejects(
    readPreviewImage({ profile: 'userscript-v1' }, invalid),
    (error) => error.message === 'Unsupported data URL format'
      && error.code === 'FEISHU_IMAGE_INVALID_DATA_URL'
      && error.phase === 'data-url',
  );
  assert.deepEqual(await readPreviewImage({ profile: 'cli-v1' }, invalid), {
    kind: 'empty',
    reason: 'invalid-data-url',
  });

  const unusualPayload = environment([image({
    src: 'data:image/PNG;base64,not-standard-but-non-empty',
    width: 300,
  })]);
  assert.equal(
    (await readPreviewImage({ profile: 'cli-v1' }, unusualPayload)).payload.data,
    'not-standard-but-non-empty',
  );
  const upperMarker = environment([image({ src: 'data:image/png;BASE64,aGk=', width: 300 })]);
  assert.equal((await readPreviewImage({ profile: 'cli-v1' }, upperMarker)).reason, 'invalid-data-url');
});

test('userscript fetch uses include credentials, Blob MIME and FileReader data URL', async () => {
  const calls = [];
  class Reader {
    readAsDataURL(blob) {
      assert.equal(blob.marker, 'blob');
      this.result = 'data:image/WEBP;base64,eA==';
      this.onload();
    }
  }
  const result = await readPreviewImage(
    { profile: 'userscript-v1', mode: 'read' },
    environment([image({ src: 'relative.png', currentSrc: 'https://cdn.test/rendered.png', width: 300 })], {
      fetchImpl: async (...args) => {
        calls.push(args);
        return { ok: true, blob: async () => ({ type: 'image/WEBP', marker: 'blob' }) };
      },
      FileReaderCtor: Reader,
    }),
  );

  assert.deepEqual(calls, [['https://cdn.test/rendered.png', { credentials: 'include' }]]);
  assert.deepEqual(result, {
    kind: 'image',
    mime: 'image/WEBP',
    width: 300,
    height: 100,
    mode: 'fetched',
    payload: { encoding: 'data-url', data: 'data:image/WEBP;base64,eA==' },
  });
});

test('CLI fetch preserves raw src, default credentials, response MIME and base64 bytes', async () => {
  const calls = [];
  const result = await readPreviewImage(
    { profile: 'cli-v1', mode: 'read' },
    environment([image({ src: '../raw.png', currentSrc: 'https://cdn.test/rendered.png', width: 300 })], {
      fetchImpl: async (...args) => {
        calls.push(args);
        return {
          ok: true,
          headers: { get: () => 'image/png; charset=binary' },
          arrayBuffer: async () => Uint8Array.from([0, 255, 65]).buffer,
        };
      },
      btoaImpl: (binary) => Buffer.from(binary, 'binary').toString('base64'),
    }),
  );

  assert.deepEqual(calls, [['../raw.png']]);
  assert.deepEqual(result, {
    kind: 'image',
    mime: 'image/png; charset=binary',
    width: 300,
    height: 100,
    mode: 'fetched',
    payload: { encoding: 'base64', data: 'AP9B' },
  });
});

test('empty source and read failures preserve profile behavior and diagnostics', async () => {
  const empty = environment([image({ width: 300 })], {
    fetchImpl: async (src) => ({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => {
        assert.equal(src, '');
        return Uint8Array.from([1]).buffer;
      },
    }),
    btoaImpl: () => 'AQ==',
  });
  await assert.rejects(
    readPreviewImage({ profile: 'userscript-v1' }, empty),
    (error) => error.message === 'Image source is empty'
      && error.code === 'FEISHU_IMAGE_SOURCE_EMPTY'
      && error.phase === 'source',
  );
  assert.equal((await readPreviewImage({ profile: 'cli-v1' }, empty)).payload.data, 'AQ==');

  const failed = environment([image({ src: 'image.png', width: 300 })], {
    fetchImpl: async () => ({ ok: false, status: 403, statusText: 'Forbidden' }),
  });
  await assert.rejects(
    readPreviewImage({ profile: 'cli-v1' }, failed),
    (error) => error.message === 'Failed to fetch image: 403 Forbidden'
      && error.code === 'FEISHU_IMAGE_FETCH_FAILED'
      && error.phase === 'fetch',
  );

  const rejected = environment([image({ src: 'image.png', width: 300 })], {
    fetchImpl: async () => { throw new Error('network stopped'); },
  });
  await assert.rejects(
    readPreviewImage({ profile: 'cli-v1' }, rejected),
    (error) => error.message === 'network stopped'
      && error.code === 'FEISHU_IMAGE_FETCH_FAILED'
      && error.phase === 'fetch',
  );
});

test('blob, arrayBuffer and encoding failures keep their phase', async () => {
  const userscriptEnv = environment([image({ src: 'image.png', width: 300 })], {
    fetchImpl: async () => ({
      ok: true,
      blob: async () => ({ type: 'image/png' }),
    }),
    FileReaderCtor: class {
      readAsDataURL() {
        this.error = new Error('reader stopped');
        this.onerror();
      }
    },
  });
  await assert.rejects(
    readPreviewImage({ profile: 'userscript-v1' }, userscriptEnv),
    (error) => error.message === 'reader stopped'
      && error.code === 'FEISHU_IMAGE_BLOB_READ_FAILED'
      && error.phase === 'blob-read',
  );

  const blobFailure = environment([image({ src: 'image.png', width: 300 })], {
    fetchImpl: async () => ({
      ok: true,
      blob: async () => { throw new Error('blob stopped'); },
    }),
  });
  await assert.rejects(
    readPreviewImage({ profile: 'userscript-v1' }, blobFailure),
    (error) => error.message === 'blob stopped'
      && error.code === 'FEISHU_IMAGE_BLOB_READ_FAILED'
      && error.phase === 'blob-read',
  );

  const cliEnv = environment([image({ src: 'image.png', width: 300 })], {
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => Uint8Array.from([1]).buffer,
    }),
    btoaImpl: () => { throw new Error('encoder stopped'); },
  });
  await assert.rejects(
    readPreviewImage({ profile: 'cli-v1' }, cliEnv),
    (error) => error.message === 'encoder stopped'
      && error.code === 'FEISHU_IMAGE_ENCODE_FAILED'
      && error.phase === 'encode',
  );

  const arrayBufferFailure = environment([image({ src: 'image.png', width: 300 })], {
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => { throw new Error('buffer stopped'); },
    }),
  });
  await assert.rejects(
    readPreviewImage({ profile: 'cli-v1' }, arrayBufferFailure),
    (error) => error.message === 'buffer stopped'
      && error.code === 'FEISHU_IMAGE_BLOB_READ_FAILED'
      && error.phase === 'blob-read',
  );
});

test('an empty document returns the profile-neutral no-candidate result', async () => {
  const env = environment([]);
  assert.deepEqual(await readPreviewImage({ profile: 'userscript-v1' }, env), {
    kind: 'empty',
    reason: 'no-candidate',
  });
  assert.deepEqual(await readPreviewImage({ profile: 'cli-v1' }, env), {
    kind: 'empty',
    reason: 'no-candidate',
  });
});

test('unknown profile and mode reject before reading the environment', () => {
  const guarded = new Proxy({}, { get: () => assert.fail('environment must not be read') });
  assert.throws(() => readPreviewImage({ profile: 'future-v2' }, guarded), /Unknown image profile/);
  assert.throws(() => readPreviewImage({ profile: 'cli-v1', mode: 'write' }, guarded), /Unknown image mode/);
});

test('imported function survives serialization without module-scope closures', async () => {
  const serialized = (0, eval)(`(${readPreviewImage.toString()})`);
  const env = environment([image({ src: 'data:image/png;base64,Ynl0ZXM=', width: 300 })]);
  assert.deepEqual(
    await serialized({ profile: 'cli-v1' }, env),
    await readPreviewImage({ profile: 'cli-v1' }, env),
  );
});

test('real Playwright page.evaluate matches the direct result', async () => {
  const playwright = await loadTestPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<img id="target" src="data:image/png;base64,Ynl0ZXM=">');
    await page.locator('#target').evaluate((element) => {
      element.getBoundingClientRect = () => ({ width: 300, height: 100 });
    });
    const evaluated = await page.evaluate(readPreviewImage, { profile: 'cli-v1', mode: 'read' });
    const direct = await readPreviewImage(
      { profile: 'cli-v1', mode: 'read' },
      environment([image({ src: 'data:image/png;base64,Ynl0ZXM=', width: 300 })]),
    );
    assert.deepEqual(evaluated, direct);
  } finally {
    await browser.close();
  }
});
