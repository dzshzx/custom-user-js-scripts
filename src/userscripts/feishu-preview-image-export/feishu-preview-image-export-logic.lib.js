const LIB_NAME = 'FeishuPreviewImageExportLogicLib';
const MIN_IMAGE_AREA = 20_000;

function sanitizeFilePart(value, fallback) {
  const text = String(value || '').trim().replace(/[\\/:*?"<>|]+/g, '-');
  return text || fallback;
}

function extensionFromMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

// 内部错误保持英文进 console；给用户的是这里映射的中文文案。
function toUserMessage(error) {
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

function createImageExportRuntime({
  documentObject,
  fetchImpl,
  gmDownload,
} = {}) {
  if (!documentObject) throw new Error(`${LIB_NAME}: documentObject is required.`);
  const fetcher = fetchImpl || globalThis.fetch?.bind(globalThis);

  function getDocumentTitle() {
    const raw = documentObject.title.replace(/\s*-\s*飞书云文档\s*$/u, '').trim();
    return sanitizeFilePart(raw, 'feishu-image');
  }

  function getVisibleImages() {
    const images = documentObject.images || documentObject.getElementsByTagName('img');
    return [...images]
      .map((img) => {
        const rect = img.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        return {
          img,
          width,
          height,
          area: width * height,
          visible: width > 0 && height > 0,
          src: img.currentSrc || img.src || '',
        };
      })
      .filter((item) => item.visible && item.area >= MIN_IMAGE_AREA)
      .sort((left, right) => right.area - left.area);
  }

  function parseDataUrl(dataUrl) {
    const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Unsupported data URL format');
    }
    return {
      mime: match[1],
      base64: match[2],
    };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const Reader = documentObject.defaultView?.FileReader || globalThis.FileReader;
      const reader = new Reader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  async function imageToDownloadPayload(item) {
    const src = item.src;
    if (!src) {
      throw new Error('Image source is empty');
    }

    if (src.startsWith('data:')) {
      const parsed = parseDataUrl(src);
      return {
        mime: parsed.mime,
        url: src,
      };
    }

    if (typeof fetcher !== 'function') {
      throw new Error('fetch unavailable');
    }
    const response = await fetcher(src, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    return {
      mime: blob.type || 'application/octet-stream',
      url: await blobToDataUrl(blob),
    };
  }

  function fallbackDownload(url, filename) {
    const anchor = documentObject.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    documentObject.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function gmDownloadPromise(url, filename) {
    return new Promise((resolve, reject) => {
      gmDownload({
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
    const images = getVisibleImages();
    if (!images.length) return null;

    const payload = await imageToDownloadPayload(images[0]);
    const filename = `${getDocumentTitle()}.${extensionFromMime(payload.mime)}`;

    if (typeof gmDownload === 'function') {
      await gmDownloadPromise(payload.url, filename);
    } else {
      fallbackDownload(payload.url, filename);
    }
    return { filename };
  }

  return {
    exportMainImage,
    getVisibleImages,
    getDocumentTitle,
  };
}

export {
  MIN_IMAGE_AREA,
  createImageExportRuntime,
  extensionFromMime,
  sanitizeFilePart,
  toUserMessage,
};
