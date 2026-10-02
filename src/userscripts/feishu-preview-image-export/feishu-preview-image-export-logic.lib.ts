import filenamify from 'filenamify/browser';
import mime from 'mime/lite';

import { readPreviewImage } from './feishu-preview-image-export-extraction.lib.ts';
import type { PreviewImageCandidate } from './feishu-preview-image-export-extraction.lib.ts';
import type { GmDownload } from '../shared/shared-gm.lib.ts';

export interface ImageExportRuntimeOptions {
  documentObject: Document;
  fetchImpl?: typeof fetch | null;
  gmDownload?: GmDownload | null;
}

type RuntimeOptions = ImageExportRuntimeOptions;

export interface ImageExportRuntime {
  exportMainImage(): Promise<{ filename: string } | null>;
  getVisibleImages(): PreviewImageCandidate[];
  getDocumentTitle(): string;
}

const LIB_NAME = 'FeishuPreviewImageExportLogicLib';

function sanitizeFilePart(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  return text ? filenamify(text, { replacement: '-' }) : fallback;
}

// image/jpeg -> jpg; parameters such as "; charset=binary" are ignored; unknown types -> bin.
function extensionFromMime(type: unknown): string {
  return mime.getExtension(String(type || '')) || 'bin';
}

// 内部错误保持英文进 console；给用户的是这里映射的中文文案。
function toUserMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
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
  if (text.includes('GM_download failed')) {
    return '浏览器下载失败，请重试。';
  }
  if (text.includes('Failed to read blob')) {
    return '图片数据读取失败，请重试。';
  }
  return `导出失败：${text}`;
}

function createImageExportRuntime({ documentObject, fetchImpl, gmDownload }: RuntimeOptions = {} as RuntimeOptions) {
  if (!documentObject) throw new Error(`${LIB_NAME}: documentObject is required.`);
  function getDocumentTitle() {
    const raw = documentObject.title.replace(/\s*-\s*飞书云文档\s*$/u, '').trim();
    return sanitizeFilePart(raw, 'feishu-image');
  }

  function getVisibleImages() {
    return readPreviewImage({ profile: 'userscript-v1', mode: 'inspect' }, { documentObject }).items;
  }

  function fallbackDownload(url: string, filename: string) {
    const anchor = documentObject.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    documentObject.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function gmDownloadPromise(url: string, filename: string) {
    return new Promise<void>((resolve, reject) => {
      gmDownload!({
        url,
        name: filename,
        saveAs: true,
        onload: resolve,
        onerror: (error) => reject(error || new Error('GM_download failed')),
        ontimeout: () => reject(new Error('GM_download timed out')),
      });
    });
  }

  // Returns { filename } on success, or null when no main image is on the page.
  async function exportMainImage() {
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

    if (typeof gmDownload === 'function') {
      await gmDownloadPromise(url, filename);
    } else {
      fallbackDownload(url, filename);
    }
    return { filename };
  }

  return {
    exportMainImage,
    getVisibleImages,
    getDocumentTitle,
  };
}

export { createImageExportRuntime, extensionFromMime, sanitizeFilePart, toUserMessage };
