export type PreviewImageProfile = 'userscript-v1' | 'cli-v1';
export type PreviewImageMode = 'read' | 'inspect';

export interface PreviewImageOptions {
  profile?: PreviewImageProfile;
  mode?: PreviewImageMode;
}

export interface PreviewImageEnvironment {
  documentObject?: Document;
  fetchImpl?: typeof fetch | null;
  FileReaderCtor?: typeof FileReader;
  btoaImpl?: (data: string) => string;
}

export interface PreviewImageCandidate {
  src: string;
  width: number;
  height: number;
  area: number;
}

export interface PreviewImageCandidates {
  kind: 'candidates';
  items: PreviewImageCandidate[];
}

export interface PreviewImageEmpty {
  kind: 'empty';
  reason: 'no-candidate' | 'invalid-data-url';
}

export interface PreviewImagePayload {
  encoding: 'data-url' | 'base64';
  data: string;
}

export interface PreviewImageRead {
  kind: 'image';
  mime: string;
  width: number;
  height: number;
  mode: 'data-url' | 'fetched';
  payload: PreviewImagePayload;
}

export type PreviewImageReadResult = PreviewImageEmpty | PreviewImageRead;

export interface PreviewImageDiagnosticError extends Error {
  code?: string;
  phase?: string;
}

type PreviewImageHost = Partial<Pick<typeof globalThis, 'document' | 'fetch' | 'FileReader' | 'btoa'>>;

function readPreviewImage(
  options: PreviewImageOptions & { mode: 'inspect' },
  environment?: PreviewImageEnvironment,
): PreviewImageCandidates;
function readPreviewImage(
  options?: PreviewImageOptions & { mode?: 'read' },
  environment?: PreviewImageEnvironment,
): Promise<PreviewImageReadResult>;
function readPreviewImage(
  options?: PreviewImageOptions,
  environment?: PreviewImageEnvironment,
): PreviewImageCandidates | Promise<PreviewImageReadResult>;
function readPreviewImage(
  options: PreviewImageOptions = {},
  environment: PreviewImageEnvironment = {},
): PreviewImageCandidates | Promise<PreviewImageReadResult> {
  const profile = options.profile;
  const mode = options.mode || 'read';

  if (profile !== 'userscript-v1' && profile !== 'cli-v1') {
    throw new Error(`Unknown image profile: ${profile}`);
  }
  if (mode !== 'read' && mode !== 'inspect') {
    throw new Error(`Unknown image mode: ${mode}`);
  }

  const attachDiagnostic = (cause: unknown, code: string, phase: string): PreviewImageDiagnosticError => {
    const error: PreviewImageDiagnosticError = cause instanceof Error ? cause : new Error(String(cause));
    try {
      error.code = code;
      error.phase = phase;
    } catch {
      const wrapped: PreviewImageDiagnosticError = new Error(error.message, { cause: error });
      wrapped.code = code;
      wrapped.phase = phase;
      return wrapped;
    }
    return error;
  };

  const host: PreviewImageHost = typeof globalThis === 'object' && globalThis ? globalThis : {};
  const documentObject = (environment.documentObject || host.document)!;
  const imageNodes: HTMLImageElement[] =
    profile === 'userscript-v1'
      ? [...(documentObject.images || documentObject.getElementsByTagName('img'))]
      : [...documentObject.querySelectorAll('img')];

  const items = imageNodes
    .map((img, index) => {
      const rect = img.getBoundingClientRect();
      const rawWidth = rect.width;
      const rawHeight = rect.height;
      const width = Math.round(rawWidth);
      const height = Math.round(rawHeight);
      const area = profile === 'userscript-v1' ? width * height : rawWidth * rawHeight;
      return {
        src: profile === 'userscript-v1' ? img.currentSrc || img.src || '' : img.getAttribute('src') || '',
        width,
        height,
        area,
        index,
      };
    })
    .filter((item) =>
      profile === 'userscript-v1' ? item.width > 0 && item.height > 0 && item.area >= 20_000 : item.area > 20_000,
    )
    .sort((left, right) => right.area - left.area || left.index - right.index)
    .map(({ index: _index, ...item }): PreviewImageCandidate => item);

  if (mode === 'inspect') {
    return { kind: 'candidates', items } satisfies PreviewImageCandidates;
  }

  return (async (): Promise<PreviewImageReadResult> => {
    if (!items.length) {
      return { kind: 'empty', reason: 'no-candidate' };
    }

    const target = items[0];
    const source = target.src;
    if (profile === 'userscript-v1' && !source) {
      throw attachDiagnostic(new Error('Image source is empty'), 'FEISHU_IMAGE_SOURCE_EMPTY', 'source');
    }

    if (source.startsWith('data:')) {
      const match = source.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        if (profile === 'cli-v1') {
          return { kind: 'empty', reason: 'invalid-data-url' };
        }
        throw attachDiagnostic(new Error('Unsupported data URL format'), 'FEISHU_IMAGE_INVALID_DATA_URL', 'data-url');
      }
      return {
        kind: 'image',
        mime: match[1],
        width: target.width,
        height: target.height,
        mode: 'data-url',
        payload:
          profile === 'userscript-v1' ? { encoding: 'data-url', data: source } : { encoding: 'base64', data: match[2] },
      };
    }

    const fetcher = environment.fetchImpl || host.fetch?.bind(host);
    if (typeof fetcher !== 'function') {
      throw attachDiagnostic(new Error('fetch unavailable'), 'FEISHU_IMAGE_FETCH_FAILED', 'fetch');
    }
    let response: Response;
    try {
      response =
        profile === 'userscript-v1' ? await fetcher(source, { credentials: 'include' }) : await fetcher(source);
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
      let blob: Blob;
      try {
        blob = await response.blob();
      } catch (error) {
        throw attachDiagnostic(error, 'FEISHU_IMAGE_BLOB_READ_FAILED', 'blob-read');
      }
      const FileReaderCtor = (environment.FileReaderCtor || host.FileReader)!;
      let data: string;
      try {
        data = await new Promise<string>((resolve, reject) => {
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

    let bytes: Uint8Array;
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
    let data: string;
    try {
      data = encode!(binary);
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
