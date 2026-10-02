import SparkMD5 from 'spark-md5';

export type RequestParams = Record<string, string | number>;

export interface RequestTimers {
  setTimeout(handler: () => void, timeout: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
}

export interface RequestError extends Error {
  retryable?: boolean;
}

export type ApiRequest = (path: string, params: RequestParams, options?: { signal?: AbortSignal }) => Promise<unknown>;

type RequestOpts = CreateRequestOptions;

export interface CreateRequestOptions {
  base: string;
  fetch?: typeof fetch;
  timers?: RequestTimers;
}

var KEY = '30820'; // APK 签名证书 X.509 DER hex 前 5 字符（getSecret / getIKey）
var B64_1 =
  'WzE3OCwyMTksMTI3LDE2MSwxODksMTYyLDEyMywxMDMsMTM3LDIxMCwxMjMsMjE5LDE4OSwxNzksMTIzLDIwMiwxMzksMTUwLDEzMywxNjAsMTI2LDIwNywxNjYsMTUxLDE0NiwxNTksMTg4LDEwMCwxMzgsMTM2LDE3NiwxNjEsMTQyLDEwMywxMzUsMTYwLDE0MiwxNzUsMTYwLDEwNCwxMzAsMTIxLDExOCwxMDYsMTMyLDEyNCwxMzAsMTA0LDEzMSwxMjEsMTI2LDE3MywxNDMsMTQwLDEzOCwxMDQsMTMwLDE1OSwxMTgsMTc1LDE0MiwxNTksMTYxLDE1OSwxNDMsMTI0LDEyMywxNjEsMTMxLDEzNywxMzQsMTAxLDEzMSwxNzUsMTU2LDEwMSwxMzEsMTc1LDE1NywxNTcsMTMwLDEzNywxNjAsMTA2LDE0MywxMzcsMTUzLDE2MCwxMzEsMTQwLDEyMiwxMDMsMTQzLDEzNywxMjMsMTU3LDEzMSwxMzcsMTUyLDEwMywxMzIsMTM3LDEyMiwxNzMsMTMwLDE1OSwxMzEsMTU5LDEzMCwxNDAsMTIyLDEwNiwxMzAsMTc1LDEyMywxNTksMTMwLDEyMSwxMzgsMTA0LDEzMiwxMjEsMTM0LDE3NCwxNDMsMTYyLDEyNiwxMDQsMTMwLDEwMywxMjcsMTU3LDEzMCwxMDMsMTI2LDE3NSwxNDIsMTc1LDE1NiwxNzUsMTQyLDE2MiwxMzEsMTYwLDEzMSwxNTksMTYxLDE1OSwxMzAsMTM3LDE1MywxNTksMTQyLDEwMywxNDIsMTczLDEzMSwxNzUsMTM0LDE3MiwxMzIsMTIxLDEyMywxNjEsMTMwLDEwMywxMzQsMTA1LDE0MiwxNDAsMTIyLDExNF0=';
var B64_2 = 'WzE5OCwxNjksMTIzLDEwNiwxNzcsMTY2LDE0MCwxNjIsMTQ3LDE4OSwxNjIsMjE5LDE5OSwxMjIsMTE4LDE1OF0=';

// hashBinary 按 charCode & 0xff 取字节，与原手写实现一致（输入均为 ASCII）。
export function md5(s: string): string {
  return SparkMD5.hashBinary(s);
}

function decrypt(blob: string): string {
  var md5key = md5(KEY);
  var codes: number[] = JSON.parse(atob(blob));
  var out = '';
  for (var i = 0; i < codes.length; i++) {
    var idx = i < md5key.length ? i : md5key.length - 1;
    out += String.fromCharCode(codes[i] - md5key.charCodeAt(idx));
  }
  var bin = atob(out);
  var u8 = new Uint8Array(bin.length);
  for (var j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j) & 0xff;
  return new TextDecoder('utf-8').decode(u8);
}

var S1 = decrypt(B64_1);
var S2 = decrypt(B64_2);

export function signature(): string {
  var t = Math.floor(Date.now() / 1000);
  return t + '.' + S2 + '.' + md5('' + t + S1);
}

export function cancelled(): Error {
  return Object.assign(new Error('Request cancelled'), { name: 'AbortError' });
}
export function delay(ms: number, signal?: AbortSignal, timers: RequestTimers = globalThis): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timer = timers.setTimeout(finish, ms);
    const abort = () => {
      timers.clearTimeout(timer);
      signal!.removeEventListener('abort', abort);
      reject(cancelled());
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export function createRequest({ base, fetch: fetcher = globalThis.fetch, timers = globalThis }: RequestOpts) {
  return async function api(
    path: string,
    params: RequestParams,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<unknown> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (signal?.aborted) throw cancelled();
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const abort = () => controller?.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = controller ? timers.setTimeout(abort, 12000) : null;
      let failure: RequestError | undefined;
      try {
        const response = await fetcher(base + path + '?' + new URLSearchParams(params as Record<string, string>), {
          headers: { jdsignature: signature(), connection: 'keep-alive' },
          signal: controller?.signal || signal,
        });
        if (signal?.aborted) throw cancelled();
        if (!response.ok)
          throw Object.assign(new Error('HTTP ' + response.status), {
            retryable: response.status === 408 || response.status === 429 || response.status >= 500,
          });
        const body: { success?: number; message?: string; data?: unknown } = await response.json();
        if (signal?.aborted) throw cancelled();
        if (body.success !== 1) throw new Error(body.message || '接口返回错误');
        return body.data;
      } catch (error) {
        failure = error as RequestError;
      } finally {
        if (timer !== null) timers.clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
      if (signal?.aborted) throw cancelled();
      if (attempt === 3 || !(failure!.retryable || failure!.name === 'TypeError' || failure!.name === 'AbortError'))
        throw failure;
      await delay(500 * 2 ** (attempt - 1), signal, timers);
    }
  };
}
