function readPreviewImage(options = {}, environment = {}) {
  const profile = options.profile;
  const mode = options.mode || 'read';

  if (profile !== 'userscript-v1' && profile !== 'cli-v1') {
    throw new Error(`Unknown image profile: ${profile}`);
  }
  if (mode !== 'read' && mode !== 'inspect') {
    throw new Error(`Unknown image mode: ${mode}`);
  }

  const attachDiagnostic = (cause, code, phase) => {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    try {
      error.code = code;
      error.phase = phase;
    } catch {
      const wrapped = new Error(error.message, { cause: error });
      wrapped.code = code;
      wrapped.phase = phase;
      return wrapped;
    }
    return error;
  };

  const host = typeof globalThis === 'object' && globalThis ? globalThis : {};
  const documentObject = environment.documentObject || host.document;
  const imageNodes = profile === 'userscript-v1'
    ? [...(documentObject.images || documentObject.getElementsByTagName('img'))]
    : [...documentObject.querySelectorAll('img')];

  const items = imageNodes
    .map((img, index) => {
      const rect = img.getBoundingClientRect();
      const rawWidth = rect.width;
      const rawHeight = rect.height;
      const width = Math.round(rawWidth);
      const height = Math.round(rawHeight);
      const area = profile === 'userscript-v1'
        ? width * height
        : rawWidth * rawHeight;
      return {
        src: profile === 'userscript-v1'
          ? (img.currentSrc || img.src || '')
          : (img.getAttribute('src') || ''),
        width,
        height,
        area,
        index,
      };
    })
    .filter((item) => (profile === 'userscript-v1'
      ? item.width > 0 && item.height > 0 && item.area >= 20_000
      : item.area > 20_000))
    .sort((left, right) => (right.area - left.area) || (left.index - right.index))
    .map(({ index: _index, ...item }) => item);

  if (mode === 'inspect') {
    return { kind: 'candidates', items };
  }

  return (async () => {
    if (!items.length) {
      return { kind: 'empty', reason: 'no-candidate' };
    }

    const target = items[0];
    const source = target.src;
    if (profile === 'userscript-v1' && !source) {
      throw attachDiagnostic(
        new Error('Image source is empty'),
        'FEISHU_IMAGE_SOURCE_EMPTY',
        'source',
      );
    }

    if (source.startsWith('data:')) {
      const match = source.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        if (profile === 'cli-v1') {
          return { kind: 'empty', reason: 'invalid-data-url' };
        }
        throw attachDiagnostic(
          new Error('Unsupported data URL format'),
          'FEISHU_IMAGE_INVALID_DATA_URL',
          'data-url',
        );
      }
      return {
        kind: 'image',
        mime: match[1],
        width: target.width,
        height: target.height,
        mode: 'data-url',
        payload: profile === 'userscript-v1'
          ? { encoding: 'data-url', data: source }
          : { encoding: 'base64', data: match[2] },
      };
    }

    const fetcher = environment.fetchImpl || host.fetch?.bind(host);
    if (typeof fetcher !== 'function') {
      throw attachDiagnostic(
        new Error('fetch unavailable'),
        'FEISHU_IMAGE_FETCH_FAILED',
        'fetch',
      );
    }
    let response;
    try {
      response = profile === 'userscript-v1'
        ? await fetcher(source, { credentials: 'include' })
        : await fetcher(source);
    } catch (error) {
      throw attachDiagnostic(error, 'FEISHU_IMAGE_FETCH_FAILED', 'fetch');
    }
    if (!response.ok) {
      throw attachDiagnostic(
        new Error(`Failed to fetch image: ${response.status} ${response.statusText}`),
        'FEISHU_IMAGE_FETCH_FAILED',
        'fetch',
      );
    }

    if (profile === 'userscript-v1') {
      let blob;
      try {
        blob = await response.blob();
      } catch (error) {
        throw attachDiagnostic(error, 'FEISHU_IMAGE_BLOB_READ_FAILED', 'blob-read');
      }
      const FileReaderCtor = environment.FileReaderCtor || host.FileReader;
      let data;
      try {
        data = await new Promise((resolve, reject) => {
          const reader = new FileReaderCtor();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        throw attachDiagnostic(error, 'FEISHU_IMAGE_BLOB_READ_FAILED', 'blob-read');
      }
      return {
        kind: 'image',
        mime: blob.type || 'application/octet-stream',
        width: target.width,
        height: target.height,
        mode: 'fetched',
        payload: { encoding: 'data-url', data },
      };
    }

    let bytes;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      throw attachDiagnostic(error, 'FEISHU_IMAGE_BLOB_READ_FAILED', 'blob-read');
    }
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const encode = environment.btoaImpl || host.btoa?.bind(host);
    let data;
    try {
      data = encode(binary);
    } catch (error) {
      throw attachDiagnostic(error, 'FEISHU_IMAGE_ENCODE_FAILED', 'encode');
    }
    return {
      kind: 'image',
      mime: response.headers.get('content-type') || 'application/octet-stream',
      width: target.width,
      height: target.height,
      mode: 'fetched',
      payload: { encoding: 'base64', data },
    };
  })();
}

export { readPreviewImage };
