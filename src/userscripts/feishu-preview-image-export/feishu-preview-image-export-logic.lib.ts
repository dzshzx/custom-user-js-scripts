import filenamify from 'filenamify/browser';
import mime from 'mime/lite';

import { readPreviewImage } from './feishu-preview-image-export-extraction.lib.ts';
import type { PreviewImageCandidate } from './feishu-preview-image-export-extraction.lib.ts';
import { errorMessage } from '../shared/shared-values.lib.ts';
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
}

const LIB_NAME = 'FeishuPreviewImageExportLogicLib';

// GM_download 的失败带着原始错误码（Tampermonkey 的 error 字段、'timeout'，或同步抛错的文字）；
// message 仍是英文进 console，给用户的文案按 code 分支。
export class GmDownloadError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`GM_download failed: ${code}`);
    this.name = 'GmDownloadError';
    this.code = code;
  }
}
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

// 内部错误保持英文进 console；给用户的是这里映射的中文文案。经 errorMessage 取文字，遇到怪对象也不抛错。
function toUserMessage(error: unknown): string {
  if (error instanceof GmDownloadError) {
    // Tampermonkey 对用户在另存为里点「取消」报 not_succeeded，与别的运行期失败分不开；用户决定（2026-10-29，#32）
    // 这种情况一律不走后备下载、只提示。
    return error.code === 'not_succeeded' ? '已取消导出。' : `扩展下载失败（${error.code}），请重试。`;
  }
  const text = errorMessage(error);
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
  if (text.includes('Download frame has no document')) {
    return '下载通道创建失败，请刷新页面后重试。';
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

  // 没有 GM_download 的脚本管理器走 anchor 下载：data URL 先转成 blob URL，再用 <a download> 触发浏览器下载。
  // anchor 放在脚本自建的同源空白 iframe 里点：飞书预览页在 document 上挂了捕获与冒泡两个
  // 阶段的 click 处理器，对顶层文档里的 anchor 一律 preventDefault，浏览器就不下载
  //（2026-10-29 真实页面实测，#32）；iframe 自己的文档没有这些处理器。
  function fallbackDownload(url: string, filename: string) {
    const frame = documentObject.createElement('iframe');
    frame.style.display = 'none';
    frame.setAttribute('aria-hidden', 'true');
    documentObject.body.appendChild(frame);
    const frameDocument = frame.contentDocument;
    const view = frameDocument?.defaultView as (Window & typeof globalThis) | null;
    if (!frameDocument || !view) {
      // 顶层文档不能当替身：它的 click 处理器会拦下这次点击，下载静默失败。
      frame.remove();
      throw new Error('Download frame has no document');
    }
    const blobUrl = dataUrlToBlobUrl(view, url);
    const anchor = frameDocument.createElement('a');
    anchor.href = blobUrl || url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    frameDocument.body.appendChild(anchor);
    anchor.click();
    // 下载由浏览器异步接手；iframe 与 blob URL 留一会儿再收，免得下载还没开始就被撤掉。
    view.setTimeout(() => {
      if (blobUrl) view.URL.revokeObjectURL(blobUrl);
      frame.remove();
    }, 10_000);
  }

  function gmDownloadPromise(url: string, filename: string) {
    // 成功 resolve；GM_download 报错、同步抛错或本脚本超时都 reject，不走后备下载：
    // 用户在另存为里点「取消」也会以 not_succeeded 报错，后备会违背用户的取消（用户决定，2026-10-29，#32）。
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const failed = (error: unknown) => settle(() => reject(new GmDownloadError(errorMessage(error))));
      const timer = setTimeout(() => settle(() => reject(new Error('GM_download timed out'))), downloadTimeoutMs);
      try {
        gmDownload!({
          url,
          name: filename,
          saveAs: true,
          onload: () => settle(resolve),
          onerror: failed,
          ontimeout: () => failed('timeout'),
        });
      } catch (error) {
        failed(error);
      }
    });
  }

  // Returns { filename } on success, or null when no main image is on the page; rejects when the
  // download failed or the user cancelled the save dialog.
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
