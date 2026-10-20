import filenamify from 'filenamify/browser';
import mime from 'mime/lite';

import { readPreviewImage } from './feishu-preview-image-export-extraction.lib.ts';
import type { PreviewImageCandidate } from './feishu-preview-image-export-extraction.lib.ts';
import type { GmDownload } from '../shared/shared-gm.lib.ts';

export interface ImageExportRuntimeOptions {
  documentObject: Document;
  fetchImpl?: typeof fetch | null;
  gmDownload?: GmDownload | null;
  downloadTimeoutMs?: number;
}

type RuntimeOptions = ImageExportRuntimeOptions;

export interface ImageExportRuntime {
  exportMainImage(): Promise<ExportResult | null>;
  getVisibleImages(): PreviewImageCandidate[];
  getDocumentTitle(): string;
}

export interface ExportResult {
  filename: string;
  via?: 'anchor';
}

const LIB_NAME = 'FeishuPreviewImageExportLogicLib';
// GM_download 的保存对话框会等用户操作，超时取宽一些；超时只报失败，不再走后备，避免重复下载。
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;
// Unicode 格式类字符（零宽、方向控制、不可见运算符等）：飞书标题里的水印会带上它们，GM_download 遇到即失败。
const FORMAT_CHARS = /\p{Cf}/gu;

// 格式类字符须在 filenamify 之前删掉：filenamify 会把它们换成替换符 '-'（只保留 U+200D 原样），
// 删在前面才得到干净标题，且输出里不再有 \p{Cf}。filenamify 自己去掉尾部空格与句点。
// 首个字形簇超过 100 个 UTF-16 码元时 filenamify 截断后会返回空串，所以仍要 `|| fallback`。
function sanitizeFilePart(value: unknown, fallback: string): string {
  const text = String(value || '')
    .replace(FORMAT_CHARS, '')
    .trim();
  return (text && filenamify(text, { replacement: '-' })) || fallback;
}

// image/jpeg -> jpg; parameters such as "; charset=binary" are ignored; unknown types -> bin.
function extensionFromMime(type: unknown): string {
  return mime.getExtension(String(type || '')) || 'bin';
}

// 取错误文案，绝不抛错：兼容 Error、字符串、null 原型对象和 Tampermonkey 的 {id, error, details}。
function errorText(error: unknown): string {
  try {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>;
      for (const key of ['error', 'message']) {
        const value = record[key];
        if (typeof value === 'string' && value) return value;
      }
      return JSON.stringify(error) ?? '';
    }
    return String(error);
  } catch {
    return 'unknown error';
  }
}

// 内部错误保持英文进 console；给用户的是这里映射的中文文案。经 errorText 取文字，遇到怪对象也不抛错。
function toUserMessage(error: unknown): string {
  const text = errorText(error);
  const httpMatch = /^Failed to fetch image: (\d+)/.exec(text);
  if (httpMatch) {
    return `图片拉取失败（HTTP ${httpMatch[1]}），请确认已登录飞书或稍后重试。`;
  }
  if (text.includes('Unsupported data URL format')) {
    return '图片地址格式不支持，无法导出。';
  }
  if (text.includes('Image source is empty')) {
    return '未读取到图片地址，请刷新页面后重试。';
  }
  if (text.includes('GM_download timed out')) {
    return '下载超时，请重试。';
  }
  if (text.includes('Failed to read blob')) {
    return '图片数据读取失败，请重试。';
  }
  return `导出失败：${text}`;
}

// 只处理 base64 data URL（页面 data URL 与 FileReader.readAsDataURL 的产出都是）；其余返回 null，调用方直接用原地址下载。
function dataUrlToBlobUrl(view: (Window & typeof globalThis) | null, url: string): string | null {
  const match = /^data:([^;,]*);base64,(.*)$/su.exec(url);
  if (!view || !match || typeof view.URL?.createObjectURL !== 'function') return null;
  const [, type, body] = match;
  const binary = view.atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff;
  return view.URL.createObjectURL(new view.Blob([bytes], { type: type || 'application/octet-stream' }));
}

function createImageExportRuntime(
  {
    documentObject,
    fetchImpl,
    gmDownload,
    downloadTimeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS,
  }: RuntimeOptions = {} as RuntimeOptions,
) {
  if (!documentObject) throw new Error(`${LIB_NAME}: documentObject is required.`);
  function getDocumentTitle() {
    const raw = documentObject.title.replace(/\s*-\s*飞书云文档\s*$/u, '').trim();
    return sanitizeFilePart(raw, 'feishu-image');
  }

  function getVisibleImages() {
    return readPreviewImage({ profile: 'userscript-v1', mode: 'inspect' }, { documentObject }).items;
  }

  // GM 下载与 anchor 后备：data URL 先转成 blob URL，再用 <a download> 触发浏览器下载。
  function fallbackDownload(url: string, filename: string) {
    const view = documentObject.defaultView as (Window & typeof globalThis) | null;
    const blobUrl = dataUrlToBlobUrl(view, url);
    const anchor = documentObject.createElement('a');
    anchor.href = blobUrl || url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    documentObject.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (blobUrl) view?.setTimeout(() => view.URL.revokeObjectURL(blobUrl), 10_000);
  }

  function gmDownloadPromise(url: string, filename: string) {
    // 'ok'：下载成功；'failed'：GM_download 报错或同步抛错，可走后备；本脚本超时则 reject，直接报失败。
    return new Promise<'ok' | 'failed'>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const failed = (error: unknown) =>
        settle(() => {
          console.warn(`${LIB_NAME}: GM_download failed (${errorText(error)}); falling back to anchor download.`);
          resolve('failed');
        });
      const timer = setTimeout(() => settle(() => reject(new Error('GM_download timed out'))), downloadTimeoutMs);
      try {
        gmDownload!({
          url,
          name: filename,
          saveAs: true,
          onload: () => settle(() => resolve('ok')),
          onerror: failed,
          ontimeout: () => failed('timeout'),
        });
      } catch (error) {
        failed(error);
      }
    });
  }

  // Returns { filename } on success ({ filename, via: 'anchor' } when GM_download failed and the anchor
  // fallback ran), or null when no main image is on the page.
  async function exportMainImage(): Promise<ExportResult | null> {
    const result = await readPreviewImage(
      { profile: 'userscript-v1', mode: 'read' },
      {
        documentObject,
        fetchImpl,
        FileReaderCtor: documentObject.defaultView?.FileReader,
      },
    );
    if (result.kind === 'empty') return null;

    const filename = `${getDocumentTitle()}.${extensionFromMime(result.mime)}`;
    const url = result.payload.data;

    if (typeof gmDownload === 'function' && (await gmDownloadPromise(url, filename)) === 'ok') {
      return { filename };
    }
    fallbackDownload(url, filename);
    return typeof gmDownload === 'function' ? { filename, via: 'anchor' } : { filename };
  }

  return {
    exportMainImage,
    getVisibleImages,
    getDocumentTitle,
  };
}

export { createImageExportRuntime, extensionFromMime, sanitizeFilePart, toUserMessage };
